# Woodsmith Synology NAS Deployment Guide

## Goal

Deploy `lowestprime/woodsmith` from `/volume2/docker_ssd/woodsmith/` on the Synology DS923+ so that:

1. the app runs only on `127.0.0.1:3002`
2. Synology Reverse Proxy publishes it over HTTPS
3. SQLite persists in `site/data/woodsmith.sqlite`
4. `pics/` stays outside the image and mounts read-only
5. Next.js image-cache writes succeed without `EACCES` errors
6. updates are built quickly from WSL, transferred cleanly to the NAS Docker daemon, and rolled out predictably
7. the repository stays tidy and disk usage stays under control

## 1. Deployment Facts

1. the real app lives under `site/`, while the root `package.json` is only a wrapper that proxies commands into `site/`
2. production is a Next.js standalone build (`output: "standalone"`)
3. the production image starts `server.js` with `node --experimental-sqlite`
4. the Dockerfile copies `.next/standalone`, `.next/static`, `public`, and `data` into the runtime image, but does **not** copy `pics/`
5. the media route serves files from `process.env.MEDIA_ROOT` or, if unset, `../pics` relative to `/app/site`
6. the production compose model is image-based, loopback-bound on `127.0.0.1:3002`, runs as the NAS user IDs, and sets `MEDIA_ROOT=/app/pics`
7. the image is loaded on the NAS and started through `docker compose`
8. the container runs as `uid=1026 gid=100(users)`
9. `/app/site/data` is writable
10. `/app/pics/Furniture` and `/app/pics/Cabinets` are present and readable
11. `curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG` returns `HTTP/1.1 200 OK`

## 2. Deployment Model

Use this model every time:

1. Keep the canonical project tree on the NAS at `/volume2/docker_ssd/woodsmith/`.
2. Mount this NAS tree into WSL at `/mnt/woodsmith` using the following CIFS command: `sudo mount -t cifs //192.168.1.126/docker_ssd/woodsmith /mnt/woodsmith -o username=Cooper,uid=1000,gid=1000,file_mode=0777,dir_mode=0777,mfsymlinks,nobrl`, so the source tree is identical in both places in normal operation.
3. Build `woodsmith:prod` from WSL.
4. Export the finished image to a compressed tarball inside `releases/`.
5. Load that tarball into the NAS Docker daemon.
6. Start or refresh the service on the NAS with `docker compose`.
7. Expose it only through Synology Reverse Proxy.

Important clarification: because `/mnt/woodsmith` is a CIFS mount to the NAS project directory, the **files** in the working tree are shared between WSL and the NAS. But the **Docker image itself** is not automatically present in the NAS Docker daemon just because it was built from that mounted path.

## 3. Final On-Disk Layout

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

1. `pics/`: master media library mounted read-only into the container
2. `site/data/`: persistent SQLite storage
3. `cache/next-image/`: writable Next.js image optimization cache; this is the permanent fix for the `mkdir '/app/site/.next/cache'` permission error seen in the live logs
4. `releases/`: compressed image archives used for deploys and rollbacks
5. `backups/`: DB and config backups

Create the runtime directories once on the NAS SSH terminal:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/{site/data,cache/next-image,releases,backups} && chown -R Cooper:users /volume2/docker_ssd/woodsmith && chmod -R 770 /volume2/docker_ssd/woodsmith/{site/data,cache,releases,backups}
```

## 4. Final `.env`

Maintain `/volume2/docker_ssd/woodsmith/.env` as:

```dotenv
PUID=1026
PGID=100
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

These IDs match the live NAS user mapping already verified in the SSH terminal output, where the running container is expected to use `uid=1026` and `gid=100(users)`.

Generate the session secret with:

```bash
openssl rand -hex 32
```

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

### Rationale

1. `image:` keeps the NAS runtime-only and avoids repeated on-NAS builds
2. `user:` matches the real NAS identity already verified in production
3. `MEDIA_ROOT=/app/pics` matches the filesystem-backed media route design
4. the new cache mount gives Next.js a writable destination for optimized images, eliminating the `EACCES` cache error from the container logs
5. loopback-only binding preserves the intended reverse-proxy-only exposure model

