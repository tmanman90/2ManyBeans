import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateV60SwitchRecipe } from '../src/lib/v60SwitchAdapter.js';
import { scaleRecipeForDose } from '../src/lib/recipeScaling.js';
import { buildTimerSteps, normalizeRecipePhases } from '../src/lib/brewTimerSteps.js';
import { transformPourOver, transformToFlashBrew } from '../src/lib/flashBrewTransform.js';
import { resolveIcedRetryConfiguration } from '../src/lib/handBrewCachePolicy.js';

const hook = readFileSync(new URL('../src/hooks/useHandBrew.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/HandBrewModal.jsx', import.meta.url), 'utf8');

const GRINDERS = ['fellow-ode-gen2', 'fellow-opus', 'baratza-encore-esp', 'comandante-c40', '1zpresso-jx-pro', 'baratza-virtuoso-plus'];
const ROASTS = ['light', 'medium', 'dark'];

// --- [1] Every roast preset + anaerobic override, every supported grinder,
// several doses spanning the 15-30g bound, through the real downstream
// consumers: buildTimerSteps (generation-time) and scaleRecipeForDose (the
// modal's live dose-edit path) at several dose edits away from generation. --
for (const roast of ROASTS) {
  for (const grinder of GRINDERS) {
    for (const anaerobic of [false, true]) {
      for (const dose of [15, 18, 20, 25, 30]) {
        const recipe = generateV60SwitchRecipe({}, {
          dose, grinder, roast, process: anaerobic ? 'anaerobic' : 'washed',
        });
        const label = `${roast}/${grinder}/${anaerobic ? 'anaerobic' : 'washed'}/${dose}g`;

        // Generation-time timer validity (R7).
        const timers = buildTimerSteps(recipe);
        assert.ok(timers, `${label}: buildTimerSteps rejected the freshly generated candidate`);
        assert.equal(timers.length, recipe.steps.length, `${label}: timer step count mismatch`);
        assert.ok(recipe.totalBrewTimeSeconds > timers.at(-1).startSeconds, `${label}: total does not follow final step`);

        // Drawdown budget stays inside totalBrewTimeSeconds: the final
        // (drawdown) step's start plus its budget must not exceed the total,
        // and must not be negative/zero.
        const drawdownStart = recipe.steps.at(-1).timeSeconds;
        const drawdownWindow = recipe.totalBrewTimeSeconds - drawdownStart;
        assert.ok(drawdownWindow > 0, `${label}: drawdown window is not positive (${drawdownWindow}s)`);

        // Several dose edits away from the generated dose, mirroring the
        // modal's live stepper before the debounced regenerate fires.
        const edits = [...new Set([
          recipe.coffeeGrams - 2, recipe.coffeeGrams + 1, recipe.coffeeGrams + 5,
          15, 30,
        ])].filter((d) => d > 0 && d !== recipe.coffeeGrams);

        for (const newDose of edits) {
          const scaled = scaleRecipeForDose(recipe, newDose);
          assert.equal(scaled.coffeeGrams, newDose, `${label}->${newDose}g: coffeeGrams not scaled`);

          // Valve steps and phase labels survive scaling (R4).
          assert.ok(scaled.steps.some((s) => /close the valve/i.test(s.action)), `${label}->${newDose}g: Close-valve step lost`);
          assert.ok(scaled.steps.some((s) => /open the valve/i.test(s.action)), `${label}->${newDose}g: Open-valve step lost`);
          const allowedPhases = new Set(['percolation', 'immersion', 'drawdown']);
          for (const step of scaled.steps) {
            assert.ok(allowedPhases.has(step.phase), `${label}->${newDose}g: phase label ${step.phase} did not survive scaling`);
          }

          // Water totals stay monotonic after dose scaling. (Not asserted
          // exactly-equal to scaled.waterGrams: scaleActionGrams/waterTotal
          // scaling rounds each step independently from the original dose's
          // waterTotal, while scaled.waterGrams is recomputed directly from
          // the ratio — the two can differ by a gram of independent
          // rounding. That is a pre-existing, shared scaleRecipeForDose
          // property across every device, not a Switch-specific defect, so
          // this gate only holds it to a small tolerance.)
          let lastWater = -1;
          for (const step of scaled.steps) {
            assert.ok(step.waterTotal >= lastWater, `${label}->${newDose}g: water totals not monotonic after scaling`);
            lastWater = step.waterTotal;
          }
          assert.ok(
            Math.abs(scaled.steps.at(-1).waterTotal - scaled.waterGrams) <= 1,
            `${label}->${newDose}g: final step water (${scaled.steps.at(-1).waterTotal}) drifted too far from scaled waterGrams (${scaled.waterGrams})`
          );

          // Single kettle temperature only (Revision 2026-08-16) — no
          // candidate carries waterTemp2 anymore; assert it stays absent
          // through scaling (never reintroduced) alongside waterTemp itself.
          assert.equal(scaled.waterTemp2, undefined, `${label}->${newDose}g: scaling must not introduce a waterTemp2 field`);
          assert.deepEqual(scaled.waterTemp, recipe.waterTemp, `${label}->${newDose}g: waterTemp did not survive scaling`);

          // Timer steps must not degrade after scaling: times are untouched
          // by scaleRecipeForDose, so the scaled candidate must still build
          // valid timer steps and keep the drawdown budget inside the total.
          const scaledTimers = buildTimerSteps(scaled);
          assert.ok(scaledTimers, `${label}->${newDose}g: buildTimerSteps rejected the scaled candidate`);
          assert.ok(scaled.totalBrewTimeSeconds > scaled.steps.at(-1).timeSeconds, `${label}->${newDose}g: drawdown budget escaped totalBrewTimeSeconds after scaling`);

          // Modal display derivation path (pure lib function): the same
          // normalizeRecipePhases call the modal uses to build displayRecipe.
          const displayRecipe = normalizeRecipePhases(scaled);
          assert.equal(displayRecipe.phaseContractStatus, 'versioned', `${label}->${newDose}g: display derivation lost the versioned phase contract`);
          assert.equal(displayRecipe.steps.length, scaled.steps.length, `${label}->${newDose}g: display derivation dropped steps`);
        }
      }
    }
  }
}
console.log('v60 switch runtime contract [1] passed (timer + scaling survive every roast/grinder/process/dose combination)');

