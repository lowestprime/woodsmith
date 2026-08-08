# Media surface ledger

Updated: 2026-08-08

This ledger records every visible grouped-media surface in Beaman Woodworks and the non-overlapping replacement selected for it. It is the acceptance source for the shared media collection work and the visual archive's rendered no-overlap gate.

The 2026-08-08 v19 archive regression passed 155 application tests and 84 visual-audit tests. Its disposable snapshot lab produced 445 captures across 48 routes and the complementary live-readonly run produced 366 captures across 36 routes, both with zero unexpected diagnostics and complete Docker cleanup. The protected route ledger now gives the Projects editor and each Notifications subview stable deep-capture identities. This is content-equivalent local evidence from intentionally unstamped images; final exact Tier 1, production-clone Tier 2, and live-production Tier 3 media evidence remain required.

## Current implementation evidence

The shared normal-flow architecture is integrated in this implementation slice. Targeted validation on 2026-07-17 produced:

- 72 passing application tests, including stable identity, one/two/three/six/twelve-plus normalization, image/video metadata, loading policy, deterministic UTC dates, and snapshot-lab isolation.
- 62 passing visual-audit tests, including exact positive-area intersection detection and deterministic no-overlap report generation.
- A passing TypeScript check and clean `git diff --check`.
- A rendered Edge/Playwright gate with 16 snapshot-lab viewport/theme states and 8 real Pastry Table viewport/theme states. Each snapshot-lab state exposed eight collections and 53 distinct media boxes. The fresh canonical Pastry Table seed exposed its one verified detail collection, while the isolated fixture exercised the process-sequence variant. The gate found zero intersections above the 0.75 px subpixel tolerance, zero broken media, zero document overflow, and zero browser diagnostics.
- Passing keyboard Enter/Space selection, modal focus trap/restoration, zoom, pan, Escape, close button, backdrop click, touch selection, video controls, and reduced-motion behavior.

This is pre-deployment acceptance evidence, not the final exact-image or post-deployment live-production archive. Those later release gates remain required.

## Rejected baseline

The public Pastry Table route on the deployed `81b35c4` production image was measured in a rendered browser before replacement.

| Viewport | Collection width | Track width | Card width | Adjacent offset | Positive intersections |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop, 1440 px | 736 px | 2663 px | 469.33 px | 365.60 px | 6 at about 36,513 px2 each |
| Mobile, 390 px | 354 px | 2250 px | 469.33 px | 296.80 px | 6 at about 60,731 px2 each |

The cards were static and untransformed. The overlap came from an overflowing column-grid track calculation, not from a deliberate transform. Fixing one transform or z-index would therefore have been insufficient. Screenshots are retained outside Git at `C:\Users\Cooper\Desktop\Woodmat Media Baseline 20260717`.

## Shared contract and variants

Every shared collection item preserves a stable identity, source, alt text, image/video kind, focal point, crop zoom, cleanup mode, caption, title, process stage, occurrence date, media role, and normalized order. The full-screen lightbox is a separate dialog/controller so collection layout can change without weakening modal semantics, focus trapping/restoration, Escape, previous/next, zoom, pan, keyboard, pointer, touch, image, or video behavior.

Selected variants:

- `detail-stage`: stable primary stage plus an independently laid-out thumbnail rail. Direct selection and previous/next controls are always visible when applicable.
- `editorial-grid`: deterministic responsive grid with one normal-flow box per item and captions adjacent to their media.
- `process-sequence`: stage-aware sequence tied to normalized build metadata and DOM order.
- `picker-grid`: dense selectable administrative grid with explicit selection, order, role, reorder, and remove controls.
- `single`: one media item using the same dialog without collection controls.

No variant may use negative margins, rotated children, translated pile offsets, ordinary-item absolute positioning, z-index collection order, clipped underlying cards, autoplay, auto-advance, or hover-only discovery.

## Public surfaces

### Portfolio piece gallery

