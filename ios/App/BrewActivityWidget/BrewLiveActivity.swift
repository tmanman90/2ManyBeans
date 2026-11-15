import ActivityKit
import SwiftUI
import WidgetKit

// Views for docs/plans/mockups/brew-live-activity. The widget cannot import
// the app's theme, so the palette is repeated here (caramel lifted for
// contrast on black).
private extension Color {
    init(hex: UInt) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    static let caramel = Color(hex: 0xE2A266)
    static let sage = Color(hex: 0x8FC09A)
    static let frost = Color(hex: 0xA9C3D0)
    static let amber = Color(hex: 0xE8BE6A)
    static let roast = Color(hex: 0x1B120C)
    static let cream = Color(hex: 0xF5EFE6)
    static let muted = Color(hex: 0xF5EFE6).opacity(0.6)
    static let track = Color.white.opacity(0.22)
}

typealias BrewState = BrewActivityAttributes.ContentState

/// What one render shows. Built from the schedule at the render time, so the
/// step label, target and glyph advance without an app update.
private struct BrewFace {
    enum Kind { case pour, wait, paused, yourTurn, chill, done }
    enum Clock {
        case countdown(start: Date, end: Date)
        case countUp(from: Date)
        case fixed(String)
    }

    let kind: Kind
    private(set) var index: Int
    let step: BrewActivityAttributes.Step?
    let next: BrewActivityAttributes.Step?
    let clock: Clock
    /// Brew time at which the next step starts.
    private(set) var nextAt: String?

    init(_ attributes: BrewActivityAttributes, _ state: BrewState, at now: Date) {
        index = min(max(state.stepIndex, 0), max(state.steps.count - 1, 0))
        nextAt = nil
        switch state.phase {
        case "done":
            kind = .done
            step = nil
            next = nil
            clock = .fixed(brewClock(state.elapsedSeconds))
            return
        case "chill":
            kind = .chill
            step = nil
            next = nil
            clock = state.dueAt.map { .countUp(from: $0) } ?? .fixed("0:00")
            return
        case "paused":
            kind = .paused
            step = state.steps.indices.contains(index) ? state.steps[index] : nil
            next = state.steps.indices.contains(index + 1) ? state.steps[index + 1] : nil
            clock = .fixed(brewClock(state.stepRemainingSeconds ?? 0))
            return
        default:
            break
        }

        guard let moment = state.moment(at: now) else {
            // "yourTurn" published by the app, or a state the widget cannot read.
            kind = .yourTurn
            step = state.steps.indices.contains(index) ? state.steps[index] : nil
            next = state.steps.indices.contains(index + 1) ? state.steps[index + 1] : nil
            clock = .countUp(from: state.dueAt ?? state.stepStartedAt ?? now)
            return
        }

        index = moment.index
        step = state.steps[moment.index]
        next = state.steps.indices.contains(moment.index + 1) ? state.steps[moment.index + 1] : nil
        if let end = moment.end, state.autoAdvance || end > now {
            kind = step?.pour == true ? .pour : .wait
            clock = .countdown(start: moment.start, end: end)
            if let brewStart = state.brewStartedAt, next != nil {
                nextAt = brewClock(end.timeIntervalSince(brewStart))
            }
        } else {
            // Source recipes wait here until the user confirms in the app.
            kind = .yourTurn
            clock = .countUp(from: moment.end ?? moment.start)
        }
    }

    var tint: Color {
        switch kind {
        case .pour, .wait: return .caramel
        case .paused: return .muted
        case .yourTurn: return .amber
        case .chill: return .frost
        case .done: return .sage
        }
    }

    var glyph: String {
        switch kind {
        case .pour: return "drop.fill"
        case .wait: return "hourglass"
        case .paused: return "pause.fill"
        case .yourTurn: return "scope"
        case .chill: return "snowflake"
        case .done: return "checkmark"
        }
    }

    /// "POUR 3 OF 4", "PAUSED · POUR 3 OF 4", "YOUR TURN · STEP 3 OF 5".
    /// `short` drops the step for the narrow expanded island corner.
    func header(stepCount: Int, short: Bool = false) -> String {
        let title = step?.title ?? ""
        switch kind {
        case .pour, .wait: return title.uppercased()
        case .paused: return short ? "PAUSED" : "PAUSED · \(title.uppercased())"
        case .yourTurn: return short ? "YOUR TURN" : "YOUR TURN · STEP \(index + 1) OF \(stepCount)"
        case .chill: return short ? "CHILL" : "CHILL AND SERVE"
        case .done: return "BREW DONE"
        }
    }

