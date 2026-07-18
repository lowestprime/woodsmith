import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request
} from "playwright";

import { chromiumLaunchOptions } from "./browser-launch.js";
import {
  buildAccelerationProvenance,
  probeBrowserGpu,
  probeCuda,
  selectAccelerator,
  type AccelerationProvenance
} from "./accelerator.js";
import {
  canonicalCoverageMatrix,
  discoveredCoverageMatrix,
  type CoverageMatrixEntry
} from "./coverage-matrix.js";

import {
  captureElement,
  capturePageSurface
} from "./capture.js";
import { runBoundedCaptureTasks } from "./capture-scheduler.js";
import {
  inlineFieldSelector,
  type InlineFieldIdentity
} from "./capture-stability.js";
import {
  config,
  viewports
} from "./config.js";
import {
  isExpectedCaptureTeardownAbort,
  isExpectedNextPrefetchAbort,
  isExpectedAuditBlockedConsole,
  isExpectedAuditMutationBlock,
  requestBlockKey
} from "./diagnostics.js";
import {
  buildRoutes,
  discoverSourceRoutes,
  fetchInventory
} from "./inventory.js";
import {
  isNavigationInterruption,
  waitForNavigationSettle,
  type NavigationSample
} from "./navigation-settle.js";
import { buildNoOverlapReport, findMediaOverlaps } from "./media-overlap.js";
import { buildMediaEvidenceReports } from "./media-evidence.js";
import { waitForVisualIdle, waitForVisualReady } from "./readiness.js";
import { waitForRequestDrain } from "./request-drain.js";
import { auditTokenEligible, isSyntheticVisitTelemetry, isUnsafeMethod } from "./policy.js";
import { assertFocusedSkipLink, assertMainFocusTransferred } from "./skip-link.js";
import { SNAPSHOT_LAB_COMMISSION_DRAFT_STATE } from "./snapshot-lab-evidence.js";
import type {
  AuthState,
  CoverageTier,
  CaptureRecord,
  DiagnosticRecord,
  Inventory,
  RouteResult,
  RunManifest,
  ThemeMode,
  ViewportProfile
} from "./types.js";
import {
  clearDirectoryContents,
  ensureDirectory,
  exists,
  relativeTo,
  safeName,
  unique,
  writeJsonAtomic
} from "./util.js";

const manifestFile = path.join(
  config.runRoot,
  "manifest.json"
);

const captureRoot = path.join(
  config.runRoot,
  "png"
);

let manifest: RunManifest;
let manifestWriteChain = Promise.resolve();
const preAuthenticationDiagnostics: DiagnosticRecord[] = [];
const pagesInDeliberateTeardown = new WeakSet<Page>();
const pageCapturePhases = new WeakMap<Page, string>();
let preAuthenticationUnsafeBlocks = 0;
const intentionalMutationBlocks = new WeakMap<BrowserContext, Set<string>>();
const pendingVisualRequests = new WeakMap<Page, Set<Request>>();

const coverageExclusions = [
  { surface: "Third-party origins", reason: "Recorded as network diagnostics only; the archive never sends credentials or audit tokens cross-origin." },
  { surface: "Admin authentication POST", reason: "The single Studio login submission is the only live unsafe request allowed before the read-only capture context exists." },
  { surface: "Successful production mutations", reason: "Forbidden in live-readonly mode and captured only against the isolated snapshot lab." },
  { surface: "Fabrication-ready 3D output", reason: "The public renderer is explicitly a conceptual proportional planning preview." },
  { surface: "Unconfigured provider success states", reason: "Payment, shipping, email, and model-provider success states require provider fixtures and remain disabled in snapshot-lab mode." },
  { surface: "Redundant deep capture on discovered query variants", reason: "Every rendered same-origin link is captured across desktop, tablet, and mobile in both themes plus archival desktop dark; deep element and dialog states remain on canonical source/database routes to avoid duplicating the same template cross-product." }
] as const;

function now() {
  return new Date().toISOString();
}

function deepCount(total: number, smokeLimit: number) {
  return config.scope === "smoke" ? Math.min(total, smokeLimit) : total;
}

function captureKey(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
  state: string;
}) {
  return [
    input.auth,
    input.route,
    input.theme,
    input.viewport,
    input.state
  ].join("::");
}

function captureCompleted(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
}, state: string) {
  return manifest.completedKeys.includes(captureKey({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state
  }));
}

function routeResultCompleted(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
}) {
  return config.resume && manifest.routes.some((result) => (
    result.expected &&
    result.auth === input.auth &&
    result.route === input.route &&
    result.theme === input.theme &&
    result.viewport === input.viewport
  ));
}

async function persistManifest() {
  manifest.completedKeys = unique(manifest.captures.map((capture) => capture.key)).sort();
  const snapshot = structuredClone(manifest);
  snapshot.completedKeys = [...manifest.completedKeys];

  const routes = new Map<string, RouteResult>();
  for (const route of snapshot.routes) {
    routes.set(`${route.auth}::${route.route}::${route.theme}::${route.viewport}`, route);
  }
  snapshot.routes = [...routes.values()].sort((left, right) => (
    `${left.auth}::${left.route}::${left.theme}::${left.viewport}`
      .localeCompare(`${right.auth}::${right.route}::${right.theme}::${right.viewport}`)
  ));
  snapshot.captures.sort((left, right) => left.key.localeCompare(right.key));
  snapshot.discoveredLinks = unique(snapshot.discoveredLinks).sort();
  snapshot.diagnostics.sort((left, right) => (
    `${left.route}::${left.type}::${left.message}::${left.timestamp}`
      .localeCompare(`${right.route}::${right.type}::${right.message}::${right.timestamp}`)
  ));

  const write = manifestWriteChain.then(() => writeJsonAtomic(manifestFile, snapshot));
  manifestWriteChain = write;
  await write;
}

async function loadOrCreateManifest(
  browserVersion: string,
  inventory: Inventory,
  acceleration: AccelerationProvenance
) {
  if (
    config.resume &&
    await exists(manifestFile)
  ) {
    const existing = JSON.parse(
      await fs.readFile(manifestFile, "utf8")
    ) as RunManifest;

    if (
      existing.runId !== config.runId ||
      existing.mode !== config.targetMode ||
      existing.baseUrl !== config.baseUrl ||
      existing.expectedCommit !== config.expectedCommit ||
      existing.schemaVersion !== 5 ||
      existing.evidenceTier !== config.evidenceTier ||
      JSON.stringify(existing.acceleration) !== JSON.stringify(acceleration)
    ) {
      throw new Error("AUDIT_RESUME refused to combine output from a different schema, run, mode, origin, or commit.");
    }

    return {
      ...existing,
      completedAt: null,
      scope: existing.scope ?? config.scope,
      evidenceTier: existing.evidenceTier,
      discoveredLinks: existing.discoveredLinks ?? [],
      exclusions: existing.exclusions ?? [...coverageExclusions],
      security: existing.security ?? {
        sameOriginUnsafeRequestsBlocked: 0,
        successfulUnsafeRequests: 0,
        tokenEligibleRequests: 0,
        crossOriginRequests: 0
      },
      mediaEvidence: null
    };
  }

  return {
    schemaVersion: 5,
    runId: config.runId,
    startedAt: now(),
    completedAt: null,
    mode: config.targetMode,
    scope: config.scope,
    evidenceTier: config.evidenceTier,
    baseUrl: config.baseUrl,
    expectedCommit: config.expectedCommit,
    deployedCommit: inventory.buildSha,
    browserVersion,
    acceleration,
    inventory,
    captures: [],
    routes: [],
    diagnostics: [],
    completedKeys: [],
    discoveredLinks: [],
    exclusions: [...coverageExclusions],
    security: {
      sameOriginUnsafeRequestsBlocked: 0,
      successfulUnsafeRequests: 0,
      tokenEligibleRequests: 0,
      crossOriginRequests: 0
    },
    mediaEvidence: null
  } satisfies RunManifest;
}

