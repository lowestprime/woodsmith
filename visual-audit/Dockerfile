FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /audit

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOME=/tmp

COPY visual-audit/package.json ./package.json
COPY visual-audit/package-lock.json ./package-lock.json
RUN npm ci

COPY visual-audit/ ./
RUN npm run build

ENTRYPOINT ["node", "dist/run.js"]
