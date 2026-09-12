import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const require = createRequire("/audit/package.json");
const { chromium, firefox, expect } = require("playwright/test");
const base = process.env.MEDIA_QA_URL;
assert.match(new URL(base).hostname, /^woodsmith-mediaqa-[a-z0-9-]+-app$/);
assert.equal(process.env.MEDIA_QA_DISPOSABLE, "true");
const browserName = process.env.MEDIA_QA_BROWSER ?? "chromium";
const phase = process.env.MEDIA_QA_PHASE ?? "initial";
const manifest = JSON.parse(readFileSync("/fixtures/manifest.json", "utf8"));
const jpeg = manifest.filter((entry) => entry.path.endsWith(".jpg"));
const video = manifest.find((entry) => entry.path.endsWith(".mp4"));
const db = new DatabaseSync("/qa-data/woodsmith.sqlite");
const row = (relativePath) => db.prepare("SELECT * FROM media_items WHERE relative_path = ?").get(relativePath);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const browser = await (browserName === "firefox" ? firefox : chromium).launch();
const context = await browser.newContext({ viewport: { width: browserName === "firefox" ? 390 : 1440, height: 1000 }, colorScheme: browserName === "firefox" ? "dark" : "light", reducedMotion: "reduce" });
await context.addCookies([
  { name: "beaman_session", value: "disposable-public-qa-only", url: base },
  { name: "beaman-theme", value: browserName === "firefox" ? "dark" : "light", url: base }
]);
const errors = [], crossOrigin = [], checks = [];
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === new URL(base).origin || ["blob:", "data:"].includes(url.protocol)) return route.continue();
  crossOrigin.push(url.origin); return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const inspector = page.locator(".studio-media-inspector");
