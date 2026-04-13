---
title: "Refactor collapsed multiple refs into one but left old names in closures"
category: runtime-errors
tags: [react, hooks, refactoring, vite, esbuild, error-boundary, closure]
module: useRepeatPress
symptom: "First user interaction crashed the React tree to a solid-color screen (html background only). The Vite build passed cleanly; the error only surfaced at runtime on the first tap."
root_cause: "A mechanical collapse of three refs (onTickRef/canTickRef/onBoundaryRef) into one (cbRef) updated the declaration site but missed the usage sites inside a closure body. Vite/esbuild doesn't resolve closure references at build time, so the phantom names compiled into valid JS and threw ReferenceError on first execution."
---

# Mechanical refactors must grep the old names before shipping

## The problem

During a simplicity-review polish pass on `src/hooks/useRepeatPress.js`, I collapsed three parallel refs + three update effects:

```js
const onTickRef = useRef(onTick);
const canTickRef = useRef(canTick);
const onBoundaryRef = useRef(onBoundary);
useEffect(() => { onTickRef.current = onTick; }, [onTick]);
useEffect(() => { canTickRef.current = canTick; }, [canTick]);
useEffect(() => { onBoundaryRef.current = onBoundary; }, [onBoundary]);
```

into one combined ref:

```js
const cbRef = useRef({ onTick, canTick, onBoundary });
useEffect(() => {
  cbRef.current = { onTick, canTick, onBoundary };
});
```

But the `fireTick` closure inside the main effect still read from the old names:

```js
const fireTick = () => {
  if (!canTickRef.current()) {           // ← phantom identifier
    if (!boundaryFired) {
      boundaryFired = true;
      if (onBoundaryRef.current) onBoundaryRef.current();  // ← phantom
    }
    return;
  }
  onTickRef.current();                    // ← phantom
  ...
};
```

None of `canTickRef`, `onTickRef`, or `onBoundaryRef` existed anywhere in the file anymore. Vite/esbuild don't resolve identifiers inside closure bodies at build time — they assume anything unresolved might be a runtime global or a hoisted binding — so the build passed. The error only fired when a real user tapped `+` on the dose stepper and `fireTick` actually executed.

Because the app has no error boundary around the modal subtree, the uncaught `ReferenceError` unmounted the whole React tree. React 19 leaves only the DOM's pre-set `document.documentElement.style.background` visible, which in this app is the Rotation tab's header green `#5C6B4E`. The user saw a solid-green screen that stayed until they force-quit.

## Why none of the review gates caught it

1. **Vite build** passed — esbuild doesn't trace closure references.
2. **Codex review #1-3** only looked at the ref **declaration site** because my prompt asked about the latest-ref pattern correctness — none of the three passes traced `fireTick`'s body with the new name.
3. **Final `/ce:review` performance + simplicity + races agents** reviewed the "polish pass" change but none of them ran the code or grepped for the old names.
4. **Unit tests** didn't exist for `useRepeatPress` — the hook is inherently runtime-bound (timers, pointer events) so I skipped them during Phase 0.
5. **iOS QA skill** couldn't run per the existing Capgo-override blocker.

Every safety net was either blind to the failure mode (build, static review) or intentionally skipped (tests, QA). The first human tap on the real device was the first real verification.

## The fix

Replace the three phantom names with reads from the combined ref:

```js
const fireTick = () => {
  if (!cbRef.current.canTick()) {
    if (!boundaryFired) {
      boundaryFired = true;
      if (cbRef.current.onBoundary) cbRef.current.onBoundary();
    }
    return;
  }
  cbRef.current.onTick();
  ...
};
```

Trivial once you see it. The hotfix shipped as `com.talmeltzer.coffeehub@1.1.129` about 8 minutes after the user report.

## The general lesson

**When doing a mechanical rename or refactor (especially ref collapse, hook restructure, or variable shadowing change), grep the old names across the file AFTER the refactor.** The declaration site is only half the work. Closure bodies, callback references, and helper functions that close over the old name must also be updated.

**Practical checklist for any rename/collapse refactor:**

1. Do the refactor at the declaration site.
2. Run `rg '<old-name>' <file>` to find any remaining references.
3. If ripgrep returns ANY matches, the refactor is incomplete.
4. Only then run the build.
5. For hooks and closures specifically, skim the function bodies inside the file — identifiers used inside closures aren't always caught by a mechanical search if they're renamed at the wrong spelling (e.g. `onTickRef` → `cbRef.current.onTick`).

**JavaScript-specific trap:** `esbuild` / `vite` do NOT fail on unresolved identifiers inside function bodies. They assume the identifier might be a runtime global. The first real error is at runtime, inside a stack you might not reach until real user interaction. Python, Go, Rust, and TypeScript's strict mode would catch this at build time; JS does not. This makes the post-refactor grep especially critical in JS codebases.

**React-specific trap:** React 19 without an error boundary unmounts the entire tree on an uncaught render error. The visible symptom is often just the static DOM background color, which looks like the app froze or crashed. If you ever see a solid-color screen on iOS PWA / Capacitor where you expected a React tree, check the WebView console for an uncaught error — it's almost always an unhandled exception, not a rendering bug.

## Prevention checklist

- [ ] After any variable rename or ref collapse, run `rg '<old-name>'` on the file.
- [ ] If the old name was part of a pattern (`onTickRef`, `canTickRef`, `onBoundaryRef` share `Ref`), grep for the suffix too: `rg 'Ref\.current'` to find every ref access.
- [ ] Never rely on Vite's build for JS identifier resolution.
- [ ] For hooks with deferred callbacks (setTimeout, setInterval, event handlers), the error surfaces only when the callback fires, often not at mount time. Test the actual interaction, not just the render.
- [ ] Consider adding a top-level error boundary around the App root so an uncaught error shows an "Something went wrong" screen instead of a bare DOM background color — this would've at least told the user "it crashed" instead of "it froze."
- [ ] When asking Codex to review a refactor, explicitly ask it to **trace the closure bodies**, not just the declaration sites.

## Related

- Hotfix shipped: `com.talmeltzer.coffeehub@1.1.129` on 2026-04-13.
- Original rip-it run: `docs/rip-it-runs/2026-04-13-043221.md` — the simplicity polish that introduced the bug is documented in the "final /ce:review" section under code-simplicity-reviewer's item #3 ("collapse 3 parallel useRef/useEffect pairs into one").
- The closest cousin lesson in this repo is `docs/solutions/runtime-errors/react-lazy-inside-render-destroys-state.md` — another case where a subtle React contract violation caused a whole-tree remount that looked like a crash.
- Consider: adding an error boundary around HandBrewModal specifically, or at the App root level. The cost is trivial, the catch is "user sees an error screen instead of a green void." This would be a separate small plan.