- Route/component: `/portfolio/[slug]`; `PiecePage` and the former `MediaLightbox` preview.
- Audience: public buyers, clients, and signed-in administrators.
- Current classes: `.media-gallery-shell`, `.piece-media-carousel`, `.media-card`.
- Current layout: horizontally scrolling CSS Grid with automatic columns; rendered evidence shows positive-area card intersections.
- Media source: reviewed public normalized `piece_media_links` display roles, with synchronized legacy paths for compatibility.
- Image/video support: current public mapping is image-only even when a media record exists.
- Ordering source: normalized link display order, then compatible legacy order.
- Focal/crop behavior: media focal X/Y and zoom applied to a cover image; cleanup display mode is retained.
- Lightbox behavior: mature shared dialog with focus trap/restoration, Escape, arrows, zoom, pan, pointer, and touch.
- Scrolling behavior: mandatory horizontal snap with explicit previous/next controls.
- Keyboard behavior: collection openers are buttons; dialog supports arrows, plus, minus, zero, Tab, and Escape.
- Mobile behavior: fixed computed card widths overflow and intersect more severely at 390 px.
- Overlap mechanism: automatic grid tracks compute wider than the adjacent column offset.
- Performance concerns: every preview image is mounted; sizing hints describe the old carousel rather than the selected primary image.
- Archive coverage: public route, lightbox boundaries, desktop/tablet/mobile, light/dark; prior archive lacked a collection intersection assertion.
- Implemented replacement variant: `detail-stage`.

### Portfolio build record

- Route/component: `/portfolio/[slug]`; `PiecePage` build-record section.
- Audience: public buyers, clients, and signed-in administrators.
- Current classes: `.piece-process-layout`, `.piece-process-timeline`, `.piece-process-carousel`, `.media-card`.
- Current layout: text timeline beside an independently scrolling automatic-column media track.
- Media source: reviewed public normalized `piece_media_links` with `process`, `drawing`, `plan`, or `installation` roles.
- Image/video support: images and videos.
- Ordering source: normalized link display order.
- Focal/crop behavior: focal X/Y and zoom on images; stage preview uses cover framing.
- Lightbox behavior: mature shared dialog.
- Scrolling behavior: independent horizontal snap detached from timeline position.
- Keyboard behavior: button openers and dialog controls; timeline itself is static.
- Mobile behavior: timeline and media collapse but the old media track retains oversized tracks.
- Overlap mechanism: the same automatic-column track behavior as the piece gallery.
- Performance concerns: all sequence media mount at once and visual order can be read separately from timeline metadata.
- Archive coverage: build-record route states and lightbox states; prior archive lacked timeline/order and intersection assertions.
- Implemented replacement variant: `process-sequence`, with each stage's metadata visibly attached to its media and identical DOM/visual order.

### Process-note cover

- Route/component: `/process/[slug]`; `ProcessPostPage`.
- Audience: public readers and signed-in administrators.
- Current classes: `.journal-cover`, `.media-card` through the former shared preview.
- Current layout: one cover item.
- Media source: process post `coverMediaPath`.
- Image/video support: image only.
- Ordering source: not applicable; one item.
- Focal/crop behavior: the route currently lacks record-level focal metadata.
- Lightbox behavior: mature shared dialog.
- Scrolling behavior: none.
- Keyboard behavior: button opener and dialog controls.
- Mobile behavior: responsive single media box.
- Overlap mechanism: none.
- Performance concerns: no collection overhead is needed.
- Archive coverage: process detail and lightbox state.
- Implemented replacement variant: `single`.

### Portfolio, Workshop, and Shop card grids

- Route/component: `/portfolio`, `/`, `/shop`; `PieceCard` and shop cards.
- Audience: public buyers and clients.
- Current classes: `.piece-grid`, `.piece-card`, shop product-card classes.
- Current layout: normal-flow responsive record grids with one representative image per record.
- Media source: reviewed public hero/display link for each piece.
- Image/video support: representative images only.
- Ordering source: page feature/order logic and piece records.
- Focal/crop behavior: stored focal and zoom metadata where supplied.
- Lightbox behavior: cards navigate to detail or shop actions; no grouped-media dialog.
- Scrolling behavior: document flow only.
- Keyboard behavior: normal links and controls.
- Mobile behavior: columns collapse without item overlap.
- Overlap mechanism: none; retained as a regression surface because multiple media-backed records are visible together.
- Performance concerns: only representative images should be requested and non-LCP cards should remain lazy.
- Archive coverage: canonical public routes across the viewport/theme matrix.
- Implemented variant: retained normal-flow editorial record grid with shared no-overlap audit identities.

### Shop cart thumbnails