## 6. WSL Image Build

From WSL, work directly inside the mounted NAS project root:

```bash
cd /mnt/woodsmith
```

Build for the NAS architecture:

```bash
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

## 7. Local WSL Smoke Test (Optional)

The following local smoke test may be useful to perform before exporting the image:

```bash
docker run --rm -p 3002:3002 -e STUDIO_PASSWORD=test-pass -e SESSION_SECRET=test-secret -e MEDIA_ROOT=/app/pics -v "$(pwd)/site/data:/app/site/data" -v "$(pwd)/pics:/app/pics:ro" -v "$(pwd)/cache/next-image:/app/site/.next/cache" woodsmith:prod
```

Because `/mnt/woodsmith` is the live CIFS-backed NAS tree, this validates against the same source files and runtime data paths used in production. The image cache mount is included here too so the local smoke test mirrors the final production container behavior and does not recreate the cache permission error.

Stop the test container with `Ctrl+C` when finished.

## 8. NAS Image Export

Still from `/mnt/woodsmith`, export the finished image directly into the shared NAS `releases/` directory:

```bash
mkdir -p releases && docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

Because `releases/` is inside the CIFS-mounted NAS project tree, this writes the archive straight into `/volume2/docker_ssd/woodsmith/releases/`.

## 9. NAS Image Loading

On the NAS SSH terminal:

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load
```

To load a specific image archive when multiple exist in `releases/`, replace the glob with its exact filename in the above command.

## 10. NAS Deployment and Updating

From the NAS project root:

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml up -d
```

This command is used for both first deploy and routine refreshes after loading future `woodsmith:prod` images.

## 11. NAS Container Verification

Run these final checks on the NAS after every deploy:

### Runtime Identity Confirmation

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'id'
```

Expected shape: `uid=1026 gid=100(users)` as already verified in the successful NAS runtime evidence.

### DB Path Write Test

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'ls -ld /app/site/data && test -w /app/site/data && echo DATA_WRITE_OK || echo DATA_WRITE_FAIL'
```

