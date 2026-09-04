import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox } from 'playwright';

// Exercise the real stylesheet, not a duplicate of the animation declaration.
const css = await readFile(new URL('../../site/app/ui-repair.css', import.meta.url), 'utf8');
const results = [];
for (const [name, engine, options] of [
  ['chromium', chromium, {}],
  ['firefox-scroll-timelines', firefox, { firefoxUserPrefs: { 'layout.css.scroll-driven-animations.enabled': true } }]
]) {
  const browser = await engine.launch({ headless: true, ...options });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.setContent(`<html><head><style>${css}</style><style>body {margin:0;height:3000px}</style></head><body><div aria-hidden="true" class="route-progress-rail" data-active="true" data-mode="timeline"><span class="route-progress-fill"></span></div></body></html>`);
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()') && CSS.supports('animation-range: 0% 100%'));
    assert.equal(supported, true, `${name}: the CSS timeline path must actually be supported`);
    assert.equal(await page.locator('.route-progress-fill').evaluate((el) => getComputedStyle(el).animationDuration), '0.001s');
    const samples = [];
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate((value) => window.scrollTo(0, value * (document.documentElement.scrollHeight - innerHeight)), fraction);
      await page.waitForFunction((expected) => {
        const value = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.route-progress-fill')).transform).a;
        return Math.abs(value - expected) < 0.01;
      }, fraction);
      samples.push(await page.locator('.route-progress-fill').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a));
    }
    await page.evaluate(() => { document.body.style.height = '5000px'; });
    await page.waitForFunction(() => {
      const expected = scrollY / (document.documentElement.scrollHeight - innerHeight);
      const actual = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.route-progress-fill')).transform).a;
      return Math.abs(actual - expected) < 0.01;
    });
    results.push({ browser: name, version: browser.version(), supported, samples, dynamicHeight: 'PASS', reducedMotion: 'reduce' });
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ status: 'PASS', results }));
