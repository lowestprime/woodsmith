"use client";

import {
  useEffect,
  useRef
} from "react";

import {
  usePathname,
  useRouter,
  useSearchParams
} from "next/navigation";

const STORAGE_KEY_PREFIX =
  "woodsmith-studio-navigation-state-v2";

const MAX_AGE_MS = 30_000;
const SCROLL_CAPTURE_DELAY_MS = 160;

const STUDIO_ENTITY_ID =
  /^(page|piece|post|user|project|order|commission|review|media|category)-/;

export type StudioNavigationFlushable = {
  flush: () => Promise<unknown>;
  hasUnsavedChanges: () => boolean;
};

type StoredNavigationState = {
  pathname: string;
  search: string;
  x: number;
  y: number;
  hash: string;
  selector: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection:
    | "forward"
    | "backward"
    | "none"
    | null;
  capturedAt: number;
};

const flushables =
  new Set<StudioNavigationFlushable>();

export class StudioNavigationBlockedError
  extends Error {
  constructor() {
    super(
      "Navigation was blocked because Studio still has unsaved changes."
    );

    this.name =
      "StudioNavigationBlockedError";
  }
}

function escapeCss(value: string): string {
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.escape === "function"
  ) {
    return CSS.escape(value);
  }

  return value.replace(
    /["\\]/g,
    "\\$&"
  );
}

function storageKeyForRoute(
  pathname: string =
    window.location.pathname,
  search: string =
    window.location.search
): string {
  return (
    `${STORAGE_KEY_PREFIX}:` +
    `${encodeURIComponent(pathname)}:` +
    `${encodeURIComponent(search)}`
  );
}

function focusSelector(
  element: HTMLElement
): string | null {
  if (element.id) {
    return `#${escapeCss(element.id)}`;
  }

  const focusKey =
    element.dataset.studioFocusKey;

  if (focusKey) {
    return (
      `[data-studio-focus-key="` +
      `${escapeCss(focusKey)}"]`
    );
  }

  const name =
    element.getAttribute("name");

  if (!name) {
    return null;
  }

  const tag =
    element.tagName.toLowerCase();

  const entity =
    element.closest<HTMLElement>("[id]");

  if (
    entity?.id &&
    STUDIO_ENTITY_ID.test(entity.id)
  ) {
    return (
      `#${escapeCss(entity.id)} ` +
      `${tag}[name="${escapeCss(name)}"]`
    );
  }

  const form =
    element.closest<HTMLFormElement>("form");

  const formKey =
    form?.dataset.studioEntityKey;

  if (formKey) {
    return (
      `form[data-studio-entity-key="` +
      `${escapeCss(formKey)}"] ` +
      `${tag}[name="${escapeCss(name)}"]`
    );
  }

  return null;
}

function selectionState(
  element: HTMLElement
): Pick<
  StoredNavigationState,
  | "selectionStart"
  | "selectionEnd"
  | "selectionDirection"
> {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return {
      selectionStart:
        element.selectionStart,
      selectionEnd:
        element.selectionEnd,
      selectionDirection:
        element.selectionDirection
    };
  }

  return {
    selectionStart: null,
    selectionEnd: null,
    selectionDirection: null
  };
}

function canSetSelection(
  element: HTMLElement
): element is
  | HTMLInputElement
  | HTMLTextAreaElement {
  if (
    element instanceof
      HTMLTextAreaElement
  ) {
    return true;
  }

  if (
    !(element instanceof
      HTMLInputElement)
  ) {
    return false;
  }

  return [
    "email",
    "password",
    "search",
    "tel",
    "text",
    "url"
  ].includes(element.type);
}

