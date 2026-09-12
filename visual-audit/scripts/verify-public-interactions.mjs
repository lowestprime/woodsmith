import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PUBLIC_QA_URL;
const output = process.env.PUBLIC_QA_OUTPUT;
assert.ok(base && output);
assert.match(new URL(base).hostname, /^woodsmith-public-qa-[a-z0-9-]+$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [], errors = [], crossOrigin = [], interactions = [];
try {
  for (const width of [1440, 430, 390, 320]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'beaman-theme', value: theme, url: base }]);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      crossOrigin.push(url.origin);
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push({ width, theme, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') errors.push({ width, theme, message: message.text() }); });
    await page.goto(base);
    await page.locator('.home-hero-image').waitFor();
    await page.locator('.home-hero-image').evaluate(image => image.decode());
    assert.ok(await page.locator('.home-hero-image').evaluate(image => image.naturalWidth > 0));
    await page.screenshot({ path: path.join(output, `hero-${width}-${theme}.png`) });
    await page.goto(`${base}/portfolio?category=tables`);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('.piece-card-footer').filter({ hasText: 'Updated' }).count(), 0);
    await page.goto(`${base}/portfolio/pastry-table`);
    const opener = page.getByRole('button', { name: /Open .*full-screen/ }).first();
    await opener.click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await opener.evaluate(el => el === document.activeElement), true);
    await opener.click();
    await page.getByRole('button', { name: 'Close image preview' }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    interactions.push({ width, theme, heroDecode: true, galleryZoomCloseFocus: true });
    await context.addCookies([{ name: 'beaman_session', value: 'disposable-public-qa-only', url: base }]);
    for (const route of ['/account/profile', '/account/projects', ...['overview','settings','pages','pieces','media','projects','orders','notifications'].map(panel => `/studio?panel=${panel}`)]) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, title: document.querySelector('h1')?.textContent, theme: document.documentElement.dataset.theme }));
      results.push({ width, requestedTheme: theme, route, status: response.status(), ...metrics });
      assert.ok(!page.url().includes('/login'), `Authentication failed: ${route}`);
      if (route.includes('panel=notifications')) await page.screenshot({ path: path.join(output, `notifications-${width}-${theme}.png`) });
    }
    await context.close();
  }
  const report = { browser: browser.version(), results, interactions, errors, crossOrigin };
  await writeFile(path.join(output, 'interactions.json'), JSON.stringify(report, null, 2));
  assert.equal(results.filter(row => row.overflow > 1 || row.status !== 200 || row.theme !== row.requestedTheme).length + errors.length + crossOrigin.length, 0, 'Inspect interactions.json');
  console.log(JSON.stringify({ routes: results.length, interactions: interactions.length, errors, crossOrigin, result: 'PASS' }));
} finally { await browser.close(); }
