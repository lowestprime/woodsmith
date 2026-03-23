# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy `lowestprime/woodsmith` from `/volume2/docker_ssd/woodsmith/` on the Synology DS923+ so that:

- the app runs only on `127.0.0.1:3002`
- Synology Reverse Proxy publishes it over HTTPS
- SQLite persists in `site/data/woodsmith.sqlite`
- `pics/` stays outside the image and mounts read-only
- Next.js image-cache writes succeed without `EACCES` errors
- updates are built quickly from WSL, transferred cleanly to the NAS Docker daemon, and rolled out predictably
- the repository stays tidy and disk usage stays under control

This final guide replaces the earlier drafts and keeps only the current production workflow. It is grounded in the live repo behavior, the final NAS runtime evidence, the WSL CIFS-mount clarification, and the latest container logs. The remaining runtime issue in the latest logs is the Next.js image-cache write failure at `/app/site/.next/cache` fileciteturn37file0. The final guide below fixes that directly by giving the cache its own writable runtime mount.

---

## 1. What matters from the actual app

The repo facts that control deployment are stable:

- the real app lives under `site/`, while the root `package.json` is only a wrapper that proxies commands into `site/` fileciteturn26file0L1-L1
- production is a Next.js standalone build (`output: "standalone"`) fileciteturn30file0L1-L1
- the production image starts `server.js` with `node --experimental-sqlite` fileciteturn27file0L1-L1
- the Dockerfile copies `.next/standalone`, `.next/static`, `public`, and `data` into the runtime image, but does **not** copy `pics/` fileciteturn27file0L1-L1
- the media route serves files from `process.env.MEDIA_ROOT` or, if unset, `../pics` relative to `/app/site` fileciteturn36file0L1-L1
- the production compose model is image-based, loopback-bound on `127.0.0.1:3002`, runs as the NAS user IDs, and sets `MEDIA_ROOT=/app/pics` fileciteturn37file3

The final NAS runtime evidence shows the correct steady state:

- the image is loaded on the NAS and started through `docker compose`
- the container runs as `uid=1026 gid=100(users)`
- `/app/site/data` is writable
- `/app/pics/Furniture` and `/app/pics/Cabinets` are present and readable
- `curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG` returns `HTTP/1.1 200 OK` fileciteturn37file2

---

## 2. The one authoritative deployment model

Use this model every time:

1. Keep the canonical project tree on the NAS at `/volume2/docker_ssd/woodsmith/`.
2. Mount that same NAS tree into WSL at `/mnt/woodsmith` using the CIFS command you provided, so the source tree is identical in both places in normal operation fileciteturn37file1.
3. Build `woodsmith:prod` from WSL.
4. Export the finished image to a compressed tarball inside `releases/`.
5. Load that tarball into the NAS Docker daemon.
6. Start or refresh the service on the NAS with `docker compose`.
7. Expose it only through Synology Reverse Proxy.

Important clarification: because `/mnt/woodsmith` is a CIFS mount to the NAS project directory, the **files** in the working tree are shared between WSL and the NAS. But the **Docker image itself** is not automatically present in the NAS Docker daemon just because it was built from that mounted path. Your own successful NAS rollout still required `docker load` from a tarball before `docker compose up -d` fileciteturn37file2. So export/import remains part of the final workflow.

---

## 3. Final on-disk layout

Use this final layout on the NAS:

```text
/volume2/docker_ssd/woodsmith/
├── .env
├── Dockerfile
├── docker-compose.synology.yml
├── pics/
├── site/
│   └── data/
│       ├── woodsmith.sqlite
│       ├── woodsmith.sqlite-wal
│       └── woodsmith.sqlite-shm
├── cache/
│   └── next-image/
├── releases/
└── backups/
```

Purpose of each runtime path:

- `pics/`: master media library mounted read-only into the container
- `site/data/`: persistent SQLite storage
- `cache/next-image/`: writable Next.js image optimization cache; this is the permanent fix for the `mkdir '/app/site/.next/cache'` permission error seen in the live logs fileciteturn37file0
- `releases/`: compressed image archives used for deploys and rollbacks
- `backups/`: DB and config backups

Create the runtime directories once on the NAS:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache/next-image /volume2/docker_ssd/woodsmith/releases /volume2/docker_ssd/woodsmith/backups && chown -R Cooper:users /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/releases /volume2/docker_ssd/woodsmith/backups && chmod -R 770 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/releases /volume2/docker_ssd/woodsmith/backups
```

---

## 4. Final `.env`

Maintain `/volume2/docker_ssd/woodsmith/.env` as:

```dotenv
PUID=1026
PGID=100
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

These IDs match the live NAS user mapping already verified in the SSH terminal output, where the running container is expected to use `uid=1026` and `gid=100(users)` fileciteturn37file2.

Generate the session secret with:

```bash
openssl rand -hex 32
```

---

## 5. Final `docker-compose.synology.yml`

Use this as the authoritative NAS compose file:

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
      - /volume2/docker_ssd/woodsmith/cache/next-image:/app/site/.next/cache