### Media Path Read Test

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; ls -ld /app/pics /app/pics/Furniture /app/pics/Cabinets; test -r /app/pics/Furniture/DSC_0051.JPG && echo IMG_READ_OK || echo IMG_READ_FAIL'
```

### Media Route Image Test

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

### Cache Test

```bash
cd /volume2/docker_ssd/woodsmith && docker compose -f docker-compose.synology.yml logs --tail=200 woodsmith
```

Once the cache mount has been added, the docker container logs should not contain any `Failed to write image to cache ... mkdir '/app/site/.next/cache'` messages.

## 12. Synology Reverse Proxy

Expose the site only through Synology Reverse Proxy.

Use this target:

1. destination protocol: `http`
2. destination host: `127.0.0.1`
3. destination port: `3002`

Recommended source:

1. source protocol: `https`
2. source host: chosen site domain or subdomain
3. source port: `443`

That matches the intended loopback-only compose binding and keeps the container off the public interface.

## 13. Update Routine

Follow this sequence for all future updates:

1. `cd /mnt/woodsmith`
2. optionally clean `node_modules`, `site/node_modules`, and `site/.next` from the shared tree to reclaim space
3. `docker buildx build --platform linux/amd64 -t woodsmith:prod --load .`
4. optionally run the local smoke test with the cache mount
5. `docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz`
6. on the NAS, `gunzip -c ... | docker load`
7. on the NAS, `docker compose -f docker-compose.synology.yml up -d`
8. run the four NAS verification commands above
9. trim old release archives

## 14. Repository Maintenance and Storage Reclamation

The source tree visible from WSL and the NAS is the same CIFS-backed project tree. To keep it tidy and small:

### Safe Working Tree Removals

These are not required for the production image build and can be removed from the shared project tree to reclaim space if desired:

```bash
cd /mnt/woodsmith && rm -rf node_modules site/node_modules site/.next
```

Why this is safe:

1. the Docker build installs dependencies inside the build stage with `npm ci` and does not rely on host `node_modules`
2. the build context excludes `node_modules`, `site/node_modules`, and `site/.next`, so keeping them in the shared tree only consumes disk and makes the repository messier, not faster, for Docker builds

### Release Archive Hygiene

Keep only a small number of release archives on the NAS. This keeps rollback available without letting `releases/` grow forever:

```bash
cd /volume2/docker_ssd/woodsmith/releases && ls -1t woodsmith-prod-*.tar.gz | tail -n +4 | xargs -r rm -f
```

That keeps the three newest image archives.

### Post-Export Local Docker Cleanup (Optional)

If the laptop does not need to keep the image loaded locally after export:

```bash
docker image rm woodsmith:prod || true
```

And to reclaim builder cache opportunistically:

```bash
docker builder prune -f
```

Only use if the space must be reclaimed, as it can slow the next build slightly by removing cached layers.

## 15. Docker Image and GitHub Repository Media Exclusion

Adding `pics/` to `.dockerignore` and `.gitignore` both files is safe for this project because the running site reads media from the **runtime-mounted** `/app/pics` path, not from files copied into the image. The compose file mounts `/volume2/docker_ssd/woodsmith/pics:/app/pics:ro`, the media route reads from `process.env.MEDIA_ROOT` or `../pics`, and the Dockerfile does **not** copy `pics/` into the production image at all. Thus excluding the `pics/` folder from the GitHub Repository and Docker Container reduces size **without** disrupting media reads. Image-cache writes are **not** affected either, because the cache is located in `/app/site/.next/cache`, which is separate from `/app/pics`.

### Exclusion Additions for `.dockerignore` and `.gitignore`

```gitignore
# Runtime-only media and image cache mounted from NAS
pics/
cache/
```

### Runtime Conditions

Do **not** change the runtime pattern within `docker-compose.synology.yml`:

```yaml
environment:
  MEDIA_ROOT: "/app/pics"
volumes:
  - /volume2/docker_ssd/woodsmith/pics:/app/pics:ro
```

Keep the writable cache mount separate from `pics/`, e.g.,

```yaml
  - /volume2/docker_ssd/woodsmith/cache/next-image:/app/site/.next/cache
```

The `pics/` folder should remain read-only at runtime and the cache path should remain writable.

## 16. One-time Cleanup from Media-and-Cache-Inclusive State

### A. Remove `pics/` from Git Tracking Without Deleting Media Files

If `.gitignore` was not already manually modified, committed and pushed, run the following command from the repository root on the WSL terminal:

```bash
printf '\n# Runtime-only media mounted from NAS\npics/\n' >> .gitignore
```

This selectively removes `pics/` from the Git index only. It does **not** delete any media files from `/volume2/docker_ssd/woodsmith/pics`.

### B. Remove `pics/` from Future Docker Build Contexts

If `.dockerignore` was not already manually modified, committed and pushed, run the following command from the repository root on the WSL terminal:

```bash
grep -qxF 'pics/' .dockerignore || printf '\n# Runtime-only media mounted from NAS\npics/\n' >> .dockerignore
```

From this point on, Docker will stop sending the large `pics/` tree as build context, which reduces build-context transfer size and keeps builds minimal.

### C. Container Rebuild

Because modifications to `.dockerignore` do not apply until subsequent builds, a clean rebuild cycle is required. Per steps [6. WSL Image Build](https://github.com/lowestprime/woodsmith/blob/master/synology-nas-deploy.md#6-wsl-image-build) – [10. NAS Deployment and Updating](https://github.com/lowestprime/woodsmith/blob/master/synology-nas-deploy.md#10-nas-deployment-and-updating), first rebuild the container via the following commands on the WSL terminal:
```bash
cd /mnt/woodsmith
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

Then, deploy the new image via the following commands on the NAS SSH terminal:
```bash
cd /volume2/docker_ssd/woodsmith
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load
docker compose -f docker-compose.synology.yml up -d --force-recreate
```