function attachDiagnostics(
  page: Page,
  route: string,
  blockedRequests: ReadonlySet<string>
) {
  const pendingRequests = new Set<Request>();
  pendingVisualRequests.set(page, pendingRequests);
  pageCapturePhases.set(page, "diagnostics-attached");

  page.on("request", request => {
    if (["font", "image", "media"].includes(request.resourceType())) {
      pendingRequests.add(request);
    }
  });

  page.on("requestfinished", request => {
    pendingRequests.delete(request);
  });

  page.on("console", message => {
    if (
      ["error", "warning"].includes(
        message.type()
      )
    ) {
      const text = `${message.type()}: ${message.text()}`;
      manifest.diagnostics.push({
        timestamp: now(),
        type: "console",
        route,
        message: text,
        expected:
          /THREE\.THREE\.Clock: This module has been deprecated/.test(text) ||
          isExpectedAuditBlockedConsole({
            targetMode: config.targetMode,
            text,
            blockedRequestCount: blockedRequests.size
          })
      });
    }
  });

  page.on("pageerror", error => {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route,
      message: error.stack || error.message
    });
  });

  page.on("requestfailed", request => {
    pendingRequests.delete(request);
    const failure =
      request.failure()?.errorText ||
      "unknown request failure";

    const method =
      request.method().toUpperCase();

    if (isExpectedAuditMutationBlock({
      targetMode: config.targetMode,
      method,
      url: request.url(),
      baseUrl: config.baseUrl,
      failure,
      blockedRequests
    })) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "mutation-blocked",
        route,
        message: `${method} ${request.url()}`,
        expected: true
      });

      return;
    }

    const evidence = {
      method,
      url: request.url(),
      failure,
      resourceType: request.resourceType(),
      headers: request.headers(),
      baseUrl: config.baseUrl
    };
    manifest.diagnostics.push({
      timestamp: now(),
      type: "requestfailed",
      route,
      message: `${method} ${request.url()} — ${failure} [phase=${pageCapturePhases.get(page) ?? "unknown"}]`,
      expected: isExpectedNextPrefetchAbort(evidence) ||
        isExpectedCaptureTeardownAbort(evidence, pagesInDeliberateTeardown.has(page))
    });
  });

  page.on("response", response => {
    const request = response.request();
    const method = request.method().toUpperCase();

    if (
      isUnsafeMethod(method) &&
      response.status() < 400
    ) {
      manifest.security.successfulUnsafeRequests += 1;
      manifest.diagnostics.push({
        timestamp: now(),
        type: "security",
        route,
        message: `Successful ${method} request returned HTTP ${response.status()}: ${response.url()}`,
        expected: config.targetMode === "snapshot-lab"
      });
    }

    if (response.status() >= 400) {
      manifest.diagnostics.push({
        timestamp: now(),
        type:
          response.headers()[
            "x-woodsmith-audit-blocked"
          ] === "1"
            ? "mutation-blocked"
            : "http-error",
        route,
        message:
          `${response.status()} ` +
          `${request.method()} ${response.url()}`,
        expected:
          response.headers()["x-woodsmith-audit-blocked"] === "1" &&
          config.targetMode === "live-readonly"
      });
    }
  });
}

async function waitForCaptureRequestDrain(
  page: Page,
  options: {
    intervalMs?: number;
    quietSamples?: number;
    timeoutMs?: number;
  } = {}
) {
  const pendingRequests = pendingVisualRequests.get(page);
  if (!pendingRequests) {
    throw new Error("Visual request tracking was not attached to the capture page.");
  }

  await waitForRequestDrain({
    pendingCount: () => pendingRequests.size,
    sleep: milliseconds => page.waitForTimeout(milliseconds),
    ...options
  });

  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images).map(image =>
      image.complete && image.naturalWidth > 0
        ? image.decode().catch(() => undefined)
        : Promise.resolve()
    ));
  });
}

async function waitForSettledVisualReady(page: Page): Promise<NavigationSample> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const settled = await waitForNavigationSettle({
      sleep: milliseconds => page.waitForTimeout(milliseconds),
      sample: () => page.evaluate(() => ({
        bodyPresent: Boolean(document.body),
        readyState: document.readyState,
        url: window.location.href
      }))
    });

    try {
      await waitForVisualReady(page);
      return settled;
    } catch (error) {
      if (!isNavigationInterruption(error) || attempt === 2) throw error;
    }
  }

  throw new Error("Visual readiness did not survive client navigation.");
}

async function authenticateAdmin(
  browser: Browser
) {
  await ensureDirectory(
    path.dirname(config.authStatePath)
  );

  const context = await browser.newContext({
    baseURL: config.baseUrl,
    viewport: {
      width: 1440,
      height: 1000
    },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    serviceWorkers: "block"
  });

  const targetOrigin = new URL(config.baseUrl).origin;
  let allowLoginSubmission = false;

  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    let requestUrl: URL;

    try {
      requestUrl = new URL(request.url());
    } catch {
      await route.continue();
      return;
    }

    const sameOrigin = requestUrl.origin === targetOrigin;
    const isLoginSubmission =
      sameOrigin &&
      requestUrl.pathname === "/studio/login" &&
      method === "POST" &&
      allowLoginSubmission;

    if (isUnsafeMethod(method) && !isLoginSubmission) {
      preAuthenticationUnsafeBlocks += 1;
      preAuthenticationDiagnostics.push({
        timestamp: now(),
        type: "mutation-blocked",
        route: requestUrl.pathname,
        message: `Authentication guard blocked ${sameOrigin ? "same-origin" : "cross-origin"} ${method} ${requestUrl.origin}${requestUrl.pathname}`,
        expected: true
      });
      await route.abort("blockedbyclient");
      return;
    }

    if (isLoginSubmission) {
      allowLoginSubmission = false;
      await route.continue();
      return;
    }

    if (sameOrigin) {
      await route.continue({
        headers: {
          ...request.headers(),
          "x-woodsmith-audit-readonly": "1"
        }
      });
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();

  try {
    await page.goto(
      "/studio/login",
      {
        waitUntil: "domcontentloaded",
        timeout: 45_000
      }
    );

    await page
      .getByLabel("Email")
      .fill(config.adminEmail);

    await page
      .getByLabel("Password")
      .fill(config.adminPassword);

    allowLoginSubmission = true;

    await Promise.all([
      page.waitForURL(
        /\/studio(?:\?|$)/,
        { timeout: 45_000 }
      ),

      page
        .getByRole(
          "button",
          { name: "Enter dashboard" }
        )
        .click()
    ]);

    await page
      .locator('[data-studio-root="true"]')
      .waitFor({
        state: "visible",
        timeout: 30_000
      });

    await context.storageState({
      path: config.authStatePath
    });
  } finally {
    await context.close();
  }
}

async function createCaptureContext(
  browser: Browser,
  auth: AuthState,
  profile: ViewportProfile,
  theme: ThemeMode,
  options: { reducedMotion?: "reduce" | "no-preference"; disableWebGl?: boolean } = {}
) {
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    ...(auth === "admin" ? { storageState: config.authStatePath } : {}),

    viewport: {
      width: profile.width,
      height: profile.height
    },

    deviceScaleFactor:
      profile.deviceScaleFactor,

    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,

    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: options.reducedMotion ?? "no-preference",
    colorScheme: theme,
    serviceWorkers: "block"
  });

  await context.addCookies([
    {
      name: "beaman-theme",
      value: theme,
      url: config.baseUrl,
      sameSite: "Lax",
      secure:
        config.baseUrl.startsWith("https://")
    }
  ]);

  await context.addInitScript(
    selectedTheme => {
      window.localStorage.setItem(
        "beaman-theme",
        selectedTheme
      );
    },
    theme
  );

  if (options.disableWebGl) {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
        if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") return null;
        return original.call(this, contextId, ...args as []) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
  }

  const targetOrigin =
    new URL(config.baseUrl).origin;
  const blockedRequests = new Set<string>();
  intentionalMutationBlocks.set(context, blockedRequests);

  await context.route(
    "**/*",
    async route => {
      const request = route.request();
      const method =
        request.method().toUpperCase();

      let requestUrl: URL;

      try {
        requestUrl = new URL(request.url());
      } catch {
        await route.continue();
        return;
      }

      if (requestUrl.origin !== targetOrigin) {
        manifest.security.crossOriginRequests += 1;

        if (
          config.targetMode === "live-readonly" &&
          isUnsafeMethod(method)
        ) {
          blockedRequests.add(requestBlockKey(method, request.url()));
          manifest.diagnostics.push({
            timestamp: now(),
            type: "mutation-blocked",
            route: request.url(),
            message: `Client route guard blocked cross-origin ${method} ${request.url()}`,
            expected: true
          });
          await route.abort("blockedbyclient");
          return;
        }

        await route.continue();
        return;
      }

      const headers: Record<string, string> = {
        ...request.headers()
      };

      const tokenEligible = auditTokenEligible(requestUrl, config.baseUrl);

      if (tokenEligible) {
        headers["x-woodsmith-audit-token"] = config.auditToken;
        manifest.security.tokenEligibleRequests += 1;
      }

      if (
        config.targetMode === "snapshot-lab" &&
        isSyntheticVisitTelemetry(method, requestUrl, config.baseUrl)
      ) {
        blockedRequests.add(requestBlockKey(method, request.url()));
        manifest.diagnostics.push({
          timestamp: now(),
          type: "mutation-blocked",
          route: request.url(),
          message:
            "Snapshot-lab route guard blocked synthetic visitor telemetry " +
            method + " " + request.url(),
          expected: true
        });
        manifest.security.sameOriginUnsafeRequestsBlocked += 1;
        await route.abort("blockedbyclient");
        return;
      }

      if (
        config.targetMode ===
        "live-readonly"
      ) {
        headers[
          "x-woodsmith-audit-readonly"
        ] = "1";

        if (
          isUnsafeMethod(method)
        ) {
          blockedRequests.add(requestBlockKey(method, request.url()));
          manifest.diagnostics.push({
            timestamp: now(),
            type: "mutation-blocked",
            route: request.url(),
            message:
              `Client route guard blocked ` +
              `${method} ${request.url()}`,
            expected: true
          });

          manifest.security.sameOriginUnsafeRequestsBlocked += 1;

          await route.abort(
            "blockedbyclient"
          );

          return;
        }
      }

      await route.continue({
        headers
      });
    }
  );

  return context;
}

