import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, firefox } from "playwright";

const base = process.env.STUDIO_QA_URL;
const output = process.env.STUDIO_QA_OUTPUT;
const axePath = process.env.AXE_SOURCE ?? "/qa/axe.min.js";
const browserName = process.env.STUDIO_QA_BROWSER ?? "chromium";

assert.ok(base && output, "STUDIO_QA_URL and STUDIO_QA_OUTPUT are required.");
assert.match(new URL(base).hostname, /^woodsmith-studioqa-[a-z0-9-]+-app$/);
assert.ok(["chromium", "firefox"].includes(browserName));
assert.ok((await readFile(axePath)).length > 100_000, "axe-core source is missing.");

await mkdir(output, { recursive: true });

const browserType = browserName === "firefox" ? firefox : chromium;
const browser = await browserType.launch();
const baseOrigin = new URL(base).origin;
const checks = [];
const violations = [];
const incomplete = [];
const errors = [];
const crossOrigin = [];
let stage = "start";
let failure = null;

function pushRequest(url, source) {
  const parsed = new URL(url);
  if (
    parsed.origin !== baseOrigin &&
    !["blob:", "data:"].includes(parsed.protocol)
  ) {
    crossOrigin.push({ stage, origin: parsed.origin, source });
  }
}

async function newContext(width, theme) {
  const context = await browser.newContext({
    colorScheme: theme,
    reducedMotion: "reduce",
    viewport: { width, height: 900 }
  });
  await context.addCookies([
    {
      name: "beaman_session",
      value: "disposable-public-qa-only",
      url: base
    },
    {
      name: "beaman-theme",
      value: theme,
      url: base
    }
  ]);
  context.on("request", (request) => pushRequest(request.url(), "request"));
  await context.route("**/*", (route) => {
    const requestUrl = new URL(route.request().url());
    if (
      requestUrl.origin === baseOrigin ||
      ["blob:", "data:"].includes(requestUrl.protocol)
    ) {
      return route.continue();
    }
    pushRequest(route.request().url(), "blocked");
    return route.abort("blockedbyclient");
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => {
      errors.push({ stage, type: "pageerror", message: error.message });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push({ stage, type: "console", message: message.text() });
      }
    });
  });
  return context;
}

async function settle(page) {
  await page.locator('[data-studio-root="true"]').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForFunction(() => Array.from(document.images).every((image) => {
    const rect = image.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    return (!visible && image.loading === "lazy") || image.complete;
  }), null, { timeout: 10_000 });
}

async function runAxe(page, identity) {
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () =>
    window.axe.run(document, {
      resultTypes: ["violations", "incomplete"],
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
      }
    })
  );
  for (const item of result.violations) {
    violations.push({
      identity,
      id: item.id,
      impact: item.impact,
      help: item.help,
      targets: item.nodes.slice(0, 8).map((node) => node.target)
    });
  }
  for (const item of result.incomplete) {
    incomplete.push({
      identity,
      id: item.id,
      impact: item.impact,
      targets: item.nodes.slice(0, 4).map((node) => node.target)
    });
  }
}

async function assertPageGeometry(page, identity) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const focusable = Array.from(
      document.querySelectorAll(
        'a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    return {
      documentWidth: root.scrollWidth,
      viewportWidth: innerWidth,
      documentHeight: root.scrollHeight,
      viewportHeight: innerHeight,
      focusableCount: focusable.length,
      clippedRecordRows: Array.from(document.querySelectorAll('.studio-record-items .studio-master-item')).filter((row) => {
        const bounds = row.getBoundingClientRect();
        return Array.from(row.children).some((child) => {
          const rect = child.getBoundingClientRect();
          return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1 || rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
        });
      }).length
    };
  });
  assert.ok(
    metrics.documentWidth <= metrics.viewportWidth + 1,
    `${identity} overflows horizontally: ${metrics.documentWidth} > ${metrics.viewportWidth}`
  );
  assert.equal(metrics.clippedRecordRows, 0, `${identity} has clipped record labels or metadata`);
  return metrics;
}

