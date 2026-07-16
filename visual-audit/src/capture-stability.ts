export type ScrollSurfaceGeometry = {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
};

export const SCROLL_CAPTURE_STABILITY_CSS = `
  [data-audit-original-content-visibility="auto"] {
    content-visibility: visible !important;
    contain-intrinsic-size: none !important;
  }
`;

export function changedScrollSurfaceDimensions(
  expected: ScrollSurfaceGeometry,
  actual: ScrollSurfaceGeometry
) {
  return (["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"] as const)
    .filter((key) => expected[key] !== actual[key]);
}

export type InlineFieldIdentity = {
  resource: string;
  field: string;
  id: string | null;
  index: string | null;
  occurrence: number;
  urlField: boolean;
};

function cssAttributeValue(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\a ")
    .replaceAll("\r", "\\d ");
}

export function inlineFieldSelector(identity: InlineFieldIdentity) {
  const attributes = [
    `[data-inline-edit-resource="${cssAttributeValue(identity.resource)}"]`,
    `[data-inline-edit-field="${cssAttributeValue(identity.field)}"]`,
    identity.id === null
      ? ":not([data-inline-edit-id])"
      : `[data-inline-edit-id="${cssAttributeValue(identity.id)}"]`,
    identity.index === null
      ? ":not([data-inline-edit-index])"
      : `[data-inline-edit-index="${cssAttributeValue(identity.index)}"]`
  ];
  return attributes.join("");
}
