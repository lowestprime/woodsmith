import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.PUBLIC_QA_URL, output = process.env.PUBLIC_QA_OUTPUT;
assert.ok(base && output);
assert.match(new URL(base).hostname, /^woodsmith-public-qa-[a-z0-9-]+$/);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const errors = [], crossOrigin = [];
let failure;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'beaman-cart', value: 'disposable-routing-cart', url: base }]);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    crossOrigin.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/shop/cart`);
  assert.equal(await page.locator('.cart-line').count(), 1);
  const removal = page.locator('.cart-line form');
  await removal.locator('[name="id"]').evaluate(element => { element.value = 'foreign-routing-cart'; });
  await removal.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForURL('**/shop/cart?error=**');
  await page.getByRole('alert').getByText('This cart item is no longer available.').waitFor();
  assert.equal(await page.locator('.cart-line').count(), 1);
  await page.goto(`${base}/shop/cart`);
  await page.locator('.cart-line form').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForURL('**/shop/cart?updated=1');
  await page.getByText('Your cart is empty.').waitFor();
  await context.addCookies([{ name: 'beaman-cart', value: 'foreign-routing-token', url: base }]);
  await page.goto(`${base}/shop/cart`);
  assert.equal(await page.locator('.cart-line').count(), 1, 'Another customer line must survive');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(output, 'cart-ownership.png') });
  await context.close();
} catch (error) { failure = error.message; }
finally {
  await writeFile(path.join(output, 'cart-ownership.json'), JSON.stringify({ passed: !failure && !errors.length && !crossOrigin.length, failure, errors, crossOrigin }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ failure, errors, crossOrigin }));
assert.ok(!failure && !errors.length && !crossOrigin.length);
