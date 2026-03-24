# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy `lowestprime/woodsmith` from `/volume2/docker_ssd/woodsmith/` on the Synology DS923+ so that:

- the app runs privately on `127.0.0.1:3002`
- Synology Reverse Proxy exposes it over HTTPS
- SQLite persists in `site/data/woodsmith.sqlite`
- `pics/` stays outside the image and mounts read-only at runtime
- updates are built on the laptop, transferred to the NAS, then loaded and started there
- the guide reflects the latest observed runtime evidence

---

## 1. Repo facts that matter for deployment

These are directly grounded in the audited repo:

- the real app lives under `site/`
- production is a Next.js standalone build
- the runtime image starts `server.js` with `node --experimental-sqlite`
- the Dockerfile copies `.next/standalone`, `.next/static`, `public`, and `data` into the runtime image, but **does not copy `pics/`** fileciteturn27file0L1-L1
- the media route serves files from `process.env.MEDIA_ROOT` or, if unset, `../pics` relative to `/app/site` fileciteturn36file0L1-L1

That means a correct production deployment must provide `pics/` as a runtime mount and should set `MEDIA_ROOT=/app/pics` explicitly.

---

## 2. What the newest EXTREME transcript now proves

Your latest commands materially tighten the diagnosis.

### Proven

- `/mnt/woodsmith` is the current EXTREME repo root.
- `docker buildx build --platform linux/amd64 -t woodsmith:prod --load .` succeeds quickly from that root.
- the app boots correctly with both mounts present and `MEDIA_ROOT=/app/pics` set.
- SQLite is **not** the active blocker in the current EXTREME run; the previous `ERR_SQLITE_ERROR` does not appear in the newest log.
- inside the running container, `MEDIA_ROOT` is correctly set to `/app/pics`.
- inside the running container, `/app/pics` exists, but `/app/pics/Furniture` and `/app/pics/Cabinets` do **not** exist.
- inside the running container, `test -r /app/pics/Furniture/DSC_0051.JPG` fails.

### Therefore

The current EXTREME media failure is **not primarily a Next.js route problem** and **not primarily a `MEDIA_ROOT` problem**.

The container simply does not see the expected contents of the host `pics/` tree when `/mnt/woodsmith/pics` is bind-mounted into `/app/pics`.

### What is still not proven

- the exact reason Docker on EXTREME is surfacing `/app/pics` as an apparently empty top-level directory
- whether that is caused by the underlying host mount type behind `/mnt/woodsmith`, by local Docker bind-mount behavior, or by some other filesystem translation layer

So the guide should not overclaim the root cause. But it **should** treat EXTREME `/mnt/woodsmith` media validation as unreliable until proven otherwise.

---

## 3. Correct production model

Use this deployment model:

1. keep the live project tree on the NAS at `/volume2/docker_ssd/woodsmith/`
2. keep `pics/` and `site/data/` on the NAS as runtime bind mounts
3. build `woodsmith:prod` on the laptop
4. export the image to a tarball
5. transfer it to `/volume2/docker_ssd/woodsmith/releases/`
6. load it on the NAS
7. start it through `docker compose`
8. expose it only through Synology Reverse Proxy

This remains optimal because laptop builds are fast and the NAS should primarily be the runtime host.

---

## 4. Required NAS identity, ownership, and environment

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

Maintain `/volume2/docker_ssd/woodsmith/.env` as:

```dotenv
PUID=1026
PGID=100
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Generate the session secret with:

```bash
openssl rand -hex 32
```

### Required ownership on the NAS

Run this once on the NAS:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases && chown -R Cooper:users /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases && chmod 770 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/backups /volume2/docker_ssd/woodsmith/releases
```

---

## 5. Correct compose file for the NAS

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

Why this is correct:

- `image:` supports transfer-and-load deployment
- `user:` maps runtime writes to the real NAS owner
- `MEDIA_ROOT=/app/pics` removes path ambiguity
- loopback-only binding keeps the app private behind Reverse Proxy

---

