# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy `lowestprime/woodsmith` from `/volume2/docker_ssd/woodsmith/` on the Synology DS923+ so that:

- the app runs privately on `127.0.0.1:3002`
- Synology Reverse Proxy exposes it over HTTPS
- SQLite persists in `site/data/woodsmith.sqlite`
- `pics/` stays outside the image and mounts read-only at runtime
- updates are easiest to ship from a faster laptop build, then load on the NAS
- the guide reflects the latest observed behavior, not stale assumptions

---

## 1. What is now firmly established

### Repo/runtime facts

These are the deployment facts that come directly from the audited repo:

- the root `package.json` is only a wrapper; real app work happens under `site/`
- production is a Next.js standalone build
- the Docker image starts `server.js` with `node --experimental-sqlite`
- the runtime image copies `.next/standalone`, `.next/static`, `public`, and `data`, but **does not copy `pics/` into the image**
- the media route serves filesystem files from `process.env.MEDIA_ROOT` or, if unset, `../pics` relative to the working directory
- the Synology compose file is intended to run an existing image, not rebuild on every deploy

### Current environment facts from your latest transcript

Your newest EXTREME transcript changes the operational guidance in several important ways:

1. **The current laptop repo root is `/mnt/woodsmith`, not `/mnt/woodsmith/woodsmith`.**
   Earlier nested-path guidance is now stale for your current EXTREME setup.

2. **The Docker build path on EXTREME is healthy and fast.**
   The latest `docker buildx build --platform linux/amd64 -t woodsmith:prod --load .` completed in about 2.3 seconds with a ~588 kB transferred build context, so laptop-side builds remain the best default.

3. **The active local blocker is media, not SQLite.**
   In the latest bind-mounted run from `/mnt/woodsmith`, the app started successfully and did **not** throw `ERR_SQLITE_ERROR`. That means the earlier SQLite bind-mount failure is no longer the primary live issue on EXTREME.

4. **The named-volume test must not be interpreted as a `pics/` test.**
   Your second command mounted only `woodsmith_data:/app/site/data` and did **not** mount `pics/` at all. Since the image does not include `pics/`, repeated image failures in that run are expected and do not prove a bad `pics` bind mount.

5. **The remaining unresolved problem is that image requests still fail in the correct bind-mounted test.**
   That means the guide must focus the next diagnostic step on the media route and runtime mount visibility, not on SQLite.

---

## 2. What the current evidence actually proves

### Proven

From the latest EXTREME transcript, these statements are safe:

- the container image builds correctly
- the standalone server starts correctly
- the app can boot with `site/data` bind-mounted from the current `/mnt/woodsmith/site/data`
- the app can also boot with a Docker named volume for `/app/site/data`
- image rendering still fails in the run that includes `-v "$(pwd)/pics:/app/pics:ro"`
- image rendering also fails in the run that omits `pics`, but that second fact is expected and therefore not diagnostic by itself

### Not yet proven

These are **not** yet proven one way or the other:

- whether `/app/pics/Furniture/...` is visible inside the container in the current EXTREME setup
- whether the `/media/...` route is returning `200 image/jpeg` or `404/other`
- whether the problem is the mount itself, `MEDIA_ROOT` resolution, or `next/image` optimization behavior after the route response comes back

That uncertainty matters, so the deployment guide should stop short of asserting that the `pics` mount is definitely broken until the route is tested directly.

---

## 3. Correct deployment model

### Recommended production strategy

Use this as the default:

1. keep the live project tree on the NAS at `/volume2/docker_ssd/woodsmith/`
2. keep `pics/` and `site/data/` on the NAS as bind-mounted runtime assets
3. build `woodsmith:prod` on the laptop
4. export the image to a tarball
5. transfer it to `/volume2/docker_ssd/woodsmith/releases/`
6. load it on the NAS
7. start it through `docker compose`
8. expose it only through Synology Reverse Proxy

Why this remains optimal:

- the laptop build is already fast
- the NAS should primarily be the runtime host
- the compose file is already written around an image-first deployment model
- `pics/` is a runtime asset library, not something that belongs baked into the image

---

## 4. Required on-NAS ownership and environment

### Real Synology IDs

Your NAS reports:

- `Cooper` UID = `1026`
- `users` GID = `100`

So production should use:

```dotenv
PUID=1026
PGID=100
```

### Required `.env`

Create or maintain `/volume2/docker_ssd/woodsmith/.env` as:

```dotenv
PUID=1026
PGID=100
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Generate the secret with:

```bash
openssl rand -hex 32
```

### Required ownership on the NAS

Run this once on the NAS:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases && chown -R Cooper:users /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases && chmod 770 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases
```

---

## 5. Correct runtime compose file

Use this runtime-oriented compose file on the NAS:

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

Why this is the right production shape:

- `image:` keeps deploys simple and reproducible
- `user:` maps container writes to the real NAS owner
- `MEDIA_ROOT=/app/pics` removes ambiguity from local fallback path resolution
- loopback-only port binding keeps the service private behind Reverse Proxy

---

## 6. Revised local validation guidance on EXTREME

This section is where the guide needed the biggest correction.

### 6.1 Use the real current repo root

On EXTREME, your current repo root is now:

```bash
/mnt/woodsmith
```

