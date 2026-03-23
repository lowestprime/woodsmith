# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy the `lowestprime/woodsmith` site from `/volume2/docker_ssd/woodsmith/` on a Synology DS923+ so that:

- the app runs privately on `127.0.0.1:3002`
- Synology Reverse Proxy exposes it safely over HTTPS
- the SQLite database persists across rebuilds
- the `pics/` library stays outside the image and mounts read-only
- updates can be rolled out either by building on the NAS or, preferably, by building on a faster laptop and transferring the finished image
- ongoing maintenance is manageable entirely over SSH
- deployment instructions reflect the latest real-world validation, not just the repo's intended design

This guide is written against the audited repository behavior **and** your latest observed runtime results.

---

## 1. What the repo actually does

These implementation details determine the correct deployment model.

- The root workspace is only a wrapper. Its scripts proxy into `site/`.
- The real app lives in `site/`.
- The app is a Next.js standalone build, so production runs from `.next/standalone/server.js`.
- The runtime requires `node --experimental-sqlite` because the app uses Node's built-in `node:sqlite`.
- The production Docker image already bakes in the correct runtime behavior.
- The app's media route serves files from a filesystem-backed directory. It now supports an explicit `MEDIA_ROOT` environment variable and otherwise falls back to `../pics` from the working directory. fileciteturn35file0L1-L1 fileciteturn33file1
- The current Synology compose file is runtime-oriented, uses `image: woodsmith:prod`, sets `user: "${PUID}:${PGID}"`, binds only to `127.0.0.1:3002`, and mounts both `/app/site/data` and `/app/pics`. fileciteturn33file0
- Persistent data lives in `site/data`, and the live database filename is `woodsmith.sqlite`.
- The image library is not stored in the DB or uploaded through the browser; it is served from `/app/pics`.

---

## 2. What the latest validation actually proved

This section supersedes any earlier assumption that the image problem and DB problem were one single issue.

### 2.1 Confirmed findings from your latest tests

Your latest commands establish all of the following:

1. **The image build is healthy.**
   `docker buildx build --platform linux/amd64 -t woodsmith:prod --load .` finished successfully on `EXTREME`.

2. **The app starts successfully.**
   The container reached `Ready`, so the standalone server is valid.

3. **The SQLite failure is specifically tied to the host bind mount used for `site/data` on `EXTREME`.**
   Evidence:
   - bind-mounting `$(pwd)/site/data:/app/site/data` produced `ERR_SQLITE_ERROR` / `unable to open database file`
   - running the same container as `--user 0:0` removed the DB error
   - replacing the bind mount with a Docker named volume also removed the DB error
   - direct inspection showed `DATA_WRITE_FAIL`

4. **The image failure is a separate problem from SQLite.**
   Evidence:
   - image failures persisted even when the container ran as `root`
   - image failures persisted even when the database used a named volume
   - host-side tests confirmed the expected image files do exist under `pics/`
   - inside the container, `/app/pics/Furniture` was missing and `IMG_READ_FAIL` was returned

5. **The current EXTREME local runtime test path is not a trustworthy representation of the real NAS media mount.**
   The host files exist, but the container still does not see the expected subdirectories under `/app/pics`. That means the local test environment on `EXTREME` is not correctly projecting the `pics/` directory into the container at runtime.

### 2.2 Operational conclusion

You now have **two different mount problems** in the laptop-side test environment:

- a **writability / ownership problem** for `site/data`
- a **mount visibility / path propagation problem** for `pics`

That means the deployment guide should no longer say “fix permissions and both issues will disappear.” That is too broad and no longer supported by the evidence.

---

## 3. Important design constraints before you deploy

### 3.1 Best public URL shape

Use a dedicated domain or subdomain, for example:

- `woodsmith.example.com`
- or `www.example.com` if this site is the root site

