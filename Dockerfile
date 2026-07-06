FROM node:22-bookworm-slim AS builder
WORKDIR /app/site
ENV NEXT_TELEMETRY_DISABLED=1

COPY site/package.json ./package.json
COPY site/package-lock.json ./package-lock.json
RUN npm ci

COPY site ./
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app/site
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nextjs
RUN useradd --system --uid 1001 --gid 1001 nextjs

COPY --from=builder --chown=nextjs:nextjs /app/site/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/site/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/site/public ./public
RUN mkdir -p /app/site/data \
  && chown nextjs:nextjs /app/site/data \
  && chmod -R a+rX /app/site/public /app/site/.next/static

USER nextjs
EXPOSE 3002
CMD ["node", "--experimental-sqlite", "server.js"]