const form = inspector.locator('form[data-studio-autosave="true"]');
async function openMedia(relativePath) {
  await page.goto(`${base}/studio?panel=media`);
  await page.locator('[data-media-path]').first().waitFor();
  await page.locator(`[data-media-path="${relativePath}"]`).click();
  await expect(inspector.locator("[data-media-inspector-title]")).toHaveText(path.basename(relativePath));
  await inspector.getByText("Crop, quality, credit, and search metadata", { exact: true }).click();
}
async function saved(relativePath, predicate) {
  await expect.poll(() => predicate(row(relativePath)), { timeout: 15000 }).toBe(true);
}
async function decodeCrop() {
  const image = inspector.locator(".media-crop-stage img");
  await image.waitFor();
  const dimensions = await image.evaluate(async (img) => { await img.decode(); return [img.naturalWidth, img.naturalHeight]; });
  assert.ok(dimensions.every((value) => value > 0));
  return dimensions;
}
let failure;
try {
  for (const entry of jpeg) {
    await openMedia(entry.path);
    const dimensions = await decodeCrop();
    const response = await context.request.get(`${base}/media/${entry.path}`);
    assert.equal(response.status(), 200);
    assert.match(response.headers()["content-type"], /image\/jpeg/);
    const bytes = await response.body();
    assert.equal(bytes.length, entry.size); assert.equal(hash(bytes), entry.sha256);
    const range = await context.request.get(`${base}/media/${entry.path}`, { headers: { Range: "bytes=0-31" } });
    assert.equal(range.status(), 206); assert.equal((await range.body()).length, 32);
    checks.push({ path: entry.path, dimensions, bytes: "identical", http: 200, range: 206 });
  }
  const selected = jpeg[0].path;
  await openMedia(selected);
  if (phase === "initial") {
    await form.locator('[name="cropAspect"]').selectOption("wide");
    await form.locator('[name="focalX"]').fill("37");
    await form.locator('[name="zoom"]').fill("3.5");
    await saved(selected, (record) => record.focal_x === 37 && record.zoom === 3.5 && JSON.parse(record.metadata_json).cropAspect === "wide");
    const stable = row(selected);
    const signature = JSON.parse(stable.metadata_json).mediaSourceSignature;
    const source = readFileSync(path.join("/fixtures/originals", selected));
    const broken = Buffer.from(source);
    const primaryBytes = JSON.parse(stable.metadata_json).mediaPrimaryBytes;
    broken[primaryBytes - 1] = 0;
    writeFileSync(path.join("/qa-media", selected), broken);
    await inspector.getByRole("button", { name: "Refresh preview", exact: true }).click();
    await expect(inspector.getByText("Preview unavailable", { exact: true })).toBeVisible();
    assert.equal(await form.locator('[name="cropAspect"]').inputValue(), "wide");
    await form.locator('[name="focalY"]').fill("62");
    await form.locator('[name="altText"]').focus();
    await saved(selected, (record) => record.focal_y === 62);
    writeFileSync(path.join("/qa-media", selected), source);
    await inspector.getByRole("button", { name: "Refresh preview", exact: true }).click();
    await decodeCrop();
    await saved(selected, (record) => JSON.parse(record.metadata_json).mediaSourceSignature === signature);
    assert.equal(await form.locator('[name="zoom"]').inputValue(), "3.5");
    assert.equal(await form.locator('[name="focalY"]').inputValue(), "62");
    checks.push({ save: "crop/fallback/recovery", sourceRestoredIdentically: hash(readFileSync(path.join("/qa-media", selected))) === jpeg[0].sha256 });
  }
  await page.reload();
  await page.locator(`[data-media-path="${selected}"]`).click();
  await inspector.getByText("Crop, quality, credit, and search metadata", { exact: true }).click();
  await decodeCrop();
  assert.equal(await form.locator('[name="cropAspect"]').inputValue(), "wide");
  assert.equal(await form.locator('[name="focalX"]').inputValue(), "37");
  assert.equal(await form.locator('[name="zoom"]').inputValue(), "3.5");
  checks.push({ persistence: phase === "initial" ? "reload" : "container-restart", status: "PASS" });

  await openMedia(video.path);
  assert.equal(await form.locator('[name="cropAspect"]').inputValue(), "free");
  if (phase === "initial") {
    await form.locator('[name="focalX"]').fill("43");
    await form.locator('[name="altText"]').focus();
    await saved(video.path, (record) => record.focal_x === 43 && JSON.parse(record.metadata_json).cropAspect === "free");
  } else assert.equal(await form.locator('[name="focalX"]').inputValue(), "43");
  checks.push({ videoDefaultAndSave: "PASS" });

  if (phase === "restart" && browserName === "chromium") {
    await page.goto(`${base}/studio?panel=media`);
    const before = row(selected);
    await page.getByText("Advanced actions and provider details", { exact: true }).click();
    await page.getByRole("button", { name: "Rescan files", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rescan files", exact: true })).toBeEnabled({ timeout: 15000 });
    assert.deepEqual(row(selected), before);
    checks.push({ reindex: "PASS", customizationAndVersionPreserved: true });
  }

  await openMedia(selected);
  await decodeCrop();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `/evidence/media-${browserName}-${phase}.png`, fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(crossOrigin, []);
  for (const entry of manifest) assert.equal(hash(readFileSync(path.join("/fixtures/originals", entry.path))), entry.sha256);
} catch (error) {
  failure = error.stack;
  await page.screenshot({ path: `/evidence/media-${browserName}-${phase}-failure.png`, fullPage: true });
} finally {
  mkdirSync("/evidence", { recursive: true });
  writeFileSync(`/evidence/browser-${browserName}-${phase}.json`, JSON.stringify({ status: failure ? "FAIL" : "PASS", browser: browserName, browserVersion: browser.version(), phase, checks, errors, crossOrigin, failure }, null, 2) + "\n");
  await browser.close(); db.close();
}
if (failure) throw new Error(failure);
console.log(`PASS: ${browserName} ${phase}, ${checks.length} media checks.`);
