---
title: "feat: Dark Mode"
type: feat
status: active
date: 2026-04-12
---

# Dark Mode

Add a single dark color palette that respects iOS system preference, with a manual override in Settings.

## Overview

Both competitors (Filtru, Bloom) support dark mode. It is table stakes for a 2026 iOS app. The codebase uses a centralized `theme.js` with 26 color tokens consumed via inline styles across 30+ files. No CSS variables or theme context infrastructure exists today.

Single dark palette only. No theme picker, no multiple color themes.

## Problem Statement

Users who prefer dark mode (or use their phone at night while brewing) see a bright cream/white UI with no way to switch. This is a comfort and accessibility issue, and a visible quality gap vs competitors.

## Proposed Solution

### Architecture

**New files:**

| File | Purpose |
|------|---------|
| `src/contexts/ThemeContext.jsx` | React context providing `isDark` boolean and active color palette |

**Modified files:**

| File | Change |
|------|--------|
| `src/styles/theme.js` | Add `CDark` palette, export `getTheme(isDark)` returning `{ C, fonts, shadows, cardBase, journalCard, radius }` |
| `src/styles/global.css` | Replace 5 hardcoded values with CSS variables (bg, focus border, scrollbar, 2 gradient RGBAs) |
| `src/main.jsx` | Wrap app in `<ThemeProvider>` |
| `src/App.jsx` | Consume theme context for html background, header colors, rotation gradient |
| `src/components/SettingsPage.jsx` | Add dark mode toggle, refactor module-level style constants into component body |
| `src/lib/peakStatus.js` | Accept `C` palette as parameter instead of importing statically |
| `src/components/StarRating.jsx` | Add dark-mode variant for unfilled bean stroke color |
| `src/components/PaywallSheet.jsx` | Replace hardcoded `#FFF` selected card background with `C.card` |
| `src/components/ShareCard.jsx` | Pin tasting share card to light palette (not affected by theme) |
| `src/components/Toast.jsx` | Use `C.redBg` instead of hardcoded `#FDECEC` |
| ~30 component files | Change `import { C } from '../styles/theme'` to `const { C } = useTheme()` |
| All `peakStatus()` call sites | Pass `C` as argument (RotationTab, BeanCard, InventoryTab) |

### Color Palette Design

**Light palette** (current, unchanged):

| Token | Value | Purpose |
|-------|-------|---------|
| bg | #FAF6F1 | Page background |
| cream | #F5EDE0 | Secondary bg |
| card | #FFFFFF | Card background |
| text | #2C1810 | Primary text |
| textMuted | #8B7355 | Secondary text |
| accent | #A0714B | Primary accent |
| navBg | #2C1810 | Bottom nav background |
| ... | ... | (26 tokens total) |

**Dark palette** (new):

| Token | Value | Purpose |
|-------|-------|---------|
| bg | #1A1412 | Dark warm brown, not pure black |
| cream | #2A2220 | Slightly lighter surface |
| card | #2E2624 | Card surface |
| text | #F0E8E0 | Light warm text |
| textMuted | #9B8B7B | Muted warm text |
| accent | #C8956B | Brighter accent for dark bg |
| navBg | #141010 | Darker nav |
| borderGold | #8B7A5A | Dimmed gold border for dark (replaces #E8D5A0) |
| ... | ... | (match all 26 tokens) |

**New token:** `borderGold` -- currently `#E8D5A0` is hardcoded in 4 files. Add to both palettes.

