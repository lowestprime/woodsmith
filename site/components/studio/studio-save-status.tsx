"use client";

import type { ReactNode } from "react";
import type { StudioMutationSnapshot } from "@/lib/studio-mutations";

type StudioSaveStatusProps<TEntity> = {
  snapshot: StudioMutationSnapshot<TEntity>;
  actions?: ReactNode;
  className?: string;
  idleLabel?: string;
};

function statusClassName(
  phase: StudioMutationSnapshot<unknown>["phase"]
): string {
  if (
    phase === "saving" ||
    phase === "retrying"
  ) {
    return " is-pending";
  }

  if (
    phase === "conflict" ||
    phase === "error"
  ) {
    return " is-error";
  }

  return "";
}

export function StudioSaveStatus<TEntity>({
  snapshot,
  actions,
  className,
  idleLabel
}: StudioSaveStatusProps<TEntity>) {
  const label =
    snapshot.phase === "idle"
      ? idleLabel ?? ""
      : snapshot.label;

  if (
    !label &&
    !snapshot.detail &&
    !actions
  ) {
    return null;
  }

  const isError =
    snapshot.phase === "conflict" ||
    snapshot.phase === "error";

  const classes = [
    "studio-inline-notice",
    statusClassName(snapshot.phase),
    className ? ` ${className}` : ""
  ].join("");

  return (
    <div
      aria-atomic="true"
      aria-live={isError ? "assertive" : "polite"}
      className={classes}
      role={isError ? "alert" : "status"}
    >
      {label ? <strong>{label}</strong> : null}
      {snapshot.detail ? (
        <span>{snapshot.detail}</span>
      ) : null}
      {actions}
    </div>
  );
}
