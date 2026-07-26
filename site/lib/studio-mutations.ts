export const STUDIO_AUTOSAVE_DEBOUNCE_MS = 650;

export const STUDIO_MUTATION_RETRY_DELAYS_MS = [
  250,
  750,
  2_000
] as const;

export type StudioMutationFailureCode =
  | "validation"
  | "conflict"
  | "authorization"
  | "transient";

export type StudioMutationResult<TEntity> =
  | {
      ok: true;
      entity: TEntity;
      updatedAt: string;
      operationId: string;
      auditId: string;
    }
  | {
      ok: false;
      code: StudioMutationFailureCode;
      message: string;
      current?: TEntity;
    };

export type StudioMutationRequest<TPayload> = {
  payload: TPayload;
  operationId: string;
  expectedUpdatedAt: string | null;
};

export type StudioMutationPhase =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "retrying"
  | "conflict"
  | "error";

export type StudioMutationSnapshot<TEntity> = {
  phase: StudioMutationPhase;
  label: string;
  detail: string | null;
  attempt: number;
  operationId: string | null;
  expectedUpdatedAt: string | null;
  hasUnsavedChanges: boolean;
  currentEntity?: TEntity;
};

export type StudioMutationQueueOptions<
  TPayload,
  TEntity
> = {
  mutate: (
    request: StudioMutationRequest<TPayload>
  ) => Promise<StudioMutationResult<TEntity>>;
  expectedUpdatedAt?: string | null;
  coalesce?: (
    previous: TPayload,
    next: TPayload
  ) => TPayload;
  createOperationId?: () => string;
  retryDelaysMs?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
  isTransientError?: (error: unknown) => boolean;
  onStatus?: (
    snapshot: StudioMutationSnapshot<TEntity>
  ) => void;
};

const STATUS_LABELS: Record<
  StudioMutationPhase,
  string
> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  retrying: "Offline — retrying",
  conflict: "Conflict — reload/compare",
  error: "Save failed"
};

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT"
]);

export function studioMutationStatusLabel(
  phase: StudioMutationPhase
): string {
  return STATUS_LABELS[phase];
}

export function mergeStudioMutationPatch<
  TPatch extends Record<string, unknown>
>(
  previous: TPatch,
  next: TPatch
): TPatch {
  return {
    ...previous,
    ...next
  };
}

export function isTransientStudioMutationError(
  error: unknown
): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (
    !error ||
    typeof error !== "object"
  ) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
  };

  return (
    typeof candidate.code === "string" &&
    TRANSIENT_ERROR_CODES.has(candidate.code)
  );
}

function defaultOperationId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    "studio",
    Date.now().toString(36),
    Math.random().toString(36).slice(2)
  ].join("-");
}

function defaultSleep(
  milliseconds: number
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function errorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  return String(
    error ||
    "Studio mutation failed."
  );
}

/**
 * Serial mutation queue for one stable Studio entity.
 *
 * Payloads must be immutable snapshots. By default, a newer queued
 * payload replaces an older queued payload. Callers using partial
 * patches can provide mergeStudioMutationPatch as the coalescer.
 */
export class StudioMutationQueue<
  TPayload,
  TEntity
