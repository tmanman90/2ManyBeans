import ActivityKit
import Foundation

// Shared by the app (BrewActivityPlugin) and the widget extension.
// The app publishes only on timer transitions. Every clock below is a date
// anchor, and the widget works out the current step from the schedule each
// time iOS renders it, so it keeps advancing while the WebView is suspended.
// New fields must be optional so an older activity still decodes.
@available(iOS 16.2, *)
struct BrewActivityAttributes: ActivityAttributes {
    let sessionID: String
    /// "Ethiopia Guji · V60"
    let title: String
    /// "V60 · 15 g"
    let subtitle: String
    let iced: Bool

    struct Step: Codable, Hashable {
        /// "Pour 3 of 4", "Bloom", "Drawdown"
        var title: String
        /// "Pour to 190 g", or the step text for a wait
        var detail: String
        /// "Pour 4 to 250 g", for the Next row
        var short: String
        /// "190g", only on a pour
        var target: String?
        /// nil when the step waits for the user
        var seconds: Double?
        var pour: Bool
    }

    struct ContentState: Codable, Hashable {
        /// running | paused | yourTurn | chill | done
        var phase: String
        var steps: [Step]
        var stepIndex: Int
        /// Running: wall clock start of the step at stepIndex.
        var stepStartedAt: Date?
        /// Running: wall clock start of the brew, net of pauses.
        var brewStartedAt: Date?
        /// The recipe's guide time, if it has one.
        var totalSeconds: Double?
        /// Standard recipes move to the next step on time. Source recipes
        /// that wait for a confirmation do not.
        var autoAdvance: Bool
        /// Paused, chill, done: brew time frozen at publish.
        var elapsedSeconds: Double
        /// Paused: time left in the step, frozen.
        var stepRemainingSeconds: Double?
        /// Your turn and chill: count up from here.
        var dueAt: Date?
        /// Chill: what to do ("Swirl over ice").
        var note: String?
    }
}

/// The step showing at a moment, derived from the schedule.
struct BrewMoment: Equatable {
    let index: Int
    let start: Date
    /// When this step's countdown ends. nil for a step that waits for the user.
    let end: Date?
}

@available(iOS 16.2, *)
extension BrewActivityAttributes.ContentState {
    var isRunning: Bool { phase == "running" }

    /// Walks the schedule from the published step to `now`.
    func moment(at now: Date) -> BrewMoment? {
        guard isRunning, let stepStart = stepStartedAt, steps.indices.contains(stepIndex) else { return nil }
        var index = stepIndex
        var start = stepStart
        while true {
            let end = endOfStep(index, startingAt: start)
            guard autoAdvance, let end, end <= now, index + 1 < steps.count else {
                return BrewMoment(index: index, start: start, end: end)
            }
            index += 1
            start = end
        }
    }

    /// Start dates of every step from the published one on (index -> date).
    func stepStarts() -> [Int: Date] {
        guard isRunning, let stepStart = stepStartedAt, steps.indices.contains(stepIndex) else { return [:] }
        var starts = [stepIndex: stepStart]
        var start = stepStart
        var index = stepIndex
        while autoAdvance, index + 1 < steps.count, let end = endOfStep(index, startingAt: start) {
            index += 1
            start = end
            starts[index] = start
        }
        return starts
    }

    /// The final step of a standard recipe runs to the guide time, as in the app.
    func endOfStep(_ index: Int, startingAt start: Date) -> Date? {
        if autoAdvance, index == steps.count - 1, let brewStart = brewStartedAt, let total = totalSeconds, total > 0 {
            return max(start, brewStart.addingTimeInterval(total))
        }
        guard let seconds = steps[index].seconds, seconds > 0 else { return nil }
        return start.addingTimeInterval(seconds)
    }

    /// The next moment the view changes on its own: a step boundary.
    func nextBoundary(after now: Date) -> Date? {
        guard let moment = moment(at: now), let end = moment.end, end > now else { return nil }
        return end
    }
}

func brewClock(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    return String(format: "%d:%02d", total / 60, total % 60)
}