    var stale: Bool { kind == .paused }
}

private func render(_ state: BrewState, @ViewBuilder _ content: @escaping (Date) -> some View) -> some View {
    // Redraw at each step boundary (Timer.Coffee's approach). iOS may still
    // render late while the app sleeps; `Date()` keeps it right when it does.
    let boundaries = state.stepStarts().values.filter { $0 > .now }.sorted()
    return TimelineView(.explicit([.now] + boundaries)) { context in
        content(context.date)
    }
}

// MARK: - Clocks

private struct ClockText: View {
    let clock: BrewFace.Clock

    var body: some View {
        switch clock {
        case let .countdown(start, end):
            // A timer interval stops at 0:00 at its end instead of counting past.
            Text(timerInterval: min(start, end) ... end, countsDown: true)
        case let .countUp(from):
            Text(timerInterval: from ... from.addingTimeInterval(8 * 3600), countsDown: false)
        case let .fixed(text):
            Text(text)
        }
    }
}

/// Elapsed brew time, "1:24", live while running.
private struct BrewElapsedText: View {
    let state: BrewState

    var body: some View {
        if state.isRunning, let start = state.brewStartedAt {
            Text(timerInterval: start ... start.addingTimeInterval(8 * 3600), countsDown: false)
        } else {
            Text(brewClock(state.elapsedSeconds))
        }
    }
}

/// Timer text takes the width of its longest value; size it to the brew.
private func elapsedWidth(_ state: BrewState) -> CGFloat {
    (state.totalSeconds ?? 0) >= 600 ? 42 : 33
}

// MARK: - Brew bar

/// One segment per step, sized by its duration. Segments fill by themselves
/// from date ranges, so the bar keeps moving with no app updates.
private struct BrewBar: View {
    let state: BrewState
    let face: BrewFace
    var height: CGFloat = 6

    var body: some View {
        let starts = state.stepStarts()
        let weights = state.steps.map { max($0.seconds ?? 20, 8) }
        let total = weights.reduce(0, +)
        GeometryReader { geo in
            let spacing: CGFloat = 4
            let usable = max(0, geo.size.width - spacing * CGFloat(max(weights.count - 1, 0)))
            HStack(spacing: spacing) {
                ForEach(state.steps.indices, id: \.self) { index in
                    segment(index, starts: starts)
                        .frame(width: usable * CGFloat(weights[index] / total), height: height)
                }
            }
        }
        .frame(height: height)
    }

    @ViewBuilder
    private func segment(_ index: Int, starts: [Int: Date]) -> some View {
        let fill = face.kind == .paused ? Color.caramel.opacity(0.55) : face.kind == .done || face.kind == .chill ? Color.sage : Color.caramel
        if face.kind == .done || face.kind == .chill || index < face.index {
            Capsule().fill(fill)
        } else if face.kind == .paused && index == face.index,
                  let seconds = state.steps[index].seconds, seconds > 0 {
            let left = state.stepRemainingSeconds ?? seconds
            ProgressView(value: min(1, max(0, 1 - left / seconds)))
                .progressViewStyle(BarStyle(fill: fill))
        } else if face.kind != .paused, let start = starts[index],
                  let end = state.endOfStep(index, startingAt: start), end > start {
            // Timer-driven progress only moves with the system style.
            ProgressView(timerInterval: start ... end, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(fill)
        } else {
            Capsule().fill(Color.track)
        }
    }
}

private struct BarStyle: ProgressViewStyle {
    let fill: Color

    func makeBody(configuration: Configuration) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.track)
                Capsule().fill(fill)
                    .frame(width: geo.size.width * CGFloat(configuration.fractionCompleted ?? 0))
            }
        }
    }
}

// MARK: - Shared pieces

private struct HeadlineText: View {
    let face: BrewFace
    let state: BrewState
    var size: CGFloat

    var body: some View {
        switch face.kind {
        case .chill:
            longText(state.note ?? "Chill and serve")
        case .wait, .yourTurn:
            longText(face.step?.detail ?? "")
        default:
            targetText
        }
    }

    /// Step text can run long; two smaller lines instead of a cut-off one.
    private func longText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: size * 0.72, weight: .semibold))
            .lineLimit(2)
            .minimumScaleFactor(0.8)
    }

    /// "Pour to 190 g" with the unit muted.
    private var targetText: Text {
        let detail = face.step?.detail ?? ""
        guard let space = detail.lastIndex(of: " "), face.step?.target != nil else { return Text(detail) }
        return Text(detail[..<space]) + Text(detail[space...]).foregroundColor(.muted)
    }
}