async function captureFormValidationStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (
    config.targetMode !== "snapshot-lab"
  ) {
    return;
  }

  const forms =
    input.page.locator("form");

  const count = deepCount(await forms.count(), 4);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const form = forms.nth(index);

    if (
      !await form
        .isVisible()
        .catch(() => false)
    ) {
      continue;
    }

    const requiredField =
      form.locator(
        [
          "input[required]",
          "textarea[required]",
          "select[required]"
        ].join(",")
      ).first();

    if (
      !await requiredField
        .isVisible()
        .catch(() => false)
    ) {
      continue;
    }

    await requiredField.evaluate(
      element => {
        (
          element as HTMLInputElement
        ).setCustomValidity(
          "Required visual-audit validation state."
        );
      }
    );

    await requiredField.evaluate(
      element => {
        const field =
          element as HTMLInputElement;
        if (field.form) {
          field.form.reportValidity();
        } else {
          field.reportValidity();
        }
      }
    );

    await saveCapture({
      ...input,
      state:
        `form-${String(index + 1)
          .padStart(4, "0")}-validation`,
      locator: form
    });

    await requiredField.evaluate(
      element => {
        (
          element as HTMLInputElement
        ).setCustomValidity("");
      }
    );
  }
}

async function captureSnapshotLabMutationState(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const route = new URL(input.route, config.baseUrl);
  const targetProfile =
    config.scope === "smoke"
      ? "desktop-1440"
      : "desktop-archival";

  if (
    config.targetMode !== "snapshot-lab" ||
    input.auth !== "admin" ||
    route.pathname !== "/commissions" ||
    input.theme !== "dark" ||
    input.profile.name !== targetProfile
  ) {
    return;
  }

  const key = captureKey({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state: SNAPSHOT_LAB_COMMISSION_DRAFT_STATE
  });
  if (
    config.resume &&
    manifest.completedKeys.includes(key)
  ) {
    return;
  }

  const form =
    input.page.locator("form.commission-workflow");
  await form.waitFor({
    state: "visible",
    timeout: 10_000
  });

  const saveAndContinue =
    form.getByRole("button", {
      name: "Save and continue",
      exact: true
    });
  await saveAndContinue.click();

  await input.page.getByText(
    "Account draft saved.",
    { exact: true }
  ).waitFor({
    state: "visible",
    timeout: 15_000
  });

  const draftId =
    await form.locator(
      'input[name="draftId"]'
    ).inputValue();
  if (!draftId) {
    throw new Error(
      "Snapshot-lab commission draft did not return an ID."
    );
  }

  try {
    const verified =
      await input.page.evaluate(
        async (id) => {
          const response = await fetch(
            "/api/commissions/draft?id=" +
              encodeURIComponent(id),
            {
              cache: "no-store"
            }
          );
          const payload =
            await response.json()
              .catch(() => null) as {
                ok?: boolean;
                draft?: {
                  id?: string;
                };
              } | null;

          return (
            response.ok &&
            payload?.ok === true &&
            payload.draft?.id === id
          );
        },
        draftId
      );
    if (!verified) {
      throw new Error(
        "Snapshot-lab commission draft could not be read back."
      );
    }

    await saveCapture({
      ...input,
      state: SNAPSHOT_LAB_COMMISSION_DRAFT_STATE,
      locator: form
    });
  } finally {
    const deleted =
      await input.page.evaluate(
        async (id) => {
          const response = await fetch(
            "/api/commissions/draft?id=" +
              encodeURIComponent(id),
            {
              method: "DELETE"
            }
          );
          const payload =
            await response.json()
              .catch(() => null) as {
                ok?: boolean;
              } | null;

          return (
            response.ok &&
            payload?.ok === true
          );
        },
        draftId
      );
    if (!deleted) {
      throw new Error(
        "Snapshot-lab commission draft cleanup failed."
      );
    }
  }
}

function routeLabel(route: string) {
  const url = new URL(
    route,
    config.baseUrl
  );

  const query = [...url.searchParams.keys()].sort().join("-");
  const privatePath = url.pathname.replace(
    /^\/(requests|studio\/request|account\/(?:reset|verify))\/[^/]+/i,
    "/$1/[private]"
  );
  const digest = createHash("sha256")
    .update(`${url.pathname}${url.search}`)
    .digest("hex")
    .slice(0, 10);

  return safeName(
    `${safeName(privatePath).slice(0, 28)}-${query ? safeName(query).slice(0, 20) : "default"}-${digest}`
  );
}

