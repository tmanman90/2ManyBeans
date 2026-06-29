---
name: ios-design
description: iOS mobile design awareness for Capacitor + React apps. Safe areas, status bar, notch, touch targets, keyboard handling, and Apple HIG patterns.
triggers:
  - when writing or modifying any UI component, layout, or style
  - when fixing layout bugs on iOS
  - when the user mentions iPhone, iOS, native, safe area, status bar, notch, or keyboard
---

# iOS Mobile Design for Capacitor + React

You are building a React PWA wrapped in Capacitor for iOS. Every UI decision must account for real iPhone hardware.

## Safe Areas (the #1 source of iOS layout bugs)

iPhones have unsafe regions: status bar (top), home indicator (bottom), Dynamic Island / notch (top corners).

### Rules
- ALWAYS use `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, `env(safe-area-inset-right)` for edge-to-edge layouts
- The `<meta name="viewport">` MUST include `viewport-fit=cover` for safe area env vars to work
- Top-level page content needs `padding-top: env(safe-area-inset-top)` or equivalent
- Fixed bottom bars (tab bars, input bars) need `padding-bottom: env(safe-area-inset-bottom)`
- On iPhone 16 Pro, `safe-area-inset-top` is ~59px. On SE, it's ~20px. Never hardcode these.

### Common Capacitor Gotchas
- `StatusBar.setOverlaysWebView(true)` means YOUR layout must handle the status bar area -- the system won't push content down
- If `StatusBar.setOverlaysWebView(false)`, the system handles it but you lose edge-to-edge design
- The Keyboard plugin shifts the viewport on iOS -- fixed-position elements must respond to `keyboardWillShow` / `keyboardWillHide` events
- `position: fixed; bottom: 0` on iOS Safari/WKWebView is unreliable with keyboards -- prefer `position: sticky` or manual keyboard height adjustment

### CSS Pattern for Safe Content Area
```css
.app-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  min-height: 100vh;
  min-height: 100dvh; /* dynamic viewport height -- excludes browser chrome */
}
```

### For Fixed Bottom Bars (tab bars, input bars)
```css
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
}
/* Content above the bar needs margin to avoid being hidden */
.content { padding-bottom: calc(60px + env(safe-area-inset-bottom)); }
```

## Touch Targets

- Minimum tap target: 44x44pt (Apple HIG). 48x48px preferred.
- Spacing between adjacent tap targets: minimum 8px
- Interactive text links: wrap in a padded container, don't rely on text size alone
- Swipe gestures: account for iOS edge swipe (back navigation) -- don't put swipeable UI within 20px of screen edges

## Typography for Mobile

- Minimum body text: 16px (prevents iOS Safari auto-zoom on input focus)
- Input fields MUST be 16px+ font-size or iOS will zoom the viewport on focus
- Use `-webkit-text-size-adjust: 100%` to prevent unwanted text scaling
- Line height: 1.4-1.6 for readability on small screens

## Performance on Mobile

- Prefer `transform` and `opacity` for animations (GPU-accelerated, no layout thrash)
- Use `will-change` sparingly -- only on elements actively animating
- Avoid `box-shadow` on large scrolling lists (causes jank on older iPhones)
- `border-radius` on images with `overflow: hidden` can cause compositing issues -- use `clip-path` if jank appears
- Lists with 50+ items: virtualize (react-window, react-virtuoso) to avoid DOM bloat

## Capacitor-Specific Patterns

- Use `Capacitor.isNativePlatform()` to branch native-only behavior
- Camera, Haptics, Keyboard plugins are async imports -- lazy-load them
- `100vh` on iOS includes the URL bar area in Safari. Use `100dvh` (dynamic viewport height) or JS measurement for true visible height.
- WKWebView has limited IndexedDB support -- Firestore should use `browserLocalPersistence` on native, not `persistentLocalCache`

## When Reviewing or Modifying UI

Before suggesting any layout change, mentally check:
1. Does this respect safe areas on all iPhone models (SE through 16 Pro Max)?
2. Are all tap targets at least 44x44pt?
3. Will this look correct with the keyboard open?
4. Is `env(safe-area-inset-*)` used where content touches screen edges?
5. Are fixed/sticky elements properly accounting for the home indicator?
