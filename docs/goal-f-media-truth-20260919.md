# Goal F media-truth reconciliation — September 19, 2026

This is a read-only follow-up to Goal A, based on current production and retained paired backups. No photograph, assignment, public flag, original filename or source byte was changed. Goal A's earlier uncertainty was correct for its evidence; the additional retained-byte comparison below resolves those two identities without guessing.

## Current runtime truth

The retained production container mounts `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` at `/app/pics` and `/volume2/docker_ssd/woodsmith/site/data` at `/app/site/data`; the production database was opened read-only. There are 25 pieces (23 published, two archived), 428 indexed rows, 209 normalized links, 25 source-folder rules and 361 embedding-cache entries (353 media, eight piece). The authoritative raw tree contains 427 nonsystem files, all indexed. None of the indexed photographs is currently marked technically unavailable. All 23 published pieces have display media and persisted `verifiedMedia=true` / `mediaReviewRequired=false`.

Direct cache-busted Chromium and Firefox requests to `/portfolio` and `/portfolio/dining-room-table` returned 200 with zero piece-media placeholders and no retired “Media under review” / “Photography in progress” copy. A contact sheet decoded all 23 currently published primary images; visual inspection matched the depicted bench, desk, cabinet, table, stool, rack, cutting board, easel, frame, chair, clock, mirror and bed to each current piece. This is current publication/provenance review, not a claim that every unused raw photograph has received a new editorial review.

Existing editorial distinctions remain: 69 indexed rows have `reviewed=1`, 53 retain accepted training labels, and none retains a rejected-piece label. 142 public normalized links refer to legacy rows with `reviewed=0`; their established publication links and piece-level truth were inspected without rewriting these flags or claiming a new per-file review. 215 image rows have no legacy piece assignment. These are retained working-library images, not evidence that a current public piece lacks photography. No bulk assignment or automatic publication was performed.

## Two retained dining-table exceptions — resolved

Eight retained pre-Goal-E paired backups from July 18 through August 31 contain actual original `PXL_…` files, not just indexed paths. The two Goal-E paired backups contain the current `DINING_TALBE_…` names. Every retained instance has the same complete-file digest for its identity. The August 31 paired-backup manifest still hashes to `97afa1e660299bc7c4646e14e02c5ba10aed6f5da726f74314cf86f3f7c429c5`, matching the accepted v19 release ledger.

| Original indexed basename | Current basename | Bytes | Complete-file SHA-256 | Final media classification |
|---|---|---:|---|---|
| PXL_20230716_004038462.jpg | DINING_TALBE_20230716_004038462.jpg | 3301864 | `0fa3201f4ce92859b7dea805d5b8486fced52d451419dbf70920c39ce47405fb` | TECHNICALLY RECOVERED; EDITORIALLY VERIFIED |
| PXL_20230716_004052400.jpg | DINING_TALBE_20230716_004052400.jpg | 3092603 | `225cc4cee6e99c1144091f8c44baaa5dccdf9f26d3852206fe01ba4065129c17` | TECHNICALLY RECOVERED; EDITORIALLY VERIFIED |

Both paths are under `Furniture/dining-room-table/`. Current raw bytes and direct HTTPS-served bytes match the retained originals exactly. Sharp/libvips full pixel decoding with `failOn: "warning"` succeeds for both at 4080 × 3072 (37,601,280 decoded bytes each). Embedded timestamps are July 15, 2023 at 17:40:38 and 17:40:52; timestamps alone were not used to establish identity. Visual inspection shows the same dining table in two views. Current production already assigns the two renamed files as hero/gallery for `dining-room-table`, with reviewed rows and an enabled source-folder rule. There is no need to recreate deleted aliases, rename originals, duplicate media, or change an owner's current assignment.

The current rename ledger records deletion of the two obsolete indexed names on September 4, with no rename link. That ledger alone was insufficient. The retained original bytes plus exact SHA-256 equality provide the missing provenance. These two identities are no longer CONTENT_TRUTH_BLOCKED. No current unresolved piece falls into NO IDENTIFIABLE SOURCE MEDIA EXISTS or CANDIDATE EXISTS BUT IDENTITY UNPROVEN on this evidence; unused/unassigned library images remain unassigned.

## Residual operational artifact, not a photograph or ownership conflict

One additional indexed row is the absent `.goal-e-persistence-20260912` probe: `kind=other`, 53 bytes, no matching source file. It is not published or used by a piece. Preserve accepted production during audit; include narrowly guarded removal of this exact stale probe row in the final release fixture-cleanup transaction after fresh paired recovery. Recheck its absence, kind, size and all references before removal. Do not remove arbitrary owner-created media. This operational cleanup remains ACTIVE_GAP until performed; it is not a content-truth or seller-ownership blocker.

## Evidence and limits

Restricted evidence under `/home/cbeaman/woodsmith-goal-f-20260912/`: `media-truth-current-private.json`, `raw-media-inventory-private.json`, `dining-backup-provenance-private.json`, `dining-identity-proof.json`, `dining-decode-proof.json`, `public-media-live-proof.json`, `public-media-contact-sheet.png`, and read-only public-byte copies. Reports, databases, session data, original media and recovery payloads remain outside Git. Whole-file hashes, source-folder rules, accepted/rejected labels, cluster keys, embedding metadata, deletion history, retained backup identities, current direct HTTPS and visual inspection were considered; no model ranking was substituted for provenance.

The public rendered report has no page errors. It observes the site's origin plus Cloudflare Insights and Turnstile/challenge subdomains; their exact edge/application attribution belongs to the remaining Goal-F security/traffic audit. This report does not falsely label that broader audit complete. Final Goal-F candidate and production release acceptance are still outstanding.