async function checkPanel({ panel, width, theme, view = "", screenshot = true }) {
  const identity = `${browserName}:${panel}:${view || "default"}:${width}:${theme}`;
  stage = identity;
  const context = await newContext(width, theme);
  const page = await context.newPage();
  const params = new URLSearchParams({ panel });
  if (view) params.set("view", view);
  await page.goto(`${base}/studio?${params}`);
  await settle(page);
  assert.equal(new URL(page.url()).pathname, "/studio");
  assert.equal(await page.locator('nav[aria-label="Studio workspaces"] a[aria-current="page"]').count(), 1);
  const metrics = await assertPageGeometry(page, identity);
  await runAxe(page, identity);
  const panelHeading = await page.locator("main h1").first().innerText();
  if (screenshot) {
    await page.screenshot({
      path: path.join(output, `${identity.replaceAll(":", "-")}.png`),
      fullPage: false
    });
  }
  checks.push({ identity, panelHeading, metrics });
  await context.close();
}

async function waitForSaved(form) {
  await form.locator('[data-studio-save-phase="saved"]').waitFor({ timeout: 10_000 });
}

async function checkShellMatrix() {
  for (const [width, theme] of [
    [1440, "light"],
    [430, "dark"],
    [390, "light"],
    [320, "dark"]
  ]) {
    await checkPanel({ panel: "overview", width, theme });
  }
}

async function checkSettingsAutosave() {
  stage = `${browserName}:settings-autosave`;
  const context = await newContext(390, "dark");
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=settings`);
  await settle(page);
  const form = page.locator('[data-studio-entity-key="site-settings:site"]');
  const tagline = form.getByRole("textbox", { name: "Tagline", exact: true });
  const original = await tagline.inputValue();
  await tagline.fill("Sanitized Studio QA autosave value");
  await tagline.blur();
  await waitForSaved(form);
  await page.reload();
  await settle(page);
  assert.equal(await tagline.inputValue(), "Sanitized Studio QA autosave value");
  await tagline.fill(original);
  await tagline.blur();
  await waitForSaved(form);
  checks.push({ identity: stage, roundTrip: true, restored: true });
  await context.close();
}

async function checkPagesMasterDetail() {
  stage = `${browserName}:pages-master-detail`;
  const context = await newContext(320, "dark");
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=pages`);
  await settle(page);
  const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  await page.getByRole("link", { name: /deliberately long but valid customer-facing label/i }).click();
  await page.waitForURL("**page=qa-long-page**");
  assert.equal(await page.evaluate(() => performance.getEntriesByType("navigation").length), navigationCount);
  assert.equal(await page.getByRole("textbox", { name: "Title", exact: true }).inputValue(), longTitle());
  assert.ok(await page.locator('.studio-master-item[aria-current="page"]').evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  await assertPageGeometry(page, stage);
  checks.push({ identity: stage, softNavigation: true, longLabelWrap: true });
  await context.close();
}

function longTitle() {
  return "A deliberately long but valid customer-facing label used to verify narrow-screen wrapping without horizontal overflow";
}