- Route/component: `/shop/cart`; cart line items.
- Audience: buyers.
- Current classes: cart line and thumbnail classes.
- Current layout: normal-flow line-item list with one image per line.
- Media source: each selected piece's public representative media.
- Image/video support: image only.
- Ordering source: cart insertion order.
- Focal/crop behavior: representative crop.
- Lightbox behavior: none.
- Scrolling behavior: document flow only.
- Keyboard behavior: native cart controls and links.
- Mobile behavior: compact line-item layout.
- Overlap mechanism: none.
- Performance concerns: thumbnails must stay thumbnail-sized.
- Archive coverage: cart empty/populated snapshot-lab states.
- Implemented variant: retained normal-flow compact list with collection audit identity.

## Administrative and customer surfaces

### Studio media library browser

- Route/component: `/studio?panel=media`; `StudioMediaWorkspace`.
- Audience: administrators.
- Current classes: `.studio-media-browser-grid`, media cards and inspector classes.
- Current layout: paginated dense CSS Grid plus master-detail inspector.
- Media source: indexed writable mounted media library.
- Image/video support: image, video, and other-file fallbacks.
- Ordering source: requested library sort and pagination.
- Focal/crop behavior: thumbnails use stored media metadata; inspector exposes crop/edit controls.
- Lightbox behavior: inspector opens the mature dialog for one selected item.
- Scrolling behavior: document or workspace pane; no piled selection track.
- Keyboard behavior: focusable cards, hotkeys, inspector forms, and dialog controls.
- Mobile behavior: grid and inspector collapse to one column.
- Overlap mechanism: none in the current grid; retained and normalized into the shared administrative contract.
- Performance concerns: library is paginated and thumbnails must not request originals unnecessarily.
- Archive coverage: media pages, filters, inspector, expanded inspector, and inspector lightbox.
- Implemented variant: `picker-grid` for the browser and `single` for the inspector.

### Reusable media picker browser

- Route/component: Studio page/piece/process editors; `MediaPicker` modal.
- Audience: administrators.
- Current classes: `.media-picker-grid`, `.media-picker-card`, `.media-picker-dialog`.
- Current layout: paginated selectable CSS Grid.
- Media source: the complete indexed mounted library through `loadMediaPageAction`.
- Image/video support: image thumbnails with video/other fallbacks.
- Ordering source: server pagination and filter result order.
- Focal/crop behavior: picker thumbnail currently uses the source without focal positioning.
- Lightbox behavior: none inside the picker.
- Scrolling behavior: bounded dialog content and pagination.
- Keyboard behavior: focus trap, Escape, search, native controls, and selectable buttons.
- Mobile behavior: responsive two-column or single-column grid in a full-height dialog.
- Overlap mechanism: none.
- Performance concerns: 48-item page cap; lazy thumbnail loading.
- Archive coverage: default, filtered-empty, pagination, and selection states.
- Implemented variant: `picker-grid`.

### Selected piece media and normalized relation editor

- Route/component: `/studio?panel=pieces`; `MediaPicker` selected strip and `PieceMediaEditor`.
- Audience: administrators.
- Current classes: `.media-picker-strip`, `.media-picker-chip`, `.piece-media-relation-list`, relation cards.
- Current layout: normal-flow selected chips plus one relation form per normalized link.
- Media source: selected mounted-library paths and `piece_media_links`.
- Image/video support: images with kind fallbacks.
- Ordering source: selected path order synchronized transactionally to normalized display order.
- Focal/crop behavior: thumbnail preview; media-level crop is edited in the media workspace.
- Lightbox behavior: none in the relation editor.
- Scrolling behavior: document flow; picker modal when browsing.
- Keyboard behavior: direct earlier/later and remove buttons; labeled role/stage/order controls.
- Mobile behavior: cards collapse to one column.
- Overlap mechanism: none.
- Performance concerns: only selected thumbnails are mounted; long relation sets need compact controls.
- Archive coverage: piece editor, picker, selected states, and relation controls.
- Implemented variant: `picker-grid` selection strip and role editor, retaining direct order/remove operations.

### Studio project media strips

