import { chromium } from "playwright";

const baseUrl = (process.env.MEDIA_TEST_BASE_URL || "http://127.0.0.1:3017").replace(/\/$/, "");
const publicRoute = process.env.MEDIA_TEST_PUBLIC_ROUTE?.trim() || null;
const publicCollectionCount = Number.parseInt(process.env.MEDIA_TEST_PUBLIC_COLLECTION_COUNT || "1", 10);
const browserChannel = process.env.AUDIT_BROWSER_CHANNEL?.trim();
const tolerance = 0.75;
const viewports = [
  { name: "mobile-320", width: 320, height: 720, deviceScaleFactor: 3, isMobile: true },
  { name: "mobile-375", width: 375, height: 812, deviceScaleFactor: 3, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
  { name: "mobile-430", width: 430, height: 932, deviceScaleFactor: 3, isMobile: true },
  { name: "desktop-1024", width: 1024, height: 768, deviceScaleFactor: 1, isMobile: false },
  { name: "tablet-portrait", width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: false },
  { name: "desktop-1440", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  { name: "desktop-archival", width: 2560, height: 1440, deviceScaleFactor: 2, isMobile: false }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (publicRoute) {
  assert(Number.isSafeInteger(publicCollectionCount) && publicCollectionCount > 0, "MEDIA_TEST_PUBLIC_COLLECTION_COUNT must be a positive integer");
}

async function settle(page, label) {
  await page.locator("[data-media-collection]").first().waitFor({ state: "visible", timeout: 60_000 });
  const images = page.locator("[data-media-collection] img");
  const imageCount = await images.count();
  for (let index = 0; index < imageCount; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    const handle = await image.elementHandle();
    try {
      await page.waitForFunction((element) => element.complete, handle, { timeout: 60_000 });
    } catch (error) {
      const incomplete = await image.evaluate((element) => ({
        alt: element.alt,
        naturalWidth: element.naturalWidth,
        src: element.currentSrc || element.src
      }));
      throw new Error(`${label} collection media readiness timed out at item ${index + 1}: ${JSON.stringify(incomplete)}`, { cause: error });
    } finally {
      await handle?.dispose();
    }
  }
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const scroller of document.querySelectorAll(".media-thumbnail-rail, .media-process-sequence")) {
      scroller.scrollTo(0, 0);
    }
  });
  await page.waitForTimeout(100);
}

async function setTheme(page, theme) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
    localStorage.setItem("beaman-theme", value);
    document.cookie = `beaman-theme=${value}; path=/; samesite=lax`;
  }, theme);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function inspect(page) {
  return page.evaluate((pixelTolerance) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const collections = [...document.querySelectorAll("[data-media-collection]")].filter(visible).map((collection) => {
      const items = [...collection.querySelectorAll('[data-media-item="true"]')]
        .filter((item) => item.closest("[data-media-collection]") === collection && visible(item))
        .map((item) => {
          const rect = item.getBoundingClientRect();
          return {
            id: item.dataset.mediaId || "missing-id",
            slot: item.dataset.mediaSlot || "item",
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom
          };
        });
      const overlaps = [];
      for (let first = 0; first < items.length; first += 1) {
        for (let second = first + 1; second < items.length; second += 1) {
          const left = items[first];
          const right = items[second];
          const width = Math.min(left.right, right.right) - Math.max(left.left, right.left);
          const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
          if (width > pixelTolerance && height > pixelTolerance) {
            overlaps.push({
              first: `${left.id}:${left.slot}`,
              second: `${right.id}:${right.slot}`,
              width,
              height,
              area: width * height
            });
          }
        }
      }
      return {
        id: collection.dataset.mediaCollection,
        variant: collection.dataset.mediaCollectionVariant,
        itemCount: items.length,
        overlaps
      };
    });
    return {
      theme: document.documentElement.dataset.theme,
      collections,
      overlaps: collections.flatMap((collection) => (
        collection.overlaps.map((overlap) => ({ collection: collection.id, ...overlap }))
      )),
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
      brokenVideos: [...document.querySelectorAll("video")]
        .filter((video) => Boolean(video.error))
        .map((video) => video.currentSrc || video.src),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    };
  }, tolerance);
}

async function assertCleanGeometry(page, label, expectedCollections) {
  const evidence = await inspect(page);
  assert(evidence.collections.length === expectedCollections, `${label} found ${evidence.collections.length} collections, expected ${expectedCollections}`);
  assert(evidence.overlaps.length === 0, `${label} overlap: ${JSON.stringify(evidence.overlaps)}`);
  assert(evidence.brokenImages.length === 0, `${label} broken images: ${JSON.stringify(evidence.brokenImages)}`);
  assert(evidence.brokenVideos.length === 0, `${label} broken videos: ${JSON.stringify(evidence.brokenVideos)}`);
  assert(evidence.documentWidth <= evidence.viewportWidth + 2, `${label} document overflow ${evidence.documentWidth}/${evidence.viewportWidth}`);
  return evidence;
}