Do **not** deploy it under a path prefix like `/woodsmith` unless you are prepared to modify the app. The audited `next.config.ts` only sets standalone output; there is no `basePath` configuration.

### 3.2 What the browser admin can and cannot do

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

### 3.3 Two subtle but important implementation facts

1. The real DB file is `site/data/woodsmith.sqlite`, not `woodsmith.db`.
2. The dashboard treats a request as closed only when status is exactly `Delivered` or `Closed`.

That means you should standardize your end-state statuses around those exact values.

### 3.4 The biggest avoidable NAS build slowdown

`.dockerignore` excludes several heavy paths, but it still does not exclude `pics/` by default.

Because builds run from the repo root, Docker still tars the `pics/` tree into the build context unless you explicitly exclude it. That is wasteful on a DS923+ and one of the strongest reasons to prefer laptop-built images.

---

## 4. Recommended deployment strategy

### Recommendation

For your DS923+ the optimal default is:

1. keep the working tree on the NAS at `/volume2/docker_ssd/woodsmith/`
2. keep the runtime-owned project files owned by `Cooper:users`
3. build the Docker image on the laptop as `linux/amd64`
4. transfer the finished image tarball to the NAS
5. load it into Docker on the NAS
6. run it with an image-based compose file
7. expose it only through Synology Reverse Proxy

Why this is optimal here:

- your NAS is better used as a runtime host than a repeated build machine
- your latest laptop-side build already completed quickly
- laptop-built images avoid repeated large build contexts on the NAS
- runtime on the NAS stays simple: one image plus two mounts (`site/data`, `pics`)
- the current compose design already matches that model fileciteturn33file0

Use NAS-native builds only as a fallback.

---

## 5. Final on-NAS layout

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
- `releases/` holds imported image tarballs.
- `backups/` holds DB/config backups.

### Important correction based on your current NAS tree

Your current NAS listing shows:

- `backups/` as `d--------- root`
- `releases/` as `d--------- root`

That is not suitable for normal maintenance by `Cooper`, and it is inconsistent with the rest of the project tree being owned by `Cooper`.

Fix those once on the NAS:

```bash
chown -R Cooper:users /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases && chmod 770 /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases
```

Also ensure the data directory is owned by the runtime user mapping you intend to use:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/site/data && chown -R Cooper:users /volume2/docker_ssd/woodsmith/site/data && chmod 770 /volume2/docker_ssd/woodsmith/site/data
```

---

## 6. One-time preparation on the NAS

### 6.1 Use the real Synology UID and GID

Your NAS reports:

- `Cooper` UID = `1026`
- `users` GID = `100`

So the production `.env` should use exactly those values.

### 6.2 Create the production environment file

Create `/volume2/docker_ssd/woodsmith/.env` with:

```dotenv
PUID=1026
PGID=100
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Generate a strong session secret on the NAS:

```bash
openssl rand -hex 32
```

### 6.3 Keep the compose file runtime-oriented

Use the current runtime compose file shape below.

## Replacement content for `/volume2/docker_ssd/woodsmith/docker-compose.synology.yml`

```yaml
services:
  woodsmith:
    image: woodsmith:prod
    container_name: woodsmith
    restart: unless-stopped
    user: "${PUID}:${PGID}"
    ports:
      - "127.0.0.1:3002:3002"
    environment:
      NODE_ENV: production
      NEXT_TELEMETRY_DISABLED: "1"
      PORT: "3002"
      HOSTNAME: "0.0.0.0"
      SELF_HOSTED: "true"
      MEDIA_ROOT: "/app/pics"
      STUDIO_PASSWORD: "${STUDIO_PASSWORD}"
      SESSION_SECRET: "${SESSION_SECRET}"
    volumes:
      - /volume2/docker_ssd/woodsmith/site/data:/app/site/data
      - /volume2/docker_ssd/woodsmith/pics:/app/pics:ro
```

This matches your uploaded compose file. fileciteturn33file0

