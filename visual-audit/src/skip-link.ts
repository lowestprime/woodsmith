export type SkipLinkFocusEvidence = {
  focused: boolean;
  visible: boolean;
  intersectsViewport: boolean;
  target: string;
};

export function assertFocusedSkipLink(evidence: SkipLinkFocusEvidence) {
  if (!evidence.focused) throw new Error("Tab did not focus the skip link.");
  if (!evidence.visible) throw new Error("The focused skip link is not visually rendered.");
  if (!evidence.intersectsViewport) throw new Error("The focused skip link does not intersect the viewport.");
  if (evidence.target !== "#main-content") throw new Error("The skip link does not target #main-content.");
}

export function assertMainFocusTransferred(activeElementId: string | null) {
  if (activeElementId !== "main-content") {
    throw new Error("Activating the skip link did not transfer focus to #main-content.");
  }
}
