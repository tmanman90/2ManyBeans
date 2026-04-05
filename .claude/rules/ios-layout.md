---
paths:
  - "src/components/**"
  - "src/tabs/**"
  - "src/App.jsx"
  - "index.html"
---

# iOS Layout Rules (auto-loaded for UI files)

This is a Capacitor iOS app. Every UI change must account for real iPhone hardware.

## Safe Areas
- ALWAYS use `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` for content near screen edges
- NEVER hardcode status bar or home indicator heights
- `viewport-fit=cover` is required in the viewport meta tag for env vars to work
- Fixed bottom bars need `padding-bottom: env(safe-area-inset-bottom)`

## Touch & Typography
- Minimum tap target: 44x44pt (Apple HIG)
- Input fields MUST be 16px+ font-size (prevents iOS auto-zoom on focus)
- NO minWidth/minHeight on BeanCard icon buttons (squeezes title text)

## Layout Gotchas
- `100vh` includes URL bar on iOS. Use `100dvh` or JS measurement.
- `position: fixed; bottom: 0` is unreliable with iOS keyboards. Use Keyboard plugin events.
- `StatusBar.setOverlaysWebView(true)` means YOUR layout handles the status bar area.

## Performance
- Prefer `transform`/`opacity` for animations (GPU-accelerated)
- Avoid `box-shadow` on scrolling lists

## Platform Branching
- `Capacitor.isNativePlatform()` for native-only behavior
- API URLs: relative on web, absolute (`https://2manybeans.vercel.app`) on native
- Camera: `<input type="file">` on web, `@capacitor/camera` on native
- Haptics: no-op on web, `@capacitor/haptics` on native (`src/lib/haptics.js`)

## Before Every UI Change
1. Does this respect safe areas on all iPhones (SE through 16 Pro Max)?
2. Are all tap targets at least 44x44pt?
3. Will this look correct with the keyboard open?
4. Are fixed/sticky elements accounting for the home indicator?