Design principle: warm dark browns, not cool grays. Match the coffee-journal personality. No pure black (#000) anywhere.

**Additional dark-mode rules** (from Owl-Listener/designer-skills `dark-mode-design`):

1. **Don't just invert, redesign surfaces.** Dark mode is its own palette, not a CSS filter.
2. **Elevation via lighter surfaces, not shadows.** Dark shadows disappear on dark bg. Use a tiered surface hierarchy instead:
   - Surface 0 (page bg): `#1A1412` darkest
   - Surface 1 (cards): `#2E2624`
   - Surface 2 (modals, dropdowns, sheets): slightly lighter, e.g. `#352B28`
   - Surface 3 (tooltips, menus, selected rows): lightest, e.g. `#3D3330`
   Add `C.surface2` and `C.surface3` tokens. Modals (PaywallSheet, AidenModal, HandBrewModal) use `surface2` so they read as elevated above the card layer.
3. **Desaturate bright accents 10-20% for dark bg.** The current light accent `#A0714B` saturated against cream reads harsher on dark. The proposed `#C8956B` already lightens; also drop saturation ~15% from the HSL of the light-mode token when picking any dark accent.
4. **Off-white text, not pure white.** Plan already uses `#F0E8E0` (good). Never `#FFFFFF` for body text on dark.
5. **Low-opacity white borders for hairlines.** `rgba(255,255,255,0.06)` for card borders (already in shadows section), `rgba(255,255,255,0.12)` for stronger dividers.
6. **Smooth mode transitions.** Add `transition: background-color 200ms ease, color 200ms ease` on body + major surfaces so toggling doesn't snap. Exclude transform/opacity to avoid interfering with animations.
7. **Contrast audit every text/bg pair.** Minimum 4.5:1 for body text, 3:1 for large text and UI chrome. Not just StarRating (already called out): also `textMuted` on `card`, badge text on colored badge backgrounds, disabled button text, placeholder text in inputs.
8. **Test in a dark room, not just the simulator.** Luminance perception shifts in actual dark environments. Do a final device pass with room lights off before shipping.

**Shadows:** Dark mode shadows use subtle `rgba(0,0,0,0.3)` (barely visible on dark surfaces) plus a thin `1px solid rgba(255,255,255,0.06)` border for elevation. Include in `getTheme()` return value.

### Theme Context

```jsx
// src/contexts/ThemeContext.jsx
const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Read from localStorage synchronously to prevent flash
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('tmb_theme_mode') || 'system'; }
    catch { return 'system'; }
  });
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const isDark = mode === 'dark' || (mode === 'system' && systemDark);
  
  const theme = useMemo(() => getTheme(isDark), [isDark]);
  
  // Stabilize context value per institutional learning (useRef + deep-compare)
  const valueRef = useRef(theme);
  // ... deep-compare pattern from Firestore settings solution
  
  // Sync mode to localStorage on change (for flash prevention)
  useEffect(() => {
    try { localStorage.setItem('tmb_theme_mode', mode); } catch {}
  }, [mode]);
  
  // Sync to Firestore when profile is available (separate effect)
  
  return <ThemeContext.Provider value={{ ...theme, isDark, mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
```

Per institutional learning: stabilize context value with `useRef` + deep-compare to prevent cascade re-renders in all 30+ consumer components.

### Flash Prevention

The `mode` preference is stored in both Firestore (for cross-device sync) and localStorage (for synchronous read on cold boot). On app load:

1. ThemeProvider reads `localStorage.getItem('tmb_theme_mode')` synchronously in `useState` initializer
2. This sets the correct theme BEFORE the first render
3. Once Firestore profile loads, if the stored preference differs, update state (and localStorage)
4. This prevents the flash for users with explicit Light/Dark overrides whose OS setting differs

### getTheme() Return Value

`getTheme(isDark)` must return ALL theme objects that embed colors, not just `C`:

```js
export function getTheme(isDark) {
  const C = isDark ? CDark : CLight;
  const shadows = isDark ? shadowsDark : shadowsLight;
  const cardBase = { background: C.card, borderRadius: radius.lg, boxShadow: shadows.card, border: `1px solid ${C.border}` };
  const journalCard = { ...cardBase, border: `1px solid ${C.accentLight}`, boxShadow: shadows.card };
  return { C, fonts, shadows, cardBase, journalCard, radius };
}
```

This ensures `cardBase` and `journalCard` (consumed by 11+ files) are reactive to theme changes. Currently they are module-level constants that embed light-palette values at import time.

### Component Migration Pattern

Before:
```js
import { C, fonts, shadows, cardBase } from '../styles/theme';
```

After:
```js
import { useTheme } from '../contexts/ThemeContext';
// inside component:
const { C, fonts, shadows, cardBase } = useTheme();
```

This is a mechanical find-and-replace across ~30 files. Each file's rendering logic stays the same, only the import and destructure changes.

### Non-Component Consumer: peakStatus.js

`peakStatus.js` is a utility function (not a React component) that imports `C` at module scope and returns color values. It cannot use `useTheme()`. 

**Fix:** Change the API signature to accept the palette:
```js
// Before
export function getPeakStatus(bean) { ... uses C.green, C.amber, etc. }

// After  
export function getPeakStatus(bean, C) { ... }
```

Update all call sites (RotationTab, BeanCard, InventoryTab) to pass `C` from their `useTheme()` context.

### Native Platform Updates

When `isDark` changes, run a side effect in ThemeContext:
```js
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  Keyboard.setStyle({ style: isDark ? KeyboardStyle.Dark : KeyboardStyle.Light });
}
```

Also update:
- `document.querySelector('meta[name="theme-color"]').content` = `C.bg`
- `document.documentElement.style.background` = `C.bg` (already dynamic in App.jsx)
- `document.body.style.background` = `C.bg` (override global.css)
- CSS variables: `document.documentElement.style.setProperty('--bg', C.bg)` etc.

### Modal Overlays

Per institutional learning: canonical overlay is `rgba(44,24,16,0.4)` + `backdropFilter: 'blur(4px)'`. Dark mode keeps the warm brown overlay, not `rgba(0,0,0,...)`. May slightly increase opacity to `rgba(44,24,16,0.5)` for better contrast on dark backgrounds.

### Hardcoded Colors Audit

~45 hardcoded hex values across 12 files. Complete strategy:

| Category | Files | Action |
|----------|-------|--------|
| `#E8D5A0` border | HandBrewModal, AidenModal, ProfessorRuphusSlideUp, RotationTab | Add `C.borderGold` token, use from theme |
| `rgba(250,246,241,*)` gradient | App.jsx line 104 (rotation header fade) | Build gradient from `C.bg` dynamically |
| `#FFFFFF` backgrounds | SettingsPage (groupStyle, etc.) | Use `C.card` from theme |
| `#FFF` selected card | PaywallSheet line 396 | Use `C.card` |
| `#FDECEC` error bg | Toast.jsx | Use `C.redBg` (token exists, not used here) |
| `#5C6B4E` rotation green | App.jsx (2 occurrences) | Keep as-is (green accent, works on both) |
| `#2B5B4E` share card bg | ShareCard, AidenModal | Keep as-is (brand colors, share cards pinned to light) |
| Star fills `#8B6542` etc. | StarRating.jsx | Keep filled colors, update unfilled stroke for dark mode |
| Google/Apple button colors | SignInScreen.jsx | Keep as-is per brand guidelines (v1). Google dark button is future polish. |
| `global.css` body gradients | global.css lines 17-19 | Convert to CSS variables, use dark-appropriate subtle tones or remove |
| `global.css` focus border | global.css `#C9A87C` | Use CSS variable `var(--accent-light)` |
| `global.css` scrollbar thumb | global.css `#E8DDD3` | Use CSS variable `var(--border)` |

### Share Cards: Pin to Light Palette

Tasting share cards use `CARD_BG = C.bg` at module scope. After migration to `useTheme()`, this would produce dark-background share images when shared from dark mode. 

**Fix:** Pin tasting share card rendering to the light palette. Either:
- Import `CLight` directly (not from context) for share card colors
- Or pass a hardcoded light palette to the share card capture function

Recipe share cards (chalkboard green) are already fixed colors and unaffected.

### StarRating: Dark Mode Contrast

Unfilled coffee bean SVGs use `#A0856B` stroke. Against the proposed dark card surface `#2E2624`, contrast ratio is ~2.4:1 (below WCAG AA). 

**Fix:** Add a dark-mode unfilled stroke color to the palette (e.g., `#C8B8A8` for ~4.5:1 contrast ratio). StarRating reads from `C.starUnfilled` (new token) instead of hardcoded value.

### Settings UI

Three-way toggle in Settings under Appearance section:
- **System** (default): follows iOS appearance
- **Light**: always light
- **Dark**: always dark

Store preference in both localStorage (flash prevention) and Firestore user preferences (cross-device sync).

**Note:** SettingsPage has module-level style constants (`groupStyle`, `rowLabelStyle`, etc.) that reference `C.*` and `#FFFFFF`. These must be moved inside the component body to read from `useTheme()`, or converted to functions that accept `C`.

### SplashScreen

`capacitor.config.ts` sets `SplashScreen.backgroundColor: '#FAF6F1'`. This is build-time only. For v1, accept that the splash is always light. Dynamic splash requires native code changes (a future enhancement).

### Nav Icons

Navigation bar icons are WebP images with `opacity: 0.55` when inactive. Verify these have transparent backgrounds and are visible on the dark nav background. If not, may need dark-mode icon variants or CSS `filter: invert()`.

## Technical Considerations

### Performance
ThemeContext re-renders all consumers when theme changes. Mitigate with:
1. Stabilized context value (ref + deep-compare)
2. Theme changes are rare (settings toggle, not per-frame)
3. `useMemo` on the palette object

### global.css
Five hardcoded color values need to become CSS variables set by JS:
```css
body {
  background: var(--bg, #FAF6F1);
  background-image:
    radial-gradient(ellipse at 20% 50%, var(--bg-gradient-1, rgba(201,168,124,0.06)) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 30%, var(--bg-gradient-2, rgba(92,61,46,0.04)) 0%, transparent 50%);
}
```
Set CSS variables on theme change via `document.documentElement.style.setProperty(...)`.

### PWA Manifest
`vite.config.js` has `background_color` and `theme_color` in the manifest. These are build-time only. Accept light as default for PWA install. The runtime theme override handles the actual experience.

## Acceptance Criteria

- [ ] Dark mode toggle in Settings with System / Light / Dark options
- [ ] System mode follows iOS `prefers-color-scheme`
- [ ] Dark palette uses warm browns, no pure black
- [ ] No flash of wrong theme on app load (localStorage sync)
- [ ] All 5 tabs render correctly in dark mode
- [ ] All modals render correctly (overlays stay warm brown)
- [ ] StatusBar text color updates on iOS (light text on dark bg)
- [ ] Keyboard style updates on iOS (dark keyboard in dark mode)
- [ ] Sign-in screen renders correctly in dark mode
- [ ] Onboarding wizard renders correctly in dark mode
- [ ] PaywallSheet renders correctly (no hardcoded #FFF)
- [ ] Settings page renders correctly (no hardcoded #FFFFFF)
- [ ] Navigation bar renders correctly (verify icon visibility)
- [ ] Peak status badges show correct contrast (peakStatus.js accepts C param)
- [ ] Star ratings: unfilled beans visible on dark card backgrounds
- [ ] Rotation header gradient fades to correct bg color (not hardcoded RGBA)
- [ ] Toast error variant uses themed redBg
- [ ] Share cards maintain fixed brand colors (tasting card pinned to light palette)
- [ ] `cardBase` and `journalCard` are reactive to theme (inside getTheme, not module-level)
- [ ] Preference persists in both localStorage and Firestore
- [ ] Cross-device sync works (change on iPhone, reflected on web)
- [ ] Bean cards, spider chart render correctly
- [ ] `#E8D5A0` borders use themed `C.borderGold` token
- [ ] Web PWA also supports dark mode
- [ ] Surface elevation tiers (`C.surface2`, `C.surface3`) added and used for modals/menus
- [ ] Dark accent desaturated 10-20% vs light-mode HSL equivalent
- [ ] Mode toggle transitions smoothly (200ms bg + color fade, no snap)
- [ ] Contrast audit pass: body text ≥4.5:1, UI chrome ≥3:1 on every screen
- [ ] Final device pass done in a dark room (not just simulator)

## Implementation Phases

### Phase 1: Infrastructure
- Create `ThemeContext.jsx` with `useTheme()` hook and localStorage flash prevention
- Add `CDark` palette to `theme.js`
- Add `getTheme(isDark)` returning `{ C, fonts, shadows, cardBase, journalCard, radius }`
- Wire `ThemeProvider` in `main.jsx`
- Add dark mode toggle to SettingsPage (refactor module-level styles)
- Store preference in localStorage + Firestore
- Refactor `peakStatus.js` to accept `C` parameter
- Estimated: 1-1.5 days

### Phase 2: Component Migration
- Migrate ~30 files from static `import { C }` to `const { C } = useTheme()`
- Update all `peakStatus()` call sites to pass `C`
- Update `global.css` to CSS variables (5 values: bg, gradients, focus border, scrollbar)
- Update `App.jsx` html background + rotation gradient to use `C.bg`
- Add `C.borderGold` token, replace `#E8D5A0` in 4 files
- Fix `PaywallSheet` `#FFF`, `Toast` `#FDECEC`, `SettingsPage` `#FFFFFF`
- Add `C.starUnfilled` token, update `StarRating.jsx`
- Pin tasting share card to light palette
- Estimated: 1.5-2 days

### Phase 3: Native + Polish
- StatusBar + Keyboard style toggle on iOS
- Meta theme-color update
- Verify nav icons on dark background
- Test all screens in dark mode, fix contrast issues
- Ensure modal overlays look right on dark bg
- Test on simulator + device
- Estimated: 1 day

## Sources & References

- Competitive audit: `docs/data/2026-04-12-competitive-audit-filtru-bloom.md`
- Theme file: `src/styles/theme.js` (26 color tokens + cardBase/journalCard at module scope)
- Global CSS: `src/styles/global.css` (5 hardcoded color values)
- App root: `src/App.jsx` (html bg at line 74, rotation gradient at line 104)
- Settings: `src/components/SettingsPage.jsx` (module-level style constants with #FFFFFF)
- Preferences hook: `src/hooks/useUserProfile.jsx`
- Peak status: `src/lib/peakStatus.js` (imports C at module scope, returns hex colors)
- Star rating: `src/components/StarRating.jsx` (unfilled stroke #A0856B, low contrast on dark)
- PaywallSheet: `src/components/PaywallSheet.jsx` (line 396, #FFF selected card)
- ShareCard: `src/components/ShareCard.jsx` (CARD_BG = C.bg at module scope)
- Toast: `src/components/Toast.jsx` (#FDECEC error bg)
- Context memoization: `docs/solutions/database-issues/firestore-settings-phase2-write-patterns.md`
- Modal overlay pattern: `lessons.md` (warm brown rgba, not black)
- Platform gating: `docs/solutions/logic-errors/share-card-capture-retry-null-safety.md`
- Capacitor config: `capacitor.config.ts` (StatusBar line 19, Keyboard line 24)
- Dark-mode principles: Owl-Listener/designer-skills `ui-design/dark-mode-design` SKILL.md