async function collectPageEvidence(page: Page, route: string) {
  const evidence = await page.evaluate((targetOrigin) => {
    const sensitiveParameters = new Set(["token", "code", "secret", "key", "password", "email"]);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).flatMap((anchor) => {
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== targetOrigin) return [];
        if ([...url.searchParams.keys()].some((key) => sensitiveParameters.has(key.toLowerCase()))) return [];
        if (["mailto:", "tel:", "javascript:", "data:"].includes(url.protocol)) return [];
        if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return [];
        if (/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|xml|json)$/i.test(url.pathname)) return [];
        return [`${url.pathname}${url.search}`];
      } catch {
        return [];
      }
    });

    const visible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    };

    const inlineCapable = (link: Element) => {
      const section = link.closest("section");
      if (!section) return false;
      return Array.from(section.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).some((element) => (
        !element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") &&
        Boolean(element.textContent?.trim())
      ));
    };

    const scrollContainers = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return visible(element) &&
        rect.width >= 120 &&
        rect.height >= 80 &&
        rect.width <= window.innerWidth * 1.2 &&
        rect.height <= window.innerHeight * 1.2 && (
        (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 4) ||
        (/(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 4)
      );
    }).length;

    const mediaCollections = Array.from(document.querySelectorAll<HTMLElement>("[data-media-collection]"))
      .filter(visible)
      .map((collection, collectionIndex) => ({
        id: collection.dataset.mediaCollection || collection.dataset.auditId || `collection-${collectionIndex + 1}`,
        variant: collection.dataset.mediaCollectionVariant || "unspecified",
        items: Array.from(collection.querySelectorAll<HTMLElement>("[data-media-item]"))
          .filter((item) => item.closest("[data-media-collection]") === collection && visible(item))
          .map((item, itemIndex) => {
            const rect = item.getBoundingClientRect();
            return {
              id: item.dataset.mediaId || `item-${itemIndex + 1}`,
              slot: item.dataset.mediaSlot || "item",
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom
            };
          })
      }));

    const renderedMediaItems = Array.from(document.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img,video")).map((element) => {
      const isImage = element instanceof HTMLImageElement;
      const source = (element.currentSrc || element.getAttribute("src") || "").trim();
      let classification = "empty";
      let fingerprintKey = "empty";

      if (source.startsWith("data:") || source.startsWith("blob:")) {
        classification = "inline";
        fingerprintKey = source.slice(0, source.indexOf(":"));
      } else if (source) {
        try {
          const url = new URL(source, window.location.href);
          if (url.origin !== targetOrigin) {
            classification = "external";
            fingerprintKey = `${url.origin}${url.pathname}`;
          } else if (url.pathname.startsWith("/media/")) {
            classification = "direct-mounted";
            fingerprintKey = `mounted:${url.pathname}`;
          } else if (url.pathname === "/_next/image") {
            const nestedValue = url.searchParams.get("url") ?? "";
            const nested = new URL(nestedValue, targetOrigin);
            if (nested.origin === targetOrigin && nested.pathname.startsWith("/media/")) {
              classification = "optimized-mounted";
              fingerprintKey = `mounted:${nested.pathname}`;
            } else {
              classification = "static-same-origin";
              fingerprintKey = `${url.pathname}?url=${nested.pathname}`;
            }
          } else {
            classification = "static-same-origin";
            fingerprintKey = url.pathname;
          }
        } catch {
          classification = "empty";
          fingerprintKey = "invalid-source";
        }
      }

      const isVisible = visible(element);
      const loaded = isImage
        ? element.complete && element.naturalWidth > 0
        : !element.error && element.readyState >= HTMLMediaElement.HAVE_METADATA;

      return {
        classification,
        fingerprintKey,
        visible: isVisible,
        loaded,
        failedVisible: isVisible && Boolean(source) && !loaded,
        missingAlt: isImage && !element.hasAttribute("alt")
      };
    });

    const placeholders = Array.from(document.querySelectorAll<HTMLElement>("[data-audit-placeholder], .piece-card-placeholder"))
      .map((element, index) => {
        const allowedReason = element.dataset.auditPlaceholderAllowed?.trim() ?? "";
        const marker = element.dataset.auditPlaceholder?.trim() || (element.classList.contains("piece-card-placeholder") ? "piece-card-placeholder" : element.tagName.toLowerCase());
        const safeMarker = marker.replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 80) || "placeholder";
        const safeReason = (allowedReason || safeMarker).replace(/[^a-zA-Z0-9._:-]+/g, "-").slice(0, 120) || "placeholder";
        return {
          index,
          kind: safeMarker,
          reason: safeReason,
          allowed: Boolean(allowedReason),
          visible: visible(element)
        };
      });

    const surfaces = {
      details: Array.from(document.querySelectorAll("details")).filter(visible).length,
      lightboxOpeners: Array.from(document.querySelectorAll('[data-media-lightbox-opener="true"]')).filter(visible).length,
      mediaPickerOpeners: Array.from(document.querySelectorAll("button")).filter((element) => visible(element) && element.textContent?.trim() === "Browse library").length,
      inlineEditLinks: Array.from(document.querySelectorAll("a.section-edit-link")).filter((link) => visible(link) && inlineCapable(link)).length,
      studioCards: Array.from(document.querySelectorAll(".studio-editor-card")).filter(visible).length,
      mediaCards: Array.from(document.querySelectorAll("[data-media-path]")).filter(visible).length,
      mediaCollections: mediaCollections.length,
      mediaCollectionItems: mediaCollections.reduce((total, collection) => total + collection.items.length, 0),
      validationForms: Array.from(document.querySelectorAll("form")).filter((form) => visible(form) && Boolean(form.querySelector("input[required],textarea[required],select[required]"))).length,
      interactiveElements: Array.from(document.querySelectorAll("a,button,input,textarea,select,summary,[role=button],[role=tab],[aria-pressed]")).filter(visible).length,
      scrollContainers,
      visualizer: Array.from(document.querySelectorAll("[role=region]")).some((element) => visible(element) && element.getAttribute("aria-label") === "Interactive conceptual furniture preview")
    };

    const brokenMedia = [
      ...Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src || "image-without-source"),
      ...Array.from(document.querySelectorAll<HTMLVideoElement>("video")).filter((video) => Boolean(video.error)).map((video) => video.currentSrc || video.src || "video-without-source")
    ];

    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const overflow = documentWidth > window.innerWidth + 2
      ? Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.right > window.innerWidth + 2 || rect.left < -2;
          })
          .slice(0, 12)
          .map((element) => element.dataset.auditId || element.id || element.tagName.toLowerCase())
      : [];

    return {
      links: [...new Set(links)],
      brokenMedia,
      overflow,
      documentWidth,
      viewportWidth: window.innerWidth,
      mediaCollections,
      surfaces,
      renderedMedia: { items: renderedMediaItems, placeholders }
    };
  }, new URL(config.baseUrl).origin);

  manifest.discoveredLinks = unique([...manifest.discoveredLinks, ...evidence.links]).sort();

  for (const source of evidence.brokenMedia) {
    const digest = createHash("sha256").update(source).digest("hex");
    manifest.diagnostics.push({ timestamp: now(), type: "broken-media", route, message: `sha256:${digest}` });
  }

  if (evidence.overflow.length > 0) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "horizontal-overflow",
      route,
      message: `Document width ${evidence.documentWidth}px exceeds viewport ${evidence.viewportWidth}px; candidates: ${evidence.overflow.join(", ")}`
    });
  }

  const mediaOverlaps = findMediaOverlaps(evidence.mediaCollections);
  for (const overlap of mediaOverlaps) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "media-overlap",
      route,
      message: `${overlap.collectionId} (${overlap.variant}) overlaps ${overlap.firstId} and ${overlap.secondId} by ${overlap.width.toFixed(2)} x ${overlap.height.toFixed(2)} px (${overlap.area.toFixed(2)} px2).`
    });
  }

  const sourceDigests = unique(evidence.renderedMedia.items
    .filter((item) => item.classification !== "empty")
    .map((item) => createHash("sha256").update(item.fingerprintKey).digest("hex"))).sort();
  const mountedSourceDigests = unique(evidence.renderedMedia.items
    .filter((item) => item.classification === "direct-mounted" || item.classification === "optimized-mounted")
    .map((item) => createHash("sha256").update(item.fingerprintKey).digest("hex"))).sort();
  const renderedMedia = {
    total: evidence.renderedMedia.items.length,
    visible: evidence.renderedMedia.items.filter((item) => item.visible).length,
    loaded: evidence.renderedMedia.items.filter((item) => item.loaded).length,
    failedVisible: evidence.renderedMedia.items.filter((item) => item.failedVisible).length,
    directMounted: evidence.renderedMedia.items.filter((item) => item.classification === "direct-mounted").length,
    optimizedMounted: evidence.renderedMedia.items.filter((item) => item.classification === "optimized-mounted").length,
    staticSameOrigin: evidence.renderedMedia.items.filter((item) => item.classification === "static-same-origin").length,
    external: evidence.renderedMedia.items.filter((item) => item.classification === "external").length,
    inline: evidence.renderedMedia.items.filter((item) => item.classification === "inline").length,
    empty: evidence.renderedMedia.items.filter((item) => item.classification === "empty").length,
    missingAlt: evidence.renderedMedia.items.filter((item) => item.missingAlt).length,
    sourceDigests,
    mountedSourceDigests,
    placeholders: evidence.renderedMedia.placeholders.map((placeholder) => ({
      digest: createHash("sha256").update(`${route}\0${placeholder.index}\0${placeholder.kind}\0${placeholder.reason}`).digest("hex"),
      kind: placeholder.kind,
      reason: placeholder.reason,
      allowed: placeholder.allowed,
      visible: placeholder.visible
    }))
  };

  return { ...evidence, renderedMedia, mediaOverlaps };
}

async function saveCapture(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  state: string;
  status: number | null;
  fullPage?: boolean;
  locator?: Locator;
  sensitive?: boolean;
}) {
  pageCapturePhases.set(input.page, `capture:${input.state}`);
  const key = captureKey({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name,
    state: input.state
  });

  if (
    config.resume &&
    manifest.completedKeys.includes(key)
  ) {
    return;
  }

  const outputDirectory = path.join(
    captureRoot,
    input.auth,
    input.profile.name,
    input.theme,
    routeLabel(input.route)
  );

  const baseName = `${safeName(input.state).slice(0, 40)}-${createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 12)}`;

  let files: string[];
  try {
    files = input.locator
      ? await captureElement(input.page, input.locator, outputDirectory, baseName)
      : await capturePageSurface(input.page, outputDirectory, baseName, input.fullPage ?? true);

    // A screenshot can expose a new lazy or responsive image candidate. Drain
    // only tracked visual requests before the next capture changes state.
    await waitForCaptureRequestDrain(input.page);
  } catch (error) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route: input.route,
      message: `Capture state ${input.state} failed: ${error instanceof Error ? error.message : String(error)}`
    });
    return;
  }

  const dimensions = await input.page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  })).catch(() => ({ width: input.profile.width, height: input.profile.height }));

  const record: CaptureRecord = {
    key,
    createdAt: now(),
    auth: input.auth,
    route: input.route,
    finalUrl: input.page.url(),
    theme: input.theme,
    viewport: input.profile.name,
    state: input.state,
    status: input.status,
    files: files.map(file =>
      relativeTo(config.runRoot, file)
    ),
    width: dimensions.width,
    height: dimensions.height,
    deviceScaleFactor:
      input.profile.deviceScaleFactor,
    sensitive:
      input.sensitive ??
      input.auth !== "anonymous"
  };

  manifest.captures.push(record);
  manifest.completedKeys.push(key);

  await persistManifest();
}