async function checkProjects() {
  stage = `${browserName}:projects`;
  const context = await newContext(430, "light");
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=projects`);
  await settle(page);
  await page.evaluate(() => { document.documentElement.dataset.qaDocument = "retained-projects"; });
  const workspace = page.locator('[data-audit-id="studio-projects-workspace"]');
  await workspace.getByPlaceholder("Filter projects").fill("QA-PROJ-001");
  await workspace.getByRole("button", { name: /QA-PROJ-001/i }).click();
  const form = workspace.locator('[data-studio-entity-key="project:QA-PROJ-001"]');
  // A text input with datalist suggestions has the implicit combobox role.
  const status = form.getByRole("combobox", { name: "Status", exact: true });
  const original = await status.inputValue();
  await status.fill("QA status saved in place");
  await status.blur();
  await waitForSaved(form);
  assert.equal(await page.locator('[data-audit-id="studio-projects-workspace"]').count(), 1);
  await status.fill(original);
  await status.blur();
  await waitForSaved(form);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.qaDocument), "retained-projects");
  checks.push({ identity: stage, filterSelection: true, autosave: true, noReload: true });
  await context.close();
}

async function checkCompactRecordWorkspaces() {
  for (const [panel, auditId] of [
    ["orders", "studio-orders-workspace"],
    ["reviews", "studio-reviews-workspace"]
  ]) {
    stage = `${browserName}:${panel}-compact`;
    const context = await newContext(320, "dark");
    const page = await context.newPage();
    await page.goto(`${base}/studio?panel=${panel}`);
    await settle(page);
    const workspace = page.locator(`[data-audit-id="${auditId}"]`);
    assert.equal(await workspace.count(), 1, `${panel} must use a compact master-detail workspace.`);
    const master = workspace.locator(".studio-master-list");
    const detail = workspace.locator(".studio-editor-card");
    assert.equal(await master.count(), 1);
    assert.equal(await detail.count(), 1);
    assert.equal(await master.locator(".studio-master-item").count(), 20);
    await page.evaluate(() => { document.documentElement.dataset.qaDocument = "retained"; });
    await master.getByRole("button", { name: `Next ${panel} page`, exact: true }).click();
    assert.equal(await master.locator(".studio-master-item").count(), 8);
    const oldest = master.locator(".studio-master-item").last();
    const oldestKey = await oldest.getAttribute("data-studio-record-key");
    await oldest.focus();
    await page.keyboard.press("Enter");
    const entityType = panel === "orders" ? "order" : "review";
    const form = detail.locator(`form[data-studio-entity-key="${entityType}:${oldestKey}"]`);
    await form.waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('[data-studio-record-detail] h3'));
    const field = form.getByRole("textbox", { name: panel === "orders" ? "Status" : "Title", exact: true });
    const original = await field.inputValue();
    const value = `Sanitized ${panel} persistence check`;
    await field.fill(value);
    // Switching must flush the in-flight edit before unmounting its editor.
    await master.locator(".studio-master-item").first().click();
    const firstKey = await master.locator(".studio-master-item").first().getAttribute("data-studio-record-key");
    await detail.locator(`form[data-studio-entity-key="${entityType}:${firstKey}"]`).waitFor();
    await oldest.click();
    await form.waitFor();
    assert.equal(await field.inputValue(), value);
    const saved = page.waitForResponse((response) => response.url().includes("/studio") && response.request().method() === "POST");
    await field.fill(original);
    await field.blur();
    await saved;
    await waitForSaved(form);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.qaDocument), "retained");
    await master.getByRole("searchbox").fill("no-matching-record-in-fixture");
    await master.getByText("No matching records", { exact: true }).waitFor();
    assert.equal(await detail.count(), 1, "Filtering must preserve the current edit context");
    await master.getByRole("searchbox").fill("");
    const metrics = await assertPageGeometry(page, stage);
    assert.ok(metrics.documentHeight < 2400, `${panel} requires excessive scrolling`);
    await page.screenshot({ path: path.join(output, `${browserName}-${panel}-interaction.png`) });
    checks.push({ identity: stage, masterDetail: true, denseRecords: 28, oldestReachable: true, switchFlush: true, focusKeyboard: true, noReload: true, metrics });
    await context.close();
  }
}

async function checkNotifications() {
  stage = `${browserName}:notifications`;
  const context = await newContext(320, "dark");
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=notifications`);
  await settle(page);
  const tabs = page.getByRole("tablist", { name: "Notification administration" });
  assert.equal(await tabs.getByRole("tab").count(), 7);
  const sequence = ["Types", "Templates", "Delivery", "Visitors", "Audit", "SMTP", "Overview"];
  for (const label of sequence) {
    const tab = tabs.getByRole("tab", { name: label, exact: true });
    await tab.focus();
    await page.keyboard.press("Enter");
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    await assertPageGeometry(page, `${stage}:${label}`);
    await runAxe(page, `${stage}:${label}`);
  }
  await tabs.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("End");
  assert.equal(await tabs.getByRole("tab", { name: "SMTP", exact: true }).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await tabs.getByRole("tab", { name: "Overview", exact: true }).getAttribute("aria-selected"), "true");
  checks.push({ identity: stage, tabs: sequence.length, keyboard: true, denseVisitorsAndAudit: true });
  await context.close();
}

