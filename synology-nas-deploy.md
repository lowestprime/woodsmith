# Beaman Woodworks Synology NAS Deployment Guide

## Goal

Deploy Beaman Woodworks from `/volume2/docker_ssd/woodsmith/` so that:

- the app listens only on `127.0.0.1:3002`
- Synology Reverse Proxy terminates public HTTPS
- SQLite persists in `site/data/`
- Next.js image cache persists in `cache/next-image/`
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025` is mounted directly to `/app/pics:rw`
- password reset links, share links, and Stripe redirects use the public site URL

## Runtime layout

```text
/volume2/docker_ssd/woodsmith/
├── .env
├── Dockerfile
├── docker-compose.synology.yml
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
mkdir -p /volume2/docker_ssd/woodsmith/{site/data,cache/next-image,releases,backups}
```

Then ensure the container user can write to `site/data`, `cache`, and the real NAS photo library:

```bash
chown -R 1026:100 /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025
chmod -R u+rwX,g+rwX /volume2/docker_ssd/woodsmith/site/data /volume2/docker_ssd/woodsmith/cache /volume1/homes/Cooper/Photos/Dad_Woodworking_09262025
```

## `.env`

Start from `.env.example` and fill at least:

```dotenv
PUID=1026
PGID=100
SITE_URL=https://www.woodmat.ch
NEXT_PUBLIC_SITE_URL=https://www.woodmat.ch
MEDIA_ROOT=/app/pics
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
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
OPENAI_IMAGE_SIZE=1024x1024
OPENAI_IMAGE_QUALITY=high
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
ENABLE_PUBLIC_AI_RENDERING=false
ENABLE_AI_BACKGROUND_CLEANUP=false
ENABLE_EMBEDDING_SEARCH=false
```

## Compose file

`docker-compose.synology.yml` is the authoritative runtime definition. Important points:

- `MEDIA_ROOT=/app/pics`
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw`
- `/volume2/docker_ssd/woodsmith/site/data:/app/site/data`
- `/volume2/docker_ssd/woodsmith/cache/next-image:/app/site/.next/cache`
- loopback-only port binding on `127.0.0.1:3002`
- optional OpenAI feature flags remain disabled unless a server-side API key is provided

The `/app/pics` mount is intentionally read-write. The dashboard can upload, rename, delete, tag, and assign media directly inside that library. Do not mount `/volume2/docker_ssd/woodsmith/pics` into `/app/pics`; the attached Synology context shows that nested mount points under `docker_ssd` can make the share ineligible for Synology Drive Team Folder use.

The image now normalizes ownership and read permissions for bundled runtime assets under `/app/site/public` and `/_next/static` so the app still boots correctly when `docker-compose.synology.yml` runs the container as the NAS `PUID:PGID` user instead of the image-default `nextjs` user.

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
  -v "/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025:/app/pics:rw" \
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

The startup path for this branch includes the current seed upgrade. On first boot after deploy, persisted legacy developer-contact data is normalized from `lowestprime@proton.me` to `cooperbeaman@proton.me`.

## Reverse proxy

Configure Synology Reverse Proxy with:

- destination protocol: `http`
- destination host: `127.0.0.1`
- destination port: `3002`

The public source host should match `SITE_URL` and `NEXT_PUBLIC_SITE_URL`.

The app now treats `https://www.woodmat.ch` as canonical. Requests arriving on `woodmat.ch` or the retired `ws.lowestprime.synology.me` host are redirected by the Next `proxy.ts` boundary to the canonical origin.

## Cloudflare visitor-location headers

If you want the dashboard visitor map to show country and city data, enable Cloudflare IP Geolocation or the Add visitor location headers Managed Transform for the zone. Cloudflare documents that:

- `CF-Connecting-IP` carries the client IP to the origin
- `CF-IPCountry` carries the two-letter visitor country code
- the visitor-location transform can add city, region, latitude, and longitude headers

Without those headers, the app still records visitor sessions, paths, and hosts, but the map/list will show unknown location data.

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

Missing or removed files must return **404** (not a broken stream). Stale `media_items` rows pointing at deleted paths used to trigger `failed to pipe response` in logs when the dashboard rendered hundreds of thumbnails at once.

### Woodshop dashboard (`/studio`) and large libraries

- The dashboard **paginates media** (48 items per page) and caps verification-candidate scans. Use **Filter** and **Next page** for very large `pics/` trees.
- After upgrading the app image, use **Refresh library** once so the scanner skips Synology **`@eaDir`** folders and **`SYNOFILE_THUMB*`** files; those paths are also excluded from SQL media lists.
- If logs show `ENOENT` for profile or generated paths, fix the file on disk or clear the bad path in SQLite / re-upload.

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
- `/volume1/homes/Cooper/Photos/Dad_Woodworking_09262025`
- `.env`

A SQLite backup without the matching media tree is no longer sufficient for full recovery.

## Current deployment caveats

- `node:sqlite` remains experimental in Node and emits warnings during build and runtime.
- SMTP, Stripe, and EasyPost remain optional until configured.
- The public custom work page is contact-first and includes a credential-free procedural 3D scale preview. Photorealistic previews, AI cleaned image copies, and embedding re-ranking are optional OpenAI-backed features and remain disabled by default.
- The build can fail on Windows if a standalone `npm run start` process still has `.next/standalone/data/woodsmith.sqlite` locked.
