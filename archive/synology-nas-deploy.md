# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy the `lowestprime/woodsmith` site from `/volume2/docker_ssd/woodsmith/` on a Synology DS923+ so that:

- the app runs privately on `127.0.0.1:3002`
- Synology Reverse Proxy exposes it safely over HTTPS
- the SQLite database persists across rebuilds
- the `pics/` library stays outside the image and mounts read-only
- updates can be rolled out either by building on the NAS or, preferably, by building on a faster laptop and transferring the finished image
- ongoing maintenance is manageable entirely over SSH

This guide is written against the audited repository behavior, not a guessed generic Next.js setup.

---

## 1. What the repo actually does

These details matter because they determine the safest and least fragile deployment sequence.

- The root workspace is only a wrapper. Its scripts proxy into `site/` (`dev`, `build`, `start`, `typecheck`, `lint`).
- The real app lives in `site/`.
- The app is a Next.js standalone build (`output: "standalone"`), so production runs from `.next/standalone/server.js`.
- The runtime requires `node --experimental-sqlite` because the app uses Node's built-in `node:sqlite`.
- The production Docker image already bakes in the correct runtime behavior.
- The checked-in Synology compose file binds only to `127.0.0.1:3002`, which is exactly what you want when Synology's reverse proxy sits in front.
- Persistent data lives in `site/data`, and the actual database filename in the live repo is `woodsmith.sqlite`.
- The image library is not stored in the DB or uploaded through the browser; it is served from `/app/pics` via a filesystem-backed media route.

---

## 2. Important design constraints you should know before deploying

### 2.1 Best public URL shape

Use a dedicated domain or subdomain, for example:

- `woodsmith.example.com`
- or `www.example.com` if this site is the root site

Do **not** deploy it under a path prefix like `/woodsmith` unless you are prepared to modify the app. The audited `next.config.ts` only sets `output: "standalone"`; there is no `basePath` configuration.

### 2.2 What the browser admin can and cannot do

The browser admin can:

- log into `/studio`
- review all inquiries and reservations
- update status, stage, public notes, internal notes, and timeline messages
- manage a buyer dossier end to end

The browser admin cannot currently:

- add new portfolio pieces from the browser
- upload new product photos from the browser
- add or edit journal posts from the browser
- manage payments, carts, shipping rates, taxes, or invoices inside the app

Those content areas are still code-and-files driven from `site/lib/content.ts` and `pics/`.

### 2.3 Two subtle but important implementation facts

1. The real DB file is `site/data/woodsmith.sqlite`, not `woodsmith.db`.
2. The dashboard counts a request as no longer open only when status is exactly `Delivered` or `Closed`.

That means you should standardize your end-state statuses around those exact words.

### 2.4 The biggest avoidable NAS build slowdown

The repository's `.dockerignore` excludes `.git`, `node_modules`, build artifacts, secrets, and Synology metadata, but it does **not** exclude `pics/`.

Because the compose file builds from the project root, Docker will still package the full `pics/` folder into the build context before the build starts, even though the Dockerfile never copies `pics/` into the image. In your current working tree, that is a major waste of NAS CPU, disk IO, and elapsed time.

That is the strongest reason to prefer the laptop-build workflow below.

---

## 3. Recommended deployment strategy

## Recommendation

For your DS923+ the optimal default is:

1. keep the working tree on the NAS at `/volume2/docker_ssd/woodsmith/`
2. build the Docker image on the laptop as `linux/amd64`
3. transfer the finished image tarball to the NAS
4. load it into Docker on the NAS
5. run it with a compose file that references an `image:` tag instead of `build:`

Why this is optimal here:

- your NAS has a 2-core Ryzen R1600 and plenty of RAM, so builds are more likely to be CPU-bound than memory-bound
- Next.js builds are compile-heavy and benefit more from faster client hardware
- shipping a prebuilt image avoids repeatedly tarring the large root build context on the NAS
- runtime on the NAS remains simple and robust because the container still mounts only persistent data and media

Use NAS-native builds only as a fallback or for quick small tests.

---

## 4. Final on-NAS layout

