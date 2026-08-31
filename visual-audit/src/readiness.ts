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
  const pending = await page.evaluate(async () => {
    await document.fonts.ready;

    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    };
    const waitForMediaEvent = (target: EventTarget, events: string[], timeoutMs: number) => new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        events.forEach((event) => target.removeEventListener(event, done));
        resolve();
      };
      const timer = window.setTimeout(done, timeoutMs);
      events.forEach((event) => target.addEventListener(event, done, { once: true }));
    });

    const images = Array.from(document.images).filter((image) => (
      visible(image) && Boolean(image.currentSrc || image.getAttribute("src") || image.getAttribute("srcset"))
    ));
    for (const image of images) {
      image.loading = "eager";
      image.setAttribute("fetchpriority", "high");
    }

    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await waitForMediaEvent(image, ["load", "error"], 15_000);
      }
      if (image.complete && image.naturalWidth > 0) await image.decode().catch(() => undefined);
    }));

    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video")).filter((video) => (
      visible(video) && Boolean(video.currentSrc || video.getAttribute("src") || video.querySelector("source[src]"))
    ));
    const videosToAwait = videos.filter((video) => video.preload !== "none");

    await Promise.all(videosToAwait.map((video) => {
      if (video.readyState >= 1 || video.error) return Promise.resolve();
      return waitForMediaEvent(video, ["loadedmetadata", "error"], 15_000);
    }));

    return {
      images: images.filter((image) => !image.complete).length,
      videos: videosToAwait.filter((video) => video.readyState < HTMLMediaElement.HAVE_METADATA && !video.error).length
    };
  });

  if (pending.images > 0 || pending.videos > 0) {
    throw new Error(
      `Visual media readiness timed out with ${pending.images} image(s) and ${pending.videos} video(s) still pending.`
    );
  }
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