async function waitForCollectionOpenerFocus(page) {
  await page.waitForFunction(() => document.activeElement?.matches(
    '[data-media-collection="fixture:detail:6"] [data-media-lightbox-opener="true"]'
  ), undefined, { timeout: 5_000 });
}

function contextOptions(viewport, overrides = {}) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    ...overrides
  };
}

function attachDiagnostics(page, diagnostics) {
  page.on("pageerror", (error) => diagnostics.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push({ type: "console", message: message.text() });
  });
  page.on("requestfailed", (request) => diagnostics.push({
    type: "requestfailed",
    url: request.url(),
    message: request.failure()?.errorText
  }));
}

const browser = await chromium.launch(browserChannel ? { channel: browserChannel } : {});
try {
  const diagnostics = [];
  const expectedItems = new Map([
    ["fixture:detail:1", 1],
    ["fixture:detail:2", 3],
    ["fixture:detail:3", 4],
    ["fixture:detail:6", 7],
    ["fixture:detail:12", 13],
    ["fixture:editorial:6", 6],
    ["fixture:process:6", 7],
    ["fixture:picker:12", 12]
  ]);
  const matrix = [];
  for (const viewport of viewports) {
    const matrixContext = await browser.newContext(contextOptions(viewport));
    const matrixPage = await matrixContext.newPage();
    attachDiagnostics(matrixPage, diagnostics);
    try {
      const response = await matrixPage.goto(`${baseUrl}/snapshot-lab/media-collections`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      assert(response?.status() === 200, `snapshot-lab media fixture returned ${response?.status()}`);
      await settle(matrixPage, `snapshot-lab fixture ${viewport.name}`);
      for (const theme of ["dark", "light"]) {
        await setTheme(matrixPage, theme);
        const evidence = await assertCleanGeometry(matrixPage, `${viewport.name}/${theme}`, 8);
        assert(evidence.theme === theme, `${viewport.name} did not apply ${theme}`);
        for (const collection of evidence.collections) {
          assert(collection.itemCount === expectedItems.get(collection.id), `${collection.id} exposed ${collection.itemCount} boxes`);
        }
        matrix.push({
          viewport: viewport.name,
          theme,
          collections: evidence.collections.length,
          items: evidence.collections.reduce((sum, item) => sum + item.itemCount, 0)
        });
      }
    } finally {
      await matrixContext.close();
    }
  }

  const productionMatrix = [];
  if (publicRoute) {
    for (const viewport of [viewports[2], viewports[4], viewports[6], viewports[7]]) {
      const productionContext = await browser.newContext(contextOptions(viewport));
      const productionPage = await productionContext.newPage();
      attachDiagnostics(productionPage, diagnostics);
      try {
        const routeResponse = await productionPage.goto(`${baseUrl}${publicRoute}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        assert(routeResponse?.status() === 200, `${publicRoute} returned ${routeResponse?.status()}`);
        await settle(productionPage, `${publicRoute} ${viewport.name}`);
        for (const theme of ["dark", "light"]) {
          await setTheme(productionPage, theme);
          const evidence = await assertCleanGeometry(productionPage, `${publicRoute} ${viewport.name}/${theme}`, publicCollectionCount);
          productionMatrix.push({
            viewport: viewport.name,
            theme,
            collections: evidence.collections.map((item) => ({ id: item.id, items: item.itemCount }))
          });
        }
      } finally {
        await productionContext.close();
      }
    }
  }

  const context = await browser.newContext(contextOptions(viewports[6]));
  const page = await context.newPage();
  attachDiagnostics(page, diagnostics);
  await page.goto(`${baseUrl}/snapshot-lab/media-collections`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, "snapshot-lab interaction fixture");
  const gallery = page.locator('[data-media-collection="fixture:detail:6"]');
  const thumbnails = gallery.locator('[data-media-slot="thumbnail"]');
  assert(await thumbnails.count() === 6, "six-item fixture did not expose six direct-selection thumbnails");

  await thumbnails.nth(5).focus();
  await page.keyboard.press("Enter");
  assert(await gallery.locator('[data-media-slot="primary"]').getAttribute("data-media-id") === "media-fixture-6", "Enter did not select the focused video thumbnail");
  assert(await gallery.locator('[data-media-slot="primary"] video').count() === 1, "selected video did not render in the stage");
  await thumbnails.nth(0).focus();
  await page.keyboard.press("Space");
  assert(await gallery.locator('[data-media-slot="primary"]').getAttribute("data-media-id") === "media-fixture-1", "Space did not select the focused thumbnail");

  const opener = gallery.locator('[data-media-lightbox-opener="true"]');
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Close image preview", "lightbox did not focus its close control");
  await page.keyboard.press("Shift+Tab");
  assert(await page.evaluate(() => document.activeElement?.classList.contains("lightbox-stage")) === true, "reverse focus trap did not wrap to the final canvas control");
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Close image preview", "forward focus trap did not wrap to close");

  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  assert((await dialog.getByRole("status").textContent())?.includes("150%"), "lightbox zoom control did not reach 150%");
  const stage = dialog.getByRole("group");
  await stage.focus();
  const transformBeforePan = await dialog.locator(".lightbox-media").getAttribute("style");
  await page.keyboard.press("ArrowRight");
  const transformAfterPan = await dialog.locator(".lightbox-media").getAttribute("style");
  assert(transformBeforePan !== transformAfterPan, "keyboard pan did not update the zoomed media transform");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await waitForCollectionOpenerFocus(page);

  await opener.click();
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Close image preview" }).click();
  await dialog.waitFor({ state: "detached" });
  await waitForCollectionOpenerFocus(page);

  await opener.click();
  await dialog.waitFor({ state: "visible" });
  await page.mouse.click(4, 4);
  await dialog.waitFor({ state: "detached" });
  await waitForCollectionOpenerFocus(page);

  const reducedContext = await browser.newContext(contextOptions(viewports[2], { reducedMotion: "reduce" }));
  const reducedPage = await reducedContext.newPage();
  attachDiagnostics(reducedPage, diagnostics);
  await reducedPage.goto(`${baseUrl}/snapshot-lab/media-collections`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(reducedPage, "snapshot-lab reduced-motion fixture");
  const reducedEvidence = await reducedPage.evaluate(() => ({
    mediaQuery: matchMedia("(prefers-reduced-motion: reduce)").matches,
    railBehavior: getComputedStyle(document.querySelector(".media-thumbnail-rail")).scrollBehavior,
    transitionDuration: getComputedStyle(document.querySelector(".media-thumbnail-button")).transitionDuration
  }));
  assert(reducedEvidence.mediaQuery, "reduced-motion media query is not active");
  assert(reducedEvidence.railBehavior === "auto", `reduced-motion rail scroll behavior is ${reducedEvidence.railBehavior}`);
  assert(reducedEvidence.transitionDuration.split(",").every((value) => Number.parseFloat(value) <= 0.001), `reduced-motion transition remains ${reducedEvidence.transitionDuration}`);
  await reducedContext.close();

  const touchContext = await browser.newContext(contextOptions(viewports[2]));
  const touchPage = await touchContext.newPage();
  attachDiagnostics(touchPage, diagnostics);
  await touchPage.goto(`${baseUrl}/snapshot-lab/media-collections`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(touchPage, "snapshot-lab touch fixture");
  const touchGallery = touchPage.locator('[data-media-collection="fixture:detail:6"]');
  await touchGallery.locator('[data-media-slot="thumbnail"]').nth(5).tap();
  assert(await touchGallery.locator('[data-media-slot="primary"]').getAttribute("data-media-id") === "media-fixture-6", "touch did not select video item");
  assert(await touchGallery.locator('[data-media-slot="primary"] video').count() === 1, "touch-selected video did not render in the stage");
  await touchGallery.locator('[data-media-lightbox-opener="true"]').tap();
  const touchDialog = touchPage.getByRole("dialog");
  await touchDialog.waitFor({ state: "visible" });
  assert(await touchDialog.locator("video[controls]").count() === 1, "video lightbox did not expose controls");
  await touchDialog.getByRole("button", { name: "Close image preview" }).tap();
  await touchDialog.waitFor({ state: "detached" });
  await touchContext.close();

  assert(diagnostics.length === 0, `browser diagnostics: ${JSON.stringify(diagnostics)}`);
  await context.close();
  console.log(JSON.stringify({
    passed: true,
    browserChannel: browserChannel || "bundled-chromium",
    tolerance,
    fixtureMatrixStates: matrix.length,
    productionMatrixStates: productionMatrix.length,
    fixtureCollectionsPerState: 8,
    fixtureVisibleBoxesPerState: 53,
    expectedPublicCollections: publicRoute ? publicCollectionCount : null,
    keyboard: ["Enter selection", "Space selection", "focus trap", "zoom", "pan", "Escape", "focus restoration"],
    pointer: ["close button", "backdrop close"],
    touch: ["video selection", "video lightbox", "close"],
    reducedMotion: reducedEvidence,
    diagnostics
  }, null, 2));
} finally {
  await browser.close();
}
