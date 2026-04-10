# AGENTS.md

## Repository identity
- Project name: Beaman Woodworks (`woodsmith` repo; root workspace package name `woodsmith-workspace`)
- Primary stack: TypeScript, Next.js 16, React 19, Node.js with `node:sqlite`, ESLint 9, Stripe, Nodemailer, React Three Fiber, Three.js
- Deployment target(s): local development from the repo root with npm; production self-hosted deployment on Synology NAS via Docker Compose with reverse proxy termination
- Critical directories:
  - `site/app`: main Next.js application routes, pages, and server/client entrypoints
  - `site/components`: shared UI components
  - `site/lib`: shared application logic, utilities, data helpers, and integrations
  - `site/data`: persisted SQLite-backed runtime data in deployment; treat as stateful application data
  - `pics/`: master media library served by `/media/[...slug]`; must remain accurate and writable for studio uploads/renames/deletes
  - `design/Beaman_Woodworks_V2_Google_Stitch_Beta/`: design prototypes that informed the Beaman Woodworks 2.0 layout, theme, and studio UX; inspect before major UI/theme/studio redesigns
  - `README.md`, `admin.md`, `synology-nas-deploy.md`, `woodsmith_DeepWiki_Merged_03222026.md`: authoritative documentation surfaces that must stay aligned with the codebase
  - `docker-compose.synology.yml`, `.env`, `.env.example`, `site/next.config.ts`, `site/eslint.config.mjs`, `site/tsconfig.json`: primary runtime/config surfaces
  - `No dedicated automated test directory is currently configured`: do not assume unit/integration/e2e test coverage exists unless you add it explicitly

## Setup and canonical commands
- Install dependencies: `npm install`
- Start local development: `npm run dev`
- Production build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests: `Not currently configured in repo scripts; do not claim unit-test coverage unless you add and run it`
- Integration tests: `Not currently configured in repo scripts`
- E2E / smoke tests: `No dedicated automated script is currently configured; when deployment/runtime behavior is affected, use the optional local container smoke test and documented route/media curl checks from synology-nas-deploy.md`
- Database migration / schema update: `No formal migration tool is currently configured; treat SQLite schema/data changes as application + persisted-data changes and update code, docs, and deployment notes together`
- Format (if applicable): `No formatter script is currently configured`

## Project-specific engineering rules
- **CRITICAL SMB I/O CONSTRAINT:** This repository is mounted over a high-latency SMB network drive. You MUST NEVER run unconstrained recursive directory searches (e.g., `rg --files`, `eza -lhaT`, `Get-ChildItem -Recurse`) from the workspace root. 
- Always explicitly scope searches to specific, narrow subdirectories (e.g., `rg <term> site/app/` or `Get-ChildItem site/components/`).
- Exclude heavy directories explicitly in your commands (e.g., `--glob "!node_modules/*" --glob "!.next/*"`).
- Follow the existing architecture and conventions unless the request requires a justified change.
- Preserve backwards compatibility for public interfaces unless the task explicitly changes them.
- Prefer small, coherent diffs over broad speculative refactors.
- Keep naming, folder structure, and abstractions consistent with the rest of the codebase.
- Do not duplicate logic when an established internal utility or pattern already exists.
- If a new dependency is needed, prefer the smallest stable choice and document why.
- Prefer the repo-root npm commands over ad hoc `site/` commands unless there is a specific reason to target `site/` directly.
- When touching layout, theming, studio UX, or major content structure, inspect `design/Beaman_Woodworks_V2_Google_Stitch_Beta/` first and align changes with the Beaman Woodworks 2.0 design direction.
- Do not guess piece-to-media identity. If media for a piece is not verified, leave it unassigned or explicitly mark the uncertainty; never silently pair incorrect images with a published piece.
- Preserve the current product truth unless the task explicitly changes it:
  - the commission visualizer is currently a to-scale SVG preview, not a photorealistic 3D renderer
  - some live commerce/notification/shipping features are environment-dependent and should degrade honestly when not configured
- Treat `pics/` as a shared source-of-truth media library, not a disposable asset cache. Changes to upload, rename, delete, metadata, or assignment behavior must preserve real-file safety and dashboard usability.
- Keep search, dashboard, project-tracking, and buyer-account changes consistent across both public and private/admin surfaces.