async function captureSkipLinkStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const skipLink = input.page.locator('a.skip-link[href="#main-content"]').first();
  const mainContent = input.page.locator("#main-content").first();
  if (await skipLink.count() !== 1 || await mainContent.count() !== 1) {
    throw new Error("The route is missing the skip link or #main-content target.");
  }

  await input.page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await input.page.keyboard.press("Tab");

  const focusEvidence = await skipLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      visible:
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number.parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0,
      intersectsViewport:
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight,
      target: element.getAttribute("href") ?? ""
    };
  });
  assertFocusedSkipLink(focusEvidence);

  await saveCapture({
    ...input,
    state: "skip-link-focused",
    locator: skipLink
  });

  await input.page.keyboard.press("Enter");
  await input.page.waitForFunction(
    () => document.activeElement?.id === "main-content",
    undefined,
    { timeout: 5_000 }
  );
  const activeElementId = await input.page.evaluate(() => document.activeElement?.id ?? null);
  assertMainFocusTransferred(activeElementId);

  await saveCapture({
    ...input,
    state: "skip-link-activated-main-focus",
    fullPage: false
  });
}

async function captureHeaderStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const header =
    input.page.locator("header").first();

  if (!await header.isVisible().catch(() => false)) {
    return;
  }

  await input.page.evaluate(() => {
    window.scrollTo(
      0,
      Math.max(
        window.innerHeight,
        900
      )
    );
  });

  await input.page.waitForTimeout(180);

  await saveCapture({
    ...input,
    state: "header-after-scroll-down",
    fullPage: false
  });

  await input.page.mouse.wheel(0, -400);
  await input.page.waitForTimeout(180);

  await saveCapture({
    ...input,
    state: "header-after-scroll-up",
    fullPage: false
  });

  await input.page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

async function captureDetailsStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const details =
    input.page.locator("details");

  const count = deepCount(await details.count(), 8);

  if (count === 0) {
    return;
  }

  await details.evaluateAll(nodes => {
    nodes.forEach(node => {
      (node as HTMLDetailsElement).open = true;
    });
  });

  await input.page.waitForTimeout(100);

  await saveCapture({
    ...input,
    state: "all-details-open",
    fullPage: true
  });

  for (let index = 0; index < count; index += 1) {
    const item = details.nth(index);

    if (!await item.isVisible().catch(() => false)) {
      continue;
    }

    await saveCapture({
      ...input,
      state:
        `details-${String(index + 1)
          .padStart(3, "0")}-open`,
      locator: item
    });
  }
}

async function captureLightboxes(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const openers =
    input.page.locator('[data-media-lightbox-opener="true"]');

  const count = deepCount(await openers.count(), 4);

  for (let index = 0; index < count; index += 1) {
    const opener = openers.nth(index);

    if (!await opener.isVisible().catch(() => false)) {
      continue;
    }

    await opener.click();

    const dialog =
      input.page.locator(
        '.lightbox-shell[role="dialog"]'
      );

    await dialog.waitFor({
      state: "visible",
      timeout: 10_000
    });

    await saveCapture({
      ...input,
      state:
        `lightbox-${String(index + 1)
          .padStart(4, "0")}-100-percent`,
      fullPage: false
    });

    if (index === 0) {
      const previous = dialog.getByRole("button", { name: "Previous image" });
      const next = dialog.getByRole("button", { name: "Next image" });
      if (await previous.isVisible().catch(() => false) && await next.isVisible().catch(() => false)) {
        await previous.click();
        await saveCapture({ ...input, state: "lightbox-previous-boundary", fullPage: false });
        await next.click();
        await saveCapture({ ...input, state: "lightbox-next-boundary", fullPage: false });
      }
    }

    const zoomIn =
      dialog.getByRole(
        "button",
        { name: "Zoom in" }
      );

    if (
      await zoomIn.isVisible().catch(() => false)
    ) {
      for (let click = 0; click < 4; click += 1) {
        await zoomIn.click();
      }

      await saveCapture({
        ...input,
        state:
          `lightbox-${String(index + 1)
            .padStart(4, "0")}-200-percent`,
        fullPage: false
      });

      for (let click = 0; click < 8; click += 1) {
        await zoomIn.click();
      }

      await saveCapture({
        ...input,
        state:
          `lightbox-${String(index + 1)
            .padStart(4, "0")}-400-percent`,
        fullPage: false
      });

      const stage = dialog.locator(".lightbox-stage");
      const box = await stage.boundingBox();
      if (box) {
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        await input.page.mouse.move(centerX, centerY);
        await input.page.mouse.down();
        await input.page.mouse.move(centerX + box.width * 0.28, centerY + box.height * 0.28, { steps: 8 });
        await input.page.mouse.up();
        await saveCapture({ ...input, state: `lightbox-${String(index + 1).padStart(4, "0")}-pan-boundary`, fullPage: false });
      }
    }

    if (index === 0) await input.page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close image preview" }).click();

    await dialog.waitFor({
      state: "hidden",
      timeout: 10_000
    });
  }
}

async function captureMediaCollections(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const collections = input.page.locator("[data-media-collection]");
  const count = deepCount(await collections.count(), 8);

  for (let index = 0; index < count; index += 1) {
    const collection = collections.nth(index);
    if (!await collection.isVisible().catch(() => false)) continue;
    const variant = await collection.getAttribute("data-media-collection-variant") || "unspecified";
    const statePrefix = `media-collection-${String(index + 1).padStart(3, "0")}-${safeName(variant)}`;

    await saveCapture({ ...input, state: `${statePrefix}-default`, locator: collection });

    if (variant !== "detail-stage") continue;
    const thumbnails = collection.locator('[data-media-slot="thumbnail"]');
    const thumbnailCount = await thumbnails.count();
    if (thumbnailCount < 2) continue;

    const last = thumbnails.nth(thumbnailCount - 1);
    await last.focus();
    await input.page.keyboard.press("Enter");
    await input.page.waitForTimeout(80);
    await saveCapture({ ...input, state: `${statePrefix}-last-selected`, locator: collection });

    await thumbnails.first().click();
    await input.page.waitForTimeout(80);
  }
}

async function captureInlineEditing(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (input.auth !== "admin") {
    return;
  }

  const allEditLinks =
    input.page.locator(
      "a.section-edit-link"
    );

  const capableIndexes = await allEditLinks.evaluateAll((links) => links.flatMap((link, index) => {
    const section = link.closest("section");
    if (!section) return [];
    const capable = Array.from(section.querySelectorAll<HTMLElement>("[data-inline-edit-resource][data-inline-edit-field]")).some((element) => (
      !element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") &&
      Boolean(element.textContent?.trim())
    ));
    return capable ? [index] : [];
  }));
  const linkIndexes = capableIndexes.slice(0, deepCount(capableIndexes.length, 4));

  for (
    let sectionOrdinal = 0;
    sectionOrdinal < linkIndexes.length;
    sectionOrdinal += 1
  ) {
    const linkIndex = linkIndexes[sectionOrdinal]!;
    const link =
      allEditLinks.nth(linkIndex);

    if (!await link.isVisible().catch(() => false)) {
      continue;
    }

    await link.click();

    const assistant =
      input.page.locator(
        ".inline-edit-hint"
      );

    await assistant.waitFor({
      state: "visible",
      timeout: 10_000
    });

    await saveCapture({
      ...input,
      state:
        `inline-section-${String(sectionOrdinal + 1)
          .padStart(3, "0")}-active`,
      fullPage: false
    });

    const activeSection = input.page.locator('section[data-inline-editing="true"]');
    const fieldIdentities = await activeSection
      .locator("[data-inline-edit-resource][data-inline-edit-field]")
      .evaluateAll((elements) => {
        const occurrences = new Map<string, number>();
        return elements.flatMap((element) => {
          if (!(element instanceof HTMLElement) || element.closest("form,button,.section-edit-link,.inline-edit-hint,.inline-url-dialog") || !element.textContent?.trim()) return [];
          const resource = element.dataset.inlineEditResource;
          const field = element.dataset.inlineEditField;
          if (!resource || !field) return [];
          const id = element.dataset.inlineEditId ?? null;
          const index = element.dataset.inlineEditIndex ?? null;
          const key = JSON.stringify([resource, field, id, index]);
          const occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          return [{
            resource,
            field,
            id,
            index,
            occurrence,
            urlField: element instanceof HTMLAnchorElement && Boolean(element.dataset.inlineEditUrlField)
          }];
        });
      }) as InlineFieldIdentity[];

    for (
      let fieldIndex = 0;
      fieldIndex < fieldIdentities.length;
      fieldIndex += 1
    ) {
      const identity = fieldIdentities[fieldIndex]!;
      const field = activeSection.locator(inlineFieldSelector(identity)).nth(identity.occurrence);

      if (!await field.isVisible().catch(() => false)) {
        continue;
      }

      const urlBeforeSelection = input.page.url();
      await field.click({ timeout: 10_000 });

      await saveCapture({
        ...input,
        state:
          `inline-section-${String(sectionOrdinal + 1)
            .padStart(3, "0")}` +
          `-field-${String(fieldIndex + 1)
            .padStart(3, "0")}-selected`,
        fullPage: false
      });

      const urlAfterSelection = input.page.url();
      if (urlAfterSelection !== urlBeforeSelection) {
        throw new Error(
          `Inline field selection navigated from ${urlBeforeSelection} to ${urlAfterSelection}`
        );
      }

      if (identity.urlField) {
        await assistant
          .getByRole(
            "button",
            { name: "Edit URL" }
          )
          .click();

        const dialog =
          input.page.locator(
            '.inline-url-dialog[role="dialog"]'
          );

        await dialog.waitFor({
          state: "visible"
        });

        await saveCapture({
          ...input,
          state:
            `inline-section-${String(sectionOrdinal + 1)
              .padStart(3, "0")}` +
            `-field-${String(fieldIndex + 1)
              .padStart(3, "0")}-url-dialog`,
          fullPage: false
        });

        await dialog
          .getByRole(
            "button",
            { name: "Cancel" }
          )
          .click();
      }
    }

    await assistant
      .getByRole(
        "button",
        { name: "Cancel" }
      )
      .click({ timeout: 10_000 });
  }
}