private struct RateCupLink: View {
    var body: some View {
        // The extension's bundle id is the app's plus ".BrewActivity"; the app
        // registers its own bundle id as a URL scheme.
        let scheme = (Bundle.main.bundleIdentifier ?? "com.talmeltzer.coffeehub.BrewActivity")
            .replacingOccurrences(of: ".BrewActivity", with: "")
        if let url = URL(string: "\(scheme)://brew/rate") {
            Link(destination: url) {
                Label("Rate this cup", systemImage: "cup.and.saucer.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.roast)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .background(Color.caramel, in: Capsule())
            }
        }
    }
}

// MARK: - Lock Screen

private struct LockScreenView: View {
    let context: ActivityViewContext<BrewActivityAttributes>

    var body: some View {
        render(context.state) { now in
            content(BrewFace(context.attributes, context.state, at: now))
        }
        .padding(.leading, 14)
        .padding(.trailing, 16)
        .padding(.vertical, 14)
        .activityBackgroundTint(Color.roast)
        .activitySystemActionForegroundColor(Color.cream)
    }

    private func content(_ face: BrewFace) -> some View {
        let state = context.state
        return HStack(spacing: 12) {
            Capsule().fill(face.tint).frame(width: 4)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(context.attributes.title, systemImage: context.attributes.iced ? "snowflake" : "cup.and.saucer")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.muted)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    topRight(face)
                        .font(.system(size: 14, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(face.kind == .done ? Color.sage : Color.muted)
                }
                if face.kind == .done {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("TOTAL TIME")
                                .font(.system(size: 12, weight: .semibold))
                                .tracking(1)
                                .foregroundStyle(Color.muted)
                            Text(brewClock(state.elapsedSeconds))
                                .font(.system(size: 30, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(Color.cream)
                        }
                        Spacer()
                        RateCupLink()
                    }
                } else {
                    HStack(alignment: .lastTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(face.header(stepCount: state.steps.count))
                                .font(.system(size: 12, weight: .semibold))
                                .tracking(1)
                                .foregroundStyle(face.kind == .pour || face.kind == .wait || face.kind == .paused ? Color.muted : face.tint)
                                .lineLimit(1)
                            HeadlineText(face: face, state: state, size: 28)
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(face.kind == .paused ? Color.muted : Color.cream)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 0) {
                            if face.kind == .yourTurn || face.kind == .chill {
                                Text(face.kind == .chill ? "chilling" : "waiting")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Color.muted)
                            }
                            ClockText(clock: face.clock)
                                .font(.system(size: 40, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(face.kind == .wait ? Color.caramel : face.tint)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 104, alignment: .trailing)
                        }
                    }
                    if face.kind != .chill && face.kind != .yourTurn {
                        BrewBar(state: state, face: face)
                    }
                    bottomRow(face)
                }
            }
        }
    }

    @ViewBuilder
    private func topRight(_ face: BrewFace) -> some View {
        let state = context.state
        switch face.kind {
        case .done:
            Text("Brew done")
        case .chill:
            Text("Brew \(brewClock(state.elapsedSeconds))")
        case .yourTurn:
            HStack(spacing: 4) { BrewElapsedText(state: state).frame(width: elapsedWidth(state), alignment: .trailing); Text("elapsed") }
        default:
            if let total = state.totalSeconds, total > 0 {
                HStack(spacing: 4) { BrewElapsedText(state: state).frame(width: elapsedWidth(state), alignment: .trailing); Text("of \(brewClock(total))") }
            } else {
                BrewElapsedText(state: state)
            }
        }
    }

    @ViewBuilder
    private func bottomRow(_ face: BrewFace) -> some View {
        switch face.kind {
        case .pour, .wait:
            if let next = face.next {
                HStack {
                    (Text("Next ").foregroundColor(.muted) + Text(next.short).foregroundColor(.cream))
                        .lineLimit(1)
                    Spacer()
                    if let at = face.nextAt { Text("at \(at)").foregroundStyle(Color.muted) }
                }
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
            }
        case .yourTurn:
            HStack {
                Text("Open the app to confirm").foregroundStyle(Color.muted)
                Spacer()
                if let next = face.next {
                    Text("Then ").foregroundColor(.muted) + Text(next.short).foregroundColor(.cream)
                }
            }
            .font(.system(size: 14, weight: .medium))
            .lineLimit(1)
        default:
            EmptyView()
        }
    }
}

