import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PUBLIC_QA_URL, output = process.env.PUBLIC_QA_OUTPUT;
assert.ok(base && output);
assert.match(new URL(base).hostname, /^woodsmith-public-qa-[a-z0-9-]+$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const checks = [], errors = [], crossOrigin = [];
let stage = 'start';
let failure;
const route = `${base}/studio?panel=notifications`;
const phase = process.env.PUBLIC_QA_PHASE || 'all';
assert.ok(['all', 'correspondence'].includes(phase));
async function observe(context) {
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin && !['blob:', 'data:'].includes(url.protocol)) crossOrigin.push(url.origin);
  });
  await context.route('**/*', r => {
    const url = new URL(r.request().url());
    if (url.origin === new URL(base).origin || ['blob:', 'data:'].includes(url.protocol)) return r.continue();
    crossOrigin.push(url.origin); return r.abort('blockedbyclient');
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push({ stage, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') errors.push({ stage, message: message.text() }); });
  });
}
async function saved(form, action) {
  const response = form.page().waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/studio')).then(value => ({ value }), error => ({ error }));
  await action();
  await form.page().evaluate(() => document.activeElement?.blur());
  if (await form.locator('[data-studio-save-phase="error"]').count()) await form.getByRole('button', { name: 'Retry save', exact: true }).click();
  const result = await response;
  if (result.error) throw result.error;
  await form.locator('[data-studio-save-phase="saved"]').waitFor();
}
try {
  for (const width of phase === 'correspondence' ? [] : [1440, 430, 390, 320]) for (const theme of ['light', 'dark']) {
    stage = `${width}-${theme}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'beaman_session', value: 'disposable-public-qa-only', url: base }, { name: 'beaman-theme', value: theme, url: base }]);
    await observe(context);
    const page = await context.newPage();
    await page.goto(route);
    const form = page.locator('[data-studio-entity-key="notification-routing:site"]');
    const global = form.getByRole('textbox', { name: 'Global forwarding recipients (BCC)', exact: true });
    await global.waitFor();
    stage = `${width}-${theme}:global-save`;
    await saved(form, () => global.fill(`Copy@Example.test;second@example.test\ncopy@example.test`));
    assert.equal(await global.inputValue(), 'copy@example.test\nsecond@example.test');
    await page.reload();
    assert.equal(await global.inputValue(), 'copy@example.test\nsecond@example.test');
    stage = `${width}-${theme}:validation-recovery`;
    await global.fill('a..b@example.test');
    await global.blur();
    await form.locator('[data-studio-save-phase="error"]').waitFor();
    await saved(form, () => global.fill('copy@example.test'));
    await page.getByRole('tab', { name: 'Types', exact: true }).click();
    await page.getByRole('button', { name: 'New customer inquiry Enabled', exact: true }).click();
    stage = `${width}-${theme}:category-save`;
    const policy = page.locator('[data-studio-entity-key="notification-policy:customer_inquiry_admin"]');
    const categoryAddress = `category-${width}-${theme}@example.test`;
    const forwarding = policy.getByRole('textbox', { name: 'Forwarding recipients (BCC)', exact: true });
    if ((await forwarding.inputValue()).includes(categoryAddress)) await saved(policy, () => forwarding.fill(''));
    await saved(policy, () => forwarding.fill(`${categoryAddress};copy@example.test;builder@example.test`));
    assert.match(await policy.locator('output').innerText(), /Effective To: builder@example.test/);
    assert.ok((await policy.locator('output').innerText()).includes(`Effective BCC: copy@example.test, ${categoryAddress}`));
    let previewWrites = 0;
    const listener = request => { if (request.method() === 'POST' && request.url().includes('/studio')) previewWrites++; };
    page.on('request', listener);
    await policy.getByLabel('Example event BCC (preview only)').fill('event@example.test');
    await policy.getByLabel('Example event BCC (preview only)').blur();
    await page.waitForFunction(() => document.querySelector('.notification-routing-preview output')?.textContent.includes('event@example.test'));
    // A bounded negative check spans the autosave debounce; this is not capture settling.
    await new Promise(resolve => setTimeout(resolve, 1000));
    page.off('request', listener);
    assert.equal(previewWrites, 0, 'Preview fields must not autosave');
    for (const tab of ['Overview', 'Types', 'Delivery', 'SMTP']) {
      await page.getByRole('tab', { name: tab, exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator(`#notification-workspace-tab-${tab.toLowerCase()}[aria-selected="true"]`).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${stage}:${tab} overflow`);
      if (tab === 'SMTP') {
        assert.equal(await page.locator('input[type="password"]').count(), 0);
        await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
        await page.getByText(/SMTP is not configured/).first().waitFor();
      }
      await page.screenshot({ path: path.join(output, `${width}-${theme}-${tab}.png`) });
    }
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await saved(form, () => global.fill(''));
    await page.reload();
    assert.equal(await global.inputValue(), '');
    checks.push({ width, theme, roundTripClear: true, malformedRejected: true, effectiveUnion: true, previewDoesNotSave: true, tabsKeyboardNoOverflow: true, smtpNoCredentials: true });
    await context.close();
  }
  stage = 'conflict';
  const context = await browser.newContext();
  await observe(context);
  await context.addCookies([{ name: 'beaman_session', value: 'disposable-public-qa-only', url: base }]);
  const one = await context.newPage(), two = await context.newPage();
  await one.goto(route); await two.goto(route);
  const first = one.locator('[data-studio-entity-key="notification-routing:site"]'), stale = two.locator('[data-studio-entity-key="notification-routing:site"]');
  await saved(first, () => first.locator('textarea').fill('winner@example.test'));
  await stale.locator('textarea').fill('stale@example.test'); await stale.locator('textarea').blur();
    await stale.locator('[data-studio-save-phase="conflict"]').waitFor();
  await two.screenshot({ path: path.join(output, 'conflict.png') });
  await one.reload();
  assert.equal(await first.locator('textarea').inputValue(), 'winner@example.test');
  stage = 'conflict-recovery';
  await stale.getByRole('button', { name: 'Use latest saved version (discard my edits)', exact: true }).click();
  await stale.locator('[data-studio-save-phase="saved"]').waitFor();
  await two.waitForFunction(() => document.querySelector('textarea[name="forwardTo"]')?.value === 'winner@example.test');
  assert.equal(await stale.locator('textarea').inputValue(), 'winner@example.test');
  await saved(stale, () => stale.locator('textarea').fill('recovered@example.test'));
  await one.reload();
  assert.equal(await first.locator('textarea').inputValue(), 'recovered@example.test');
  checks.push({ staleVersionRejected: true, explicitRecovery: true });
  await context.close();

  stage = 'customer-contact-reply';
  const guestContext = await browser.newContext();
  await observe(guestContext);
  const guest = await guestContext.newPage();
  await guest.goto(`${base}/contact`);
  await guest.getByLabel('Your name', { exact: true }).fill('QA customer');
  await guest.getByLabel('Email', { exact: true }).fill('buyer@example.test');
  await guest.getByLabel('How can the woodshop help?').fill('Synthetic correspondence acceptance inquiry.');
  await guest.getByRole('button', { name: 'Send inquiry' }).click();
  await guest.waitForURL('**/requests/**');
  await guest.locator('textarea[name="body"]').fill('Synthetic customer follow-up.');
  await guest.locator('textarea[name="body"]').locator('..').locator('..').getByRole('button').click();
  await guest.getByText('Your follow-up note has been added.').waitFor();
  checks.push({ customerContactAndReply: true, reference: new URL(guest.url()).pathname.split('/').at(-1) });
  stage = 'local-reservation';
  await guestContext.addCookies([{ name: 'beaman-cart', value: 'disposable-routing-cart', url: base }]);
  await guest.goto(`${base}/shop/cart`);
  const reservation = guest.locator('form[action="/api/shop/local-reservation"]');
  for (const [name, value] of Object.entries({ email: 'buyer@example.test', shippingName: 'QA customer', shippingStreet1: 'Synthetic cross streets', shippingCity: 'Fixture city', shippingState: 'CA', shippingZip: '94122' })) await reservation.locator(`[name="${name}"]`).fill(value);
  await reservation.locator('[name="pickupConsent"]').check();
  await reservation.getByRole('button', { name: 'Continue logistics review' }).click();
  await guest.waitForURL('**/shop/cart?checkout=local-review&**');
  checks.push({ localReservation: true, order: new URL(guest.url()).searchParams.get('order') });
  await guestContext.close();
} catch (error) {
  failure = { stage, message: error.message };
  for (const [index, context] of browser.contexts().entries()) for (const [pageIndex, page] of context.pages().entries()) {
    if (page.isClosed()) continue;
    await page.screenshot({ path: path.join(output, `failure-${index}-${pageIndex}.png`) }).catch(() => {});
    await writeFile(path.join(output, `failure-${index}-${pageIndex}.txt`), await page.locator('main').innerText().catch(() => 'Unavailable'));
  }
}
finally {
  await writeFile(path.join(output, 'routing-qa.json'), JSON.stringify({ phase, checks, errors, crossOrigin, failure, passed: !failure && !errors.length && !crossOrigin.length }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checks: checks.length, errors, crossOrigin, failure }));
assert.ok(!failure && !errors.length && !crossOrigin.length, 'Inspect routing-qa.json');
