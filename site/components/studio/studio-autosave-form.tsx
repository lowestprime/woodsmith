"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type FocusEventHandler,
  type FormEventHandler,
  type ReactNode
} from "react";

import {
  STUDIO_AUTOSAVE_DEBOUNCE_MS,
  StudioMutationQueue,
  type StudioMutationQueueOptions,
  type StudioMutationRequest,
  type StudioMutationResult,
  type StudioMutationSnapshot
} from "@/lib/studio-mutations";

import {
  registerStudioNavigationFlushable
} from "@/components/studio/studio-navigation-state";

import {
  StudioSaveStatus
} from "@/components/studio/studio-save-status";

type NativeFormProps =
  Omit<
    ComponentPropsWithoutRef<"form">,
    | "action"
    | "onBlur"
    | "onChange"
    | "onInput"
    | "onSubmit"
  >;

type PendingPayload<TPayload> =
  | {
      hasValue: false;
    }
  | {
      hasValue: true;
      value: TPayload;
    };

export type StudioAutosaveFormProps<
  TPayload = FormData,
  TEntity = unknown
> = NativeFormProps & {
  children: ReactNode;
  entityKey: string;
  expectedUpdatedAt?: string | null;
  mutate: (
    request:
      StudioMutationRequest<TPayload>
  ) => Promise<
    StudioMutationResult<TEntity>
  >;
  createPayload?: (
    form: HTMLFormElement
  ) => TPayload;
  coalesce?:
    StudioMutationQueueOptions<
      TPayload,
      TEntity
    >["coalesce"];
  retryDelaysMs?:
    readonly number[];
  onBlur?: FocusEventHandler<
    HTMLFormElement
  >;
  onChange?: FormEventHandler<
    HTMLFormElement
  >;
  onInput?: FormEventHandler<
    HTMLFormElement
  >;
  onSubmit?: FormEventHandler<
    HTMLFormElement
  >;
  onQueue?: (
    queue:
      StudioMutationQueue<
        TPayload,
        TEntity
      >
  ) => void;
  onStatus?: (
    snapshot:
      StudioMutationSnapshot<TEntity>
  ) => void;
  showStatus?: boolean;
  statusActions?: ReactNode;
  statusClassName?: string;
  statusIdleLabel?: string;
};

type AutosaveInputMode =
  | "debounced"
  | "immediate"
  | "ignored";

function inputMode(
  target: EventTarget | null
): AutosaveInputMode {
  if (
    target instanceof HTMLElement &&
    target.closest(
      '[data-studio-autosave="ignore"]'
    )
  ) {
    return "ignored";
  }

  if (
    target instanceof
      HTMLTextAreaElement
  ) {
    return "debounced";
  }

  if (
    target instanceof
      HTMLSelectElement
  ) {
    return "immediate";
  }

  if (
    !(target instanceof
      HTMLInputElement)
  ) {
    return "ignored";
  }

  if (
    [
      "button",
      "file",
      "hidden",
      "image",
      "reset",
      "submit"
    ].includes(target.type)
  ) {
    return "ignored";
  }

  if (
    [
      "checkbox",
      "color",
      "date",
      "datetime-local",
      "month",
      "radio",
      "range",
      "time",
      "week"
    ].includes(target.type)
  ) {
    return "immediate";
  }

  return "debounced";
}

function defaultPayload(
  form: HTMLFormElement
): FormData {
  return new FormData(form);
}

export function StudioAutosaveForm<
  TPayload = FormData,
  TEntity = unknown