> {
  private readonly mutate: (
    request: StudioMutationRequest<TPayload>
  ) => Promise<StudioMutationResult<TEntity>>;

  private readonly coalesce: (
    previous: TPayload,
    next: TPayload
  ) => TPayload;

  private readonly createOperationId: () => string;

  private readonly retryDelaysMs: readonly number[];

  private readonly sleep: (
    milliseconds: number
  ) => Promise<void>;

  private readonly isTransientError: (
    error: unknown
  ) => boolean;

  private readonly onStatus:
    | ((
        snapshot: StudioMutationSnapshot<TEntity>
      ) => void)
    | undefined;

  private readonly listeners = new Set<
    (
      snapshot: StudioMutationSnapshot<TEntity>
    ) => void
  >();

  private expectedUpdatedAt: string | null;

  private pendingPayload: TPayload | undefined;

  private blockedPayload: TPayload | undefined;

  private drainPromise: Promise<void> | null = null;

  private snapshot: StudioMutationSnapshot<TEntity>;

  constructor(
    options: StudioMutationQueueOptions<
      TPayload,
      TEntity
    >
  ) {
    this.mutate = options.mutate;

    this.coalesce =
      options.coalesce ??
      ((_previous, next) => next);

    this.createOperationId =
      options.createOperationId ??
      defaultOperationId;

    this.retryDelaysMs =
      options.retryDelaysMs ??
      STUDIO_MUTATION_RETRY_DELAYS_MS;

    this.sleep =
      options.sleep ??
      defaultSleep;

    this.isTransientError =
      options.isTransientError ??
      isTransientStudioMutationError;

    this.onStatus = options.onStatus;

    this.expectedUpdatedAt =
      options.expectedUpdatedAt ??
      null;

    this.snapshot = {
      phase: "idle",
      label: studioMutationStatusLabel("idle"),
      detail: null,
      attempt: 0,
      operationId: null,
      expectedUpdatedAt: this.expectedUpdatedAt,
      hasUnsavedChanges: false
    };
  }

  getSnapshot(): StudioMutationSnapshot<TEntity> {
    // React external-store readers require stable identity
    // until the queue emits a genuinely new snapshot.
    return this.snapshot;
  }

  getExpectedUpdatedAt(): string | null {
    return this.expectedUpdatedAt;
  }

  getUnsavedPayload(): TPayload | undefined {
    return (
      this.blockedPayload ??
      this.pendingPayload
    );
  }

  hasUnsavedChanges(): boolean {
    return (
      this.pendingPayload !== undefined ||
      this.blockedPayload !== undefined ||
      this.snapshot.phase === "saving" ||
      this.snapshot.phase === "retrying"
    );
  }

  subscribe(
    listener: (
      snapshot: StudioMutationSnapshot<TEntity>
    ) => void
  ): () => void {
    this.listeners.add(listener);

    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  updateExpectedUpdatedAt(
    expectedUpdatedAt: string | null
  ): void {
    this.expectedUpdatedAt = expectedUpdatedAt;

    this.emit({
      expectedUpdatedAt
    });
  }

  enqueue(payload: TPayload): void {
    if (this.blockedPayload !== undefined) {
      this.blockedPayload = this.coalesce(
        this.blockedPayload,
        payload
      );

      this.emit({
        hasUnsavedChanges: true
      });

      return;
    }

    this.pendingPayload =
      this.pendingPayload === undefined
        ? payload
        : this.coalesce(
            this.pendingPayload,
            payload
          );

    if (
      this.snapshot.phase !== "saving" &&
      this.snapshot.phase !== "retrying"
    ) {
      this.emit({
        phase: "dirty",
        detail: null,
        attempt: 0,
        operationId: null,
        hasUnsavedChanges: true,
        currentEntity: undefined
      });
    } else {
      this.emit({
        hasUnsavedChanges: true
      });
    }

    void this.ensureDrain();
  }

  async flush(): Promise<
    StudioMutationSnapshot<TEntity>
  > {
    while (true) {
      const active =
        this.drainPromise ??
        (
          this.pendingPayload !== undefined &&
          this.blockedPayload === undefined
            ? this.ensureDrain()
            : null
        );

      if (!active) {
        return this.getSnapshot();
      }

      await active;

      if (
        this.blockedPayload !== undefined ||
        (
          this.pendingPayload === undefined &&
          this.drainPromise === null
        )
      ) {
        return this.getSnapshot();
      }
    }
  }

  async retryUnsaved(
    options: {
      expectedUpdatedAt?: string | null;
    } = {}
  ): Promise<StudioMutationSnapshot<TEntity>> {
    if (
      Object.prototype.hasOwnProperty.call(
        options,
        "expectedUpdatedAt"
      )
    ) {
      this.expectedUpdatedAt =
        options.expectedUpdatedAt ??
        null;
    }

    if (this.blockedPayload === undefined) {
      return this.flush();
    }

    const payload = this.blockedPayload;

    this.blockedPayload = undefined;

    this.pendingPayload =
      this.pendingPayload === undefined
        ? payload
        : this.coalesce(
            payload,
            this.pendingPayload
          );

    this.emit({
      phase: "dirty",
      detail: null,
      attempt: 0,
      operationId: null,
      expectedUpdatedAt: this.expectedUpdatedAt,
      hasUnsavedChanges: true,
      currentEntity: undefined
    });

    void this.ensureDrain();

    return this.flush();
  }

  discardUnsaved(): void {
    this.pendingPayload = undefined;
    this.blockedPayload = undefined;

    this.emit({
      phase: "idle",
      detail: null,
      attempt: 0,
      operationId: null,
      hasUnsavedChanges: false,
      currentEntity: undefined
    });
  }

  private ensureDrain(): Promise<void> {
    if (this.drainPromise) {
      return this.drainPromise;
    }

    const run = this.drain();

    this.drainPromise = run;

    void run.finally(() => {
      if (this.drainPromise === run) {
        this.drainPromise = null;
      }

      if (
        this.pendingPayload !== undefined &&
        this.blockedPayload === undefined
      ) {
        void this.ensureDrain();
      }
    });

    return run;
  }

  private async drain(): Promise<void> {
    while (
      this.pendingPayload !== undefined &&
      this.blockedPayload === undefined
    ) {
      const payload = this.pendingPayload;

      this.pendingPayload = undefined;

      const saved = await this.execute(payload);

      if (!saved) {
        return;
      }
    }
  }

  private async execute(
    payload: TPayload
  ): Promise<boolean> {
    const operationId =
      this.createOperationId();

    let attempt = 0;

    while (true) {
      this.emit({
        phase:
          attempt === 0
            ? "saving"
            : "retrying",
        detail: null,
        attempt,
        operationId,
        expectedUpdatedAt:
          this.expectedUpdatedAt,
        hasUnsavedChanges: true,
        currentEntity: undefined
      });

      try {
        const result = await this.mutate({
          payload,
          operationId,
          expectedUpdatedAt:
            this.expectedUpdatedAt
        });

        if (result.ok) {
          this.expectedUpdatedAt =
            result.updatedAt;

          this.emit({
            phase: "saved",
            detail: null,
            attempt,
            operationId:
              result.operationId,
            expectedUpdatedAt:
              result.updatedAt,
            hasUnsavedChanges:
              this.pendingPayload !== undefined,
            currentEntity:
              result.entity
          });

          return true;
        }

        if (
          result.code === "transient" &&
          attempt < this.retryDelaysMs.length
        ) {
          await this.waitForRetry(
            operationId,
            attempt,
            result.message
          );

          attempt += 1;
          continue;
        }

        this.block(
          payload,
          result.code === "conflict"
            ? "conflict"
            : "error",
          result.message,
          operationId,
          attempt,
          result.current
        );

        return false;
      } catch (error) {
        if (
          this.isTransientError(error) &&
          attempt < this.retryDelaysMs.length
        ) {
          await this.waitForRetry(
            operationId,
            attempt,
            errorMessage(error)
          );

          attempt += 1;
          continue;
        }

        this.block(
          payload,
          "error",
          errorMessage(error),
          operationId,
          attempt
        );

        return false;
      }
    }
  }

  private async waitForRetry(
    operationId: string,
    attempt: number,
    detail: string
  ): Promise<void> {
    this.emit({
      phase: "retrying",
      detail,
      attempt: attempt + 1,
      operationId,
      expectedUpdatedAt:
        this.expectedUpdatedAt,
      hasUnsavedChanges: true,
      currentEntity: undefined
    });

    await this.sleep(
      this.retryDelaysMs[attempt]
    );
  }

  private block(
    payload: TPayload,
    phase: "conflict" | "error",
    detail: string,
    operationId: string,
    attempt: number,
    currentEntity?: TEntity
  ): void {
    this.blockedPayload =
      this.pendingPayload === undefined
        ? payload
        : this.coalesce(
            payload,
            this.pendingPayload
          );

    this.pendingPayload = undefined;

    this.emit({
      phase,
      detail,
      attempt,
      operationId,
      expectedUpdatedAt:
        this.expectedUpdatedAt,
      hasUnsavedChanges: true,
      currentEntity
    });
  }

  private emit(
    patch: Partial<
      StudioMutationSnapshot<TEntity>
    >
  ): void {
    const phase =
      patch.phase ??
      this.snapshot.phase;

    this.snapshot = {
      ...this.snapshot,
      ...patch,
      phase,
      label:
        studioMutationStatusLabel(phase)
    };

    const snapshot = this.getSnapshot();

    try {
      this.onStatus?.(snapshot);
    } catch {
      // Presentation callbacks must not corrupt queue ordering.
    }

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Presentation listeners must not corrupt queue ordering.
      }
    }
  }
}