// --- [2] Iced rejection: Switch candidates never reach flashBrewTransform,
// and if they somehow did, the transform must reject them with a marked
// unsupported error, never a crash and never a silently-generated classic
// iced recipe. -------------------------------------------------------------
const switchHot = generateV60SwitchRecipe({}, { dose: 20, roast: 'medium' });
assert.throws(
  () => transformPourOver(switchHot, 20),
  /independent iced V60 adapter/,
  'transformPourOver must reject a Switch hot candidate, not silently transform it'
);
assert.throws(
  () => transformToFlashBrew(switchHot, 'v60', 20),
  /independent iced V60 adapter/,
  'transformToFlashBrew must reject a Switch hot candidate via the same guard'
);

// The real iced-request path never reaches transformPourOver at all for v60
// (device hot candidates use the dedicated V60-02 iced adapter, gated by
// isDeterministicV60Hot in HandBrewModal) — so the actual out-of-scope
// guard lives in useHandBrew.js: a Switch hot request must never fall
// through to the classic V60 iced engine. Assert the guard exists at every
// call site (mirrors handbrew-v60-switch-integration.test.mjs's static
// source-assertion convention).
assert.match(hook, /const isV60Switch = device === 'v60' && v60Variant === 'switch';/, 'isV60Switch flag missing or changed shape');
assert.match(hook, /const \[handBrewIcedUnsupported, setHandBrewIcedUnsupported\] = useState\(false\);/, 'handBrewIcedUnsupported state missing');
assert.match(
  hook,
  /const candidateIcedValid = !isV60Switch\s*\n\s*&& icedCandidateMatchesConfiguration/,
  'cached-iced path must never treat a stale iced entry as valid for a Switch hot request'
);
assert.match(
  hook,
  /if \(device === 'v60' && candidateMode === 'candidate' && !isV60Switch\) \{\s*\n\s*const icedResult = generateV60IcedWithFallback/,
  'fresh-generation path must skip generateV60IcedWithFallback for Switch hot requests'
);
assert.match(
  hook,
  /if \(device === 'v60' && retryConfig\.variant === 'switch'\) \{/,
  'regenerateIced must guard against retrying iced generation for a Switch hot recipe'
);
assert.match(hook, /setHandBrewIcedUnsupported\(isV60Switch\);/, 'iced-unsupported state must be stamped from isV60Switch');
assert.match(hook, /return \{[\s\S]{0,120}handBrewIcedUnsupported/, 'handBrewIcedUnsupported must be exposed from the hook');

// U3 threaded `variant` into resolveIcedRetryConfiguration precisely so this
// guard has something to check.
const retryConfigForSwitch = resolveIcedRetryConfiguration({ recipe: switchHot, bean: {}, preferences: {} });
assert.equal(retryConfigForSwitch.variant, 'switch', 'resolveIcedRetryConfiguration must surface the switch variant for the guard');
const classicHotStub = { device: 'v60', variant: undefined, coffeeGrams: 15 };
const retryConfigForClassic = resolveIcedRetryConfiguration({ recipe: classicHotStub, bean: {}, preferences: {} });
assert.equal(retryConfigForClassic.variant, 'classic', 'a classic (or legacy, variant-less) hot recipe must resolve to classic');

// --- [3] UI behavior: iced entry point is hidden (not offered) for the
// Switch variant, with a short explanatory note, instead of silently
// falling back to a classic-derived iced recipe. ---------------------------
assert.match(modal, /icedUnsupported = false/, 'HandBrewModal must accept an icedUnsupported prop');
assert.match(modal, /\{timerReady && icedUnsupported && \(/, 'no short note when iced is unsupported for the current variant');
assert.match(modal, /\{timerReady && !icedUnsupported && \(\s*<m\.button\s*onClick=\{handleEnterIced\}/, 'iced entry point must be hidden (not just erroring) when icedUnsupported');
assert.match(modal, /if \(icedUnsupported\) return null;/, 'icedRecipe derivation must defend against a stale icedMode for the Switch variant');

console.log('v60 switch runtime contract [2]+[3] passed (iced rejection: no crash, no silent classic-iced, hidden entry point with a note)');
