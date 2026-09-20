# Goal F bounded current security and UX evidence — September 19, 2026

This packet reuses the existing direct Goal-F browser sweep and adds only remaining header/theme/reflow/origin checks. No application source, owner content or production runtime configuration changed.

## Current edge and browser protections

Cache-busted requests from the authoritative execution environment show HTTP → HTTPS 301 and `www.woodmat.ch` → `woodmat.ch` 308. Canonical home/About/search return 200. HTTPS sends exactly `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. No includeSubDomains or preload was added. Private dynamic page responses use private/no-cache/no-store; an absent media request returns 404/no-store.

Neither origin nor edge currently sends enforcing or report-only Content-Security-Policy. This is the observed CSP audit result, not a claim that CSP is installed or that every injection vector is impossible. Existing frame/MIME/referrer/permissions protections and server input/origin controls remain in place. No new CSP allowlist was guessed for Next streaming, Turnstile, media, R3F or the edge-injected script during this audit.

Cross-origin POSTs with an empty payload to `/api/commissions/draft` and `/api/render-preview` return 403 in both browsers. Their guards run before state/provider work; no draft, image or customer submission is created. Accepted Goal-E Managed Turnstile fail-closed and mail-isolation evidence remains applicable to the unchanged verifier/routing implementation. The added seller intake availability guard remains separately subject to the final source/release gates.

The retained Goal-F authenticated sweep proves session cookies are Secure, HttpOnly and SameSite=Lax in Chromium and Firefox. The theme cookie is intentionally JavaScript-readable, SameSite=Lax, and currently lacks Secure; it carries only `light`/`dark`, not an identity or access capability. Current keyboard theme switching, reload persistence and initial SSR `data-theme` matching pass in both browsers. This does not misrepresent the cosmetic cookie as an authentication cookie.

## Network attribution

The accepted direct rendered sweep observed only the site plus `static.cloudflareinsights.com`, `challenges.cloudflare.com` and `brunhild.challenges.cloudflare.com`. Direct NAS origin `/about` contains Turnstile markup and no Insights beacon; the same edge-served page contains the Insights beacon. Thus Insights is edge-injected, and the challenge origins belong to the configured Cloudflare challenge flow. The new bounded browser checks observe only the site, Insights and the challenge origin. No additional unexplained cross-origin host was found. These requests are not search-engine/cache evidence.

## Bounded UX coverage and honest limits

The existing `live-reproof.json` contains 96 route observations and two secure-session observations across Chromium/Firefox, 320/390/430/768/1024/1440/1920 widths and 27 public/account/Studio route variants. Aggregate: zero horizontal overflow, dev overlays, broken visible images or page errors. All 72 recorded failures are the known retired public-credit/copy normalization defect. Schema 18 fixes the source predicate, but that fix is not yet deployed: these copy clauses remain ACTIVE_GAP until exact-candidate/live proof. No failed copy check was relabeled passing.

The new `security-ux-current.json` adds keyboard theme focus/Enter, day/night reload, cookie/SSR parity, reduced-motion contexts and 200% CSS-layout zoom on Contact, Commissions and Login. Both engines keep headings/form controls visible with zero horizontal overflow at 1440 physical pixels / 720 effective layout pixels. This is real layout reflow with CSS zoom, not a claim of manual browser-chrome zoom or a full assistive-technology audit. Console/page errors: zero. The retained seller fixture already covers 390/1440 layouts and server authorization; it was not rerun.

Final changed-source tests and exact-candidate/live browser acceptance remain required, including publication-copy correction and changed seller/commerce routes. This document does not qualify the undeployed schema-19 branch as a production release.

Restricted evidence: `security-current-headers.json`, `security-origin-attribution.json`, `security-ux-current.json`, and retained `live-reproof.json` under `/home/cbeaman/woodsmith-goal-f-20260912`. Public-media identity proof is separate in [the media packet](goal-f-media-truth-20260919.md).