- Route/component: `/studio?panel=projects` and the project assignment area in `StudioMediaWorkspace`.
- Audience: administrators.
- Current classes: `.project-media-strip`.
- Current layout: normal-flow thumbnail grid/strip with one box per attached file.
- Media source: private project media assignments and project-linked media records.
- Image/video support: image previews with file links/fallbacks.
- Ordering source: project media record order.
- Focal/crop behavior: compact crop thumbnails.
- Lightbox behavior: one implementation links to media; another uses the inspector workflow.
- Scrolling behavior: document/workspace flow.
- Keyboard behavior: native links/buttons.
- Mobile behavior: fewer columns without overlap.
- Overlap mechanism: none.
- Performance concerns: private media must remain bounded, lazy, and excluded from public output.
- Archive coverage: authenticated project panel and media workspace project state.
- Implemented variant: compact `editorial-grid` audit identity using the shared item contract and `single` dialog where preview is allowed.

### Commission reference upload previews

- Route/component: `/commissions`; `CommissionWorkflow` upload step.
- Audience: prospective buyers and signed-in customers.
- Current classes: `.commission-upload-previews` and child figures.
- Current layout: normal-flow local preview grid with filename and remove button.
- Media source: browser-selected local object URLs before private submission.
- Image/video support: accepted reference images and supported upload types.
- Ordering source: browser file selection order.
- Focal/crop behavior: contained local preview; no persisted crop before upload.
- Lightbox behavior: none before submission.
- Scrolling behavior: document flow.
- Keyboard behavior: native file input and remove buttons.
- Mobile behavior: responsive grid.
- Overlap mechanism: none.
- Performance concerns: object URLs are revoked; large selections are bounded by intake validation.
- Archive coverage: snapshot-lab upload step and validation states; real files must remain synthetic.
- Implemented variant: normal-flow `editorial-grid` audit identity with explicit filename/remove controls.

## Alternatives evaluated

### A. Detail stage plus thumbnail rail

The primary image occupies one stable aspect-ratio stage. A distinct normal-flow rail contains direct-selection buttons with fixed thumbnail boxes. The stage alone carries the LCP preload; secondary thumbnails are lazy. The control row exposes previous, next, and `item x of y`. Portrait, landscape, extreme, image, and video items use containment appropriate to kind without changing stage geometry. The stage opens the separate lightbox.

This pattern minimizes page height and interaction cost for furniture detail photography while retaining direct discoverability. It is strongest for 2-12+ item detail galleries and narrow mobile layouts. One-item mode removes redundant navigation and rail controls.

### B. Responsive editorial grid

Every item occupies a deterministic CSS Grid cell in DOM order with an explicit stable aspect-ratio wrapper. Captions remain outside the image. The grid exposes more images without interaction and is strongest for small reference sets, Studio project attachments, and commission previews. For 12+ media it consumes substantially more page height and requests more visible thumbnails, so it is not the default detail-gallery pattern.

### Process and Studio specializations

Build records use `process-sequence`: normalized order, stage, date, title, and caption stay attached to the corresponding media, preventing divergence between a text timeline and an independent visual track. Studio selection uses `picker-grid`: selected state, role, order, reorder, and remove remain explicit and keyboard operable.

## Selection rationale

The selected mixed architecture follows the client's rejection of all overlapping groups, gives furniture photography one stable visual focus, preserves complete direct discovery, and avoids forcing public detail, chronological process, and administrative selection into one layout. All variants use normal-flow boxes, deterministic DOM order, explicit controls, and stable sizing, which improves accessibility, mobile behavior, image loading, component reuse, and visual-archive reproducibility. The design prototype's normal-flow portfolio cards support this direction; no prototype evidence justified retaining overlap.

## Acceptance gates

- Unit and structural gate: implemented and passing for item normalization, variant semantics, one/many behavior, metadata association, snapshot-lab isolation, and preload policy.
- Rendered no-overlap gate: implemented as `npm run test:media-browser`; it compares every visible `[data-media-item]` rectangle with every peer in its nearest `[data-media-collection]`, permits only a documented 0.75 px subpixel tolerance, and fails any positive-area intersection.
- Matrix gate: passing for one, two, three, six, and twelve items; mixed and extreme ratios; image/video; process metadata; 320/375/390/430 mobile, desktop, tablet, archival/ultrawide; light/dark; reduced motion; keyboard; pointer; and touch interaction.
- Archive artifact gate: implemented. Route evidence records collection identity, variant, item count, viewport, theme, and exact findings; capture emits `no-overlap.json`; validation rejects missing, stale, inconsistent, or non-passing reports. Final exact-image and live-production execution remain later release gates.