async function captureStudioCards(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (
    input.auth !== "admin" ||
    !input.page.url().includes("/studio")
  ) {
    return;
  }

  const cards =
    input.page.locator(
      ".studio-editor-card"
    );

  const count = deepCount(await cards.count(), 8);

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);

    if (!await card.isVisible().catch(() => false)) {
      continue;
    }

    await saveCapture({
      ...input,
      state:
        `studio-editor-${String(index + 1)
          .padStart(4, "0")}`,
      locator: card
    });
  }
}

async function captureMediaPageItems(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  if (
    input.auth !== "admin" ||
    !input.page.url().includes(
      "panel=media"
    )
  ) {
    return;
  }

  const cards =
    input.page.locator(
      "[data-media-path]"
    );

  const count = deepCount(await cards.count(), 6);

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);

    if (!await card.isVisible().catch(() => false)) {
      continue;
    }

    await card.click();

    const inspector =
      input.page.locator(
        ".studio-media-inspector"
      );

    await inspector.waitFor({
      state: "visible"
    });

    await saveCapture({
      ...input,
      state:
        `media-inspector-${String(index + 1)
          .padStart(4, "0")}`,
      locator: inspector
    });

    await inspector
      .locator("details")
      .evaluateAll(nodes => {
        nodes.forEach(node => {
          (node as HTMLDetailsElement).open = true;
        });
      });

    await saveCapture({
      ...input,
      state:
        `media-inspector-${String(index + 1)
          .padStart(4, "0")}-expanded`,
      locator: inspector
    });

    const preview =
      inspector.locator('[data-media-lightbox-opener="true"]');

    if (
      await preview.isVisible().catch(() => false)
    ) {
      await preview.click();

      const dialog =
        input.page.locator(
          '.lightbox-shell[role="dialog"]'
        );

      await dialog.waitFor({
        state: "visible"
      });

      await saveCapture({
        ...input,
        state:
          `media-inspector-${String(index + 1)
            .padStart(4, "0")}-lightbox`,
        fullPage: false
      });

      await dialog
        .getByRole(
          "button",
          { name: "Close image preview" }
        )
        .click();
    }
  }

  if (input.profile.isMobile) {
    for (
      const pane of [
        "Tools",
        "Library",
        "Inspector"
      ]
    ) {
      const button =
        input.page.getByRole(
          "button",
          { name: pane }
        );

      if (
        await button.isVisible().catch(() => false) &&
        await button.isEnabled()
      ) {
        await button.click();

        await saveCapture({
          ...input,
          state:
            `media-mobile-pane-${pane.toLowerCase()}`,
          fullPage: false
        });
      }
    }
  }
}

async function captureVisualizerStates(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const preview = input.page.getByRole("region", { name: "Interactive conceptual furniture preview" });
  if (!await preview.isVisible().catch(() => false)) return;

  for (const name of ["front", "side", "top", "Orthographic", "Rotate preview left", "Zoom preview in", "Zoom preview out", "Reset view"]) {
    const button = input.page.getByRole("button", { name, exact: true });
    if (!await button.isVisible().catch(() => false)) continue;
    await button.click();
    await input.page.waitForTimeout(120);
    await saveCapture({ ...input, state: `visualizer-${safeName(name)}`, locator: preview });
  }

  const pieceType = input.page.getByLabel("Piece type");
  if (await pieceType.isVisible().catch(() => false)) {
    const options = await pieceType.locator("option").evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
    for (const value of options) {
      await pieceType.selectOption(value);
      await input.page.waitForTimeout(100);
      await saveCapture({ ...input, state: `visualizer-template-${safeName(value)}`, locator: preview });
    }
  }

  const dimensionFields = [
    { label: "Width (in)", min: "4", max: "240" },
    { label: "Depth (in)", min: "2", max: "120" },
    { label: "Height (in)", min: "2", max: "144" }
  ];

  for (const boundary of ["min", "max"] as const) {
    for (const field of dimensionFields) {
      const inputField = input.page.getByLabel(field.label);
      if (await inputField.isVisible().catch(() => false)) await inputField.fill(field[boundary]);
    }
    await input.page.waitForTimeout(120);
    await saveCapture({ ...input, state: `visualizer-dimensions-${boundary}`, locator: preview });
  }
}

async function captureElementAtlas(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  await input.page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector<HTMLElement>(".site-header")?.classList.remove("is-hidden");
  });
  await input.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const elements =
    input.page.locator([
      "a:not(.skip-link)",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      '[role="button"]',
      '[role="tab"]',
      '[aria-pressed]'
    ].join(","));

  const count = deepCount(await elements.count(), 48);

  for (let index = 0; index < count; index += 1) {
    const element =
      elements.nth(index);

    const prefix =
      `element-${String(index + 1)
        .padStart(5, "0")}`;
    const states = [
      `${prefix}-normal`,
      `${prefix}-hover`,
      `${prefix}-focus`
    ];
    if (states.every((state) => captureCompleted(input, state))) {
      continue;
    }

    if (!await element.isVisible().catch(() => false)) {
      continue;
    }

    const box =
      await element.boundingBox();

    if (
      !box ||
      box.width < 2 ||
      box.height < 2
    ) {
      continue;
    }

    await saveCapture({
      ...input,
      state: `${prefix}-normal`,
      locator: element
    });

    await element.hover({
      force: true
    }).catch(() => undefined);

    await saveCapture({
      ...input,
      state: `${prefix}-hover`,
      locator: element
    });

    await element.focus()
      .catch(() => undefined);

    await saveCapture({
      ...input,
      state: `${prefix}-focus`,
      locator: element
    });
  }
}