>({
  children,
  entityKey,
  expectedUpdatedAt = null,
  mutate,
  createPayload,
  coalesce,
  retryDelaysMs,
  onBlur,
  onChange,
  onInput,
  onSubmit,
  onQueue,
  onStatus,
  showStatus = true,
  statusActions,
  statusClassName,
  statusIdleLabel,
  className,
  ...formProps
}: StudioAutosaveFormProps<
  TPayload,
  TEntity
>) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const timerRef =
    useRef<number | null>(null);

  const pendingPayloadRef =
    useRef<PendingPayload<TPayload>>({
      hasValue: false
    });

  const payloadFactory =
    useCallback(
      (form: HTMLFormElement) => {
        if (createPayload) {
          return createPayload(form);
        }

        return defaultPayload(
          form
        ) as TPayload;
      },
      [createPayload]
    );

  const queue = useMemo(() => {
    if (!entityKey.trim()) {
      throw new Error(
        "StudioAutosaveForm requires a nonempty entityKey."
      );
    }

    return new StudioMutationQueue<
      TPayload,
      TEntity
    >({
      mutate,
      // Canonical versions are synchronized below. Keeping them out of
      // queue construction preserves the visible saved state after a
      // parent adopts the server's updated record.
      expectedUpdatedAt: null,
      coalesce,
      retryDelaysMs
    });
  }, [
    coalesce,
    entityKey,
    mutate,
    retryDelaysMs
  ]);

  const subscribeToQueue =
    useCallback(
      (notify: () => void) =>
        queue.subscribe(() => {
          notify();
        }),
      [queue]
    );

  const getQueueSnapshot =
    useCallback(
      () => queue.getSnapshot(),
      [queue]
    );

  const snapshot =
    useSyncExternalStore(
      subscribeToQueue,
      getQueueSnapshot,
      getQueueSnapshot
    );

  useEffect(() => {
    onStatus?.(snapshot);
  }, [onStatus, snapshot]);

  const cancelTimer =
    useCallback(() => {
      if (timerRef.current !== null) {
        window.clearTimeout(
          timerRef.current
        );

        timerRef.current = null;
      }
    }, []);

  const captureCurrent =
    useCallback(():
      PendingPayload<TPayload> => {
      const form = formRef.current;

      if (!form) {
        return {
          hasValue: false
        };
      }

      return {
        hasValue: true,
        value: payloadFactory(form)
      };
    }, [payloadFactory]);

  const stageCurrent =
    useCallback(() => {
      const pending =
        captureCurrent();

      if (!pending.hasValue) {
        return false;
      }

      pendingPayloadRef.current =
        pending;

      return true;
    }, [captureCurrent]);

  const enqueuePending =
    useCallback(() => {
      cancelTimer();

      const pending =
        pendingPayloadRef.current;

      if (!pending.hasValue) {
        return false;
      }

      const current =
        captureCurrent();

      const payload =
        current.hasValue
          ? current.value
          : pending.value;

      pendingPayloadRef.current = {
        hasValue: false
      };

      queue.enqueue(
        payload
      );

      return true;
    }, [
      cancelTimer,
      captureCurrent,
      queue
    ]);

  const enqueueCurrent =
    useCallback(() => {
      if (!stageCurrent()) {
        return false;
      }

      return enqueuePending();
    }, [
      enqueuePending,
      stageCurrent
    ]);

  const flushPending =
    useCallback(async () => {
      enqueuePending();
      await queue.flush();
    }, [enqueuePending, queue]);

  const forceFlushCurrent =
    useCallback(async () => {
      stageCurrent();
      await flushPending();
    }, [
      flushPending,
      stageCurrent
    ]);

  const scheduleCurrent =
    useCallback(() => {
      if (!stageCurrent()) {
        return;
      }

      cancelTimer();

      timerRef.current =
        window.setTimeout(() => {
          timerRef.current = null;
          enqueuePending();
        }, STUDIO_AUTOSAVE_DEBOUNCE_MS);
    }, [
      cancelTimer,
      enqueuePending,
      stageCurrent
    ]);

  useEffect(() => {
    queue.updateExpectedUpdatedAt(
      expectedUpdatedAt
    );
  }, [expectedUpdatedAt, queue]);

  useEffect(() => {
    onQueue?.(queue);
  }, [onQueue, queue]);

  useEffect(() => {
    const unregister =
      registerStudioNavigationFlushable({
        flush: flushPending,
        hasUnsavedChanges: () =>
          pendingPayloadRef.current
            .hasValue ||
          queue.hasUnsavedChanges()
      });

    return () => {
      unregister();
      enqueuePending();
      void queue.flush();
    };
  }, [
    enqueuePending,
    flushPending,
    queue
  ]);

  const busy =
    snapshot.phase === "saving" ||
    snapshot.phase === "retrying";

  return (
    <form
      {...formProps}
      aria-busy={busy}
      className={className}
      data-studio-autosave="true"
      data-studio-entity-key={entityKey}
      onBlur={(event) => {
        onBlur?.(event);

        if (
          inputMode(event.target) ===
          "debounced"
        ) {
          void flushPending();
        }
      }}
      onChange={(event) => {
        onChange?.(event);

        if (
          inputMode(event.target) ===
          "immediate"
        ) {
          enqueueCurrent();
        }
      }}
      onInput={(event) => {
        onInput?.(event);

        if (
          inputMode(event.target) ===
          "debounced"
        ) {
          scheduleCurrent();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
        void forceFlushCurrent();
      }}
      ref={formRef}
    >
      {children}

      {showStatus ? (
        <StudioSaveStatus
          actions={statusActions}
          className={statusClassName}
          idleLabel={statusIdleLabel}
          snapshot={snapshot}
        />
      ) : null}
    </form>
  );
}