## Secrets, config, and external services
- Never hard-code secrets or credentials.
- Use the project’s established env/config pattern: root `.env` for runtime values, root `.env.example` as the canonical env template/reference, Docker/Synology runtime values in `docker-compose.synology.yml`
- Required secure-deployment values include at minimum: `STUDIO_PASSWORD`, `SESSION_SECRET`, `SITE_URL`, and `NEXT_PUBLIC_SITE_URL`
- Optional service configuration includes `STRIPE_*`, `EASYPOST_API_KEY`, `SMTP_*`, and `SHIP_FROM_*`
- For external integrations, verify real configuration points before wiring anything in.
- When changing uploads/media behavior, preserve and verify:
  - `MEDIA_ROOT=/app/pics`
  - writable `pics/` mount
  - writable `site/data/`
  - writable Next image cache mount when relevant
- Update env examples and setup docs if new config is introduced.
- If SMTP/Stripe/EasyPost are not configured, preserve graceful degraded behavior rather than pretending those capabilities are live.

## UI / frontend rules
- Preserve responsiveness across common viewport sizes.
- Keep accessibility intact: semantics, labels, keyboard navigation, focus behavior, contrast, and reduced-motion respect where relevant.
- Verify critical UI flows in a rendered environment when tooling allows.
- After meaningful UI/auth/dashboard changes, verify the most relevant affected routes from this set:
  - `/`
  - `/portfolio`
  - `/portfolio/[slug]`
  - `/shop`
  - `/shop/cart`
  - `/journal`
  - `/journal/[slug]`
  - `/commissions`
  - `/commissions/status`
  - `/about`
  - `/search`
  - `/account/signup`
  - `/account/login`
  - `/account/forgot`
  - `/account/reset`
  - `/account/profile`
  - `/account/projects`
  - `/requests/[reference]`
  - `/studio/login`
  - `/studio`
- Preserve the full-size image lightbox behavior with zoom, pan, navigation, and `Esc` close support when touching gallery/media flows.
- Keep public-facing language factual, consumer-facing, and aligned with actual implemented functionality.

## Data / backend rules
- Preserve data integrity and idempotence where relevant.
- The app’s persisted studio/runtime state is SQLite-backed; changes that affect stored records must be treated carefully and updated coherently.
- For schema or migration-like changes, update code, tests (if added), documentation, and deployment notes together.
- Handle validation, edge cases, and failure states explicitly.
- Preserve buyer/project access protections for `/requests/[reference]`; do not weaken request-sharing safeguards accidentally.
- Queueing, email, checkout, invoice, and shipping flows must fail safely and transparently when provider configuration is incomplete.
- Because `pics/` and `site/data/` now jointly matter for recovery, do not make changes that break backup/recovery assumptions without updating deployment and backup docs.

## Documentation rules
- Update `README.md`, `admin.md`, `synology-nas-deploy.md`, `woodsmith_DeepWiki_Merged_03222026.md`, and examples whenever behavior or workflows change.
- Keep documentation consumer-facing, factual, and aligned with the repository’s actual current state.
- If a change affects deployment, media mutability, runtime caveats, environment variables, admin workflows, or backup requirements, update the relevant docs in the same task.
- Do not describe optional integrations as fully live unless the implementation and config requirements truly support that claim.

## Repo-specific definition of done
- Required implementation is present and integrated.
- Relevant commands succeed: build / lint / typecheck / tests / migrations / smoke checks as applicable.
- For this repo specifically, at minimum run and report the relevant subset of:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- If automated tests do not exist for the affected area, say so explicitly and perform/report the most relevant smoke or rendered-route verification instead of implying nonexistent test coverage.
- Docs are updated where needed.
- All requested items are accounted for as DONE / BLOCKED / NOT APPLICABLE.

## Git workflow
- Keep changes narrowly scoped and easy to review.
- Do not commit secrets, tokens, caches, build artifacts, large generated files, SQLite data snapshots, or uploaded media unless the task explicitly requires versioning them.
- Prefer small commits with descriptive messages.
- Preserve factual accuracy in README and docs.
- Before finalizing, run the relevant checks if the project has them.
- Never commit directly to `main` for non-trivial changes.
- Create a feature branch for each task.
- Keep PRs focused and reviewable.