async function captureRoute(input: {
  context: BrowserContext;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  deep: boolean;
  coverageTier: CoverageTier;
}) {
  if (routeResultCompleted({
    auth: input.auth,
    route: input.route,
    theme: input.theme,
    viewport: input.profile.name
  })) {
    return;
  }

  const page =
    await input.context.newPage();

  attachDiagnostics(
    page,
    input.route,
    intentionalMutationBlocks.get(input.context) ?? new Set<string>()
  );

  try {
    pageCapturePhases.set(page, "navigation");
    const response = await page.goto(
      input.route,
      {
        waitUntil: "domcontentloaded",
        timeout: 60_000
      }
    );

    pageCapturePhases.set(page, "initial-readiness");
    const settledDocument = await waitForSettledVisualReady(page);
    const redirectChain: string[] = [];
    let redirected =
      response?.request().redirectedFrom();

    while (redirected) {
      redirectChain.unshift(
        redirected.url()
      );

      redirected =
        redirected.redirectedFrom();
    }

    if (response && response.url() !== settledDocument.url && !redirectChain.includes(response.url())) {
      redirectChain.push(response.url());
    }

    const routeResult: RouteResult = {
      route: input.route,
      auth: input.auth,
      theme: input.theme,
      viewport: input.profile.name,
      deep: input.deep,
      coverageTier: input.coverageTier,
      finalUrl: settledDocument.url,
      status:
        response?.status() ?? null,
      redirectChain,
      expected: true
    };

    manifest.routes.push(routeResult);

    pageCapturePhases.set(page, "collect-page-evidence");
    const evidence = await collectPageEvidence(page, input.route);
    routeResult.discoveredLinks = evidence.links;
    routeResult.surfaces = evidence.surfaces;
    routeResult.mediaCollections = evidence.mediaCollections.map((collection) => ({
      id: collection.id,
      variant: collection.variant,
      itemCount: collection.items.length
    }));
    routeResult.mediaOverlapFindings = evidence.mediaOverlaps;
    routeResult.mediaEvidence = evidence.renderedMedia;

    const base = {
      page,
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      profile: input.profile,
      status: response?.status() ?? null
    };

    await saveCapture({
      ...base,
      state: "viewport-top",
      fullPage: false
    });

    await saveCapture({
      ...base,
      state: "full-page-default",
      fullPage: true
    });

    try {
      await captureSkipLinkStates(base);
    } catch (error) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "coverage",
        route: input.route,
        message: `Skip-link capture failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    try {
      await captureHeaderStates(base);
    } catch (error) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "pageerror",
        route: input.route,
        message: `Header-state capture failed: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    try {
      await captureSnapshotLabMutationState(base);
    } catch (error) {
      manifest.diagnostics.push({
        timestamp: now(),
        type: "pageerror",
        route: input.route,
        message:
          "Snapshot-lab mutation capture failed: " +
          (error instanceof Error ? error.message : String(error))
      });
    }

    if (input.deep) {
      const steps = [
        ["details", captureDetailsStates],
        ["media-collections", captureMediaCollections],
        ["lightboxes", captureLightboxes],
        ["media-pickers", captureMediaPickers],
        ["inline-editing", captureInlineEditing],
        ["studio-cards", captureStudioCards],
        ["media-inspectors", captureMediaPageItems],
        ["form-validation", captureFormValidationStates],
        ["commission-visualizer", captureVisualizerStates],
        ["element-atlas", captureElementAtlas]
      ] as const;

      for (const [label, step] of steps) {
        try {
          pageCapturePhases.set(page, `deep:${label}`);
          await step(base);
        } catch (error) {
          manifest.diagnostics.push({
            timestamp: now(),
            type: "pageerror",
            route: input.route,
            message: `Deep capture step ${label} failed: ${error instanceof Error ? error.message : String(error)}`
          });
        }
      }
    }

    // Deep and canonical-only routes can both leave responsive media work
    // behind after their final interaction. Settle layout/media first, then
    // require a longer request-free window before closing the page. This keeps
    // teardown from manufacturing ERR_ABORTED diagnostics for real images.
    pageCapturePhases.set(page, "final-settle");
    await waitForVisualIdle(page);
    await waitForCaptureRequestDrain(page, {
      intervalMs: 100,
      quietSamples: 6,
      timeoutMs: 15_000
    });

    await persistManifest();
  } catch (error) {
    manifest.diagnostics.push({
      timestamp: now(),
      type: "pageerror",
      route: input.route,
      message:
        error instanceof Error
          ? error.stack || error.message
          : String(error)
    });

    await persistManifest();
  } finally {
    pageCapturePhases.set(page, "deliberate-teardown");
    pagesInDeliberateTeardown.add(page);
    await page.close();
  }
}

async function captureMediaPickers(input: {
  page: Page;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  profile: ViewportProfile;
  status: number | null;
}) {
  const openers =
    input.page.getByRole(
      "button",
      { name: "Browse library" }
    );

  const count = deepCount(await openers.count(), 3);

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const opener = openers.nth(index);

    if (
      !await opener
        .isVisible()
        .catch(() => false)
    ) {
      continue;
    }

    await opener.click();

    const dialog =
      input.page.locator(
        '.media-picker-dialog[role="dialog"]'
      );

    await dialog.waitFor({
      state: "visible",
      timeout: 10_000
    });

    await saveCapture({
      ...input,
      state:
        `media-picker-${String(index + 1)
          .padStart(3, "0")}-default`,
      fullPage: false
    });

    const filter = dialog.getByLabel("Search");

    if (
      await filter
        .isVisible()
        .catch(() => false)
    ) {
      await filter.fill(
        "__visual_audit_no_results__"
      );
      await dialog.getByRole("button", { name: "Search" }).click();
      await dialog.locator('[aria-busy="false"]').waitFor({ state: "attached", timeout: 10_000 }).catch(() => input.page.waitForTimeout(500));

      await saveCapture({
        ...input,
        state:
          `media-picker-${String(index + 1)
            .padStart(3, "0")}-empty-filter`,
        fullPage: false
      });

      await filter.fill("");
    }

    await dialog
      .getByRole(
        "button",
        { name: "Close media browser" }
      )
      .click();

    await dialog.waitFor({
      state: "hidden",
      timeout: 10_000
    });
  }
}

async function runRoutes(
  browser: Browser,
  auth: AuthState,
  routes: string[],
  options: {
    matrix?: CoverageMatrixEntry[];
    coverageTier?: CoverageTier;
  } = {}
) {
  const matrix = options.matrix ?? canonicalCoverageMatrix(config.scope, viewports);
  const coverageTier = options.coverageTier ?? "canonical";
  const tasks = unique(routes).flatMap((route) => matrix.flatMap((entry) => (
    routeResultCompleted({ auth, route, theme: entry.theme, viewport: entry.profile.name })
      ? []
      : [{ route, entry }]
  )));
  const workerCount = config.targetMode === "snapshot-lab" ? 1 : config.captureWorkers;
  const startedAt = performance.now();
  const run = await runBoundedCaptureTasks(tasks, {
    workerCount,
    execute: async (task, _index, signal) => {
      if (signal.aborted) throw new Error("Capture task was cancelled before context creation.");
      if (routeResultCompleted({ auth, route: task.route, theme: task.entry.theme, viewport: task.entry.profile.name })) return;
      const taskIdentity = `${auth}::${task.route}::${task.entry.theme}::${task.entry.profile.name}`;
      const taskScratch = path.join(config.tmpRoot, "capture-workers", createHash("sha256").update(taskIdentity).digest("hex").slice(0, 20));
      await ensureDirectory(taskScratch);
      await writeJsonAtomic(path.join(taskScratch, "task.json"), {
        identity: taskIdentity,
        coverageTier,
        startedAt: now()
      });
      let context: BrowserContext | null = null;
      try {
        context = await createCaptureContext(browser, auth, task.entry.profile, task.entry.theme);
        await captureRoute({
          context,
          auth,
          route: task.route,
          theme: task.entry.theme,
          profile: task.entry.profile,
          deep: task.entry.deep,
          coverageTier
        });
      } finally {
        await context?.close();
        await fs.rm(taskScratch, { recursive: true, force: true });
      }
    }
  });
  console.log(`CAPTURE_STAGE=${JSON.stringify({
    auth,
    coverageTier,
    tasks: tasks.length,
    workers: run.metrics.workerCount,
    maxInFlight: run.metrics.maxInFlight,
    seconds: Number(((performance.now() - startedAt) / 1_000).toFixed(3))
  })}`);
}

