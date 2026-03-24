```markdown
# Design System: Beaman Woodworks

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Joiner"**

This design system is an exercise in structural integrity and quiet confidence. Much like a hand-cut dovetail joint, the interface must feel inseparable from its purpose—functional, permanent, and inherently beautiful. We are moving beyond "standard" minimalism into **Organic Brutalism**: a style that favors heavy, intentional type and raw, unadorned surfaces over decorative flourishes.

To break the "template" look, we utilize **Intentional Asymmetry**. Large-scale typography is often offset or overlapped by imagery, mimicking the way wood grain intersects at a corner. The digital experience should feel as tactile as a planed oak board, utilizing high-contrast "OLED" blacks to ground the warmth of the "Komorebi" tones.

---

## 2. Colors: The 'Komorebi Oak' Palette
The palette transitions from the deep shadows of a workshop to the dappled light (Komorebi) hitting a finished workpiece.

### Tonal Hierarchy
*   **Primary (`#e1c299`):** The "Raw Oak." Used for high-action CTAs and brand moments.
*   **Surface (`#131313`):** The "Inked Black." Our foundational dark mode, providing a deep, high-contrast canvas.
*   **On-Surface-Variant (`#d4c3b9`):** The "Paper White." Used for secondary text to provide a softer, more artisanal read than pure white.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined through background color shifts.
*   *Implementation:* A section featuring project details should use `surface-container-low` (`#1b1b1b`) to sit subtly atop the `surface` (`#131313`) background. Let the change in value define the edge, not a line.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of materials:
1.  **Base Layer:** `surface` (`#131313`)
2.  **Sectional Layer:** `surface-container-low` (`#1b1b1b`)
3.  **Interactive Layer (Cards/Modals):** `surface-container-high` (`#2a2a2a`)

### Signature Textures & Glass
To evoke the precision of Japanese joinery, use **Glassmorphism** for navigation overlays or floating toolbars. Use `surface-variant` (`#353535`) at 60% opacity with a `24px` backdrop blur. This allows the richness of product photography to "bleed" through the UI, softening the industrial edges.

---

## 3. Typography: Editorial Authority
We pair the geometric, rhythmic verticality of the Arts and Crafts movement with the hyper-legibility of modern Swiss design.

| Level | Token | Font Family | Size | Character |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | ITC New Rennie Mackintosh | 3.5rem | Architectural, Tall, Grand |
| **Headline**| `headline-md` | ITC New Rennie Mackintosh | 1.75rem | Authoritative, Artisan |
| **Title**   | `title-lg` | Work Sans | 1.375rem | Clean, Technical |
| **Body**    | `body-lg` | Work Sans | 1.0rem | Accessible, Humanist |
| **Label**   | `label-sm` | Work Sans | 0.6875rem | Utilitarian, All-Caps (0.1em tracking) |

**Typography Strategy:**
*   **The Mackintosh Header:** Use `ITC New Rennie Mackintosh` for all storytelling. Its elongated stems evoke the tall trees of the American forest and the verticality of Japanese shoji screens.
*   **The Technical Sans:** Use `Work Sans` for all functional UI (pricing, specs, buttons). This separation ensures the brand feels like a "studio" rather than just a "store."

---

## 4. Elevation & Depth
In this system, elevation is a product of light and shadow, not lines.

*   **The Layering Principle:** Depth is achieved via tonal "stacking." A `surface-container-highest` (`#353535`) element should be used only for the most critical interactive components (e.g., a "Buy" button or an active state).
*   **Ambient Shadows:** For floating elements, use a "Woodsmoke Shadow": `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4)`. The blur must be wide and soft.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` (`#50443d`) at **15% opacity**. It should be felt, not seen.
*   **Corner Treatment:** Every element uses `0px` border-radius. In high-end woodworking, sharp, crisp edges are a sign of mastery. Soft corners are for mass-market furniture; we are bespoke.

---

## 5. Components

### Buttons: Tactile Precision
*   **Primary:** `primary` (`#e1c299`) background with `on-primary` (`#402d10`) text. No radius.
*   **Tertiary (The "Chisel" Link):** `ITC New Rennie Mackintosh` text with a 2px underline that animates from 0% to 100% width on hover.
*   **States:** Hover states should involve a subtle shift to `primary-container` (`#a88c67`).

### Cards & Collections
*   **Rule:** Forbid divider lines.
*   **Layout:** Use the `20` (7rem) spacing token to separate project stories. Use `surface-container-lowest` (`#0e0e0e`) as the card background to create an "inset" look, making the product photo pop as if it were framed.

### Input Fields
*   **Styling:** Minimalist bottom-border only using `outline` (`#9d8e84`). When focused, the border transitions to `primary` (`#e1c299`).
*   **Label:** Use `label-sm` in all-caps, positioned above the field to mimic technical blueprints.

### Custom Woodworking Icons
*   **Stroke:** 1.5pt consistent line weight.
*   **Style:** Stylized, geometric representations of a block plane, a dovetail saw, and a marking gauge. Always rendered in `secondary` (`#c6c7c2`).

---

## 6. Do’s and Don’ts

### Do
*   **Embrace Negative Space:** Use the `24` (8.5rem) spacing scale liberally. Luxury is defined by the space you *don't* fill.
*   **Asymmetric Grids:** Align text to a left-margin while allowing imagery to bleed off the right edge of the screen.
*   **Tonal Layering:** Use background shifts to guide the eye. A darker section implies a "footing" or a "base."

### Don’t
*   **No Rounded Corners:** Do not use `0.5rem` or any rounding. It dilutes the "artisan" precision of the brand.
*   **No High-Contrast Borders:** Never use a 100% opaque border to separate content. It creates visual noise that competes with the craftsmanship of the photography.
*   **No Standard Drop Shadows:** Avoid the "fuzzy" default shadow. If it doesn't look like ambient light in a workshop, don't use it.

---

## 7. Favicon & Brand Mark
The favicon is a stylized **Joinery Joint (The Half-Blind Dovetail)**. It is a vector representation of two interlocking pieces of wood, rendered in `primary` on a `surface` background. It serves as a microscopic testament to the brand's obsession with how things fit together.