async function checkBlockedRecordSwitch() {
  stage = `${browserName}:blocked-record-switch`;
  const context = await newContext(320, "dark");
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=orders`);
  await settle(page);
  const master = page.locator('.studio-record-list');
  const form = page.locator('[data-studio-record-detail] form[data-studio-entity-key]');
  const originalKey = await form.getAttribute('data-studio-entity-key');
  const field = form.getByLabel('Status', { exact: true });
  const original = await field.inputValue();
  await field.fill('');
  await master.locator('.studio-master-item').nth(1).click();
  await master.getByRole('alert').waitFor();
  assert.equal(await form.getAttribute('data-studio-entity-key'), originalKey);
  for (const control of [master.getByRole('alert'), master.getByRole('button', { name: 'Next orders page', exact: true })]) {
    assert.ok(await control.evaluate((element) => {
      const outer = element.closest('nav').getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return rect.top >= outer.top && rect.bottom <= outer.bottom + 1;
    }), 'Blocked-save feedback and pagination must remain visible in the list');
  }
  await assertPageGeometry(page, stage);
  await page.screenshot({ path: path.join(output, `${browserName}-blocked-switch.png`) });
  await field.fill(original);
  await field.blur();
  const retry = form.getByRole('button', { name: 'Retry save', exact: true });
  if (await retry.isVisible()) await retry.click();
  await waitForSaved(form);
  await master.locator('.studio-master-item').nth(1).click();
  await page.waitForFunction((key) => document.querySelector('[data-studio-record-detail] form[data-studio-entity-key]')?.getAttribute('data-studio-entity-key') !== key, originalKey);
  checks.push({ identity: stage, invalidSwitchBlocked: true, contextPreserved: true, errorAndPaginationVisible: true, retrySaved: true });
  await context.close();
}

async function checkReviewDeletionRefresh() {
  stage = `${browserName}:review-deletion-refresh`;
  const context = await newContext(390, 'light');
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=reviews`);
  await settle(page);
  await page.evaluate(() => { document.documentElement.dataset.qaDocument = 'review-delete'; });
  const master = page.locator('.studio-record-list');
  const row = master.locator('.studio-master-item').first();
  const key = await row.getAttribute('data-studio-record-key');
  assert.match(key, /^qa-review-\d{3}$/);
  await row.click();
  const form = page.locator(`[data-studio-entity-key="review:${key}"]`);
  await form.waitFor();
  await page.locator('[data-studio-record-detail]').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete review', exact: true }).click();
  await page.waitForURL('**deleted=review**');
  await page.waitForFunction((key) => !document.querySelector(`[data-studio-record-key="${key}"]`) && !document.querySelector(`[data-studio-entity-key="review:${key}"]`), key);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.qaDocument), 'review-delete');
  await assertPageGeometry(page, stage);
  checks.push({ identity: stage, deletedKey: key, deletedRecordRemoved: true, noReload: true });
  await context.close();
}