export type StudioServerMutationInput<TPatch> = {
  patch: TPatch;
  operationId: string;
  expectedUpdatedAt?: string | null;
};

export type StudioServerMutationCommit<TEntity> = {
  entity: TEntity;
  updatedAt: string;
  auditId: string;
};

type StudioMaybePromise<TValue> =
  | TValue
  | Promise<TValue>;

export type StudioServerMutationActor = {
  email: string;
};

export type StudioServerMutationAdapter<
  TPatch,
  TEntity
> = {
  authorize: () =>
    StudioMaybePromise<
      StudioServerMutationActor | null
    >;
  originAllowed: () =>
    StudioMaybePromise<boolean>;
  validate: (
    patch: TPatch
  ) => TPatch;
  transaction: (
    work: () =>
      StudioServerMutationCommit<TEntity>
  ) =>
    StudioServerMutationCommit<TEntity>;
  findCompletedOperation: (
    operationId: string,
    patch: TPatch
  ) =>
    | StudioServerMutationCommit<TEntity>
    | null;
  loadCurrent: (
    patch: TPatch
  ) => TEntity | null;
  save: (
    current: TEntity | null,
    patch: TPatch
  ) => TEntity;
  loadCanonical: (
    saved: TEntity,
    patch: TPatch
  ) => TEntity | null;
  updatedAt: (
    entity: TEntity
  ) => string;
  entityType: string;
  entityKey: (
    entity: TEntity,
    patch: TPatch
  ) => string;
  operation?: (
    current: TEntity | null,
    entity: TEntity,
    patch: TPatch
  ) => string;
  audit: (input: {
    actorEmail: string;
    entityType: string;
    entityKey: string;
    operation: string;
    before: TEntity | null;
    after: TEntity;
    requestId: string;
  }) => string;
  invalidate: (
    entity: TEntity,
    patch: TPatch
  ) => StudioMaybePromise<void>;
};

