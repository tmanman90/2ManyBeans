import ActivityKit
import Capacitor
import Foundation
import os
import UserNotifications

private let log = Logger(subsystem: "com.talmeltzer.coffeehub", category: "BrewActivity")

/// Brew timer Live Activity and step alerts. JS: src/lib/brewLiveActivity.js.
/// Registered in MyViewController. Methods resolve at once; ActivityKit work
/// runs on a single writer so a stuck call never blocks the timer.
@objc(BrewActivityPlugin)
public class BrewActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BrewActivityPlugin"
    public let jsName = "BrewActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "upsert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlertPermission", returnType: CAPPluginReturnPromise),
    ]

    private var openURLObserver: NSObjectProtocol?

    override public func load() {
        // "Rate this cup" on the done state opens <bundle id>://brew/rate.
        openURLObserver = NotificationCenter.default.addObserver(
            forName: .capacitorOpenURL, object: nil, queue: .main
        ) { [weak self] notification in
            guard let url = (notification.object as? [String: Any])?["url"] as? URL,
                  url.host == "brew", url.path == "/rate" else { return }
            self?.notifyListeners("rateCup", data: [:], retainUntilConsumed: true)
        }
    }

    deinit {
        if let openURLObserver { NotificationCenter.default.removeObserver(openURLObserver) }
    }

    @objc func upsert(_ call: CAPPluginCall) {
        BrewStepAlerts.replace(with: decode(BrewAlertsPayload.self, from: call)?.alerts ?? [])
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        guard let payload = decode(BrewActivityPayload.self, from: call) else {
            call.reject("Invalid brew activity payload")
            return
        }
        Task { @MainActor in
            BrewActivityController.shared.upsert(attributes: payload.attributes, state: payload.state)
        }
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        BrewStepAlerts.replace(with: [])
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        let payload = decode(BrewActivityEndPayload.self, from: call)
        Task { @MainActor in
            BrewActivityController.shared.end(final: payload?.state, dismissAfter: payload?.dismissAfterSeconds)
        }
        call.resolve()
    }

    @objc func requestAlertPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            call.resolve(["granted": granted])
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from call: CAPPluginCall) -> T? {
        guard let data = try? JSONSerialization.data(withJSONObject: call.jsObjectRepresentation) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .millisecondsSince1970
        do {
            return try decoder.decode(type, from: data)
        } catch {
            log.error("BA-DECODE-FAIL \(String(describing: error), privacy: .public)")
            return nil
        }
    }
}

private struct BrewAlertsPayload: Decodable {
    let alerts: [BrewStepAlert]?
}

@available(iOS 16.2, *)
private struct BrewActivityPayload: Decodable {
    let attributes: BrewActivityAttributes
    let state: BrewActivityAttributes.ContentState
}

@available(iOS 16.2, *)
private struct BrewActivityEndPayload: Decodable {
    let state: BrewActivityAttributes.ContentState?
    let dismissAfterSeconds: Double?
}

struct BrewStepAlert: Decodable {
    let at: Date
    let title: String
    let body: String
}

/// One local notification per upcoming step boundary. These fire while the
/// app is suspended, which the Live Activity alone cannot promise.
enum BrewStepAlerts {
    private static let maxAlerts = 24
    private static let ids = (0 ..< maxAlerts).map { "brew-step-\($0)" }

    static func replace(with alerts: [BrewStepAlert]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ids)
        if alerts.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: ids)
            return
        }
        let now = Date()
        for (id, alert) in zip(ids, alerts) where alert.at > now {
            let content = UNMutableNotificationContent()
            content.title = alert.title
            content.body = alert.body
            content.sound = .default
            content.threadIdentifier = "brew-timer"
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: alert.at.timeIntervalSince(now), repeats: false)
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        }
    }
}

/// Ported from GETUP's LiveActivityManager, cut down to what a brew needs:
/// one writer holding only the latest state, every ActivityKit await raced
/// against a 10 s timeout, end cancels any pending update, and orphan cleanup
/// never blocks starting the current brew.
@available(iOS 16.2, *)
@MainActor
final class BrewActivityController {
    static let shared = BrewActivityController()
    private static let timeout: UInt64 = 10_000_000_000

    private var activity: Activity<BrewActivityAttributes>?
    private var lastSent: BrewActivityAttributes.ContentState?
    private var pending: BrewActivityAttributes.ContentState?
    private var writer: Task<Void, Never>?