This removes stopped containers, dangling images, and unused builder cache. It does **not** modify the live `pics/` directory on the NAS.

### D. Removal of Currently-Tracked `pics/` and `cache/` from GitHub Repository

After step A and a normal push, the `pics/` folder and its contents will disappear from the current branch tip of the GitHub repository upon issuance of the following terminal commands on the NAS SSH terminal

```bash
git rm -r --cached --ignore-unmatch pics cache && git add .gitignore .dockerignore && git commit -m "Stop tracking runtime media and image cache" && git push -u origin master
```

This command effectively cleans up the **current** remote repository contents.

### E. Removal of Historic `pics/` and `cache/` Blobs from GitHub History

If `pics/` or `cache/` were committed in earlier history, removing them from the current tree does **not** shrink the remote repository history. In the current Codex App PowerShell environment, `git filter-repo` is **not installed**, as shown by `git: 'filter-repo' is not a git command`. Install it first, then run the history rewrite.

#### Install `git-filter-repo` in the current environment

```powershell
py -m pip install --user git-filter-repo
````

OR

```powershell
python -m pip install --user git-filter-repo
```

Permanently add the `git-filter-repo` comprising directory to PATH

```powershell
$p = "C:\Users\Cooper\AppData\Roaming\Python\Python313\Scripts"; [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$p", "User"); $env:PATH += ";$p"
```

#### Then rewrite history to remove both directories completely:

```powershell
git filter-repo --path pics --path cache --invert-paths --force
```

Because this repository currently uses the `master` branch, force-push the rewritten history as follows:

```powershell
git push --force origin master
git push --force --tags
```

Anyone else using the repository must then re-clone or hard-reset.

### F. One-Time Cleanup of Existing Runtime Cache Files on the NAS

The optimized image cache currently lives on the NAS under `cache/next-image/images`, not inside the immutable application image, because the compose file mounts `/volume2/docker_ssd/woodsmith/cache/next-image` to `/app/site/.next/cache` . To safely clear stale cached images and let Next.js regenerate them on demand, stop the site, remove only the cache contents, keep the cache directory itself, and bring the site back up:

```bash
docker compose -f docker-compose.synology.yml down && find /volume2/docker_ssd/woodsmith/cache/next-image -mindepth 1 -maxdepth 1 -exec rm -rf {} + && mkdir -p /volume2/docker_ssd/woodsmith/cache/next-image && chown -R 1026:100 /volume2/docker_ssd/woodsmith/cache && chmod -R u+rwX,g+rwX /volume2/docker_ssd/woodsmith/cache && gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load && docker compose -f docker-compose.synology.yml up -d --force-recreate
```

This clears only the generated image cache. It does **not** touch original media in `pics/`.

### G. Removal of Stale or Stopped Woodsmith Containers and Dangling Build Leftovers

To remove stopped containers, dangling images, and unused builder cache without touching live NAS media or the mounted runtime cache directory:

```bash
docker container prune -f && docker image prune -f && docker builder prune -f
```

## 17. Changes and Preservations

This ignore-file cleanup **achieves** the following:

* reduce Git repository size going forward
* reduce Docker build-context size
* keep production images smaller and cleaner
* prevent accidental re-commit of large media directories

It **does not**:

* remove or block runtime media reads from `/app/pics`
* affect `MEDIA_ROOT=/app/pics`
* affect the site’s writable `.next/cache`
* delete the actual NAS media files unless you explicitly remove them from `pics/`

## 18. Minimal Post-Cleanup Verification

Run the following command post-redeployment to confirm that media reads and cache writes continue to function normally:

```bash
docker exec woodsmith sh -lc 'printf "MEDIA_ROOT=%s\n" "$MEDIA_ROOT"; test -r /app/pics/Furniture/DSC_0051.JPG && echo MEDIA_OK || echo MEDIA_FAIL; test -w /app/site/.next/cache && echo CACHE_OK || echo CACHE_FAIL'
```

### Expected Result

* `MEDIA_OK`
* `CACHE_OK`

This confirms the ignore-file cleanup did not disrupt media or cache write access.
