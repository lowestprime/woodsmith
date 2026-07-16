export function setInlineNavigationGuard(
  element: HTMLElement,
  enabled: boolean,
  listener: EventListener,
) {
  const anchor = element.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;

  if (enabled) anchor.addEventListener("click", listener, true);
  else anchor.removeEventListener("click", listener, true);
}