Recommended project layout on the NAS:

```text
/volume2/docker_ssd/woodsmith/
├── Dockerfile
├── docker-compose.synology.yml
├── .env
├── pics/
├── site/
│   └── data/
│       ├── woodsmith.sqlite
│       ├── woodsmith.sqlite-wal
│       └── woodsmith.sqlite-shm
├── releases/
└── backups/
```

Notes:

- `pics/` remains your master media library.
- `site/data/` holds the database.
- `releases/` is for imported image tarballs.
- `backups/` is for DB/config backups.

Create the runtime folders once:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/releases /volume2/docker_ssd/woodsmith/backups
```

---

## 5. One-time preparation on the NAS

### 5.1 Create the production environment file

Create `/volume2/docker_ssd/woodsmith/.env` with at least these two values:

```dotenv
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Generate a strong session secret on the NAS:

```bash
openssl rand -hex 32
```

### 5.2 Keep the compose file runtime-oriented

The checked-in compose file builds locally on the NAS. For your long-term deployment, replace it with this image-based production compose file so that the NAS only runs an already-built image.

## Replacement content for `/volume2/docker_ssd/woodsmith/docker-compose.synology.yml`

```yaml
services:
  woodsmith:
    image: woodsmith:prod
    container_name: woodsmith
    restart: unless-stopped
    ports:
      - "127.0.0.1:3002:3002"
    environment:
      NODE_ENV: production
      NEXT_TELEMETRY_DISABLED: "1"
      PORT: "3002"
      HOSTNAME: "0.0.0.0"
      SELF_HOSTED: "true"
      STUDIO_PASSWORD: "${STUDIO_PASSWORD}"
      SESSION_SECRET: "${SESSION_SECRET}"
    volumes:
      - /volume2/docker_ssd/woodsmith/site/data:/app/site/data
      - /volume2/docker_ssd/woodsmith/pics:/app/pics:ro
```

Why this is better than the checked-in compose file for your NAS:

- avoids building on every update
- makes rollback trivial by loading and re-tagging an older image
- keeps secrets in `.env` rather than fallback defaults
- preserves the deliberate `127.0.0.1:3002:3002` loopback-only exposure

---

## 6. Optimal first deployment: build on laptop, transfer image, run on NAS

## 6.1 Build the image on the laptop

From the repository root on the laptop, build explicitly for the NAS architecture:

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

This is the safest command even if the laptop is not `linux/amd64`, because the DS923+ is x86-64.

### Optional local smoke test before transfer

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

Then visit `http://localhost:3002` and verify:

- the home page renders
- `/studio/login` renders
- an image-backed portfolio page loads media

Stop the test container with `Ctrl+C` when finished.

## 6.2 Export the image to a compressed archive

```bash
mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

## 6.3 Transfer the archive to the NAS

Example with `scp`:

```bash
scp releases/woodsmith-prod-*.tar.gz root@GDRIVE:/volume2/docker_ssd/woodsmith/releases/
```

## 6.4 Load the image on the NAS

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-YYYY-MM-DD-HHMMSS.tar.gz | docker load
```

If the loaded tag is not exactly `woodsmith:prod`, retag it:

```bash
docker image tag <loaded-image-tag> woodsmith:prod
```

## 6.5 Start the container on the NAS

From the project root on the NAS:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d
```

If your DSM shell exposes `docker-compose` instead of `docker compose`, use the legacy command with the same flags.

## 6.6 Validate locally on the NAS before reverse proxy

```bash
curl -I http://127.0.0.1:3002
```

You want a successful HTTP response header rather than a connection failure.

### Watch logs during first startup

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs -f woodsmith
```

---

## 7. Reverse proxy setup on Synology

The compose file intentionally binds the app only to loopback. So Synology Reverse Proxy should forward to:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

## Recommended public setup

- source protocol: `https`
- source hostname: your chosen domain or subdomain
- source port: `443`
- destination protocol: `http`
- destination hostname: `127.0.0.1`
- destination port: `3002`

## Recommended Synology GUI sequence

On DSM, open the reverse proxy interface and create a rule roughly like:

1. choose your domain or subdomain as the source host
2. set source to HTTPS on 443
3. set destination to HTTP on `127.0.0.1:3002`
4. attach the correct certificate for the public hostname
5. save and test from an external browser

The exact DSM menu label can vary by DSM build and package naming, but on recent DSM 7.x systems it is typically under the login/application portal area.

## Why the loopback bind is correct

Because the container is published as `127.0.0.1:3002:3002`, clients on your LAN or the public internet cannot hit `:3002` directly. Traffic reaches the app only through Synology's own reverse proxy or from an SSH session on the NAS. That is a good default security boundary.

---

## 8. Ongoing update workflow

## Recommended update workflow

1. pull the latest repo on the laptop
2. build a new image on the laptop
3. export and transfer it to the NAS
4. back up the NAS data directory
5. load the new image
6. restart the service
7. smoke test the public site and `/studio`

### Laptop side

```bash
cd /path/to/woodsmith && git pull --ff-only origin master && docker buildx build --platform linux/amd64 -t woodsmith:prod --load . && mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz && scp releases/woodsmith-prod-*.tar.gz root@GDRIVE:/volume2/docker_ssd/woodsmith/releases/
```

### NAS backup before restart

```bash
mkdir -p /volume2/docker_ssd/woodsmith/backups && cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -czf backups/woodsmith-backup-$(date +%F-%H%M%S).tar.gz site/data .env docker-compose.synology.yml && docker compose -f docker-compose.synology.yml start woodsmith
```

### NAS deploy the new image

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-YYYY-MM-DD-HHMMSS.tar.gz | docker load && cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d --force-recreate
```

### Quick verification after deploy

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps && docker compose -f docker-compose.synology.yml logs --tail=100 woodsmith
```

---

## 9. NAS-native build workflow if you must build on the NAS

This is the simpler but less optimal path.

## 9.1 Before using it, fix the build-context problem

At minimum, add `pics/` to `.dockerignore`. I also recommend excluding `.codex/` and the large source font-pack folder if they are not needed in the image build context.

## Suggested additions to `.dockerignore`

```text
pics
.codex
ITC_New_Rennie_Mackintosh_Complete_Family_Pack
```

## 9.2 Use the checked-in build compose only if you really want on-NAS builds

If you want the original repo behavior, restore the checked-in `docker-compose.synology.yml` and run:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml build --no-cache woodsmith && docker compose -f docker-compose.synology.yml up -d
```

## When this path makes sense

- small emergency rebuilds
- quick verification after a tiny repo edit made directly on the NAS
- situations where image transfer from the laptop is temporarily inconvenient

## When it does not

- major dependency updates
- repeated rebuild iterations
- anything involving large media-heavy project roots without a strict `.dockerignore`

---

## 10. Day-2 maintenance over SSH

## View container state

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps
```

## Follow logs

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs -f woodsmith
```

## Restart only the app

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml restart woodsmith
```

## Recreate the app without touching data

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d --force-recreate woodsmith
```

## Stop the app cleanly

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith
```

## Remove the container but keep the image and mounted data

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml rm -sf woodsmith
```

---

## 11. Backup and restore

Because the app uses SQLite with WAL mode, the simplest safe backup is:

1. stop the container briefly
2. archive `site/data/`
3. start the container again

## Manual backup

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -czf backups/woodsmith-data-$(date +%F-%H%M%S).tar.gz site/data .env docker-compose.synology.yml && docker compose -f docker-compose.synology.yml start woodsmith
```