// MARK: - Dynamic Island

struct BrewLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BrewActivityAttributes.self) { context in
            LockScreenView(context: context)
        } dynamicIsland: { context in
            let face = BrewFace(context.attributes, context.state, at: .now)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    render(context.state) { now in
                        ExpandedLeading(face: BrewFace(context.attributes, context.state, at: now), context: context)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    render(context.state) { now in
                        ExpandedTrailing(face: BrewFace(context.attributes, context.state, at: now))
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    render(context.state) { now in
                        ExpandedBottom(face: BrewFace(context.attributes, context.state, at: now), state: context.state)
                    }
                }
            } compactLeading: {
                render(context.state) { now in
                    CompactLeading(face: BrewFace(context.attributes, context.state, at: now))
                }
            } compactTrailing: {
                render(context.state) { now in
                    CompactTrailing(face: BrewFace(context.attributes, context.state, at: now))
                }
            } minimal: {
                render(context.state) { now in
                    MinimalView(face: BrewFace(context.attributes, context.state, at: now))
                }
            }
            .keylineTint(face.tint)
        }
    }
}

private struct CompactLeading: View {
    let face: BrewFace

    var body: some View {
        Group {
            if face.kind == .pour, let target = face.step?.target {
                Text(target)
                    .font(.system(size: 15, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
            } else {
                Image(systemName: face.glyph)
                    .font(.system(size: 14, weight: .semibold))
            }
        }
        .foregroundStyle(face.tint)
        .lineLimit(1)
        .padding(.leading, 2)
    }
}

private struct CompactTrailing: View {
    let face: BrewFace

    var body: some View {
        ClockText(clock: face.clock)
            .font(.system(size: 15, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(face.kind == .pour || face.kind == .wait || face.kind == .done ? Color.cream : face.tint)
            .multilineTextAlignment(.trailing)
            .frame(width: 46, alignment: .trailing)
    }
}

private struct MinimalView: View {
    let face: BrewFace

    var body: some View {
        if case let .countdown(start, end) = face.clock, start < end {
            // Drains to the end of the step, like the Clock app's timer.
            ZStack {
                ProgressView(timerInterval: start ... end, countsDown: true, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                    .progressViewStyle(.circular)
                    .tint(face.tint)
                Image(systemName: face.glyph)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(face.tint)
            }
        } else {
            Image(systemName: face.glyph)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(face.tint)
        }
    }
}

private struct ExpandedLeading: View {
    let face: BrewFace
    let context: ActivityViewContext<BrewActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(face.header(stepCount: context.state.steps.count, short: true), systemImage: face.glyph)
                .font(.system(size: 13, weight: .bold))
                .tracking(0.8)
                .foregroundStyle(face.tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(context.attributes.subtitle)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(.leading, 6)
        .padding(.top, 4)
    }
}

private struct ExpandedTrailing: View {
    let face: BrewFace

    var body: some View {
        ClockText(clock: face.clock)
            .font(.system(size: 36, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(face.kind == .done ? Color.cream : face.kind == .wait ? Color.caramel : face.tint)
            .multilineTextAlignment(.trailing)
            .frame(width: 88, alignment: .trailing)
            .padding(.trailing, 6)
    }
}

private struct ExpandedBottom: View {
    let face: BrewFace
    let state: BrewState

    var body: some View {
        // Done never reaches the island: an ended activity shows on the Lock
        // Screen only.
        VStack(alignment: .leading, spacing: 8) {
            HeadlineText(face: face, state: state, size: 24)
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(face.kind == .paused ? Color.muted : Color.cream)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if face.kind == .yourTurn {
                Text("Open the app to confirm")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.muted)
            } else if face.kind != .chill {
                BrewBar(state: state, face: face)
                HStack(spacing: 4) {
                    BrewElapsedText(state: state).frame(width: elapsedWidth(state), alignment: .leading)
                    if let total = state.totalSeconds, total > 0 { Text("of \(brewClock(total))") }
                    Spacer()
                    if let next = face.next {
                        (Text("Next ").foregroundColor(.muted) + Text(next.short).foregroundColor(.cream))
                            .lineLimit(1)
                        if let at = face.nextAt { Text(at) }
                    }
                }
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Color.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 6)
        .padding(.bottom, 4)
    }
}