function readStoredNavigationState():
StoredNavigationState | null {
  const key =
    storageKeyForRoute();

  let state:
    StoredNavigationState | null =
      null;

  try {
    const raw =
      sessionStorage.getItem(key);

    if (!raw) {
      return null;
    }

    state =
      JSON.parse(raw) as
        StoredNavigationState;
  } catch {
    return null;
  }

  if (
    !state ||
    typeof state.capturedAt !==
      "number" ||
    Date.now() - state.capturedAt >
      MAX_AGE_MS ||
    state.pathname !==
      window.location.pathname ||
    state.search !==
      window.location.search
  ) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage cleanup must never block Studio interaction.
    }

    return null;
  }

  return state;
}

function applyStoredScrollPosition(
  state: StoredNavigationState
): void {
  window.scrollTo({
    left:
      typeof state.x === "number"
        ? state.x
        : 0,
    top:
      typeof state.y === "number"
        ? state.y
        : 0,
    behavior: "auto"
  });
}

function restoreStoredFocusAndSelection(
  state: StoredNavigationState
): boolean {
  if (!state.selector) {
    return true;
  }

  const target =
    document.querySelector<HTMLElement>(
      state.selector
    );

  if (!target) {
    return false;
  }

  target.focus({
    preventScroll: true
  });

  if (
    document.activeElement !== target
  ) {
    return false;
  }

  if (
    canSetSelection(target) &&
    typeof state.selectionStart ===
      "number" &&
    typeof state.selectionEnd ===
      "number"
  ) {
    try {
      target.setSelectionRange(
        state.selectionStart,
        state.selectionEnd,
        state.selectionDirection ??
          undefined
      );
    } catch {
      return false;
    }

    return (
      target.selectionStart ===
        state.selectionStart &&
      target.selectionEnd ===
        state.selectionEnd &&
      (
        state.selectionDirection ===
          null ||
        target.selectionDirection ===
          state.selectionDirection
      )
    );
  }

  return true;
}

