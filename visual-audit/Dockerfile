FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /audit

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/tmp

COPY visual-audit/package.json ./package.json
COPY visual-audit/package-lock.json ./package-lock.json
RUN npm ci --include=dev

COPY visual-audit/ ./
RUN npm run build \
  && npm prune --omit=dev

# Keep the bounded dependency inventory inside the immutable audit image. This
# avoids host-path drift and Docker Desktop SMB/UNC bind failures.
COPY site/app /workspace/site/app
COPY site/components /workspace/site/components
COPY site/lib /workspace/site/lib
COPY visual-audit/src /workspace/visual-audit/src

ENTRYPOINT ["node", "dist/run.js"]
