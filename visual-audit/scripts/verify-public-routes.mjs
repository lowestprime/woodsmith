import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PUBLIC_QA_URL;
const output = process.env.PUBLIC_QA_OUTPUT;
assert.ok(base && output, 'PUBLIC_QA_URL and PUBLIC_QA_OUTPUT are required');
assert.match(new URL(base).hostname, /^(?:127\.0\.0\.1|localhost|woodsmith-public-qa-[a-z0-9-]+)$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const crossOrigin = [];
const progress = [];
try {
  for (const width of process.env.PUBLIC_QA_PROGRESS_ONLY === 'true' ? [] : [1440, 430, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await context.addCookies([{ name: 'beaman-theme', value: theme, url: base }]);
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push({ width, theme, kind: 'page', message: error.message }));
      page.on('console', (message) => { if (message.type() === 'error') errors.push({ width, theme, kind: 'console', message: message.text() }); });
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        crossOrigin.push({ origin: url.origin, method: route.request().method() });
        return route.abort('blockedbyclient');
      });
      for (const route of ['/', '/portfolio', '/shop', '/shop/cart', '/about', '/contact', '/commissions', '/account/login', '/account/forgot', '/account/signup', '/commissions/status', '/search?q=table', '/process', '/missing-qa-page']) {
        const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').first().waitFor();
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => ({
          title: document.title,
          h1: document.querySelector('h1')?.textContent,
          noindex: [...document.querySelectorAll('meta[name="robots"]')].some((el) => el.content.includes('noindex')),
          theme: document.documentElement.dataset.theme,
          overflow: document.documentElement.scrollWidth - innerWidth,
          missingMedia: [...document.images].filter((image) => image.complete && !image.naturalWidth).map((image) => image.getAttribute('alt')),
          contactLinks: document.querySelectorAll('a[href="/contact"]').length,
          eyebrowCount: document.querySelectorAll('.eyebrow').length,
          cardDates: [...document.querySelectorAll('.piece-card-footer')].filter((node) => node.textContent.includes('Updated')).length
        }));
        results.push({ route, width, requestedTheme: theme, status: response.status(), ...metrics });
        if (['/', '/portfolio', '/contact'].includes(route) && [1440, 320].includes(width)) {
          await page.screenshot({ path: path.join(output, `${route === '/' ? 'home' : route.slice(1)}-${width}-${theme}.png`) });
        }
      }
      await context.close();
    }
  }
  for (const fallback of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    if (fallback) await context.addInitScript(() => {
      const supports = CSS.supports.bind(CSS);
      CSS.supports = (...args) => args.some((value) => value.includes('animation-timeline')) ? false : supports(...args);
    });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.route-progress-rail[data-active="true"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.route-progress-rail').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.route-progress-rail').getAttribute('data-mode'), fallback ? 'fallback' : 'timeline');
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((value) => scrollTo(0, value * (document.documentElement.scrollHeight - innerHeight)), fraction);
      await page.waitForFunction((expected) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.route-progress-fill')).transform).a - expected) < 0.015, fraction);
    }
    await page.evaluate(() => { const extra = document.createElement('div'); extra.style.height = '1200px'; document.body.append(extra); });
    await page.waitForFunction(() => Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.route-progress-fill')).transform).a - scrollY / (document.documentElement.scrollHeight - innerHeight)) < 0.015);
    await page.evaluate(() => scrollBy(0, -80));
    await page.locator('.site-header:not(.is-hidden)').waitFor();
    await page.locator('.site-nav a[href="/contact"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/contact');
    await page.getByRole('heading', { name: 'Contact the woodshop' }).waitFor();
    await page.waitForFunction(() => scrollY < 5 && new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.route-progress-fill')).transform).a < 0.015);
    progress.push({ mode: fallback ? 'fallback' : 'timeline', topMiddleBottom: 'PASS', dynamicHeight: 'PASS', keyboardContactNavigationReset: 'PASS' });
    await context.close();
  }
  const report = { browser: browser.version(), results, errors, crossOrigin, progress };
  await writeFile(path.join(output, 'public-qa.json'), JSON.stringify(report, null, 2));
  const overflows = results.filter((row) => row.overflow > 1);
  const wrongTheme = results.filter((row) => row.theme !== row.requestedTheme);
  // Next's streamed notFound() response may be 200, but must render the 404 UI and noindex.
  const statusErrors = results.filter((row) => row.route === '/missing-qa-page'
    ? !([200, 404].includes(row.status) && row.h1 === 'Page not found' && row.noindex)
    : row.status !== 200);
  console.log(JSON.stringify({ routes: results.length, overflows, wrongTheme, statusErrors, errorCount: errors.length, output }));
  assert.equal(overflows.length + wrongTheme.length + statusErrors.length + errors.length + crossOrigin.length, 0, 'Rendered QA has unresolved failures; inspect public-qa.json');
} finally {
  await browser.close();
}
