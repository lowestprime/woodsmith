"use client";

import { type FormEventHandler, type ReactNode, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MediaActionResult } from "@/lib/actions";

type ActionFormSuccessContext = {
  form: HTMLFormElement | null;
  formData: FormData | null;
};

type ActionFormProps = {
  action: (state: MediaActionResult | null, formData: FormData) => Promise<MediaActionResult>;
  className?: string;
  confirmMessage?: string;
  children: ReactNode;
  onInput?: FormEventHandler<HTMLFormElement>;
  resetOnSuccess?: boolean;
  refreshOnSuccess?: boolean;
  onSuccess?: (result: Extract<MediaActionResult, { ok: true }>, context: ActionFormSuccessContext) => void;
  successLabel?: (result: Extract<MediaActionResult, { ok: true }>) => string;
};

function describe(result: Extract<MediaActionResult, { ok: true }>): string {
  if (result.kind === "upload") return `Uploaded ${result.relativePath}`;
  if (result.kind === "rename") return `Renamed to ${result.relativePath}`;
  if (result.kind === "delete") return `Deleted ${result.relativePath}`;
  if (result.kind === "assign") return `Assigned to ${result.pieceSlug}`;
  if (result.kind === "cleanup") return `Cleaned copy created: ${result.relativePath}`;
  if (result.kind === "save") return `Saved metadata for ${result.relativePath}`;
  if (result.kind === "refresh") return "Media library refreshed.";
  return "Done.";
}

export function ActionForm({
  action,
  className,
  confirmMessage,
  children,
  onInput,
  resetOnSuccess,
  refreshOnSuccess = false,
  onSuccess,
  successLabel,
}: ActionFormProps) {
  const [state, formAction, isPending] = useActionState<MediaActionResult | null, FormData>(action, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handledState = useRef<MediaActionResult | null>(null);
  const submittedDataRef = useRef<FormData | null>(null);

  useEffect(() => {
    if (!state || !state.ok) return;
    if (handledState.current === state) return;
    handledState.current = state;
    onSuccess?.(state, { form: formRef.current, formData: submittedDataRef.current });
    if (resetOnSuccess && formRef.current) {
      formRef.current.reset();
    }
    if (refreshOnSuccess) {
      router.refresh();
    }
  }, [state, onSuccess, resetOnSuccess, refreshOnSuccess, router]);

  const notice = state
    ? state.ok
      ? successLabel ? successLabel(state) : describe(state)
      : state.message
    : null;

  return (
    <form
      action={formAction}
      aria-busy={isPending}
      className={className}
      onInput={onInput}
      onSubmit={(event) => {
        if (isPending) {
          event.preventDefault();
          return;
        }
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        submittedDataRef.current = formRef.current
          ? new FormData(formRef.current, submitter instanceof HTMLElement ? submitter : undefined)
          : null;
      }}
      ref={formRef}
    >
      {children}
      {notice ? (
        <p
          aria-live="polite"
          className={`studio-inline-notice${state && !state.ok ? " is-error" : ""}${isPending ? " is-pending" : ""}`}
          role={state && !state.ok ? "alert" : undefined}
        >
          {isPending ? "Working…" : notice}
        </p>
      ) : isPending ? (
        <p aria-live="polite" className="studio-inline-notice is-pending">Working…</p>
      ) : null}
    </form>
  );
}
