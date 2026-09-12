import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PUBLIC_QA_URL, output = process.env.PUBLIC_QA_OUTPUT;
assert.ok(base && output);
assert.match(new URL(base).hostname, /^woodsmith-public-qa-[a-z0-9-]+$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = { passed: false, stage: 'start', browser: browser.version(), checks: [], errors: [], crossOrigin: [] };
async function autosave(form, expected, action) {
  await action();
  await form.page().evaluate(() => document.activeElement?.blur());
  await form.page().waitForFunction(async ({ relativePath, field, value }) => {
    const response = await fetch(`/api/studio/media-library?query=${encodeURIComponent(relativePath.split('/').at(-1) ?? relativePath)}&pageSize=12`, { cache: 'no-store' });
    if (!response.ok) return false;
    const body = await response.json();
    const item = body.items.find(candidate => candidate.relativePath === relativePath);
    return item && String(item[field] ?? '') === String(value);
  }, expected);
  await form.locator('[data-studio-save-phase="saved"]').waitFor();
}
try {
  for (const width of [1440, 430, 390, 320]) for (const theme of ['light', 'dark']) {
    report.stage = `${width}/${theme}/open`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'beaman-theme', value: theme, url: base }, { name: 'beaman_session', value: 'disposable-public-qa-only', url: base }]);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      report.crossOrigin.push({ origin: url.origin, method: route.request().method() });
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ width, theme, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') report.errors.push({ width, theme, message: message.text() }); });
    await page.goto(`${base}/studio?panel=media&media=qa-dense`, { waitUntil: 'domcontentloaded' });
    await page.locator('.studio-media-browser-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    // replaceState/pushState legitimately notify Playwright's framenavigated event.
    // A window-owned marker instead proves that the actual document was preserved.
    await page.evaluate(() => { window.__denseQaDocument = 'preserved'; });
    await page.getByRole('button', { name: 'Next media page', exact: true }).click();
    report.stage = `${width}/${theme}/next-page`;
    await page.waitForFunction(() => new URL(location.href).searchParams.get('mediaPage') === '2');
    await page.getByRole('button', { name: 'Previous media page', exact: true }).click();
    report.stage = `${width}/${theme}/previous-page`;
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('mediaPage'));
    assert.ok(await page.locator('.studio-media-browser-card').count() > 0);
    assert.equal(await page.evaluate(() => window.__denseQaDocument), 'preserved', 'Pagination must not replace the document');
    const card = page.locator('.studio-media-browser-card').first();
    await card.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.studio-media-browser-card').nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Home');
    assert.equal(await card.evaluate(el => el === document.activeElement), true);
    const firstPath = await page.evaluate(() => document.activeElement?.getAttribute('data-media-path'));
    assert.ok(firstPath);
    await page.keyboard.press('Enter');
    report.stage = `${width}/${theme}/inspector`;
    const inspector = page.locator('.studio-media-inspector');
    await inspector.waitFor();
    await inspector.getByRole('heading', { name: firstPath.split('/').at(-1), exact: true }).waitFor();
    if (width < 600) assert.equal(await inspector.locator('[data-media-inspector-title]').evaluate(el => el === document.activeElement), true);
    const alt = inspector.getByRole('textbox', { name: 'Alt text', exact: true });
    const newAlt = `Disposable inspector ${width} ${theme}`;
    const mediaForm = inspector.locator('form[data-studio-autosave="true"]');
    report.stage = `${width}/${theme}/autosave`;
    await autosave(mediaForm, { relativePath: firstPath, field: 'altText', value: newAlt }, () => alt.fill(newAlt));
    assert.equal(await page.evaluate(() => window.__denseQaDocument), 'preserved', 'Autosave must not reload');
    await inspector.getByText('Crop, quality, credit, and search metadata', { exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `Inspector overflow ${width}/${theme}: ${overflow}`);
    await page.screenshot({ path: path.join(output, `inspector-${width}-${theme}.png`) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    report.stage = `${width}/${theme}/reload`;
    const persisted = await page.evaluate(async relativePath => {
      const response = await fetch(`/api/studio/media-library?query=${encodeURIComponent(relativePath.split('/').at(-1) ?? relativePath)}&pageSize=12`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Media persistence request failed: ${response.status}`);
      const body = await response.json();
      return body.items.find(item => item.relativePath === relativePath) ?? null;
    }, firstPath);
    assert.equal(persisted?.altText, newAlt);
    report.checks.push({ width, theme, paginationInPlace: true, keyboardInspector: true, savedAcrossReload: true, overflow });
    if (width === 320 && theme === 'dark') {
      await page.goto(`${base}/studio?panel=media&media=${encodeURIComponent(firstPath.split('/').at(-1))}`, { waitUntil: 'domcontentloaded' });
      await page.locator(`.studio-media-browser-card[data-media-path="${firstPath}"]`).click();
      await inspector.waitFor();
      await page.evaluate(() => { window.__denseQaDocument = 'preserved'; });
      const form = inspector.locator('form[data-studio-autosave="true"]');
      report.stage = '320/dark/assignment';
      await autosave(form, { relativePath: firstPath, field: 'pieceSlug', value: 'pastry-table' }, () => inspector.getByRole('combobox', { name: 'Piece', exact: true }).selectOption('pastry-table'));
      assert.equal(await inspector.getByRole('checkbox', { name: 'Reviewed for public use', exact: true }).isChecked(), false);
      await inspector.getByText('Crop, quality, credit, and search metadata', { exact: true }).click();
      const zoom = inspector.locator('input[name="zoom"]');
      report.stage = '320/dark/crop';
      await autosave(form, { relativePath: firstPath, field: 'zoom', value: '1.05' }, async () => { await zoom.focus(); await zoom.press('ArrowRight'); });
      await page.waitForFunction(() => Number(document.querySelector('.studio-media-inspector input[name="zoom"]')?.value) > 1);
      const rename = inspector.getByRole('textbox', { name: 'Rename', exact: true });
      await rename.fill('fixture-renamed');
      await inspector.getByRole('button', { name: 'Rename', exact: true }).click();
      report.stage = '320/dark/rename';
      await page.waitForFunction(async () => {
        const response = await fetch('/api/studio/media-library?query=fixture-renamed.png&pageSize=12', { cache: 'no-store' });
        if (!response.ok) return false;
        const body = await response.json();
        return body.items.some(item => item.relativePath === 'qa-dense/fixture-renamed.png');
      });
      assert.equal(await page.evaluate(() => window.__denseQaDocument), 'preserved');
      await page.goto(`${base}/studio?panel=media&media=fixture-renamed.png`, { waitUntil: 'domcontentloaded' });
      await page.locator('.studio-media-browser-card[data-media-path="qa-dense/fixture-renamed.png"]').click();
      await inspector.getByRole('heading', { name: 'fixture-renamed.png', exact: true }).waitFor();
      await page.evaluate(() => { window.__denseQaDocument = 'preserved'; });
      const remove = inspector.getByRole('button', { name: 'Delete', exact: true });
      await remove.click();
      report.stage = '320/dark/delete-cancel';
      await page.getByRole('dialog', { name: 'Delete media file', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-audit-confirm-trigger') === 'Delete media file');
      await remove.click();
      await page.getByRole('button', { name: 'Delete media', exact: true }).click();
      report.stage = '320/dark/delete-confirm';
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('.studio-media-inspector h3')?.textContent !== 'fixture-renamed.png');
      assert.equal(await page.evaluate(() => window.__denseQaDocument), 'preserved');
      report.checks.push({ width, theme, unreviewedAssignment: true, keyboardCrop: true, renameInPlace: true, deleteCancelFocus: true, deleteInPlace: true, deletedOriginalFixture: firstPath });
    }
    await context.close();
  }
  report.passed = report.errors.length === 0 && report.crossOrigin.length === 0;
  assert.equal(report.passed, true);
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(path.join(output, 'dense-studio.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report));
}