function captureableDiscoveredRoute(route: string, auth: AuthState) {
  let url: URL;
  try {
    url = new URL(route, config.baseUrl);
  } catch {
    return false;
  }
  if (url.origin !== new URL(config.baseUrl).origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/_next/")) return false;
  if (auth === "anonymous" && (url.pathname.startsWith("/studio") || url.pathname.startsWith("/requests/") || ["/account/profile", "/account/projects"].includes(url.pathname))) return false;
  return true;
}

async function runDiscoveredRoutes(browser: Browser, auth: AuthState, seededRoutes: string[]) {
  const captured = new Set([
    ...seededRoutes,
    ...manifest.routes.filter((route) => route.auth === auth).map((route) => route.route)
  ]);

  for (let pass = 0; pass < 3; pass += 1) {
    const pending = manifest.discoveredLinks
      .filter((route) => !captured.has(route) && captureableDiscoveredRoute(route, auth))
      .sort();
    if (pending.length === 0) return;
    pending.forEach((route) => captured.add(route));
    await runRoutes(browser, auth, pending, {
      matrix: discoveredCoverageMatrix(config.scope, viewports),
      coverageTier: "discovered"
    });
  }
}

async function runMediaPagination(
  browser: Browser,
  inventory: Inventory
) {
  const profile =
    viewports.find(
      viewport =>
        viewport.name === (config.scope === "smoke" ? "desktop-1440" : "desktop-archival")
    )!;

  const theme = "dark" as const;
  const totalPages = Math.max(
    1,
    Math.ceil(inventory.counts.media / 48)
  );

  const filterRoutes = [
    "/studio?panel=media&mediaAssignment=unassigned",
    "/studio?panel=media&mediaAssignment=assigned",
    "/studio?panel=media&mediaAssignment=review",
    "/studio?panel=media&mediaKind=image",
    "/studio?panel=media&mediaKind=video",
    "/studio?panel=media&mediaAi=high",
    "/studio?panel=media&mediaAi=ambiguous",
    "/studio?panel=media&mediaAi=details",
    "/studio?panel=media&mediaAi=unanalyzed",
    "/studio?panel=media&mediaAi=missing-alt",
    "/studio?panel=media&mediaAi=representatives"
  ];

  const pageRoutes = Array.from(
    { length: config.scope === "smoke" ? 1 : totalPages },
    (_, index) =>
      `/studio?panel=media&mediaPage=${index + 1}`
  );

  await runRoutes(browser, "admin", unique([
    ...pageRoutes,
    ...(config.scope === "smoke" ? [] : filterRoutes)
  ]), {
    matrix: [{ profile, theme, deep: true }],
    coverageTier: "special"
  });
}

async function runVisualizerFallbackStates(browser: Browser) {
  if (config.scope === "smoke") return;
  const profile = viewports.find((viewport) => viewport.name === "desktop-archival")!;
  const variants = [
    { route: "/commissions?auditState=reduced-motion", options: { reducedMotion: "reduce" as const } },
    { route: "/commissions?auditState=webgl-unavailable", options: { disableWebGl: true } }
  ];

  await runBoundedCaptureTasks(variants, {
    workerCount: config.targetMode === "snapshot-lab" ? 1 : config.captureWorkers,
    execute: async (variant, _index, signal) => {
      if (signal.aborted) throw new Error("Visualizer fallback capture was cancelled.");
      const taskIdentity = `anonymous::${variant.route}::dark::${profile.name}`;
      const taskScratch = path.join(config.tmpRoot, "capture-workers", createHash("sha256").update(taskIdentity).digest("hex").slice(0, 20));
      await ensureDirectory(taskScratch);
      await writeJsonAtomic(path.join(taskScratch, "task.json"), { identity: taskIdentity, coverageTier: "special", startedAt: now() });
      let context: BrowserContext | null = null;
      try {
        context = await createCaptureContext(browser, "anonymous", profile, "dark", variant.options);
        await captureRoute({ context, auth: "anonymous", route: variant.route, theme: "dark", profile, deep: false, coverageTier: "special" });
      } finally {
        await context?.close();
        await fs.rm(taskScratch, { recursive: true, force: true });
      }
    }
  });
}

function routesForCurrentScope(routes: ReturnType<typeof buildRoutes>, inventory: Inventory) {
  if (config.scope === "full") return routes;

  const firstPiece = inventory.pieces.find((piece) => piece.publicationStatus === "published");
  const publicCandidates = [
    "/",
    "/portfolio",
    ...(firstPiece ? [`/portfolio/${encodeURIComponent(firstPiece.slug)}`] : []),
    "/shop",
    "/commissions",
    "/contact",
    "/search?q=__visual_audit_no_results__",
    "/account/login",
    "/studio/login",
    "/__visual-audit-route-not-found__"
  ];
  const publicRoutes = publicCandidates.filter((route) => routes.publicRoutes.includes(route));
  const panelPrefixes = ["overview", "pages", "pieces", "media", "projects", "notifications"]
    .map((panel) => `/studio?panel=${panel}`);
  const adminRoutes = unique([
    ...publicRoutes,
    "/commissions",
    ...routes.adminRoutes.filter((route) => panelPrefixes.some((prefix) => route.startsWith(prefix)))
  ]);

  return { ...routes, publicRoutes, adminRoutes };
}

async function main() {
  await ensureDirectory(config.outputRoot);
  await ensureDirectory(config.runRoot);
  await ensureDirectory(captureRoot);

  const accelerator = selectAccelerator(config.accelerator, await probeCuda());
  const browser = await chromium.launch(chromiumLaunchOptions(
    config.browserChannel,
    accelerator.selected === "cuda" ? "cuda-vulkan" : "canonical"
  ));

  try {
    const browserGpu = await probeBrowserGpu(browser);
    if (accelerator.selected === "cuda" && !browserGpu.hardwareAccelerated) {
      throw new Error("CUDA acceleration was selected, but Chromium CDP reported a software renderer.");
    }
    const acceleration = buildAccelerationProvenance(accelerator, browserGpu);
    await authenticateAdmin(browser);

    const inventory =
      await fetchInventory(
        browser,
        config.authStatePath
      );

    if (inventory.schemaVersion !== 2 || !inventory.mediaEvidence) {
      throw new Error("The target does not expose the schema-v2 protected media inventory required for evidence-tier capture.");
    }

    const targetHost = new URL(config.baseUrl).hostname;
    const localTarget = ["127.0.0.1", "localhost", "::1"].includes(targetHost);
    if (inventory.buildSha === "unknown" && !localTarget) {
      throw new Error(
        "The target image is missing WOODSMITH_BUILD_SHA; rebuild it with the audited commit before capture."
      );
    }
    if (inventory.buildSha !== "unknown" && inventory.buildSha !== config.expectedCommit) {
      throw new Error(
        `Deployment mismatch: expected ${config.expectedCommit}, ` +
        `but production reported ${inventory.buildSha}.`
      );
    }

    const source =
      await discoverSourceRoutes();

    const completeRoutes = buildRoutes(inventory, source);
    const routes = routesForCurrentScope(completeRoutes, inventory);

    manifest =
      await loadOrCreateManifest(
        browser.version(),
        inventory,
        acceleration
      );

    manifest.diagnostics.push(...preAuthenticationDiagnostics);
    manifest.security.sameOriginUnsafeRequestsBlocked += preAuthenticationUnsafeBlocks;

    await writeJsonAtomic(
      path.join(
        config.runRoot,
        "coverage-plan.json"
      ),
      {
        generatedAt: now(),
        runId: config.runId,
        mode: config.targetMode,
        scope: config.scope,
        evidenceTier: config.evidenceTier,
        mediaPolicy: {
          provenance: inventory.mediaEvidence.provenance,
          publicReferenced: inventory.mediaEvidence.publicReferenced,
          publicPresent: inventory.mediaEvidence.publicPresent,
          syntheticMarkers: inventory.mediaEvidence.syntheticMarkers,
          rawPathsRecorded: false
        },
        source,
        inventoryCounts:
          inventory.counts,
        routes,
        completeInventoryRoutes: completeRoutes,
        exclusions: coverageExclusions,
        requiredStates: [
          "route-default", "header-scroll", "theme-light", "theme-dark", "desktop", "tablet", "mobile", "archival-dpr",
          "skip-link-focus-and-activation", "disclosures", "dialogs", "lightbox-zoom-boundaries", "inline-editing", "media-picker", "media-inspector",
          "nested-scroll-surfaces", "empty-states", "error-states", "snapshot-lab-validation",
          ...(config.targetMode === "snapshot-lab" ? ["snapshot-lab-successful-mutation"] : [])
        ],
        safety: {
          liveReadonly: "Unsafe same-origin and cross-origin requests are blocked client-side; same-origin requests also carry the server read-only header.",
          snapshotLab: "Mutation-dependent states are permitted only against the separately mounted SQLite and media clones."
        },
        structuralMatrix: canonicalCoverageMatrix(config.scope, viewports),
        discoveredLinkMatrix: discoveredCoverageMatrix(config.scope, viewports),
        matrixPolicy: {
          canonical: "Every source/database route uses every configured viewport in dark and light; desktop-archival dark also expands deep states.",
          discovered: "Every rendered same-origin link uses standard desktop, tablet, and mobile dark/light states plus archival desktop dark, without duplicate deep template expansion.",
          continuousControls: "Intermediate continuous dimensions use finite boundary and pairwise representatives; raw values and selected state are retained in the manifest."
        }
      }
    );

    await runRoutes(
      browser,
      "anonymous",
      routes.publicRoutes
    );

    if (config.scope === "full") await runDiscoveredRoutes(browser, "anonymous", routes.publicRoutes);

    await runRoutes(
      browser,
      "admin",
      routes.adminRoutes
    );

    if (config.scope === "full") await runDiscoveredRoutes(browser, "admin", routes.adminRoutes);

    await runMediaPagination(
      browser,
      inventory
    );

    await runVisualizerFallbackStates(browser);

    if (config.targetMode === "live-readonly" && manifest.security.successfulUnsafeRequests > 0) {
      throw new Error(`Live read-only audit observed ${manifest.security.successfulUnsafeRequests} successful unsafe request(s).`);
    }

    manifest.completedAt = now();
    manifest.mediaEvidence = buildMediaEvidenceReports({
      runId: manifest.runId,
      generatedAt: manifest.completedAt,
      evidenceTier: manifest.evidenceTier,
      mode: manifest.mode,
      inventory: manifest.inventory.mediaEvidence,
      routes: manifest.routes
    });
    await writeJsonAtomic(path.join(config.runRoot, "live-media.json"), manifest.mediaEvidence.liveMedia);
    await writeJsonAtomic(path.join(config.runRoot, "placeholder-report.json"), manifest.mediaEvidence.placeholders);
    await writeJsonAtomic(path.join(config.runRoot, "no-overlap.json"), buildNoOverlapReport({
      runId: manifest.runId,
      generatedAt: manifest.completedAt,
      routes: manifest.routes
    }));
    await persistManifest();
  } finally {
    await browser.close();

    await clearDirectoryContents(config.tmpRoot);
  }
}

await main();