## 6. Correct local guidance on EXTREME

This is the section that needed the biggest correction.

### 6.1 What EXTREME is good for

EXTREME is currently reliable for:

- code editing
- git operations
- building `woodsmith:prod`
- app boot smoke tests
- SQLite smoke tests

### 6.2 What EXTREME is **not yet** reliable for

Based on the newest transcript, EXTREME is **not yet a trustworthy media-validation host** when the repo is run from `/mnt/woodsmith` and `pics/` is bind-mounted into Docker.

That is because the host path is populated, but the container sees only `/app/pics` and not its expected `Furniture/` and `Cabinets/` subdirectories.

### 6.3 Correct laptop build command

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

### 6.4 Correct local app/DB smoke test

Use this to validate app startup and DB behavior only:

```bash
docker volume create woodsmith_data >/dev/null && docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v woodsmith_data:/app/site/data woodsmith:prod
```

Interpretation:

- if this boots, app startup and DB behavior are fine
- image errors in this command are expected because `pics` was not mounted

### 6.5 Correct full local media test on EXTREME

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

Interpretation of the newest run:

- the app boots
- media still fails
- this is now confirmed to be consistent with container-side file invisibility

### 6.6 Correct background inspection workflow on EXTREME

```bash
docker rm -f woodsmith-test >/dev/null 2>&1; docker run -d --name woodsmith-test -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" woodsmith:prod
```

Then inspect inside the container:

```bash
docker exec woodsmith-test sh -lc 'id; printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; pwd; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

Interpretation of your latest result:

- `MEDIA_ROOT=/app/pics` is correct
- working directory `/app/site` is correct
- `/app/pics` exists
- `/app/pics/Furniture` is missing
- `/app/pics/Cabinets` is missing
- `IMG_READ_FAIL` confirms the mounted source tree is not actually visible where the app expects it

### 6.7 Correct next step on EXTREME

Do **not** move next to route debugging or `next/image` debugging from this host path.

First do a host-versus-container comparison:

```bash
printf 'HOST_PWD=%s\n' "$PWD"; ls -ld "$(pwd)/pics" "$(pwd)/pics/Furniture" "$(pwd)/pics/Cabinets"; test -r "$(pwd)/pics/Furniture/DSC_0051.JPG" && echo HOST_IMG_READ_OK || echo HOST_IMG_READ_FAIL
```

If the host can read the file but the container still cannot, stop using `/mnt/woodsmith` for authoritative media validation.

At that point, use one of these two paths:

1. copy the repo to a native local Linux filesystem on EXTREME and rerun the same bind-mounted test there
2. treat the NAS as the authoritative media-validation host and run the media checks there instead

That is the best evidence-aligned guidance now.

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

## 8. Mandatory NAS verification before declaring success

Run these on the NAS after boot.

### 8.1 Confirm runtime identity

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'id'
```

Expected: UID `1026`, GID `100`.

### 8.2 Confirm data path is writable

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/site/data && test -w /app/site/data && echo DATA_WRITE_OK || echo DATA_WRITE_FAIL'
```

### 8.3 Confirm media tree visibility inside the container

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

### 8.4 Confirm the route itself returns a real image

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

Do not stop at “the homepage loaded.” Deployment is not complete until:

- the container can see the source file
- the route returns a real image response

---

## 9. Reverse proxy on Synology

The container is intentionally bound only to loopback. Synology Reverse Proxy should forward to:

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
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml ps && docker compose -f docker-compose.synology.yml logs --tail=100 woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL' && curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

---

## 11. Bottom line

The newest transcript changes the deployment guidance in one decisive way:

- **do not spend more time debugging Next.js media routing from EXTREME `/mnt/woodsmith` until container-side file visibility is solved first**

Right now, the strongest evidence says:

- laptop builds are good
- app boot is good
- SQLite is not the active blocker in the current EXTREME run
- the current EXTREME `pics` bind mount does not surface the expected media tree into the container
- the NAS should remain the authoritative production-validation environment
