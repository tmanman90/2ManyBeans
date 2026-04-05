---
title: "React.lazy inside render body destroys component state on every re-render"
category: runtime-errors
date: 2026-04-04
tags: [react, react-lazy, code-splitting, state-loss, render-phase]
module: App Shell
symptom: "Form inputs reset to defaults whenever parent component re-renders"
root_cause: "React.lazy() called inside component body creates new lazy reference each render"
---

## Problem

OnboardingWizard form state (name, grinder selection, brew method) would be destroyed on any parent re-render. User types their name, a poll fires or state updates, the form resets to defaults.

## Root Cause

```jsx
// WRONG: inside component body
const Root = () => {
  if (!isOnboarded) {
    const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));
    return <React.Suspense fallback={<LoadingScreen />}><OnboardingWizard /></React.Suspense>;
  }
};
```

`React.lazy()` is designed to be called once at module scope. Inside the render function, it creates a new lazy component reference on each render. React sees a "different" component, unmounts the previous one, and mounts a new one. All local state is destroyed.

## Solution

```jsx
// CORRECT: at module scope
const OnboardingWizard = React.lazy(() => import('./components/OnboardingWizard'));

const Root = () => {
  if (!isOnboarded) {
    return <React.Suspense fallback={<LoadingScreen />}><OnboardingWizard /></React.Suspense>;
  }
};
```

Zero LOC change. The conditional render still works the same way, but the lazy reference is stable across renders.

## Prevention

- `React.lazy()` must always be at module scope, never inside a component
- Same rule applies to `createContext()` - always module scope
- If you see a `const Component = React.lazy(...)` inside a function body, it's a bug
