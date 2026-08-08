"use client";

import {
  useEffect,
  useId,
  useRef,
  useState
} from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

type ConfirmDestructiveActionProps = {
  title: string;
  description: string;
  triggerLabel: string;
  confirmLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  triggerClassName?: string;
  confirmClassName?: string;
  submitName?: string;
  submitValue?: string;
  onConfirm?: () =>
    | void
    | Promise<void>;
};

export function ConfirmDestructiveAction({
  title,
  description,
  triggerLabel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  disabled,
  triggerClassName =
    "button-secondary",
  confirmClassName =
    "button-primary",
  submitName,
  submitValue,
  onConfirm
}: ConfirmDestructiveActionProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const triggerRef =
    useRef<HTMLButtonElement>(null);

  const submitRef =
    useRef<HTMLButtonElement>(null);

  const dialogRef =
    useRef<HTMLDivElement>(null);

  const cancelRef =
    useRef<HTMLButtonElement>(null);

  const returnFocusRef =
    useRef<HTMLElement | null>(null);

  const [open, setOpen] =
    useState(false);

  const [confirming, setConfirming] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    returnFocusRef.current =
      document.activeElement instanceof
        HTMLElement
        ? document.activeElement
        : triggerRef.current;

    const frame =
      window.requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });

    function onKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (!confirming) {
          setOpen(false);
        }

        return;
      }

      if (
        event.key !== "Tab" ||
        !dialogRef.current
      ) {
        return;
      }

      const focusable = [
        ...dialogRef.current.querySelectorAll<
          HTMLElement
        >(FOCUSABLE_SELECTOR)
      ];

      const first = focusable[0];
      const last =
        focusable[
          focusable.length - 1
        ];

      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (
        event.shiftKey &&
        document.activeElement ===
          first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement ===
          last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      window.cancelAnimationFrame(
        frame
      );

      document.removeEventListener(
        "keydown",
        onKeyDown
      );

      const target =
        returnFocusRef.current;

      window.requestAnimationFrame(() => {
        if (target?.isConnected) {
          target.focus();
        }
      });
    };
  }, [confirming, open]);

  async function confirm() {
    if (confirming) {
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      if (onConfirm) {
        await onConfirm();
        setOpen(false);
        return;
      }

      const submitter =
        submitRef.current;

      const form =
        submitter?.form ??
        triggerRef.current?.form;

      if (
        !form ||
        !submitter
      ) {
        throw new Error(
          "Destructive confirmation is not attached to a form."
        );
      }

      setOpen(false);
      form.requestSubmit(submitter);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The destructive action could not be started."
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <button
        className={triggerClassName}
        data-audit-confirm-trigger={title}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel}
      </button>

      <button
        hidden
        name={submitName}
        ref={submitRef}
        type="submit"
        value={submitValue}
      />

      {open ? (
        <div className="inline-url-dialog-shell">
          <button
            aria-label={`Close ${title}`}
            className="inline-url-dialog-backdrop"
            disabled={confirming}
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          />

          <div
            aria-describedby={
              error
                ? `${descriptionId} ${errorId}`
                : descriptionId
            }
            aria-labelledby={titleId}
            aria-modal="true"
            className="inline-url-dialog"
            ref={dialogRef}
            role="dialog"
          >
            <strong id={titleId}>
              {title}
            </strong>

            <p
              className="muted-copy"
              id={descriptionId}
            >
              {description}
            </p>

            {error ? (
              <p
                className="error-copy"
                id={errorId}
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="hero-actions">
              <button
                className="button-secondary"
                disabled={confirming}
                onClick={() => {
                  setOpen(false);
                }}
                ref={cancelRef}
                type="button"
              >
                {cancelLabel}
              </button>

              <button
                className={confirmClassName}
                disabled={confirming}
                onClick={() => {
                  void confirm();
                }}
                type="button"
              >
                {confirming
                  ? "Working…"
                  : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