function applyStoredNavigationState(
  state: StoredNavigationState
): void {
  restoreStoredFocusAndSelection(
    state
  );

  applyStoredScrollPosition(state);

  if (
    state.hash &&
    state.hash !==
      window.location.hash
  ) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${state.hash}`
    );
  }
}

function scheduleStoredNavigationScrollStabilization(
  state: StoredNavigationState
): () => void {
  let cancelled = false;
  let focusInterrupted = false;

  let firstFrame:
    number | null = null;

  let secondFrame:
    number | null = null;

  let focusFrame:
    number | null = null;

  const focusDeadline =
    performance.now() + 2_000;

  function cancelFocusRetry() {
    if (focusFrame !== null) {
      window.cancelAnimationFrame(
        focusFrame
      );

      focusFrame = null;
    }
  }

  function interruptFocusRetry(
    event: Event
  ) {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    if (
      !target?.closest(
        "[data-studio-root]"
      )
    ) {
      return;
    }

    focusInterrupted = true;
    cancelFocusRetry();
  }

  function restoreFocusWhenReady() {
    if (
      cancelled ||
      focusInterrupted ||
      !state.selector
    ) {
      return;
    }

    if (
      restoreStoredFocusAndSelection(
        state
      )
    ) {
      return;
    }

    if (
      performance.now() >=
        focusDeadline
    ) {
      return;
    }

    focusFrame =
      window.requestAnimationFrame(() => {
        focusFrame = null;
        restoreFocusWhenReady();
      });
  }

  function restoreAfterLayoutSettlement() {
    if (cancelled) {
      return;
    }

    firstFrame =
      window.requestAnimationFrame(() => {
        firstFrame = null;

        secondFrame =
          window.requestAnimationFrame(() => {
            secondFrame = null;

            if (cancelled) {
              return;
            }

            applyStoredScrollPosition(state);
          });
      });
  }

  if (state.selector) {
    document.addEventListener(
      "pointerdown",
      interruptFocusRetry,
      true
    );

    document.addEventListener(
      "keydown",
      interruptFocusRetry,
      true
    );

    focusFrame =
      window.requestAnimationFrame(() => {
        focusFrame = null;
        restoreFocusWhenReady();
      });
  }

  void document.fonts.ready.then(
    restoreAfterLayoutSettlement,
    restoreAfterLayoutSettlement
  );

  return () => {
    cancelled = true;
    cancelFocusRetry();

    if (firstFrame !== null) {
      window.cancelAnimationFrame(
        firstFrame
      );
    }

    if (secondFrame !== null) {
      window.cancelAnimationFrame(
        secondFrame
      );
    }

    if (state.selector) {
      document.removeEventListener(
        "pointerdown",
        interruptFocusRetry,
        true
      );

      document.removeEventListener(
        "keydown",
        interruptFocusRetry,
        true
      );
    }
  };
}

export function registerStudioNavigationFlushable(
  flushable: StudioNavigationFlushable
): () => void {
  flushables.add(flushable);

  return () => {
    flushables.delete(flushable);
  };
}

export function hasUnsavedStudioChanges():
boolean {
  return [...flushables].some(
    (flushable) =>
      flushable.hasUnsavedChanges()
  );
}

export async function flushStudioNavigationQueues():
Promise<void> {
  const active = [...flushables];

  await Promise.all(
    active.map((flushable) =>
      flushable.flush()
    )
  );

  if (
    active.some((flushable) =>
      flushable.hasUnsavedChanges()
    )
  ) {
    throw new StudioNavigationBlockedError();
  }
}

export function captureStudioNavigationState(
  root: HTMLElement | null =
    document.querySelector<HTMLElement>(
      "[data-studio-root]"
    )
): void {
  const active =
    document.activeElement instanceof
      HTMLElement &&
    root?.contains(document.activeElement)
      ? document.activeElement
      : null;

  const selection = active
    ? selectionState(active)
    : {
        selectionStart: null,
        selectionEnd: null,
        selectionDirection: null
      };

  const state: StoredNavigationState = {
    pathname:
      window.location.pathname,
    search:
      window.location.search,
    x:
      window.scrollX,
    y:
      window.scrollY,
    hash:
      window.location.hash,
    selector:
      active
        ? focusSelector(active)
        : null,
    selectionStart:
      selection.selectionStart,
    selectionEnd:
      selection.selectionEnd,
    selectionDirection:
      selection.selectionDirection,
    capturedAt:
      Date.now()
  };

  try {
    sessionStorage.setItem(
      storageKeyForRoute(
        state.pathname,
        state.search
      ),
      JSON.stringify(state)
    );
  } catch {
    // Storage failures must never block Studio interaction.
  }
}

export function restoreStudioNavigationState():
boolean {
  const state =
    readStoredNavigationState();

  if (!state) {
    return false;
  }

  applyStoredNavigationState(state);
  return true;
}

function internalStudioUrl(
  anchor: HTMLAnchorElement
): URL | null {
  if (
    anchor.target &&
    anchor.target !== "_self"
  ) {
    return null;
  }

  if (
    anchor.hasAttribute("download")
  ) {
    return null;
  }

  const url =
    new URL(
      anchor.href,
      window.location.href
    );

  if (
    url.origin !==
      window.location.origin ||
    !url.pathname.startsWith(
      "/studio"
    )
  ) {
    return null;
  }

  return url;
}

export function StudioNavigationState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams =
    useSearchParams();

  const navigationPending =
    useRef(false);

  const routeKey =
    `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    const previous =
      window.history.scrollRestoration;

    window.history.scrollRestoration =
      "manual";

    return () => {
      window.history.scrollRestoration =
        previous;
    };
  }, []);

  useEffect(() => {
    const state =
      readStoredNavigationState();

    if (!state) {
      return;
    }

    let cancelStabilization =
      () => {};

    const frame =
      window.requestAnimationFrame(() => {
        applyStoredNavigationState(state);

        cancelStabilization =
          scheduleStoredNavigationScrollStabilization(
            state
          );
      });

    return () => {
      window.cancelAnimationFrame(frame);
      cancelStabilization();
    };
  }, [routeKey]);

  useEffect(() => {
    let captureTimer:
      number | null = null;

    function capture() {
      captureStudioNavigationState();
    }

    function scheduleCapture() {
      if (captureTimer !== null) {
        window.clearTimeout(
          captureTimer
        );
      }

      captureTimer =
        window.setTimeout(() => {
          captureTimer = null;
          capture();
        }, SCROLL_CAPTURE_DELAY_MS);
    }

    function beforeUnload(
      event: BeforeUnloadEvent
    ) {
      capture();

      if (
        !hasUnsavedStudioChanges()
      ) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "scroll",
      scheduleCapture,
      {
        passive: true
      }
    );

    window.addEventListener(
      "scrollend",
      capture
    );

    window.addEventListener(
      "pagehide",
      capture
    );

    window.addEventListener(
      "beforeunload",
      beforeUnload
    );

    document.addEventListener(
      "focusin",
      scheduleCapture,
      true
    );

    document.addEventListener(
      "input",
      scheduleCapture,
      true
    );

    document.addEventListener(
      "selectionchange",
      scheduleCapture
    );

    return () => {
      if (captureTimer !== null) {
        window.clearTimeout(
          captureTimer
        );
      }

      window.removeEventListener(
        "scroll",
        scheduleCapture
      );

      window.removeEventListener(
        "scrollend",
        capture
      );

      window.removeEventListener(
        "pagehide",
        capture
      );

      window.removeEventListener(
        "beforeunload",
        beforeUnload
      );

      document.removeEventListener(
        "focusin",
        scheduleCapture,
        true
      );

      document.removeEventListener(
        "input",
        scheduleCapture,
        true
      );

      document.removeEventListener(
        "selectionchange",
        scheduleCapture
      );
    };
  }, [routeKey]);

  useEffect(() => {
    function onPointerDown(
      event: PointerEvent
    ) {
      const target =
        event.target instanceof Element
          ? event.target
          : null;

      const anchor =
        target?.closest<HTMLAnchorElement>(
          "a[href]"
        );

      if (
        !anchor ||
        !anchor.closest(
          "[data-studio-root]"
        ) ||
        !internalStudioUrl(anchor)
      ) {
        return;
      }

      captureStudioNavigationState();
    }

    function onSubmit(
      event: SubmitEvent
    ) {
      const form =
        event.target instanceof
          HTMLFormElement
          ? event.target
          : null;

      if (
        form?.closest(
          "[data-studio-root]"
        )
      ) {
        captureStudioNavigationState();
      }
    }

    function onClick(
      event: MouseEvent
    ) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target
          : null;

      const anchor =
        target?.closest<HTMLAnchorElement>(
          "a[href]"
        );

      if (
        !anchor ||
        !anchor.closest(
          "[data-studio-root]"
        )
      ) {
        return;
      }

      const url =
        internalStudioUrl(anchor);

      if (!url) {
        return;
      }

      const current =
        new URL(
          window.location.href
        );

      if (
        url.pathname ===
          current.pathname &&
        url.search ===
          current.search &&
        url.hash !==
          current.hash
      ) {
        return;
      }

      event.preventDefault();

      if (
        navigationPending.current
      ) {
        return;
      }

      navigationPending.current =
        true;

      void (async () => {
        try {
          await flushStudioNavigationQueues();

          captureStudioNavigationState();

          router.push(
            `${url.pathname}${url.search}${url.hash}`,
            {
              scroll: false
            }
          );
        } catch (error) {
          window.dispatchEvent(
            new CustomEvent(
              "studio:navigation-blocked",
              {
                detail: error
              }
            )
          );
        } finally {
          navigationPending.current =
            false;
        }
      })();
    }

    document.addEventListener(
      "pointerdown",
      onPointerDown,
      true
    );

    document.addEventListener(
      "submit",
      onSubmit,
      true
    );

    document.addEventListener(
      "click",
      onClick,
      true
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        onPointerDown,
        true
      );

      document.removeEventListener(
        "submit",
        onSubmit,
        true
      );

      document.removeEventListener(
        "click",
        onClick,
        true
      );
    };
  }, [router]);

  return null;
}
