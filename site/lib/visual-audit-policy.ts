export function isVisualAuditReadOnlyMutation(
  readOnlyHeader: string | null | undefined,
  method: string
) {
  return readOnlyHeader === "1" && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export const VISUAL_AUDIT_STUDIO_VIEWS = [
  {
    id: "overview-search-index",
    route: "/studio?panel=overview&view=search-index",
    modes: ["live-readonly", "snapshot-lab"],
    snapshotMutationStates: [
      "snapshot-lab-search-index-checked",
      "snapshot-lab-search-index-rebuilt"
    ]
  },
  {
    id: "projects-editor",
    route: "/studio?panel=projects&audit=all&view=editor",
    modes: ["live-readonly", "snapshot-lab"],
    snapshotMutationStates: [
      "snapshot-lab-project-autosave-roundtrip"
    ]
  },
  ...[
    "overview",
    "types",
    "templates",
    "delivery",
    "visitors",
    "audit",
    "smtp"
  ].map((view) => ({
    id: `notifications-${view}`,
    route: `/studio?panel=notifications&audit=all&view=${view}`,
    modes: ["live-readonly", "snapshot-lab"],
    snapshotMutationStates:
      view === "types"
        ? ["snapshot-lab-notification-policy-autosave-roundtrip"]
        : view === "templates"
          ? ["snapshot-lab-notification-template-autosave-roundtrip"]
          : view === "visitors"
            ? ["snapshot-lab-visitor-policy-autosave-roundtrip"]
            : []
  }))
] as const;
