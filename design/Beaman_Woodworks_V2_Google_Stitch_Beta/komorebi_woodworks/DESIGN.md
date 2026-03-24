# Design System Document

## 1. Overview & Creative North Star: "The Master’s Workshop"

This design system is a digital translation of *Shokunin* (the artisan spirit). It is built to showcase craftsmanship that is meant to last generations, framed within a digital interface that celebrates *Ma* (negative space) and the Japanese concept of *Mono no Aware*—the quiet beauty of transience and the natural world.

**Creative North Star: The Organic Editorial**
The experience must feel less like a "website" and more like a high-end, limited-run architectural monograph. We break the "template" look by utilizing intentional asymmetry, where large typographic headlines (`display-lg`) are balanced against generous voids of `surface`. The goal is to create a tactile sense of paper and wood, where the interface recedes to let the grain of the photography and the soul of the work take center stage.

---

## 2. Colors: Tonal Depth vs. Structural Lines

The palette is derived from natural materials: the off-white of handmade washi paper, the deep warmth of walnut, and the charcoal of sumi ink.

*   **Primary (`#725338`) & Secondary (`#6d5b4d`):** Used for intentional focal points—CTAs and active states. They represent the "Tool" and the "Material."
*   **Surface Hierarchy (The Washi Rule):** We use Material Design tiers to simulate the stacking of paper.
    *   `surface` (`#fef9f2`): The base tabletop.
    *   `surface_container_low` (`#f8f3ec`): A secondary sheet of paper.
    *   `surface_container_highest` (`#e7e2db`): For focused interactive components.

**The "No-Line" Rule:** 
To maintain an organic, premium feel, 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined through background color shifts. A `surface_container_low` section sitting on a `surface` background is the only "divider" permitted.

**Signature Textures & Gradients:**
Main CTAs should utilize a subtle linear gradient from `primary` to `primary_container` at a 45-degree angle. This mimics the light catching a finished wood edge, providing a visual "soul" that flat hex codes cannot achieve.

---

## 3. Typography: The Mackintosh Legacy

Typography is the primary architecture of this design system. We juxtapose the highly stylized, vintage-character of Mackintosh with the invisible efficiency of modern sans-serifs.

*   **Brand & Display (ITC New Rennie Mackintosh):** Used for `display-lg` through `headline-sm`. This font is an art-nouveau masterpiece; it should be given room to breathe. Use it for philosophical statements, project titles, and section headers.
*   **Body & Utility (Work Sans):** Used for all `body` and `title` scales. This provides a clean, "industrial blueprint" feel that complements the artisanal display face.
*   **Labels (Inter):** Reserved for technical data, dimensions, and wood species (`label-sm`).

**Hierarchy Strategy:** 
The extreme contrast between the height of Mackintosh letters and the grounded nature of Work Sans communicates a brand that is both visionary (Art) and practical (Joinery).

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are too heavy for this aesthetic. We achieve depth through the **Layering Principle.**

*   **Ambient Shadows:** When a card must "float" (e.g., a featured commission), use a shadow tinted with `on_surface` (charcoal).
    *   *Specs:* 0px 12px 32px, 6% opacity of `#1d1c17`.
*   **The "Ghost Border":** If a container requires definition for accessibility (like an input field), use `outline_variant` at 20% opacity. Never use a 100% opaque border.
*   **Glassmorphism & Ma:** For floating navigation or tooltips, use `surface_container_lowest` with a 12px backdrop-blur and 85% opacity. This allows the "wood grain" of the background photography to bleed through, softening the interface.

---

## 5. Components: Refined & Functional

Components are inspired by the joinery and hardware found in a woodworking studio.

*   **Buttons:**
    *   **Primary:** Filled with `primary` gradient, `rounded-sm` (0.125rem) to mimic a hand-planed edge. Text is `label-md` in `on_primary`.
    *   **Secondary:** Ghost style. No background, `outline_variant` (20% opacity), with `primary` text.
*   **Cards & Lists:** 
    *   **Rule:** Forbid divider lines. Use `spacing-8` or `spacing-12` to create separation. 
    *   **Portfolio Cards:** Use `surface_container_low` backgrounds. On hover, transition to `surface_container_highest` with a soft ambient shadow.
*   **Input Fields:**
    *   Minimalist "Underline" style or a very soft `surface_variant` fill. Labels should use `body-sm` in `on_surface_variant`. 
    *   Error states use `error` text, but avoid "Red Boxes." Use a small `error` dot (2px) next to the helper text.
*   **Chips (Wood Species/Tags):** 
    *   Use `secondary_container` with `on_secondary_container` text. `rounded-full` is allowed here to contrast the sharp lines of the furniture.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Place a `display-lg` header on the left with 60% whitespace to its right.
*   **Prioritize Photography:** Use high-resolution imagery with natural lighting. The UI should feel like a gallery frame around the photo.
*   **Use the Spacing Scale:** Stick strictly to the `spacing` tokens (e.g., `spacing-16` for hero margins) to ensure the "Ma" feels intentional, not accidental.

### Don't:
*   **No "Web 2.0" Gradients:** Avoid high-contrast, shiny, or metallic gradients. Stick to the "wood-sheen" tonal shifts.
*   **No Pure Black:** Never use `#000000`. Use `on_surface` (`#1d1c17`) or charcoal ink tones to maintain a vintage, printed feel.
*   **No Crowding:** If a section feels "full," increase the spacing by one tier. This system succeeds through restraint.
*   **No Standard Borders:** Avoid the "boxed-in" look. Let the edges of the screen and the shifts in paper tone define the space.