export class StudioMutationValidationError
  extends Error {
  readonly code = "validation" as const;

  constructor(message: string) {
    super(message);
    this.name =
      "StudioMutationValidationError";
  }
}

export class StudioMutationAuthorizationError
  extends Error {
  readonly code = "authorization" as const;

  constructor(
    message =
      "Administrator authorization is required."
  ) {
    super(message);
    this.name =
      "StudioMutationAuthorizationError";
  }
}

export class StudioMutationConflictError
  extends Error {
  readonly code = "conflict" as const;
  readonly current: unknown | undefined;

  constructor(
    message: string,
    current?: unknown
  ) {
    super(message);
    this.name =
      "StudioMutationConflictError";
    this.current = current;
  }
}

export class StudioMutationTransientError
  extends Error {
  readonly code = "transient" as const;

  constructor(message: string) {
    super(message);
    this.name =
      "StudioMutationTransientError";
  }
}

const STUDIO_OPERATION_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function serverMutationFailure<TEntity>(
  error: unknown
): StudioMutationResult<TEntity> {
  if (
    error instanceof
      StudioMutationValidationError
  ) {
    return {
      ok: false,
      code: "validation",
      message: error.message
    };
  }

  if (
    error instanceof
      StudioMutationAuthorizationError
  ) {
    return {
      ok: false,
      code: "authorization",
      message: error.message
    };
  }

  if (
    error instanceof
      StudioMutationConflictError
  ) {
    if (
      error.current !== undefined
    ) {
      return {
        ok: false,
        code: "conflict",
        message: error.message,
        current:
          error.current as TEntity
      };
    }

    return {
      ok: false,
      code: "conflict",
      message: error.message
    };
  }

  if (
    error instanceof
      StudioMutationTransientError
  ) {
    return {
      ok: false,
      code: "transient",
      message: error.message
    };
  }

  return {
    ok: false,
    code: "transient",
    message:
      "The Studio change could not be saved. Try again."
  };
}

