import { createHash } from "node:crypto";

import type { AuthState, ThemeMode, ViewportProfile } from "./types.js";

export type SpecialInteractionGroup =
  | "interaction-suite"
  | "details"
  | "media-collections"
  | "lightboxes"
  | "media-pickers"
  | "inline-editing"
  | "studio-cards"
  | "audit-surfaces"
  | "confirmation-dialogs"
  | "form-validation"
  | "commission-visualizer"
  | "media-inspectors"
  | "element-atlas";

export type SuiteInteractionGroup = Exclude<
  SpecialInteractionGroup,
  "interaction-suite" | "media-inspectors" | "element-atlas"
>;

export type SpecialTask = {
  key: string;
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
  group: SpecialInteractionGroup;
  rangeStart: number | null;
  rangeEnd: number | null;
};

const singletonGroups: SuiteInteractionGroup[] = [
  "details",
  "media-collections",
  "lightboxes",
  "media-pickers",
  "inline-editing",
  "studio-cards",
  "audit-surfaces",
  "confirmation-dialogs",
  "form-validation",
  "commission-visualizer"
];

const anonymousSingletonGroups = new Set<SuiteInteractionGroup>([
  "details",
  "media-collections",
  "lightboxes",
  "form-validation",
  "commission-visualizer"
]);

const allInteractionGroups: readonly SpecialInteractionGroup[] = [
  "interaction-suite",
  ...singletonGroups,
  "media-inspectors",
  "element-atlas"
];

export function interactionSuiteGroups(auth: AuthState): readonly SuiteInteractionGroup[] {
  return auth === "anonymous"
    ? singletonGroups.filter((group) => anonymousSingletonGroups.has(group))
    : [...singletonGroups];
}

function rangeTasks(input: {
  auth: AuthState;
  route: string;
  theme: ThemeMode;
  viewport: string;
  group: SpecialInteractionGroup;
  total: number;
  size: number;
}) {
  const tasks: Omit<SpecialTask, "key">[] = [];
  for (let start = 0; start < input.total; start += input.size) {
    tasks.push({
      auth: input.auth,
      route: input.route,
      theme: input.theme,
      viewport: input.viewport,
      group: input.group,
      rangeStart: start,
      rangeEnd: Math.min(input.total, start + input.size)
    });
  }
  return tasks;
}

function withKey(task: Omit<SpecialTask, "key">): SpecialTask {
  const identity = [
    task.auth,
    task.route,
    task.theme,
    task.viewport,
    task.group,
    task.rangeStart ?? "all",
    task.rangeEnd ?? "all"
  ].join("::");
  return {
    ...task,
    key: `special-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`
  };
}

export function buildSpecialTaskPlan(input: {
  auth: AuthState;
  routes: readonly string[];
  profile: ViewportProfile;
  theme: ThemeMode;
  mediaItemsPerPage?: number;
  mediaInspectorBatchSize?: number;
  elementAtlasLimit?: number;
  elementAtlasBatchSize?: number;
}) {
  const mediaItemsPerPage = input.mediaItemsPerPage ?? 48;
  const mediaInspectorBatchSize = input.mediaInspectorBatchSize ?? 8;
  const elementAtlasLimit = input.elementAtlasLimit ?? 48;
  const elementAtlasBatchSize = input.elementAtlasBatchSize ?? 12;
  if ([mediaItemsPerPage, mediaInspectorBatchSize, elementAtlasLimit, elementAtlasBatchSize]
    .some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error("Special-task range values must be positive safe integers.");
  }

  const tasks: SpecialTask[] = [];
  for (const route of [...new Set(input.routes)].sort()) {
    const base = { auth: input.auth, route, theme: input.theme, viewport: input.profile.name };
    const groups = interactionSuiteGroups(input.auth);
    if (groups.length > 0) tasks.push(withKey({
      ...base,
      group: "interaction-suite",
      rangeStart: null,
      rangeEnd: null
    }));
    if (new URL(route, "https://audit.invalid").searchParams.get("panel") === "media") {
      tasks.push(...rangeTasks({
        ...base,
        group: "media-inspectors",
        total: mediaItemsPerPage,
        size: mediaInspectorBatchSize
      }).map(withKey));
    }
    tasks.push(...rangeTasks({
      ...base,
      group: "element-atlas",
      total: elementAtlasLimit,
      size: elementAtlasBatchSize
    }).map(withKey));
  }
  return tasks.sort((left, right) => left.key.localeCompare(right.key));
}

export function partitionSpecialTasks(tasks: readonly SpecialTask[], shardIndex: number, shardCount: number) {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1) throw new Error("Shard count must be a positive safe integer.");
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) {
    throw new Error("Shard index must be within the configured shard count.");
  }
  return tasks.filter((task) => Number.parseInt(task.key.slice(-8), 16) % shardCount === shardIndex);
}

export function specialTaskGroupCounts(tasks: readonly SpecialTask[]): Record<SpecialInteractionGroup, number> {
  const counts = Object.fromEntries(allInteractionGroups.map((group) => [group, 0])) as Record<SpecialInteractionGroup, number>;
  for (const task of tasks) counts[task.group] += 1;
  return counts;
}
