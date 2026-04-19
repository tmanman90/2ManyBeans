# Design System Document

## 1. Overview & Creative North Star
**Creative North Star: "The Artisanal Ledger"**

This design system is a digital translation of a hand-crafted specialty coffee journal. It draws deep inspiration from the "Ghibli-esque" aesthetic—where warmth, intentionality, and a sense of nostalgic comfort take precedence over cold efficiency. 

We move beyond the "standard template" by embracing **The Artisanal Ledger** philosophy: layouts are treated like high-end editorial spreads rather than rigid grids. This is achieved through generous, breathing whitespace, intentional asymmetry, and a focus on "tactile" hierarchy. Instead of boxes and borders, we use the natural physics of light and layering to guide the user. The goal is a digital experience that feels as premium and specialty as a hand-poured cup of coffee.

---

## 2. Colors

The palette is rooted in organic, earthy tones. We avoid pure whites to reduce eye strain and establish a "paper" quality to the interface.

- **Primary (`#000000`):** Used for absolute authority. This is reserved for primary CTAs and heavy headings to create high-contrast anchors.
- **Secondary (`#805531`):** The signature "warm bean" tan. Use this for storytelling elements and signature accents.
- **Surface Hierarchy (`#fdf9f4` to `#e6e2dd`):** A sophisticated range of creams and soft greys used for layering.

### The "No-Line" Rule
To maintain the artisanal feel, **1px solid borders are strictly prohibited** for sectioning. Structural boundaries must be defined solely through:
1.  **Background Color Shifts:** A `surface-container-low` section sitting on a `surface` background.
2.  **Whitespace:** Using padding as a separator rather than a line.
3.  **Tonal Transitions:** Soft, color-blocked areas that distinguish content blocks.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper. Use `surface-container` tiers to create depth:
*   **Base Layer:** `surface` (#fdf9f4).
*   **Nesting:** To highlight a card or featured section, place a `surface-container-lowest` (#ffffff) element on top of a `surface-container-low` (#f7f3ee) background.

### The "Glass & Gradient" Rule
While the aesthetic is cozy, we introduce "modern artisanal" elements through **Glassmorphism**. For floating elements (like a sticky navigation bar or a mobile menu), use `surface` colors with a 80% opacity and a `backdrop-blur` of 12px. To provide visual "soul," primary buttons can utilize a subtle gradient transitioning from `primary` (#000000) to `primary-container` (#1b1b1b).

---

## 3. Typography

The typography strategy is a conversation between the hand-drawn and the structured.

*   **Display & Headline (Noto Serif):** Our serif choice provides the editorial weight. It feels traditional, trustworthy, and high-end. 
    *   *Usage:* Large display headers should be set with tighter letter-spacing to feel like a premium magazine masthead.
*   **Body & Labels (Plus Jakarta Sans / Nunito):** A clean, modern sans-serif that ensures absolute clarity.
    *   *Usage:* Use `body-lg` for descriptions to maintain the "cozy" readability. Avoid using pure black for long-form body text; use `on-surface-variant` (#4c4546) to soften the reading experience.
*   **Signature Accents (Caveat):** Used sparingly (approx. 10-15% of the UI) for "hand-written" notes, captions, or the brand logo to inject a human touch.

---

## 4. Elevation & Depth

We convey importance through **Tonal Layering** rather than traditional structural lines or heavy shadows.

*   **The Layering Principle:** Depth is achieved by stacking. Place a "Bright" surface element on a "Dim" surface background to create a natural lift.
*   **Ambient Shadows:** For floating components (e.g., Modals), use extra-diffused shadows. 
    *   *Spec:* `box-shadow: 0 10px 40px rgba(28, 28, 25, 0.06);`. The shadow color is a tinted version of `on-surface`, never a neutral grey.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` token at **15% opacity**. High-contrast, 100% opaque borders are forbidden.
*   **Glassmorphism:** Use semi-transparent surface tokens to allow the warm background tones to "bleed" through, softening the edges of the UI.

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#000000) with `on-primary` (#ffffff) text. Radius: `md` (0.75rem). High contrast, minimalist, no border.
*   **Secondary:** `surface-container-highest` background with `on-surface` text. Used for secondary actions.
*   **Tertiary:** No background, `secondary` (#805531) text. For low-emphasis actions.

### Cards & Lists
*   **Style:** Forbid the use of divider lines. Separate list items using 16px or 24px of vertical whitespace.
*   **Nesting:** Cards should be `surface-container-lowest` (#ffffff) with a `sm` radius to feel like a physical piece of paper laid on the background.

### Input Fields
*   **Style:** Minimalist. Use a `surface-container-low` background with a `ghost border` on focus. No heavy bottom-lines or 4-sided dark borders.

### Signature Component: The "Tasting Note" Chip
*   **Context:** Unique to this system. A soft, hand-drawn-style chip using `secondary-container` (#fcc397) and `on-secondary-container` (#784f2c) to highlight flavor profiles or specialty tags.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts (e.g., text aligned left with an image offset to the right) to feel artisanal.
*   **Do** prioritize "Reading Time." The generous whitespace is designed for a slow, premium browsing experience.
*   **Do** use `Caveat` for small, delightful details, like a "Hand-picked" label.

### Don't
*   **Don't** use 1px solid black dividers. It breaks the "Artisanal Ledger" immersion.
*   **Don't** use standard blue for links. Use `secondary` (#805531) or `primary` with an underline.
*   **Don't** crowd the interface. If it feels "busy," increase the padding by at least 25%.
*   **Don't** use sharp corners. Every element should have at least a `sm` (0.25rem) radius to maintain the "soft" Ghibli feel.