Why this is the correct long-term NAS compose file:

- `image:` avoids rebuilding on every update
- `user: "${PUID}:${PGID}"` maps the container to the real NAS owner
- `MEDIA_ROOT` explicitly matches the revised media route implementation fileciteturn33file1
- `127.0.0.1:3002:3002` keeps the service private behind Synology Reverse Proxy
- secrets come from `.env` instead of unsafe fallback defaults

---

## 7. Optimal first deployment: build on laptop, transfer image, run on NAS

### 7.1 Build the image on the laptop

From the repository root on the laptop:

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

This is the correct image target for the DS923+.

### 7.2 Do **not** trust your current EXTREME `/mnt/woodsmith` bind mounts for runtime smoke testing

Your latest evidence shows:

- `site/data` bind mounts from that location are not writable by the container runtime user
- `pics` bind mounts from that location do not surface the expected subdirectories in-container, even though the files exist on the host

So the following test is **not** reliable when run from your current EXTREME `/mnt/woodsmith/woodsmith` path:

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

Use one of the two validated local test options below instead.

### 7.3 Safe local smoke-test option A: verify app startup and DB using a named volume

This verifies the container, standalone app, and SQLite startup without depending on your problematic host data mount:

```bash
docker volume create woodsmith_data >/dev/null && docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -v woodsmith_data:/app/site/data woodsmith:prod
```

Use this to confirm:

- the app starts
- `/studio/login` loads
- the database initializes cleanly

This test does **not** validate `pics`.

### 7.4 Safe local smoke-test option B: validate media only from a known-good native Linux path

If you want to validate media locally on the laptop, first place the repo or at least a temporary media subset on a host path that Docker actually projects correctly into containers.

Then test with:

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -v woodsmith_data:/app/site/data -v "/absolute/native/linux/path/to/pics:/app/pics:ro" woodsmith:prod
```

Only treat local media validation as passed if the container can actually see directories like `/app/pics/Furniture` from inside the container.

### 7.5 Export the image to a compressed archive

```bash
mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

### 7.6 Transfer the archive to the NAS

Example:

```bash
scp releases/woodsmith-prod-*.tar.gz root@GDRIVE:/volume2/docker_ssd/woodsmith/releases/
```

### 7.7 Load the image on the NAS

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-YYYY-MM-DD-HHMMSS.tar.gz | docker load
```

If needed, retag the image:

```bash
docker image tag <loaded-image-tag> woodsmith:prod
```

### 7.8 Start the container on the NAS

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d
```

### 7.9 Validate locally on the NAS before reverse proxy

```bash
curl -I http://127.0.0.1:3002
```

Then inspect logs:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs -f woodsmith
```

---

## 8. NAS-specific preflight checks before calling deployment successful

Run these on the NAS after the first start.

### 8.1 Verify the container runs as the intended mapped user

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'id'
```

You want to see UID `1026` and GID `100`.