export async function executeStudioServerMutation<
  TPatch,
  TEntity
>(
  input:
    StudioServerMutationInput<TPatch>,
  adapter:
    StudioServerMutationAdapter<
      TPatch,
      TEntity
    >
): Promise<
  StudioMutationResult<TEntity>
> {
  const operationId =
    input.operationId.trim();

  if (
    !STUDIO_OPERATION_ID_PATTERN.test(
      operationId
    )
  ) {
    return {
      ok: false,
      code: "validation",
      message:
        "The Studio operation ID is invalid."
    };
  }

  const expectedUpdatedAt =
    input.expectedUpdatedAt ??
    null;

  if (
    expectedUpdatedAt !== null &&
    !expectedUpdatedAt.trim()
  ) {
    return {
      ok: false,
      code: "validation",
      message:
        "The expected entity version is invalid."
    };
  }

  try {
    const actor =
      await adapter.authorize();

    if (
      !actor ||
      !actor.email.trim()
    ) {
      throw new
        StudioMutationAuthorizationError();
    }

    if (
      !(await adapter.originAllowed())
    ) {
      throw new
        StudioMutationAuthorizationError(
          "The Studio mutation origin is not allowed."
        );
    }

    const patch =
      adapter.validate(
        input.patch
      );

    const committed =
      adapter.transaction(() => {
        const completed =
          adapter.findCompletedOperation(
            operationId,
            patch
          );

        if (completed) {
          return completed;
        }

        const current =
          adapter.loadCurrent(
            patch
          );

        if (
          expectedUpdatedAt !== null &&
          (
            !current ||
            adapter.updatedAt(
              current
            ) !== expectedUpdatedAt
          )
        ) {
          throw new
            StudioMutationConflictError(
              "This Studio record changed in another session.",
              current ?? undefined
            );
        }

        const saved =
          adapter.save(
            current,
            patch
          );

        const entity =
          adapter.loadCanonical(
            saved,
            patch
          );

        if (!entity) {
          throw new
            StudioMutationTransientError(
              "The saved Studio record could not be reloaded."
            );
        }

        const updatedAt =
          adapter.updatedAt(
            entity
          ).trim();

        if (!updatedAt) {
          throw new
            StudioMutationTransientError(
              "The saved Studio record has no canonical version."
            );
        }

        const auditId =
          adapter.audit({
            actorEmail:
              actor.email.trim(),
            entityType:
              adapter.entityType,
            entityKey:
              adapter.entityKey(
                entity,
                patch
              ),
            operation:
              adapter.operation?.(
                current,
                entity,
                patch
              ) ??
              (
                current
                  ? "update"
                  : "create"
              ),
            before:
              current,
            after:
              entity,
            requestId:
              operationId
          }).trim();

        if (!auditId) {
          throw new
            StudioMutationTransientError(
              "The Studio audit record could not be created."
            );
        }

        return {
          entity,
          updatedAt,
          auditId
        };
      });

    await adapter.invalidate(
      committed.entity,
      patch
    );

    return {
      ok: true,
      entity:
        committed.entity,
      updatedAt:
        committed.updatedAt,
      operationId,
      auditId:
        committed.auditId
    };
  } catch (error) {
    return serverMutationFailure<TEntity>(
      error
    );
  }
}
