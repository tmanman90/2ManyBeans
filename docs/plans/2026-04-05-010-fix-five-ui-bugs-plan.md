---
title: "fix: Five iOS UI bugs (chat placeholder, archive images, keyboard, settings alignment, inventory sticky header)"
type: fix
status: active
date: 2026-04-05
---

# fix: Five iOS UI Bugs

## 1. Chat placeholder truncated
**File:** `src/tabs/ChatTab.jsx`
**Problem:** "Ask Professor Ruphus about your brew" gets cut off on smaller screens.
**Fix:** Shorten to "Ask about your brew..." (fits all screen widths).

## 2. Archive image overflow
**File:** `src/tabs/ArchiveTab.jsx`
**Problem:** Uses `objectFit: 'cover'` which crops bag images. Inventory uses `'contain'`.
**Fix:** Switch to `objectFit: 'contain'`, increase height to 160px, add background color for padding.

## 3. Keyboard covers low inputs
**File:** `src/components/TastingForm.jsx`
**Problem:** No `scrollIntoView` when focusing inputs near bottom of screen.
**Fix:** Add `onFocus` handler that scrolls the focused input into view with a delay (keyboard animation).

## 4. Settings select alignment
**File:** `src/components/SettingsPage.jsx`
**Problem:** `selectStyle` has `paddingRight: 4` which is too tight. "Fellow Ode Gen 2" doesn't align with shorter values.
**Fix:** Remove `paddingRight` from selectStyle, let flexbox handle alignment naturally.

## 5. Inventory sticky header
**File:** `src/tabs/InventoryTab.jsx`
**Problem:** Title, Add Bean button, and search bar scroll away with content.
**Fix:** Make header section `position: 'sticky'` with `top: 0`, `zIndex: 10`, `background: C.bg`.

## Acceptance Criteria
- [ ] Chat placeholder visible on iPhone SE width
- [ ] Archive images show full bag (not cropped)
- [ ] Keyboard doesn't cover focused inputs in tasting form
- [ ] All Settings select values right-aligned consistently
- [ ] Inventory header stays visible while scrolling beans