### 8.2 Verify the database path is writable inside the container

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/site/data && test -w /app/site/data && echo DATA_WRITE_OK || echo DATA_WRITE_FAIL'
```

### 8.3 Verify the media path is visible inside the container

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets && test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

Do **not** skip this. Your EXTREME laptop-side logs proved that “host file exists” is not enough. You need to verify container visibility too.

### 8.4 Verify the route returns a real image response

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

You want a real `Content-Type: image/jpeg`, not a failure.

---

## 9. Reverse proxy setup on Synology

The compose file intentionally binds the app only to loopback. So Synology Reverse Proxy should forward to:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

### Recommended public setup

- source protocol: `https`
- source hostname: your chosen domain or subdomain
- source port: `443`
- destination protocol: `http`
- destination hostname: `127.0.0.1`
- destination port: `3002`

### Recommended Synology GUI sequence

On DSM, create a rule roughly like:

1. choose your domain or subdomain as the source host
2. set source to HTTPS on 443
3. set destination to HTTP on `127.0.0.1:3002`
4. attach the correct certificate for the public hostname
5. save and test from an external browser

### Why the loopback bind is correct

Because the container is published as `127.0.0.1:3002:3002`, clients on your LAN or the public internet cannot hit port `3002` directly. Traffic reaches the app only through Synology Reverse Proxy or from an SSH session on the NAS.

---

## 10. Ongoing update workflow

### Recommended update workflow

1. pull the latest repo on the laptop
2. build a new image on the laptop
3. export and transfer it to the NAS
4. back up the NAS data directory
5. load the new image
6. recreate the service
7. smoke test the public site, `/studio`, and one media URL

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
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps && docker compose -f docker-compose.synology.yml logs --tail=100 woodsmith && curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

---

## 11. NAS-native build workflow if you must build on the NAS

This is the simpler but less optimal path.

### 11.1 Before using it, tighten the build context

At minimum, add these to `.dockerignore`:

```text
pics
.codex
ITC_New_Rennie_Mackintosh_Complete_Family_Pack
backups
releases
```

That keeps the build context small and avoids shipping irrelevant directories into Docker's tar stream.

### 11.2 Use a build-oriented compose file only when you actually need local NAS builds

If you temporarily want on-NAS builds, use a build compose file and run:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml build --no-cache woodsmith && docker compose -f docker-compose.synology.yml up -d
```

### When this path makes sense

- emergency rebuilds
- quick verification after a tiny repo edit made directly on the NAS
- temporary situations where image transfer from the laptop is inconvenient

### When it does not

- repeated rebuild iterations
- large dependency updates
- any situation where `pics/` is still included in the build context

---

## 12. Day-2 maintenance over SSH

### View container state

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps
```

### Follow logs

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs -f woodsmith
```

### Restart only the app

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml restart woodsmith
```

### Recreate the app without touching data

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d --force-recreate woodsmith
```

### Stop the app cleanly

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith
```

### Remove the container but keep the image and mounted data

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml rm -sf woodsmith
```

---

## 13. Backup and restore

Because the app uses SQLite with WAL mode, the simplest safe backup is:

1. stop the container briefly
2. archive `site/data/`
3. start the container again

### Manual backup

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -czf backups/woodsmith-data-$(date +%F-%H%M%S).tar.gz site/data .env docker-compose.synology.yml && docker compose -f docker-compose.synology.yml start woodsmith
```

### Manual restore

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -xzf backups/woodsmith-data-YYYY-MM-DD-HHMMSS.tar.gz && docker compose -f docker-compose.synology.yml up -d woodsmith
```

### What must be backed up

At minimum:

- `site/data/woodsmith.sqlite`
- `site/data/woodsmith.sqlite-wal`
- `site/data/woodsmith.sqlite-shm`
- `.env`
- `docker-compose.synology.yml`

Also make sure your `pics/` library is backed up by your normal NAS backup strategy.

---

## 14. Security notes you should not ignore

### 14.1 Change the defaults before public launch

The code has fallback secrets. Do not rely on them. Always set real values in `.env`.

### 14.2 Treat buyer dossier URLs as semi-secret

The buyer dossier page exposes buyer-identifying information and supports buyer updates. Do not treat those URLs as public marketing pages.

### 14.3 Understand which fields are public

On buyer-visible request pages:

- `status` is public
- `adminStage` is public
- `publicNotes` is public
- timeline messages marked `public` are public

Only `internalNotes` and timeline messages marked `private` stay private.

---

## 15. Operational conventions that will keep the site sane

### Recommended status vocabulary

Because open dossiers close only on `Delivered` or `Closed`, use a controlled vocabulary like:

- `Brief received`
- `Quoted`
- `Awaiting deposit`
- `Scheduled`
- `In progress`
- `Ready for delivery`
- `Delivered`
- `Closed`

### Recommended stage vocabulary