    func upsert(attributes: BrewActivityAttributes, state: BrewActivityAttributes.ContentState) {
        if let activity, activity.attributes.sessionID == attributes.sessionID, activity.activityState == .active {
            guard state != lastSent else { return }
            pending = state
            startWriter()
            return
        }

        // Capture before any async sweep, so a new request is never swept.
        let existing = Activity<BrewActivityAttributes>.activities
        if let match = existing.first(where: {
            $0.attributes.sessionID == attributes.sessionID && $0.activityState == .active
        }) {
            notice("BA-ADOPT id=\(match.id)")
            activity = match
            lastSent = nil
            endInBackground(existing.filter { $0.id != match.id })
            pending = state
            startWriter()
            return
        }
        endInBackground(existing)

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            notice("BA-BLOCKED disabled")
            return
        }
        do {
            let requested = try Activity.request(
                attributes: attributes,
                content: content(state),
                pushType: nil
            )
            activity = requested
            lastSent = state
            pending = nil
            notice("BA-START id=\(requested.id)")
        } catch {
            log.error("BA-START-FAIL \(error.localizedDescription, privacy: .public)")
        }
    }

    /// With a final state the activity shows it until dismissed; without one
    /// every brew activity goes away now.
    func end(final state: BrewActivityAttributes.ContentState?, dismissAfter seconds: Double?) {
        writer?.cancel()
        writer = nil
        pending = nil
        lastSent = nil
        let current = activity
        activity = nil
        let all = Activity<BrewActivityAttributes>.activities
        Task { @MainActor in
            for target in all {
                let isCurrent = target.id == current?.id
                let finalContent = isCurrent ? state.map(content) : nil
                let policy: ActivityUIDismissalPolicy = isCurrent && state != nil
                    ? .after(.now.addingTimeInterval(seconds ?? 0))
                    : .immediate
                if await bounded({ await target.end(finalContent, dismissalPolicy: policy) }) {
                    notice("BA-END id=\(target.id)")
                } else {
                    notice("BA-TIMEOUT end id=\(target.id)")
                }
            }
        }
    }

    private func endInBackground(_ stale: [Activity<BrewActivityAttributes>]) {
        guard !stale.isEmpty else { return }
        notice("BA-STALE count=\(stale.count)")
        Task { @MainActor in
            for target in stale {
                _ = await bounded({ await target.end(nil, dismissalPolicy: .immediate) })
            }
        }
    }

    private func startWriter() {
        guard writer == nil else { return }
        writer = Task { @MainActor [weak self] in
            await self?.drain()
            self?.writer = nil
        }
    }

    private func drain() async {
        while !Task.isCancelled, let state = pending, let activity {
            pending = nil
            if await bounded({ await activity.update(self.content(state)) }) {
                lastSent = state
                notice("BA-UPDATE id=\(activity.id) phase=\(state.phase) step=\(state.stepIndex)")
            } else {
                lastSent = nil
                notice("BA-TIMEOUT update id=\(activity.id)")
            }
        }
    }

    private func content(_ state: BrewActivityAttributes.ContentState) -> ActivityContent<BrewActivityAttributes.ContentState> {
        // staleDate asks iOS to redraw at the next step boundary.
        ActivityContent(state: state, staleDate: state.nextBoundary(after: .now))
    }

    /// True when the operation finished, false when it timed out. A stuck
    /// ActivityKit call is left behind instead of holding later updates.
    private func bounded(_ operation: @escaping @MainActor () async -> Void) async -> Bool {
        await withCheckedContinuation { continuation in
            let gate = OnceGate(continuation)
            let timer = Task { @MainActor in
                try? await Task.sleep(nanoseconds: Self.timeout)
                gate.resolve(false)
            }
            Task { @MainActor in
                await operation()
                timer.cancel()
                gate.resolve(true)
            }
        }
    }

    private func notice(_ marker: String) {
        log.notice("\(marker, privacy: .public)")
    }
}

@MainActor
private final class OnceGate {
    private var continuation: CheckedContinuation<Bool, Never>?

    init(_ continuation: CheckedContinuation<Bool, Never>) {
        self.continuation = continuation
    }

    func resolve(_ value: Bool) {
        continuation?.resume(returning: value)
        continuation = nil
    }
}