## Manual restore

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -xzf backups/woodsmith-data-YYYY-MM-DD-HHMMSS.tar.gz && docker compose -f docker-compose.synology.yml up -d woodsmith
```

## What must be backed up

At minimum:

- `site/data/woodsmith.sqlite`
- `site/data/woodsmith.sqlite-wal`
- `site/data/woodsmith.sqlite-shm`
- `.env`
- `docker-compose.synology.yml`

Also make sure your `pics/` library is backed up by your normal NAS backup strategy, because the app depends on those files being present.

---

## 12. Security notes you should not ignore

## 12.1 Change the defaults before public launch

The code has a fallback studio password and fallback session secret. Do not leave them active. Always set real values in `.env`.

## 12.2 Treat buyer dossier URLs as semi-secret

The buyer dossier page shows the buyer's contact information and allows timeline posting from that page. In the current implementation, whoever has the dossier link can see the buyer email on the page itself.

Operational implication:

- do not treat dossier links as broadly shareable public marketing pages
- send them only to the buyer or trusted collaborators
- do not post them publicly

## 12.3 Understand which fields are public

On a request page visible to the buyer:

- `status` is public
- `adminStage` is public
- `publicNotes` is public
- timeline messages marked `public` are public

Only `internalNotes` and timeline messages marked `private` stay private.

So write `adminStage` as buyer-safe language, not as an internal-only scratch field.

---

## 13. Operational conventions that will keep the site sane

## Recommended status vocabulary

Because `open dossiers` only closes on `Delivered` or `Closed`, use a short controlled vocabulary like this:

- `Brief received`
- `Quoted`
- `Awaiting deposit`
- `Scheduled`
- `In progress`
- `Ready for delivery`
- `Delivered`
- `Closed`

## Recommended stage vocabulary

Because stage is buyer-visible, keep it precise but friendly:

- `Reviewing brief`
- `Preparing quote`
- `Awaiting approval`
- `Awaiting deposit`
- `Queued for build`
- `Building`
- `Finishing`
- `Delivery planning`
- `Completed`
- `Archived`

## Good division of labor for fields

- **Status**: broad headline state for the buyer
- **Stage**: finer buyer-safe operational detail
- **Public note**: persistent note the buyer should always see right now
- **Internal note**: private working note for the studio only
- **Timeline message**: dated event or message, public or private depending on visibility

---

## 14. Troubleshooting

## The container starts but images 404

Check that the mount exists and that the files are actually under `/volume2/docker_ssd/woodsmith/pics`. The app resolves media from `/app/pics`, not from inside the DB.

## `/studio/login` warns that the fallback password is active

Your `.env` is missing `STUDIO_PASSWORD`, or compose is not loading `.env` from the project directory.

## The site works on `127.0.0.1:3002` but not publicly

That usually means the reverse proxy or certificate rule is wrong, not the container. Re-check the public hostname, certificate attachment, and `127.0.0.1:3002` destination.

## Open dossier count looks wrong

Check the exact `status` string. Only `Delivered` and `Closed` are treated as closed by the current code.

## Build on NAS is extremely slow

That is expected if the build context still includes `pics/`. Either exclude it in `.dockerignore` or stop building on the NAS and switch to the image-transfer workflow.

---

## 15. The shortest stable production sequence

If you want the minimum reliable path from zero to running:

1. create `.env`
2. replace compose with the image-based runtime compose shown above
3. build `woodsmith:prod` on the laptop as `linux/amd64`
4. `docker save | gzip`
5. `scp` the archive to `/volume2/docker_ssd/woodsmith/releases/`
6. `docker load` on the NAS
7. `docker compose up -d`
8. create a Synology reverse proxy rule to `127.0.0.1:3002`
9. log into `/studio/login`
10. back up `site/data/` before every upgrade

---

## 16. Audited source files behind this guide

Repo files checked directly:

- `package.json`
- `Dockerfile`
- `docker-compose.synology.yml`
- `.dockerignore`
- `.gitignore`
- `site/package.json`
- `site/next.config.ts`
- `site/lib/auth.ts`
- `site/lib/db.ts`
- `site/lib/actions.ts`
- `site/lib/content.ts`
- `site/components/forms.tsx`
- `site/components/site-chrome.tsx`
- `site/app/media/[...slug]/route.ts`
- `site/app/studio/login/page.tsx`
- `site/app/studio/page.tsx`
- `site/app/studio/request/[reference]/page.tsx`
- `site/app/requests/[reference]/page.tsx`

Additional uploaded grounding used:

- `Synology_NAS_DS923+_hardware_specs_01302026.md`
- `woodsmith_DeepWiki_Merged_03222026.md`