So all laptop commands should assume that as the working directory.

### 6.2 Build test

This remains valid:

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

### 6.3 App + DB smoke test

This is the cleanest SQLite smoke test and is still useful:

```bash
docker volume create woodsmith_data >/dev/null && docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v woodsmith_data:/app/site/data woodsmith:prod
```

Interpretation:

- if this boots, the app and DB path are fine
- if image errors appear here, that is expected because `pics` was not mounted
- therefore this command validates app startup and DB only, **not media**

### 6.4 Full local runtime test for media

To test media locally, use the command that includes both mounts **and** sets `MEDIA_ROOT` explicitly:

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

This is now the only local `docker run` command that should be treated as a real media test.

### 6.5 The next diagnostic step must be route-first, not page-first

The page-level log line:

```text
The requested resource isn't a valid image for /media/... received null
```

is not specific enough to tell you whether the problem is:

- missing container-side files
- wrong `MEDIA_ROOT`
- route returning `404`
- route returning a non-image response
- or `next/image` rejecting an otherwise reachable route

So the next step is to test the route directly.

### 6.6 Correct direct route validation workflow on EXTREME

Start the container in the background:

```bash
docker rm -f woodsmith-test >/dev/null 2>&1; docker run -d --name woodsmith-test -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

Then verify container-side visibility:

```bash
docker exec woodsmith-test sh -lc 'id; printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; pwd; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

Then test the route directly:

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

Then clean up:

```bash
docker rm -f woodsmith-test
```

### 6.7 How to interpret that route test

#### Case A: `IMG_READ_FAIL` or missing `/app/pics/Furniture`
The bind mount is the problem.

#### Case B: `IMG_READ_OK`, but `curl -I` returns `404` or not an image content type
The route configuration or path resolution is the problem.

#### Case C: `IMG_READ_OK` and `curl -I` returns `200` with `Content-Type: image/jpeg`
Then the problem is no longer the mount. At that point, the remaining issue is in how `next/image` is handling the route response, and the guide should move to app-code-level image optimization debugging rather than NAS deployment debugging.

That distinction is critical.

---

## 7. First production deployment to the NAS

### 7.1 Build on the laptop

```bash
cd /mnt/woodsmith && docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

### 7.2 Export the image

```bash
mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

### 7.3 Transfer it to the NAS

```bash
scp releases/woodsmith-prod-*.tar.gz root@GDRIVE:/volume2/docker_ssd/woodsmith/releases/
```

### 7.4 Load it on the NAS

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-YYYY-MM-DD-HHMMSS.tar.gz | docker load
```

### 7.5 Start it on the NAS

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d
```

---

## 8. Mandatory NAS preflight checks before declaring success

Run these on the NAS after the first boot.

### 8.1 Confirm runtime identity

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'id'
```

Expected: UID `1026`, GID `100`.

### 8.2 Confirm data path is writable

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/site/data && test -w /app/site/data && echo DATA_WRITE_OK || echo DATA_WRITE_FAIL'
```

### 8.3 Confirm media path is visible

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

### 8.4 Confirm the route itself returns a real image

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

Do not stop at “the homepage loaded.” For this app, deployment is not complete until the media route itself returns a valid image response.

---

## 9. Reverse proxy setup on Synology

The container is intentionally bound only to loopback, so Synology Reverse Proxy should forward to:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

Recommended public rule:

- source protocol: `https`
- source hostname: your chosen domain or subdomain
- source port: `443`
- destination protocol: `http`
- destination hostname: `127.0.0.1`
- destination port: `3002`

This is the correct security posture because the app is not directly exposed on the LAN or public network.

---

## 10. Update workflow

### Laptop side

```bash
cd /mnt/woodsmith && git pull --ff-only origin master && docker buildx build --platform linux/amd64 -t woodsmith:prod --load . && mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz && scp releases/woodsmith-prod-*.tar.gz root@GDRIVE:/volume2/docker_ssd/woodsmith/releases/
```

### NAS backup

```bash
mkdir -p /volume2/docker_ssd/woodsmith/backups && cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml stop woodsmith && tar -czf backups/woodsmith-backup-$(date +%F-%H%M%S).tar.gz site/data .env docker-compose.synology.yml && docker compose -f docker-compose.synology.yml start woodsmith
```

### NAS deploy

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-YYYY-MM-DD-HHMMSS.tar.gz | docker load && cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d --force-recreate
```

### Verification after each update

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps && docker compose -f docker-compose.synology.yml logs --tail=100 woodsmith && curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

---

## 11. What should change in the guide right now

The previous guide needed these corrections, and this revision incorporates them:

- remove the stale assumption that EXTREME still uses `/mnt/woodsmith/woodsmith`
- stop presenting SQLite as the active local blocker, because the latest transcript no longer supports that
- stop using the named-volume run as evidence of a broken `pics` mount, because that command omitted `pics` entirely
- make `MEDIA_ROOT=/app/pics` explicit in every local runtime test so local smoke tests match production more closely
- require a direct `curl -I /media/...` route check before concluding the image path is good or bad
- treat `next/image` debugging as a later branch only if the route itself proves healthy

That is the tightest, most evidence-aligned deployment guidance based on everything you have now shown.