async function checkExternalOrderRefresh() {
  stage = `${browserName}:external-order-refresh`;
  const context = await newContext(430, 'light');
  const page = await context.newPage();
  await page.goto(`${base}/studio?panel=orders&qa=before-refresh`);
  await settle(page);
  await page.evaluate(() => { document.documentElement.dataset.qaDocument = 'external-refresh'; });
  const form = page.locator('[data-studio-record-detail] form[data-studio-entity-key]');
  const key = await form.getAttribute('data-studio-entity-key');
  const original = await form.getByLabel('Status', { exact: true }).inputValue();
  const otherPage = await context.newPage();
  await otherPage.goto(`${base}/studio?panel=orders`);
  await settle(otherPage);
  const otherForm = otherPage.locator(`[data-studio-entity-key="${key}"]`);
  await otherForm.getByLabel('Status', { exact: true }).fill('Canonical update from another operator');
  await otherForm.getByLabel('Status', { exact: true }).blur();
  await waitForSaved(otherForm);
  await page.locator('nav[aria-label="Studio workspaces"]').getByRole('link', { name: 'Orders', exact: true }).click();
  await page.waitForURL('**/studio?panel=orders');
  await page.waitForFunction(() => document.querySelector('[data-studio-record-detail] input[name="status"]')?.value === 'Canonical update from another operator');
  assert.equal(await form.getAttribute('data-studio-entity-key'), key);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.qaDocument), 'external-refresh');
  await form.getByLabel('Status', { exact: true }).fill(original);
  await form.getByLabel('Status', { exact: true }).blur();
  await waitForSaved(form);
  checks.push({ identity: stage, serverVersionAdopted: true, editingContextPreserved: true, noReload: true, restored: true });
  await context.close();
}

try {
  if (process.env.STUDIO_QA_PHASE === "destructive") {
    await checkReviewDeletionRefresh();
  } else if (browserName === "chromium") {
    await checkShellMatrix();
    for (const panel of ["settings", "pages", "pieces", "media", "projects", "orders", "reviews", "notifications"]) {
      await checkPanel({ panel, width: 1440, theme: "light" });
      await checkPanel({ panel, width: 320, theme: "dark", screenshot: panel !== "media" });
    }
    if (process.env.STUDIO_QA_PHASE === "scan") {
      for (const view of ["types", "templates", "delivery", "visitors", "audit", "smtp"]) {
        await checkPanel({ panel: "notifications", view, width: 320, theme: "dark" });
      }
    } else {
    await checkSettingsAutosave();
    await checkPagesMasterDetail();
    await checkProjects();
    await checkCompactRecordWorkspaces();
    await checkBlockedRecordSwitch();
    await checkExternalOrderRefresh();
    await checkNotifications();
    }
  } else {
    await checkPanel({ panel: "overview", width: 390, theme: "light" });
    await checkPanel({ panel: "orders", width: 390, theme: "dark" });
    await checkPanel({ panel: "notifications", width: 430, theme: "light" });
    await checkNotifications();
    await checkCompactRecordWorkspaces();
    await checkBlockedRecordSwitch();
    await checkExternalOrderRefresh();
  }
} catch (error) {
  failure = { stage, message: error instanceof Error ? error.message : String(error) };
  for (const [contextIndex, context] of browser.contexts().entries()) {
    for (const [pageIndex, page] of context.pages().entries()) {
      if (page.isClosed()) continue;
      await page.screenshot({
        path: path.join(output, `failure-${contextIndex}-${pageIndex}.png`),
        fullPage: false
      }).catch(() => undefined);
      await writeFile(
        path.join(output, `failure-${contextIndex}-${pageIndex}.txt`),
        await page.locator("main").innerText().catch(() => "Unavailable")
      );
    }
  }
} finally {
  const report = {
    browserName,
    checks,
    violations,
    incomplete,
    errors,
    crossOrigin,
    failure,
    passed:
      !failure &&
      violations.length === 0 &&
      errors.length === 0 &&
      crossOrigin.length === 0
  };
  await writeFile(path.join(output, "studio-workspaces.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

console.log(JSON.stringify({
  browserName,
  checks: checks.length,
  violations: violations.length,
  incomplete: incomplete.length,
  errors: errors.length,
  crossOrigin: crossOrigin.length,
  failure
}));
assert.ok(!failure, "Inspect the Studio workspace report and failure capture.");
assert.equal(violations.length, 0, "Studio workspace axe violations remain.");
assert.equal(errors.length, 0, "Studio workspace browser errors remain.");
assert.equal(crossOrigin.length, 0, "Studio workspace cross-origin requests remain.");
