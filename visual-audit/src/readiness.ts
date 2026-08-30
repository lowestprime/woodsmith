import type { Locator, Page } from "playwright";

const READINESS_CSS = `
  *, *::before, *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  .media-run-summary > span:last-child {
    color: transparent !important;
    inline-size: 5rem !important;
  }
`;

async function triggerLazyContent(page: Page) {
  await page.evaluate(async () => {
    const pause = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const originalWindow = { x: window.scrollX, y: window.scrollY };
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const step = Math.max(320, Math.floor(window.innerHeight * 0.78));

    for (let y = 0; y < documentHeight; y += step) {
      window.scrollTo(0, y);
      await pause();
    }
    window.scrollTo(0, documentHeight);
    await pause();

    const scrollables = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
      const style = getComputedStyle(element);
      return (
        (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4) ||
        (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 4)
      );
    });

    for (const element of scrollables) {
      const original = { left: element.scrollLeft, top: element.scrollTop };
      const verticalStep = Math.max(160, Math.floor(element.clientHeight * 0.78));
      const horizontalStep = Math.max(160, Math.floor(element.clientWidth * 0.78));

      for (let top = 0; top < element.scrollHeight; top += verticalStep) {
        for (let left = 0; left < element.scrollWidth; left += horizontalStep) {
          element.scrollTo(left, top);
          await pause();
        }
      }

      element.scrollTo(original.left, original.top);
    }

    window.scrollTo(originalWindow.x, originalWindow.y);
    await pause();
  });
}

async function settleMedia(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;

    await Promise.all(Array.from(document.images).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
          window.setTimeout(done, 10_000);
        });
      }
      if (image.complete && image.naturalWidth > 0) await image.decode().catch(() => undefined);
    }));

    await Promise.all(Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
      .filter((video) => video.preload !== "none")
      .map((video) => {
      if (video.readyState >= 1 || video.error) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("loadedmetadata", done, { once: true });
        video.addEventListener("error", done, { once: true });
        window.setTimeout(done, 5_000);
      });
    }));
  });
}

async function waitForStableLayout(page: Page, locator?: Locator) {
  const target = locator ? await locator.elementHandle() : null;
  if (locator && !target) {
    throw new Error("The visual-readiness target detached before layout sampling.");
  }

  const result = await page.evaluate((element: Element | null) => new Promise<{
    stable: boolean;
    changedFields: string[];
  }>((resolve) => {
    const deadline = performance.now() + 5_000;
    let previous = "";
    let previousSample: Record<string, boolean | number> | null = null;
    let stableSamples = 0;
    const sample = () => {
      const rect = element?.getBoundingClientRect() ?? null;
      const root: Element | Document = element ?? document;
      const currentSample: Record<string, boolean | number> = {
        connected: element?.isConnected ?? true,
        width: rect ? Math.round(rect.width) : Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        height: rect ? Math.round(rect.height) : Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        scrollWidth: element instanceof HTMLElement ? element.scrollWidth : document.documentElement.scrollWidth,
        scrollHeight: element instanceof HTMLElement ? element.scrollHeight : document.documentElement.scrollHeight,
        images: Array.from(root.querySelectorAll<HTMLImageElement>("img")).filter((image) => image.complete).length,
        dialogs: root.querySelectorAll('[role="dialog"],dialog[open]').length +
          (element?.matches('[role="dialog"],dialog[open]') ? 1 : 0)
      };
      const current = JSON.stringify(currentSample);
      const changedFields = previousSample
        ? Object.keys(currentSample).filter((key) => currentSample[key] !== previousSample?.[key])
        : Object.keys(currentSample);
      stableSamples = current === previous ? stableSamples + 1 : 0;
      previous = current;
      previousSample = currentSample;
      if (stableSamples >= 2) resolve({ stable: true, changedFields: [] });
      else if (performance.now() >= deadline) resolve({ stable: false, changedFields });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }), target).finally(async () => {
    await target?.dispose();
  });
  if (!result.stable) {
    const fields = result.changedFields.length > 0 ? result.changedFields.join(", ") : "unknown";
    throw new Error(`Visual readiness did not reach three consecutive stable layout frames. Unstable fields: ${fields}.`);
  }
}

async function waitForBusySurfaces(page: Page) {
  await page.waitForFunction(() => {
    const visibleBusy = Array.from(document.querySelectorAll<HTMLElement>('[aria-busy="true"], .loading-pulse')).some((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
    });
    return !visibleBusy;
  }, { timeout: 15_000 });
}

export async function waitForVisualIdle(page: Page, locator?: Locator) {
  await settleMedia(page);
  await waitForStableLayout(page, locator);
  await waitForBusySurfaces(page);
}

export async function waitForVisualReady(page: Page) {
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("main").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);
  await page.addStyleTag({ content: READINESS_CSS });

  await triggerLazyContent(page);
  await settleMedia(page);
  await waitForStableLayout(page);
  await waitForBusySurfaces(page);

  await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>([
      "a", "button", "input", "textarea", "select", "summary", "details", "dialog",
      "[role]", "[data-media-path]", "[data-inline-edit-resource]"
    ].join(",")));
    candidates.forEach((element, index) => {
      if (element.dataset.auditId) return;
      const semantic = element.getAttribute("aria-label") || element.getAttribute("name") || element.id || element.tagName.toLowerCase();
      element.dataset.auditId = `${semantic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "element"}-${String(index + 1).padStart(5, "0")}`;
    });
    window.scrollTo(0, 0);
  });

  // Restoring the canonical scroll position can select new responsive image
  // candidates. Settle those requests before screenshots begin so context
  // teardown never manufactures client-aborted image diagnostics.
  await waitForVisualIdle(page);
}
