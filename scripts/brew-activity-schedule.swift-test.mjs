// Compiles the widget's shared schedule code for macOS and checks the step
// walk. ActivityKit is iOS only, so its import and protocol are stripped from
// a temporary copy. Run by brew-live-activity.test.mjs when swiftc exists.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(join(root, 'ios/App/BrewActivityShared/BrewActivityAttributes.swift'), 'utf8')
  .replace('import ActivityKit\n', '')
  .replace(': ActivityAttributes {', ': Codable, Hashable {');

const test = String.raw`
import Foundation

func check(_ condition: Bool, _ message: String) {
    if !condition {
        print("FAIL: \(message)")
        exit(1)
    }
}

let t0 = Date(timeIntervalSince1970: 1_000_000)
func at(_ seconds: Double) -> Date { t0.addingTimeInterval(seconds) }
func step(_ seconds: Double?) -> BrewActivityAttributes.Step {
    .init(title: "t", detail: "d", short: "s", target: nil, seconds: seconds, pour: true)
}

// Bloom 45 s, two pours of 30 s, drawdown to a 3:30 guide.
var state = BrewActivityAttributes.ContentState(
    phase: "running", steps: [step(45), step(30), step(30), step(105)], stepIndex: 0,
    stepStartedAt: t0, brewStartedAt: t0, totalSeconds: 210, autoAdvance: true, elapsedSeconds: 0
)
check(state.moment(at: at(10)) == BrewMoment(index: 0, start: t0, end: at(45)), "first step")
check(state.moment(at: at(84)) == BrewMoment(index: 2, start: at(75), end: at(105)), "advances by itself")
check(state.moment(at: at(400)) == BrewMoment(index: 3, start: at(105), end: at(210)), "final step ends at the guide")
check(state.nextBoundary(after: at(84)) == at(105), "stale date is the next boundary")
check(state.nextBoundary(after: at(400)) == nil, "no boundary after the guide")
check(state.stepStarts() == [0: t0, 1: at(45), 2: at(75), 3: at(105)], "bar segments")

// Skipped ahead: the walk starts from the published step.
state.stepIndex = 1
state.stepStartedAt = at(20)
check(state.moment(at: at(60)) == BrewMoment(index: 2, start: at(50), end: at(80)), "after a skip")
check(state.moment(at: at(90)) == BrewMoment(index: 3, start: at(80), end: at(210)), "final step after a skip")

// Source recipes wait for a confirmation instead of advancing.
state.autoAdvance = false
state.stepIndex = 0
state.stepStartedAt = t0
check(state.moment(at: at(100)) == BrewMoment(index: 0, start: t0, end: at(45)), "waits on the step")
state.steps[0].seconds = nil
check(state.moment(at: at(100)) == BrewMoment(index: 0, start: t0, end: nil), "open-ended step")

state.phase = "paused"
check(state.moment(at: at(10)) == nil, "paused has no live moment")
check(brewClock(208.9) == "3:28", "clock text")
print("brew activity schedule passed")
`;

const work = mkdtempSync(join(tmpdir(), 'brew-activity-swift-'));
try {
  writeFileSync(join(work, 'BrewActivityAttributes.swift'), source);
  writeFileSync(join(work, 'main.swift'), test);
  execFileSync('swiftc', ['-o', join(work, 'schedule-test'), join(work, 'BrewActivityAttributes.swift'), join(work, 'main.swift')], { stdio: 'inherit' });
  process.stdout.write(execFileSync(join(work, 'schedule-test'), { encoding: 'utf8' }));
} finally {
  rmSync(work, { recursive: true, force: true });
}
