export function isVisualAuditReadOnlyMutation(
  readOnlyHeader: string | null | undefined,
  method: string
) {
  return readOnlyHeader === "1" && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