```

Why this is the final correct version:

- `image:` keeps the NAS runtime-only and avoids repeated on-NAS builds
- `user:` matches the real NAS identity already verified in production fileciteturn37file2
- `MEDIA_ROOT=/app/pics` matches the filesystem-backed media route design fileciteturn36file0L1-L1
- the new cache mount gives Next.js a writable destination for optimized images, eliminating the `EACCES` cache error from the container logs fileciteturn37file0
- loopback-only binding preserves the intended reverse-proxy-only exposure model

No additional code change is required for the cache fix if this writable cache mount is present and owned by `Cooper:users`.

---

## 6. Keep the repo lean before and after builds

The source tree visible from WSL and the NAS is the same CIFS-backed project tree fileciteturn37file1. To keep it tidy and small:

### Safe to remove from the working tree

These are not required for the production image build and can be removed from the shared project tree whenever you want to reclaim space:

```bash
cd /mnt/woodsmith && rm -rf node_modules site/node_modules site/.next
```

Why this is safe:

- the Docker build installs dependencies inside the build stage with `npm ci` and does not rely on host `node_modules` fileciteturn27file0L1-L1
- the build context excludes `node_modules`, `site/node_modules`, and `site/.next`, so keeping them in the shared tree only consumes disk and makes the repository messier, not faster, for Docker builds fileciteturn20file0L1-L1

### Release archive hygiene

Keep only a small number of release archives on the NAS. This keeps rollback available without letting `releases/` grow forever:

```bash
cd /volume2/docker_ssd/woodsmith/releases && ls -1t woodsmith-prod-*.tar.gz | tail -n +4 | xargs -r rm -f
```

That keeps the three newest image archives.

### Optional local Docker cleanup after a successful export

If the laptop does not need to keep the image loaded locally after export:

```bash
docker image rm woodsmith:prod || true
```

And to reclaim builder cache opportunistically:

```bash
docker builder prune -f
```

Use that only if you actually want the space back; it can slow the next build slightly by removing cached layers.

---

## 7. Build from WSL

From WSL, work directly inside the mounted NAS project root:

```bash
cd /mnt/woodsmith
```

Build for the NAS architecture:

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

This remains the preferred build path because the app image compiles quickly from WSL while the NAS is better used as the runtime host. The DS923+ hardware profile is relatively modest for repeated compile-heavy Next.js builds, while your successful deployment flow already demonstrates the laptop-build → NAS-load model fileciteturn37file2.

---

## 8. Optional local smoke test from WSL

A local smoke test is still useful before you export the image:

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" -v "$(pwd)/cache/next-image:/app/site/.next/cache" woodsmith:prod
```

Because `/mnt/woodsmith` is the live CIFS-backed NAS tree, this validates against the same source files and runtime data paths you intend to use in production fileciteturn37file1. The image cache mount is included here too so the local smoke test mirrors the final production container behavior and does not recreate the cache permission error.

Stop the test container with `Ctrl+C` when finished.

---

## 9. Export the image to the NAS release directory

Still from `/mnt/woodsmith`, export the finished image directly into the shared NAS `releases/` directory:

```bash
mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

Because `releases/` is inside the CIFS-mounted NAS project tree, this writes the archive straight into `/volume2/docker_ssd/woodsmith/releases/`.

---

## 10. Load the image on the NAS

On the NAS SSH terminal:

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load
```

Your live NAS transcript already shows this exact pattern working and loading `woodsmith:prod` successfully before the compose deployment fileciteturn37file2.

If multiple archives exist and you want to load a specific one, use its exact filename instead of the glob.

---

## 11. Deploy or update the service on the NAS

From the NAS project root:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d
```

This is the single command to use both for first deploy and routine refreshes after loading a newer `woodsmith:prod` image.

---

## 12. Verify the live NAS container

Run these final checks on the NAS after every deploy:

### Confirm runtime identity

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'id'
```

Expected shape: `uid=1026 gid=100(users)` as already verified in the successful NAS runtime evidence fileciteturn37file2.

### Confirm DB path is writable

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/site/data && test -w /app/site/data && echo DATA_WRITE_OK || echo DATA_WRITE_FAIL'
```

### Confirm media path is readable

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

### Confirm the media route returns the actual image

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

Your current NAS output already shows the final good state for all of these checks, including `DATA_WRITE_OK`, `IMG_READ_OK`, and `HTTP/1.1 200 OK` for the direct media request fileciteturn37file2.

### Confirm the cache error is gone

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs --tail=200 woodsmith
```

After the cache mount is added, the recurring `Failed to write image to cache ... mkdir '/app/site/.next/cache'` messages seen in the latest container logs should no longer appear fileciteturn37file0.

---

## 13. Synology Reverse Proxy

Expose the site only through Synology Reverse Proxy.

Use this target:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

Recommended source:

- source protocol: `https`
- source host: your chosen site domain or subdomain
- source port: `443`

That matches the intended loopback-only compose binding and keeps the container off the public interface.

---

## 14. Final routine for every update

Use this exact sequence for all future updates:

1. `cd /mnt/woodsmith`
2. optionally clean `node_modules`, `site/node_modules`, and `site/.next` from the shared tree if you want to reclaim space
3. `docker buildx build --platform linux/amd64 -t woodsmith:prod --load .`
4. optionally run the local smoke test with the cache mount
5. `docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz`
6. on the NAS, `gunzip -c ... | docker load`
7. on the NAS, `docker compose -f docker-compose.synology.yml up -d`
8. run the four NAS verification commands above
9. trim old release archives

That is the cleanest, fastest, and least fragile steady-state workflow supported by the repo and by your final live runtime evidence fileciteturn37file2 fileciteturn37file4.