Because stage is buyer-visible, keep it precise but buyer-safe:

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

### Good division of labor for fields

- **Status**: broad headline state for the buyer
- **Stage**: finer buyer-safe operational detail
- **Public note**: persistent note the buyer should always see right now
- **Internal note**: private working note for the studio only
- **Timeline message**: dated event or message, public or private depending on visibility

---

## 16. Troubleshooting

### Problem: `ERR_SQLITE_ERROR` / `unable to open database file`

Interpretation:

- the runtime process cannot write to `/app/site/data`
- this can be caused by an ownership mismatch between the container user and the host mount
- your EXTREME tests specifically showed this disappears when you run as `root` or replace the bind mount with a named volume

Fix sequence:

1. confirm the compose file uses `user: "${PUID}:${PGID}"`
2. confirm `.env` contains `PUID=1026` and `PGID=100`
3. ensure `/volume2/docker_ssd/woodsmith/site/data` is owned by `Cooper:users`
4. confirm in-container writability with the preflight check above

### Problem: image URLs return “isn't a valid image ... received null”

Interpretation:

- this is not automatically a Next.js image bug
- your latest tests showed it persists even when SQLite is fixed
- host files existed, but `/app/pics/Furniture` was missing inside the container
- that means the container was not actually seeing the expected media tree

Fix sequence:

1. verify the compose file still mounts `/volume2/docker_ssd/woodsmith/pics:/app/pics:ro`
2. verify `MEDIA_ROOT=/app/pics` is set
3. exec into the running NAS container and confirm `/app/pics/Furniture` and `/app/pics/Cabinets` exist
4. request one direct media URL with `curl -I`
5. only after mount visibility is confirmed should you investigate file-level permission edge cases

### Problem: local laptop smoke test from `/mnt/woodsmith` keeps failing on media

Interpretation:

- your current EXTREME host path is not a trustworthy bind-mount source for validating media runtime behavior

Fix:

- use a named volume for DB validation
- move media validation to a known-good native Linux path or validate directly on the NAS

### Problem: `/studio/login` warns that the fallback password is active

Interpretation:

- `.env` is missing `STUDIO_PASSWORD`, or compose is not loading it

### Problem: the site works on `127.0.0.1:3002` but not publicly

Interpretation:

- the reverse proxy or certificate rule is wrong, not the container

### Problem: open dossier count looks wrong

Interpretation:

- the exact `status` string is not one of the two closed values: `Delivered` or `Closed`

### Problem: NAS build is extremely slow

Interpretation:

- your build context is still too large, usually because `pics/` is not excluded

---

## 17. The shortest stable production sequence

If you want the minimum reliable path from zero to running:

1. fix ownership of `backups/`, `releases/`, and `site/data`
2. create `.env` with `PUID=1026` and `PGID=100`
3. use the current image-based compose file with `MEDIA_ROOT=/app/pics`
4. build `woodsmith:prod` on the laptop as `linux/amd64`
5. `docker save | gzip`
6. `scp` the archive to `/volume2/docker_ssd/woodsmith/releases/`
7. `docker load` on the NAS
8. `docker compose up -d`
9. verify `id`, DB writability, and `/app/pics/Furniture` visibility **inside the container**
10. confirm `curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG`
11. create the Synology Reverse Proxy rule to `127.0.0.1:3002`
12. log into `/studio/login`
13. back up `site/data/` before every upgrade

---

## 18. Audited source files behind this guide

Direct repo grounding used earlier:

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

Additional current-session grounding used for this revised guide:

- uploaded current `docker-compose.synology.yml` fileciteturn33file0
- uploaded current `site/app/media/[...slug]/route.ts` fileciteturn33file1
- the prior guide draft uploaded in-session fileciteturn33file2
- the directly fetched repo `site/app/media/[...slug]/route.ts` confirming the current runtime path behavior fileciteturn35file0L1-L1

