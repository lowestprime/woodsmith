# Beaman Woodworks Synology NAS Deployment Guide

## Goal

Deploy Beaman Woodworks from `/volume2/docker_ssd/woodsmith/` so that:

- the app listens only on `127.0.0.1:3002`
- Synology Reverse Proxy terminates public HTTPS
- SQLite persists in `site/data/`
- Next.js image cache persists in `cache/next-image/`
- the shared `pics/` library is writable from the private Woodshop dashboard
- password reset links, share links, and Stripe redirects use the public site URL

## Runtime layout

```text
/volume2/docker_ssd/woodsmith/
├── .env
├── Dockerfile
├── docker-compose.synology.yml
├── pics/
├── site/
│   └── data/
├── cache/
│   └── next-image/
├── releases/
└── backups/
```

## Required directories

Create these once on the NAS:

```bash
mkdir -p /volume2/docker_ssd/woodsmith/{site/data,cache/next-image,releases,backups,pics}
```

Then ensure the container user can write to `site/data`, `cache`, and `pics`:

```bash
chown -R 1026:100 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/pics
chmod -R u+rwX,g+rwX /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume2/docker_ssd/woodsmith/pics
```

## `.env`

Start from `.env.example` and fill at least:

```dotenv
PUID=1026
PGID=100
SITE_URL=https://beamanwoodworks.example.com
NEXT_PUBLIC_SITE_URL=https://beamanwoodworks.example.com
STUDIO_PASSWORD=replace-with-a-long-unique-password
SESSION_SECRET=replace-with-a-long-random-secret
```

Optional live services:

```dotenv
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
EASYPOST_API_KEY=
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SHIP_FROM_NAME=Beaman Woodworks
SHIP_FROM_STREET1=
SHIP_FROM_CITY=
SHIP_FROM_STATE=
SHIP_FROM_ZIP=
SHIP_FROM_COUNTRY=US
```

## Compose file

`docker-compose.synology.yml` is the authoritative runtime definition. Important points:

- `MEDIA_ROOT=/app/pics`
- `/volume2/docker_ssd/woodsmith/pics:/app/pics`
- `/volume2/docker_ssd/woodsmith/site/data:/app/site/data`
- `/volume2/docker_ssd/woodsmith/cache/next-image:/app/site/.next/cache`
- loopback-only port binding on `127.0.0.1:3002`

The `pics/` mount is intentionally read-write. The dashboard can upload, rename, delete, tag, and assign media directly inside that library. Do not change the mount back to read-only unless media management is intentionally disabled.

## Build from WSL or another Docker host

```bash
cd /mnt/woodsmith
docker buildx build --platform linux/amd64 -t woodsmith:prod --load .
```

Optional local container smoke test:

```bash
docker run --rm -p 3002:3002 \
  --env-file .env \
  -e MEDIA_ROOT=/app/pics \
  -v "$(pwd)/site/data:/app/site/data" \
  -v "$(pwd)/pics:/app/pics" \
  -v "$(pwd)/cache/next-image:/app/site/.next/cache" \
  woodsmith:prod
```

## Export and load on the NAS

From the build host:

```bash
docker save woodsmith:prod | gzip > releases/woodsmith-prod-$(date +%F-%H%M%S).tar.gz
```

On the NAS:

```bash
gunzip -c /volume2/docker_ssd/woodsmith/releases/woodsmith-prod-*.tar.gz | docker load
cd /volume2/docker_ssd/woodsmith
docker compose -f docker-compose.synology.yml up -d
```

## Reverse proxy

Configure Synology Reverse Proxy with:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

The public source host should match `SITE_URL` and `NEXT_PUBLIC_SITE_URL`.

## Verification after deploy

### Container health

```bash
cd /volume2/docker_ssd/woodsmith
docker compose -f docker-compose.synology.yml ps
```

### Data and media permissions

```bash
docker compose -f docker-compose.synology.yml exec woodsmith sh -lc 'test -w /app/site/data && echo DATA_OK; test -w /app/pics && echo MEDIA_OK; test -w /app/site/.next/cache && echo CACHE_OK'
```

### Media route

```bash
curl -I http://127.0.0.1:3002/media/Furniture/DSC_0051.JPG
```

### App routes

```bash
curl -I http://127.0.0.1:3002/
curl -I http://127.0.0.1:3002/portfolio
curl -I http://127.0.0.1:3002/shop
curl -I http://127.0.0.1:3002/process
curl -I http://127.0.0.1:3002/commissions
curl -I http://127.0.0.1:3002/studio/login
```

`/journal` and `/journal/[slug]` should redirect to the Process routes.

### Logs

```bash
docker compose -f docker-compose.synology.yml logs --tail=200 woodsmith
```

## Backup guidance

Because the dashboard can mutate the shared media library, back up these paths together:

- `site/data/`
- `pics/`
- `.env`

A SQLite backup without the matching media tree is no longer sufficient for full recovery.

## Current deployment caveats

- `node:sqlite` remains experimental in Node and emits warnings during build and runtime.
- SMTP, Stripe, and EasyPost remain optional until configured.
- The public custom work page is contact-first; the older SVG visualizer is not a photorealistic 3D renderer.
- The build can fail on Windows if a standalone `npm run start` process still has `.next/standalone/data/woodsmith.sqlite` locked.
