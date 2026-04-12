---
status: pending
priority: p3
issue_id: 021
tags: [code-review, accessibility, frontend]
dependencies: []
---

# P3: PaywallSheet TierCard uses nested interactive elements

## Problem Statement

`TierCard` is a `<button>` with inner `<div onClick>` price options. Nested interactive elements are invalid HTML — a button cannot contain another interactive control. Screen readers announce this incoherently. The `stopPropagation` guards at lines 327/342 make it work but don't fix the semantic issue. On iOS Safari this can fight focus rings.

## Findings

**File:** `src/components/PaywallSheet.jsx:304-357`

Flagged by: simplicity Finding 10, races P3-3.

## Proposed Solution

Flatten: use a `<div role="radiogroup">` wrapper, make the card a `<div role="radio">` with keyboard handling, and make price options proper `<button>` children. Alternatively, show cycle options as two explicit sibling buttons BELOW the selected card instead of inside it.

```jsx
<div role="radiogroup" aria-label="Subscription tier">
  <div
    role="radio"
    aria-checked={selected}
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    style={...}
  >
    {label} {features}
  </div>
  {selected && (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => onCycleChange('annual')}>{annualPrice}/yr</button>
      <button onClick={() => onCycleChange('monthly')}>{monthlyPrice}/mo</button>
    </div>
  )}
</div>
```

## Acceptance Criteria

- [ ] No nested interactive elements
- [ ] Screen reader announces tier + cycle correctly
- [ ] Keyboard navigation works (Tab to focus, Enter/Space to select)
- [ ] Visual regression reviewed

## Work Log
