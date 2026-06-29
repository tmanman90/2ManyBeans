# Coffee Hub — Motion Contract (SwiftUI-grade, framer-motion)

Translated from SwiftUI animation patterns (ref: Shubham0812/SwiftUI-Animations) into
framer-motion recipes tuned for WKWebView. Rule: transform/opacity only; spring physics;
honor prefers-reduced-motion (global `<MotionConfig reducedMotion="user">`).

Tokens (already in theme.js `motion.spring`):
| token | stiffness | damping | use |
|---|---|---|---|
| soft | 260 | 30 | list mounts, card layout, hero expand |
| snappy | 420 | 34 | tab indicator, sheet present/dismiss |
| bouncy | 500 | 24 | badges, success check, press feedback |
| ease.out | cubic-bezier(0.22,1,0.36,1) | | scrim/opacity crossfades |

## Core recipes
1. **Tab indicator** — shared-element `layoutId` pill, `spring.snappy`. Animate the pill only; never sibling labels. (Already in App.jsx — keep, formalize physics.)
2. **List mount stagger + press** — container `staggerChildren: 0.055`, item `{opacity, y:18→0}` `spring.soft`; `whileTap={{scale:0.97}}` `spring.bouncy`. Don't put `layout` on every card per-render.
3. **Card → detail expand (matchedGeometry)** — `layoutId="bean-card-{id}"` on compact + full; inner text `layout="position"` so type doesn't distort. One at a time. Hide steam shader until layout settles.
4. **Bottom sheet** — `{y:'100%'→0}` `spring.snappy`, `drag="y"` scoped to handle, `dragElastic={{top:0.05,bottom:0.3}}`, dismiss on `velocity.y>300 || offset.y>150`. `touchAction:'none'` on drag target (critical: WKWebView scroll fights pointer otherwise).
5. **Number/score ticker** — `useSpring(useMotionValue(0),{260,30})` + `useTransform`. CPU only; keep <10 concurrent.
6. **Success check** — SVG `pathLength 0→1` `spring.soft` + circle `scale 0→1` `spring.bouncy`.
7. **Badge pop-in** — `AnimatePresence mode="popLayout"`, `{scale:0.6,opacity:0}→{1,1}` `spring.bouncy`.
8. **Page/tab transition** — subtle: x `±15–30%` + opacity, `spring.soft`, `willChange:'transform'`. Don't slide a view containing a WebGL canvas.
9. **Parallax hero** — `useScroll`+`useTransform` drives the metadata layer's `y/opacity`; NEVER wrap the WebGL canvas in motion (re-promotes layer every frame, kills FPS). Canvas owns its own layer.
10. **Shimmer skeleton** — CSS keyframe loop for the shimmer (cheaper than MotionValue), framer only for mount/unmount.

## Signature moments (award-worthy — build these deliberately)
1. **Bean card → full detail (Wallet hero):** card morphs to full-screen via `layoutId`; title/photo continue as same element. `spring.soft`. The single most "real iOS app" moment.
2. **Tasting score reveal:** score counts up (`useSpring`), spider-chart arms draw via SVG `pathLength` stagger (0.08s/axis), flavor badges pop (`spring.bouncy`). ~800ms, feels earned.
3. **Bag finished:** bag icon `scale:[1,1.4,0]`+fade (`spring.bouncy`), success check draws, card flies `y:-60,opacity:0`, list reflows via `popLayout` `spring.soft`. Closure + delight.
4. **Scan → added flight:** scan thumbnail `layoutId`-flies to the rotation tab/slot. One spring arc `spring.bouncy`, ~400ms. Physics prove "it went there."
