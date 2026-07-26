import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STUDIO_AUTOSAVE_DEBOUNCE_MS,
  StudioMutationQueue,
  isTransientStudioMutationError,
  mergeStudioMutationPatch,
  studioMutationStatusLabel,
  type StudioMutationRequest,
  type StudioMutationResult
} from "./studio-mutations.ts";

type Entity = {
  title: string;
};

type Payload = {
  title: string;
};

function success(
  entity: Entity,
  updatedAt: string,
  operationId: string
): StudioMutationResult<Entity> {
  return {
    ok: true,
    entity,
    updatedAt,
    operationId,
    auditId: `audit-${operationId}`
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>(
    (resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    }
  );

  return {
    promise,
    resolve,
    reject
  };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

test(
  "autosave constants and visible status labels remain exact",
  () => {
    assert.equal(
      STUDIO_AUTOSAVE_DEBOUNCE_MS,
      650
    );

    assert.equal(
      studioMutationStatusLabel("saving"),
      "Saving…"
    );

    assert.equal(
      studioMutationStatusLabel("saved"),
      "Saved"
    );

    assert.equal(
      studioMutationStatusLabel("retrying"),
      "Offline — retrying"
    );

    assert.equal(
      studioMutationStatusLabel("conflict"),
      "Conflict — reload/compare"
    );
  }
);

test(
  "patch coalescing preserves intentionally empty and false values",
  () => {
    const merged = mergeStudioMutationPatch(
      {
        title: "Original",
        count: 12,
        visible: true,
        optional: "value"
      },
      {
        title: "",
        count: 0,
        visible: false,
        optional: null
      }
    );

    assert.deepEqual(
      merged,
      {
        title: "",
        count: 0,
        visible: false,
        optional: null
      }
    );
  }
);

test(
  "one entity never writes concurrently and newer queued state coalesces",
  async () => {
    const first = deferred<
      StudioMutationResult<Entity>
    >();

    const calls: Array<
      StudioMutationRequest<Payload>
    > = [];

    let active = 0;
    let maximumActive = 0;
    let operationSequence = 0;

    const queue = new StudioMutationQueue<
      Payload,
      Entity
    >({
      expectedUpdatedAt: "version-1",
      createOperationId: () =>
        `operation-${++operationSequence}`,
      mutate: async (request) => {
        calls.push(request);
        active += 1;

        maximumActive = Math.max(
          maximumActive,
          active
        );

        try {
          if (calls.length === 1) {
            return await first.promise;
          }

          return success(
            request.payload,
            "version-3",
            request.operationId
          );
        } finally {
          active -= 1;
        }
      }
    });

    queue.enqueue({
      title: "First"
    });

    await nextTurn();

    queue.enqueue({
      title: "Second"
    });

    queue.enqueue({
      title: "Latest"
    });

    assert.equal(calls.length, 1);
    assert.equal(maximumActive, 1);

    first.resolve(
      success(
        {
          title: "First"
        },
        "version-2",
        calls[0].operationId
      )
    );

    const snapshot = await queue.flush();

    assert.equal(calls.length, 2);
    assert.equal(maximumActive, 1);

    assert.deepEqual(
      calls.map((call) => call.payload),
      [
        {
          title: "First"
        },
        {
          title: "Latest"
        }
      ]
    );

    assert.deepEqual(
      calls.map(
        (call) => call.expectedUpdatedAt
      ),
      [
        "version-1",
        "version-2"
      ]
    );

    assert.deepEqual(
      calls.map((call) => call.operationId),
      [
        "operation-1",
        "operation-2"
      ]
    );

    assert.equal(snapshot.phase, "saved");

    assert.equal(
      snapshot.expectedUpdatedAt,
      "version-3"
    );

    assert.equal(
      snapshot.hasUnsavedChanges,
      false
    );
  }
);

test(
  "transient server results retry with bounded backoff and one operation ID",
  async () => {
    const calls: Array<
      StudioMutationRequest<Payload>
    > = [];

    const delays: number[] = [];
    const phases: string[] = [];

    let attempt = 0;

    const queue = new StudioMutationQueue<
      Payload,
      Entity
    >({
      expectedUpdatedAt: "version-1",
      createOperationId: () =>
        "stable-operation",
      retryDelaysMs: [
        10,
        20,
        30
      ],
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      onStatus: (snapshot) => {
        phases.push(snapshot.phase);
      },
      mutate: async (request) => {
        calls.push(request);
        attempt += 1;

        if (attempt < 3) {
          return {
            ok: false,
            code: "transient",
            message:
              "Network temporarily unavailable."
          };
        }

        return success(
          request.payload,
          "version-2",
          request.operationId
        );
      }
    });

    queue.enqueue({
      title: "Retried"
    });

    const snapshot = await queue.flush();

    assert.equal(calls.length, 3);

    assert.deepEqual(
      calls.map((call) => call.operationId),
      [
        "stable-operation",
        "stable-operation",
        "stable-operation"
      ]
    );

    assert.deepEqual(
      calls.map(
        (call) => call.expectedUpdatedAt
      ),
      [
        "version-1",
        "version-1",
        "version-1"
      ]
    );

    assert.deepEqual(
      delays,
      [
        10,
        20
      ]
    );

    assert.equal(
      phases.includes("retrying"),
      true
    );

    assert.equal(snapshot.phase, "saved");

    assert.equal(
      snapshot.hasUnsavedChanges,
      false
    );
  }
);

test(
  "a conflict blocks the queue and retains the newest complete local state",
  async () => {
    const calls: Array<
      StudioMutationRequest<Payload>
    > = [];

    let conflict = true;
    let operationSequence = 0;

    const queue = new StudioMutationQueue<
      Payload,
      Entity
    >({
      expectedUpdatedAt: "version-1",
      createOperationId: () =>
        `operation-${++operationSequence}`,
      mutate: async (request) => {
        calls.push(request);

        if (conflict) {
          return {
            ok: false,
            code: "conflict",
            message:
              "The entity changed elsewhere.",
            current: {
              title: "Server value"
            }
          };
        }

        return success(
          request.payload,
          "version-3",
          request.operationId
        );
      }
    });

    queue.enqueue({
      title: "Local value"
    });

    let snapshot = await queue.flush();

    assert.equal(snapshot.phase, "conflict");

    assert.equal(
      snapshot.label,
      "Conflict — reload/compare"
    );

    assert.deepEqual(
      snapshot.currentEntity,
      {
        title: "Server value"
      }
    );

    assert.deepEqual(
      queue.getUnsavedPayload(),
      {
        title: "Local value"
      }
    );

    queue.enqueue({
      title: "Newest local value"
    });

    assert.deepEqual(
      queue.getUnsavedPayload(),
      {
        title: "Newest local value"
      }
    );

    assert.equal(calls.length, 1);

    conflict = false;

    snapshot = await queue.retryUnsaved({
      expectedUpdatedAt: "version-2"
    });

    assert.equal(calls.length, 2);

    assert.deepEqual(
      calls[1].payload,
      {
        title: "Newest local value"
      }
    );

    assert.equal(
      calls[1].expectedUpdatedAt,
      "version-2"
    );

    assert.equal(snapshot.phase, "saved");

    assert.equal(
      snapshot.expectedUpdatedAt,
      "version-3"
    );
  }
);

test(
  "validation and authorization failures never retry automatically",
  async () => {
    for (
      const code of [
        "validation",
        "authorization"
      ] as const
    ) {
      let calls = 0;
      const delays: number[] = [];

      const queue = new StudioMutationQueue<
        Payload,
        Entity
      >({
        retryDelaysMs: [
          1,
          2,
          3
        ],
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
        mutate: async () => {
          calls += 1;

          return {
            ok: false,
            code,
            message: `${code} failed`
          };
        }
      });

      queue.enqueue({
        title: code
      });

      const snapshot = await queue.flush();

      assert.equal(calls, 1);
      assert.deepEqual(delays, []);
      assert.equal(snapshot.phase, "error");

      assert.deepEqual(
        queue.getUnsavedPayload(),
        {
          title: code
        }
      );
    }
  }
);

test(
  "thrown transient transport failures stop after the bounded retry budget",
  async () => {
    let calls = 0;
    const delays: number[] = [];

    const queue = new StudioMutationQueue<
      Payload,
      Entity
    >({
      retryDelaysMs: [
        5,
        10
      ],
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      mutate: async () => {
        calls += 1;

        throw new TypeError(
          "fetch failed"
        );
      }
    });

    queue.enqueue({
      title: "Offline state"
    });

    const snapshot = await queue.flush();

    assert.equal(calls, 3);

    assert.deepEqual(
      delays,
      [
        5,
        10
      ]
    );

    assert.equal(snapshot.phase, "error");

    assert.equal(
      snapshot.hasUnsavedChanges,
      true
    );

    assert.deepEqual(
      queue.getUnsavedPayload(),
      {
        title: "Offline state"
      }
    );
  }
);

test(
  "only transport-like failures are classified as transient",
  () => {
    assert.equal(
      isTransientStudioMutationError(
        new TypeError("fetch failed")
      ),
      true
    );

    assert.equal(
      isTransientStudioMutationError({
        code: "ECONNRESET"
      }),
      true
    );

    assert.equal(
      isTransientStudioMutationError(
        new Error("validation failed")
      ),
      false
    );
  }
);

test(
  "discarding blocked local state clears the unsaved marker",
  async () => {
    const queue = new StudioMutationQueue<
      Payload,
      Entity
    >({
      mutate: async () => ({
        ok: false,
        code: "validation",
        message: "Invalid title."
      })
    });

    queue.enqueue({
      title: ""
    });

    await queue.flush();

    assert.equal(
      queue.hasUnsavedChanges(),
      true
    );

    queue.discardUnsaved();

    assert.equal(
      queue.hasUnsavedChanges(),
      false
    );

    assert.equal(
      queue.getSnapshot().phase,
      "idle"
    );
  }
);

function readStudioPrimitive(
  fileName: string
): string {
  return readFileSync(
    new URL(
      `../components/studio/${fileName}`,
      import.meta.url
    ),
    "utf8"
  );
}

test(
  "autosave form encodes debounce, immediate controls, blur flush, and navigation registration",
  () => {
    const source = readStudioPrimitive(
      "studio-autosave-form.tsx"
    );

    assert.match(
      source,
      /STUDIO_AUTOSAVE_DEBOUNCE_MS/
    );

    assert.match(
      source,
      /onInput=/
    );

    assert.match(
      source,
      /onChange=/
    );

    assert.match(
      source,
      /onBlur=/
    );

    assert.match(
      source,
      /registerStudioNavigationFlushable/
    );

    assert.match(
      source,
      /useSyncExternalStore/
    );

    assert.match(
      source,
      /const subscribeToQueue/
    );

    assert.match(
      source,
      /queue\.subscribe/
    );

    assert.match(
      source,
      /const getQueueSnapshot/
    );

    assert.match(
      source,
      /queue\.getSnapshot\(\)/
    );

    assert.match(
      source,
      /nonempty entityKey/
    );

    assert.doesNotMatch(
      source,
      /setSnapshot\s*\(/
    );

    assert.doesNotMatch(
      source,
      /let current\s*=/
    );

    assert.doesNotMatch(
      source,
      /current\s*=\s*nextSnapshot/
    );

    assert.match(
      source,
      /new FormData\(form\)/
    );

    assert.match(
      source,
      /event\.preventDefault\(\)/
    );
  }
);

test(
  "navigation state preserves viewport, focus, selection, and scroll-free Studio routing",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    assert.match(
      source,
      /flushStudioNavigationQueues/
    );

    assert.match(
      source,
      /selectionStart/
    );

    assert.match(
      source,
      /selectionEnd/
    );

    assert.match(
      source,
      /preventScroll: true/
    );

    assert.match(
      source,
      /sessionStorage/
    );

    assert.match(
      source,
      /scroll: false/
    );

    assert.match(
      source,
      /url\.origin !==\s*window\.location\.origin/
    );
  }
);

test(
  "destructive confirmation provides modal semantics, focus containment, and native form submission",
  () => {
    const source = readStudioPrimitive(
      "confirm-destructive-action.tsx"
    );

    assert.match(
      source,
      /aria-modal="true"/
    );

    assert.match(
      source,
      /role="dialog"/
    );

    assert.match(
      source,
      /event\.key === "Escape"/
    );

    assert.match(
      source,
      /requestSubmit\(submitter\)/
    );

    assert.match(
      source,
      /target\?\.isConnected/
    );

    assert.doesNotMatch(
      source,
      /window\.confirm/
    );
  }
);

test(
  "save status exposes polite progress and assertive conflict or failure feedback",
  () => {
    const source = readStudioPrimitive(
      "studio-save-status.tsx"
    );

    assert.match(
      source,
      /aria-live=\{isError \? "assertive" : "polite"\}/
    );

    assert.match(
      source,
      /role=\{isError \? "alert" : "status"\}/
    );

    assert.match(
      source,
      /snapshot\.detail/
    );
  }
);

test(
  "autosave navigation flush includes the captured debounce payload",
  () => {
    const source = readStudioPrimitive(
      "studio-autosave-form.tsx"
    );

    assert.match(
      source,
      /pendingPayloadRef/
    );

    assert.match(
      source,
      /flush:\s*flushPending/
    );

    assert.match(
      source,
      /pendingPayloadRef\.current\s*\.hasValue/
    );

    assert.match(
      source,
      /enqueuePending\(\);\s*await queue\.flush\(\)/
    );

    assert.doesNotMatch(
      source,
      /flush:\s*\(\)\s*=>\s*queue\.flush\(\)/
    );
  }
);

test(
  "Studio recovery state is exact-route and scroll-captured",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    assert.match(
      source,
      /pathname:\s*window\.location\.pathname/
    );

    assert.match(
      source,
      /search:\s*window\.location\.search/
    );

    assert.match(
      source,
      /state\.pathname\s*!==\s*window\.location\.pathname/
    );

    assert.match(
      source,
      /state\.search\s*!==\s*window\.location\.search/
    );

    assert.match(
      source,
      /"scrollend"/
    );

    assert.match(
      source,
      /SCROLL_CAPTURE_DELAY_MS/
    );

    assert.match(
      source,
      /scrollRestoration\s*=\s*"manual"/
    );

    assert.doesNotMatch(
      source,
      /scrollIntoView/
    );
  }
);

test(
  "destructive confirmation initially focuses Cancel",
  () => {
    const source = readStudioPrimitive(
      "confirm-destructive-action.tsx"
    );

    assert.match(
      source,
      /cancelRef\.current\?\.focus\(\)/
    );

    assert.match(
      source,
      /ref=\{cancelRef\}/
    );

    assert.doesNotMatch(
      source,
      /confirmRef/
    );
  }
);

const {
  executeStudioServerMutation,
  StudioMutationConflictError,
  StudioMutationTransientError,
  StudioMutationValidationError
} = await import(
  "./studio-mutations.ts"
);

test(
  "server mutation shell commits, audits, canonicalizes, and invalidates in order",
  async () => {
    const events: string[] = [];

    const before = {
      id: "home",
      value: "before",
      updatedAt: "version-1"
    };

    const canonical = {
      id: "home",
      value: "after",
      updatedAt: "version-2"
    };

    const result =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home",
            value: "  after  "
          },
          operationId:
            "operation-success-0001",
          expectedUpdatedAt:
            "version-1"
        },
        {
          authorize: async () => ({
            email:
              "admin@example.com"
          }),
          originAllowed:
            async () => true,
          validate: (patch) => ({
            ...patch,
            value:
              patch.value.trim()
          }),
          transaction: (work) => {
            events.push("begin");

            const committed =
              work();

            events.push("commit");

            return committed;
          },
          findCompletedOperation:
            () => null,
          loadCurrent:
            () => before,
          save: (
            current,
            patch
          ) => {
            events.push("save");

            assert.deepEqual(
              current,
              before
            );

            return {
              ...canonical,
              value:
                patch.value
            };
          },
          loadCanonical:
            (saved) => {
              events.push(
                "canonical"
              );

              return saved;
            },
          updatedAt:
            (entity) =>
              entity.updatedAt,
          entityType: "page",
          entityKey:
            (entity) =>
              entity.id,
          audit: (input) => {
            events.push("audit");

            assert.equal(
              input.actorEmail,
              "admin@example.com"
            );

            assert.equal(
              input.requestId,
              "operation-success-0001"
            );

            assert.equal(
              input.operation,
              "update"
            );

            assert.deepEqual(
              input.before,
              before
            );

            assert.equal(
              input.after.value,
              "after"
            );

            return "audit-0001";
          },
          invalidate:
            async () => {
              events.push(
                "invalidate"
              );
            }
        }
      );

    if (!result.ok) {
      assert.fail(
        result.message
      );
    }

    assert.deepEqual(
      result,
      {
        ok: true,
        entity: canonical,
        updatedAt:
          "version-2",
        operationId:
          "operation-success-0001",
        auditId:
          "audit-0001"
      }
    );

    assert.deepEqual(
      events,
      [
        "begin",
        "save",
        "canonical",
        "audit",
        "commit",
        "invalidate"
      ]
    );
  }
);

test(
  "server mutation shell returns authorization without entering origin or transaction checks",
  async () => {
    let originChecks = 0;
    let transactions = 0;

    const result =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home"
          },
          operationId:
            "operation-authorization-0001"
        },
        {
          authorize:
            async () => null,
          originAllowed:
            async () => {
              originChecks += 1;
              return true;
            },
          validate:
            (patch) => patch,
          transaction: (work) => {
            transactions += 1;
            return work();
          },
          findCompletedOperation:
            () => null,
          loadCurrent:
            () => null,
          save: () => ({
            id: "home",
            updatedAt:
              "version-1"
          }),
          loadCanonical:
            (saved) => saved,
          updatedAt:
            (entity) =>
              entity.updatedAt,
          entityType: "page",
          entityKey:
            (entity) =>
              entity.id,
          audit:
            () => "audit-0001",
          invalidate:
            async () => undefined
        }
      );

    if (result.ok) {
      assert.fail(
        "Authorization failure unexpectedly succeeded."
      );
    }

    assert.equal(
      result.code,
      "authorization"
    );

    assert.equal(
      originChecks,
      0
    );

    assert.equal(
      transactions,
      0
    );
  }
);

test(
  "server mutation shell rejects an untrusted origin before validation or transaction",
  async () => {
    let validations = 0;
    let transactions = 0;

    const result =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home"
          },
          operationId:
            "operation-origin-0001"
        },
        {
          authorize:
            async () => ({
              email:
                "admin@example.com"
            }),
          originAllowed:
            async () => false,
          validate: (patch) => {
            validations += 1;
            return patch;
          },
          transaction: (work) => {
            transactions += 1;
            return work();
          },
          findCompletedOperation:
            () => null,
          loadCurrent:
            () => null,
          save: () => ({
            id: "home",
            updatedAt:
              "version-1"
          }),
          loadCanonical:
            (saved) => saved,
          updatedAt:
            (entity) =>
              entity.updatedAt,
          entityType: "page",
          entityKey:
            (entity) =>
              entity.id,
          audit:
            () => "audit-0001",
          invalidate:
            async () => undefined
        }
      );

    if (result.ok) {
      assert.fail(
        "Untrusted-origin failure unexpectedly succeeded."
      );
    }

    assert.equal(
      result.code,
      "authorization"
    );

    assert.equal(
      validations,
      0
    );

    assert.equal(
      transactions,
      0
    );
  }
);

test(
  "server mutation shell validates complete input before beginning a transaction",
  async () => {
    let transactions = 0;

    const result =
      await executeStudioServerMutation(
        {
          patch: {
            id: ""
          },
          operationId:
            "operation-validation-0001"
        },
        {
          authorize:
            async () => ({
              email:
                "admin@example.com"
            }),
          originAllowed:
            async () => true,
          validate: () => {
            throw new
              StudioMutationValidationError(
                "Page ID is required."
              );
          },
          transaction: (work) => {
            transactions += 1;
            return work();
          },
          findCompletedOperation:
            () => null,
          loadCurrent:
            () => null,
          save: () => ({
            id: "home",
            updatedAt:
              "version-1"
          }),
          loadCanonical:
            (saved) => saved,
          updatedAt:
            (entity) =>
              entity.updatedAt,
          entityType: "page",
          entityKey:
            (entity) =>
              entity.id,
          audit:
            () => "audit-0001",
          invalidate:
            async () => undefined
        }
      );

    if (result.ok) {
      assert.fail(
        "Validation failure unexpectedly succeeded."
      );
    }

    assert.equal(
      result.code,
      "validation"
    );

    assert.equal(
      result.message,
      "Page ID is required."
    );

    assert.equal(
      transactions,
      0
    );
  }
);

test(
  "server mutation shell returns the canonical current record on an optimistic conflict",
  async () => {
    let saves = 0;
    let audits = 0;

    const current = {
      id: "home",
      value: "newer",
      updatedAt: "version-2"
    };

    const result =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home"
          },
          operationId:
            "operation-conflict-0001",
          expectedUpdatedAt:
            "version-1"
        },
        {
          authorize:
            async () => ({
              email:
                "admin@example.com"
            }),
          originAllowed:
            async () => true,
          validate:
            (patch) => patch,
          transaction:
            (work) => work(),
          findCompletedOperation:
            () => null,
          loadCurrent:
            () => current,
          save: () => {
            saves += 1;

            return current;
          },
          loadCanonical:
            (saved) => saved,
          updatedAt:
            (entity) =>
              entity.updatedAt,
          entityType: "page",
          entityKey:
            (entity) =>
              entity.id,
          audit: () => {
            audits += 1;
            return "audit-0001";
          },
          invalidate:
            async () => undefined
        }
      );

    if (result.ok) {
      assert.fail(
        "Conflict unexpectedly succeeded."
      );
    }

    assert.equal(
      result.code,
      "conflict"
    );

    assert.deepEqual(
      result.current,
      current
    );

    assert.equal(saves, 0);
    assert.equal(audits, 0);
  }
);

test(
  "server mutation replay prevents a duplicate write after committed invalidation failure",
  async () => {
    const canonical = {
      id: "home",
      value: "saved",
      updatedAt: "version-2"
    };

    let completed:
      | {
          entity:
            typeof canonical;
          updatedAt: string;
          auditId: string;
        }
      | null = null;

    let saves = 0;
    let audits = 0;
    let invalidations = 0;

    const adapter = {
      authorize:
        async () => ({
          email:
            "admin@example.com"
        }),
      originAllowed:
        async () => true,
      validate:
        (patch: {
          id: string;
        }) => patch,
      transaction: (
        work: () => {
          entity:
            typeof canonical;
          updatedAt: string;
          auditId: string;
        }
      ) => {
        const result = work();
        completed = result;
        return result;
      },
      findCompletedOperation:
        () => completed,
      loadCurrent:
        () => ({
          id: "home",
          value: "before",
          updatedAt:
            "version-1"
        }),
      save: () => {
        saves += 1;
        return canonical;
      },
      loadCanonical:
        () => canonical,
      updatedAt:
        (entity:
          typeof canonical) =>
            entity.updatedAt,
      entityType: "page",
      entityKey:
        (entity:
          typeof canonical) =>
            entity.id,
      audit: () => {
        audits += 1;
        return "audit-replay-0001";
      },
      invalidate:
        async () => {
          invalidations += 1;

          if (
            invalidations === 1
          ) {
            throw new
              StudioMutationTransientError(
                "Cache invalidation failed."
              );
          }
        }
    };

    const request = {
      patch: {
        id: "home"
      },
      operationId:
        "operation-replay-0001",
      expectedUpdatedAt:
        "version-1"
    };

    const first =
      await executeStudioServerMutation(
        request,
        adapter
      );

    if (first.ok) {
      assert.fail(
        "The first invalidation failure unexpectedly succeeded."
      );
    }

    assert.equal(
      first.code,
      "transient"
    );

    assert.equal(
      first.message,
      "Cache invalidation failed."
    );

    const second =
      await executeStudioServerMutation(
        request,
        adapter
      );

    if (!second.ok) {
      assert.fail(
        second.message
      );
    }

    assert.equal(saves, 1);
    assert.equal(audits, 1);
    assert.equal(
      invalidations,
      2
    );

    assert.deepEqual(
      second,
      {
        ok: true,
        entity: canonical,
        updatedAt:
          "version-2",
        operationId:
          "operation-replay-0001",
        auditId:
          "audit-replay-0001"
      }
    );
  }
);

test(
  "server mutation shell rejects malformed operation and version identities before authorization",
  async () => {
    let authorizations = 0;

    const adapter = {
      authorize:
        async () => {
          authorizations += 1;

          return {
            email:
              "admin@example.com"
          };
        },
      originAllowed:
        async () => true,
      validate:
        (patch: {
          id: string;
        }) => patch,
      transaction:
        (
          work: () => {
            entity: {
              id: string;
              updatedAt: string;
            };
            updatedAt: string;
            auditId: string;
          }
        ) => work(),
      findCompletedOperation:
        () => null,
      loadCurrent:
        () => null,
      save: () => ({
        id: "home",
        updatedAt:
          "version-1"
      }),
      loadCanonical:
        (saved: {
          id: string;
          updatedAt: string;
        }) => saved,
      updatedAt:
        (entity: {
          id: string;
          updatedAt: string;
        }) =>
          entity.updatedAt,
      entityType: "page",
      entityKey:
        (entity: {
          id: string;
        }) =>
          entity.id,
      audit:
        () => "audit-0001",
      invalidate:
        async () => undefined
    };

    const invalidOperation =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home"
          },
          operationId: "bad"
        },
        adapter
      );

    if (invalidOperation.ok) {
      assert.fail(
        "Malformed operation ID unexpectedly succeeded."
      );
    }

    assert.equal(
      invalidOperation.code,
      "validation"
    );

    const invalidVersion =
      await executeStudioServerMutation(
        {
          patch: {
            id: "home"
          },
          operationId:
            "operation-version-0001",
          expectedUpdatedAt: "   "
        },
        adapter
      );

    if (invalidVersion.ok) {
      assert.fail(
        "Blank expected version unexpectedly succeeded."
      );
    }

    assert.equal(
      invalidVersion.code,
      "validation"
    );

    assert.equal(
      authorizations,
      0
    );
  }
);

test(
  "server conflict errors retain an optional canonical current entity",
  () => {
    const current = {
      id: "home",
      updatedAt: "version-2"
    };

    const error =
      new StudioMutationConflictError(
        "Conflict.",
        current
      );

    assert.equal(
      error.code,
      "conflict"
    );

    assert.deepEqual(
      error.current,
      current
    );
  }
);

test(
  "durable Studio operation replay resolves one audit record by request ID and entity identity",
  async () => {
    const {
      readFile
    } = await import(
      "node:fs/promises"
    );

    const source =
      await readFile(
        new URL(
          "./db.ts",
          import.meta.url
        ),
        "utf8"
      );

    const start =
      source.indexOf(
        "export function getAdminEditAuditByRequestId("
      );

    const end =
      source.indexOf(
        "export function listAdminEditAudit(",
        start
      );

    assert.ok(
      start >= 0,
      "Durable replay lookup is missing."
    );

    assert.ok(
      end > start,
      "Durable replay lookup boundary is invalid."
    );

    const helper =
      source.slice(
        start,
        end
      );

    for (
      const token of [
        "requestId: string;",
        "entityType: string;",
        "entityKey: string;",
        "WHERE request_id = ?",
        "AND entity_type = ?",
        "AND entity_key = ?",
        "ORDER BY created_at DESC",
        "LIMIT 1",
        "request_id AS requestId",
        "before_json AS beforeJson",
        "after_json AS afterJson",
        "readJson(",
        "row.beforeJson",
        "row.afterJson"
      ]
    ) {
      assert.equal(
        helper.includes(token),
        true,
        `Durable replay lookup lacks ${token}.`
      );
    }

    assert.equal(
      helper.includes(
        "!requestId ||"
      ),
      true
    );

    assert.equal(
      helper.includes(
        "!entityType ||"
      ),
      true
    );

    assert.equal(
      helper.includes(
        "!entityKey"
      ),
      true
    );

    for (
      const forbidden of [
        "INSERT INTO",
        "UPDATE ",
        "DELETE FROM",
        "redirect(",
        "revalidatePath(",
        "revalidateTag("
      ]
    ) {
      assert.equal(
        helper.includes(
          forbidden
        ),
        false,
        `Durable replay lookup contains forbidden mutation token ${forbidden}.`
      );
    }
  }
);


test("durable inline operation ledger round-trips the exact stored response", async () => {
  const {
    mkdtemp,
    rm
  } = await import("node:fs/promises");
  const {
    tmpdir
  } = await import("node:os");
  const {
    join
  } = await import("node:path");
  const {
    closeDatabaseForTests,
    getStudioMutationOperation,
    recordStudioMutationOperation
  } = await import("./db.ts");

  const previousNodeEnv =
    process.env.NODE_ENV;
  const previousDataRoot =
    process.env.DATA_ROOT;

  const dataRoot = await mkdtemp(
    join(
      tmpdir(),
      "woodsmith-inline-operation-"
    )
  );

  process.env.NODE_ENV = "test";
  process.env.DATA_ROOT = dataRoot;

  const response = {
    ok: true as const,
    requestId: "inline-operation-1234567890",
    operationId: "inline-operation-1234567890",
    replayed: false,
    updatedAt: "2026-07-22T18:30:00.000Z",
    auditId: "audit-1",
    applied: [],
    revertPatches: []
  };

  try {
    closeDatabaseForTests();

    const recorded =
      recordStudioMutationOperation({
        operationId:
          "inline-operation-1234567890",
        actorEmail:
          "ADMIN@EXAMPLE.COM",
        mutationScope:
          "inline-edit",
        requestHash:
          "a".repeat(64),
        response
      });

    assert.equal(
      recorded.actorEmail,
      "admin@example.com"
    );

    assert.deepEqual(
      recorded.response,
      response
    );

    const replay =
      getStudioMutationOperation<
        typeof response
      >(
        "inline-operation-1234567890"
      );

    assert.ok(replay);

    assert.equal(
      replay.mutationScope,
      "inline-edit"
    );

    assert.equal(
      replay.requestHash,
      "a".repeat(64)
    );

    assert.deepEqual(
      replay.response,
      response
    );

    assert.throws(
      () =>
        recordStudioMutationOperation({
          operationId:
            "inline-operation-1234567890",
          actorEmail:
            "admin@example.com",
          mutationScope:
            "inline-edit",
          requestHash:
            "b".repeat(64),
          response
        }),
      /UNIQUE constraint failed|PRIMARY KEY/
    );
  } finally {
    closeDatabaseForTests();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV =
        previousNodeEnv;
    }

    if (previousDataRoot === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT =
        previousDataRoot;
    }

    await rm(
      dataRoot,
      {
        recursive: true,
        force: true
      }
    );
  }
});

test("inline route preserves the legacy response while adding one stable replay identity", async () => {
  const {
    readFile
  } = await import("node:fs/promises");

  const routeSource = await readFile(
    new URL(
      "../app/api/studio/inline-edit/route.ts",
      import.meta.url
    ),
    "utf8"
  );

  const assistantSource = await readFile(
    new URL(
      "../components/inline-edit-assistant.tsx",
      import.meta.url
    ),
    "utf8"
  );

  const migrationSource = await readFile(
    new URL(
      "./database-migrations.ts",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    migrationSource,
    /version:\s*7[\s\S]*studio_mutation_operations/
  );

  const transactionPosition =
    routeSource.indexOf(
      "withDatabaseTransaction(() => {"
    );

  const replayPosition =
    routeSource.indexOf(
      "getStudioMutationOperation",
      transactionPosition
    );

  const applyPosition =
    routeSource.indexOf(
      "applyPatch(",
      transactionPosition
    );

  const recordPosition =
    routeSource.indexOf(
      "recordStudioMutationOperation",
      applyPosition
    );

  assert.ok(
    transactionPosition >= 0
  );

  assert.ok(
    replayPosition >
      transactionPosition
  );

  assert.ok(
    applyPosition >
      replayPosition
  );

  assert.ok(
    recordPosition >
      applyPosition
  );

  assert.match(
    routeSource,
    /requestId:\s*operationId/
  );

  assert.match(
    routeSource,
    /operationId,\s*replayed:\s*false/
  );

  assert.match(
    routeSource,
    /revertPatches:\s*applied/
  );

  const sendPosition =
    assistantSource.indexOf(
      "async function sendPatches"
    );

  const operationPosition =
    assistantSource.indexOf(
      "globalThis.crypto.randomUUID()",
      sendPosition
    );

  const retryLoopPosition =
    assistantSource.indexOf(
      "attempt < 3",
      operationPosition
    );

  const requestPosition =
    assistantSource.indexOf(
      "JSON.stringify({",
      retryLoopPosition
    );

  assert.ok(
    sendPosition >= 0
  );

  assert.ok(
    operationPosition >
      sendPosition
  );

  assert.ok(
    retryLoopPosition >
      operationPosition
  );

  assert.ok(
    requestPosition >
      retryLoopPosition
  );

  assert.match(
    assistantSource.slice(
      requestPosition,
      requestPosition + 200
    ),
    /operationId,[\s\S]*patches/
  );
});

test(
  "page autosave action binds the typed server shell without redirecting or broad invalidation",
  async () => {
    const {
      readFile
    } = await import(
      "node:fs/promises"
    );

    const source =
      await readFile(
        new URL(
          "./actions.ts",
          import.meta.url
        ),
        "utf8"
      );

    const autosaveStart =
      source.indexOf(
        "export async function\nsavePageAutosaveAction("
      );

    const legacyStart =
      source.indexOf(
        "export async function savePageAction("
      );

    const deleteStart =
      source.indexOf(
        "export async function deletePageAction(",
        legacyStart
      );

    assert.ok(
      autosaveStart >= 0,
      "Page autosave action is missing."
    );

    assert.ok(
      legacyStart > autosaveStart,
      "Legacy page action does not follow the autosave action."
    );

    assert.ok(
      deleteStart > legacyStart,
      "Legacy page action boundary is invalid."
    );

    const autosave =
      source.slice(
        autosaveStart,
        legacyStart
      );

    const legacy =
      source.slice(
        legacyStart,
        deleteStart
      );

    for (
      const token of
      [
        "StudioServerMutationInput<",
        "StudioMutationResult<PageRecord>",
        "executeStudioServerMutation(",
        "await getCurrentUser()",
        'user.role !== "admin"',
        "studioServerActionOriginAllowed",
        "validatePageAutosavePatch(",
        "withDatabaseTransaction(",
        "getStudioMutationOperation<",
        "pageAutosaveRequestHash(",
        "StudioMutationConflictError",
        "getPage(",
        "savePage(patch)",
        "recordAdminEditAudit({",
        "recordStudioMutationOperation({",
        "PAGE_AUTOSAVE_MUTATION_SCOPE",
        "revalidatePageAutosaveSurface("
      ]
    ) {
      assert.equal(
        autosave.includes(token),
        true,
        `Page autosave action lacks ${token}.`
      );
    }

    for (
      const forbidden of
      [
        "redirect(",
        "requireAdmin(",
        "revalidatePagePaths(",
        'revalidatePath("/studio"',
        'revalidatePath("/", "layout")',
        "window.location",
        "x-forwarded-host",
        "x-forwarded-proto"
      ]
    ) {
      assert.equal(
        autosave.includes(
          forbidden
        ),
        false,
        `Page autosave action contains forbidden token ${forbidden}.`
      );
    }

    for (
      const token of
      [
        "await requireAdmin()",
        "savePage(",
        "revalidatePagePaths(slug)",
        "redirect("
      ]
    ) {
      assert.equal(
        legacy.includes(token),
        true,
        `Legacy page action lost ${token}.`
      );
    }

    const invalidationStart =
      source.indexOf(
        "function revalidatePageAutosaveSurface("
      );

    assert.ok(
      invalidationStart >= 0 &&
      invalidationStart < autosaveStart,
      "Targeted page invalidation helper is missing."
    );

    const invalidation =
      source.slice(
        invalidationStart,
        autosaveStart
      );

    assert.equal(
      (
        invalidation.match(
          /revalidatePath\(/g
        ) ?? []
      ).length,
      1,
      "Page autosave invalidation must invoke one concrete-path invalidation."
    );

    for (
      const forbidden of
      [
        'revalidatePath("/", "layout")',
        'revalidatePath("/studio"',
        'revalidatePath("/[slug]"',
        "revalidatePagePaths("
      ]
    ) {
      assert.equal(
        invalidation.includes(
          forbidden
        ),
        false,
        `Targeted invalidation contains ${forbidden}.`
      );
    }
  }
);

test(
  "successful mutation snapshots retain the canonical saved entity and version",
  async () => {
    const queue =
      new StudioMutationQueue<
        {
          title: string;
        },
        {
          title: string;
          updatedAt: string;
        }
      >({
        expectedUpdatedAt:
          "version-1",

        createOperationId:
          () =>
            "operation-canonical-success-0001",

        mutate: async ({
          payload,
          operationId
        }) => ({
          ok: true,
          entity: {
            title:
              payload.title.trim(),
            updatedAt:
              "version-2"
          },
          updatedAt:
            "version-2",
          operationId,
          auditId:
            "audit-canonical-success-0001"
        })
      });

    queue.enqueue({
      title:
        " Canonical server value "
    });

    const snapshot =
      await queue.flush();

    assert.equal(
      snapshot.phase,
      "saved"
    );

    assert.equal(
      snapshot.expectedUpdatedAt,
      "version-2"
    );

    assert.equal(
      snapshot.hasUnsavedChanges,
      false
    );

    assert.deepEqual(
      snapshot.currentEntity,
      {
        title:
          "Canonical server value",
        updatedAt:
          "version-2"
      }
    );

    assert.equal(
      queue.getExpectedUpdatedAt(),
      "version-2"
    );
  }
);

test(
  "controlled page editor adopts autosave, canonical reconciliation, navigation flush, and confirmed deletion",
  async () => {
    const {
      readFile
    } = await import(
      "node:fs/promises"
    );

    const editor =
      await readFile(
        new URL(
          "../components/studio/studio-page-editor.tsx",
          import.meta.url
        ),
        "utf8"
      );

    const page =
      await readFile(
        new URL(
          "../app/studio/page.tsx",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const token of
      [
        '"use client"',
        "useState<PageAutosavePatch>",
        "StudioAutosaveForm<",
        "savePageAutosaveAction",
        "expectedUpdatedAt={",
        "createPayload={createPayload}",
        "onQueue={captureQueue}",
        "onStatus={",
        "snapshot.currentEntity",
        "snapshot.hasUnsavedChanges",
        "immediateMutationDepthRef",
        "flushStudioNavigationQueues()",
        "queue.enqueue(payload)",
        "onSelectionChange={",
        "ConfirmDestructiveAction",
        "captureStudioNavigationState()",
        "form.requestSubmit()",
        'type="submit"',
        "Save page"
      ]
    ) {
      assert.equal(
        editor.includes(token),
        true,
        `Controlled page editor lacks ${token}.`
      );
    }

    for (
      const token of
      [
        'value={draft.slug}',
        'value={draft.title}',
        'value={draft.navLabel}',
        'value={draft.status}',
        'value={draft.layout}',
        'value={draft.intro}',
        'value={draft.body}',
        "sections:",
        "draftRef.current.sections"
      ]
    ) {
      assert.equal(
        editor.includes(token),
        true,
        `Controlled page state lacks ${token}.`
      );
    }

    for (
      const forbidden of
      [
        "redirect(",
        "window.location.reload",
        "router.refresh(",
        'revalidatePath("/studio"',
        "action={savePageAction}"
      ]
    ) {
      assert.equal(
        editor.includes(forbidden),
        false,
        `Controlled page editor contains forbidden token ${forbidden}.`
      );
    }

    for (
      const token of
      [
        "StudioPageEditor",
        "StudioPageEditorRecord",
        "updatedAt: null",
        "<StudioNavigationState />",
        "<StudioScrollRestore />"
      ]
    ) {
      assert.equal(
        page.includes(token),
        true,
        `Studio page integration lacks ${token}.`
      );
    }

        assert.equal(
      page.split(
        "action={savePageAction}"
      ).length - 1,
      1,
      "The explicit new-page save form must remain wired exactly once in page.tsx."
    );

    assert.equal(
      editor.includes(
        "savePageAction"
      ),
      false,
      "The legacy page save action must not enter the controlled autosave editor."
    );

    assert.equal(
      page.includes(
        "action={deletePageAction}"
      ),
      false,
      "Unconfirmed page deletion remains wired in page.tsx."
    );

    assert.equal(
      page.includes(
        'Omit<PageRecord, "createdAt" | "updatedAt">'
      ),
      false,
      "PageEditor still strips the canonical updatedAt."
    );
  }
);

test(
  "page editor client adapter maps queue payload to the server patch contract",
  async () => {
    const {
      readFile
    } = await import(
      "node:fs/promises"
    );

    const editor =
      await readFile(
        new URL(
          "../components/studio/studio-page-editor.tsx",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const token of
      [
        "StudioMutationRequest<PageAutosavePatch>",
        "const savePageMutation",
        "savePageAutosaveAction({",
        "patch: request.payload",
        "operationId:",
        "request.operationId",
        "expectedUpdatedAt:",
        "request.expectedUpdatedAt",
        "mutate={savePageMutation}"
      ]
    ) {
      assert.equal(
        editor.includes(token),
        true,
        `Page mutation adapter lacks ${token}.`
      );
    }

    assert.equal(
      editor.includes(
        "mutate={savePageAutosaveAction}"
      ),
      false,
      "The queue must not bind directly to the differently shaped server input."
    );
  }
);

test(
  "page identity closure separates explicit creation from existing-page autosave",
  async () => {
    const {
      readFile
    } = await import(
      "node:fs/promises"
    );

    const editor =
      await readFile(
        new URL(
          "../components/studio/studio-page-editor.tsx",
          import.meta.url
        ),
        "utf8"
      );

    const page =
      await readFile(
        new URL(
          "../app/studio/page.tsx",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const token of
      [
        "ExistingStudioPageEditorRecord",
        "NewStudioPageEditorRecord",
        "page: ExistingStudioPageEditorRecord",
        "readOnly",
        'value={draft.slug}'
      ]
    ) {
      assert.equal(
        editor.includes(token),
        true,
        `Existing-page identity contract lacks ${token}.`
      );
    }

    assert.equal(
      editor.includes(
        "savePageAction"
      ),
      false,
      "The redirecting create action must remain outside the client autosave editor."
    );

    for (
      const token of
      [
        "function NewPageEditor(",
        "page.updatedAt === null",
        "action={savePageAction}",
        'defaultValue=""',
        'name="slug"',
        "JSON.stringify(",
        "page.sections",
        "<StudioPageEditor"
      ]
    ) {
      assert.equal(
        page.includes(token),
        true,
        `Page create/update boundary lacks ${token}.`
      );
    }

    assert.equal(
      page.match(
        /action=\{savePageAction\}/g
      )?.length,
      1,
      "The explicit new-page create action must be wired exactly once."
    );
  }
);

test(
  "StudioMutationQueue snapshots remain referentially stable until the queue emits",
  () => {
    const queue =
      new StudioMutationQueue<
        Record<string, never>,
        never
      >({
        mutate: async () => {
          throw new Error(
            "Snapshot identity test must not invoke mutate."
          );
        }
      });

    const initial =
      queue.getSnapshot();

    assert.strictEqual(
      queue.getSnapshot(),
      initial
    );

    queue.updateExpectedUpdatedAt(
      "snapshot-version-2"
    );

    const updated =
      queue.getSnapshot();

    assert.notStrictEqual(
      updated,
      initial
    );

    assert.strictEqual(
      queue.getSnapshot(),
      updated
    );

    assert.equal(
      updated.expectedUpdatedAt,
      "snapshot-version-2"
    );
  }
);

test(
  "Studio navigation retains route-specific focus and selection history",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    assert.match(
      source,
      /function storageKeyForRoute/
    );

    assert.match(
      source,
      /STORAGE_KEY_PREFIX/
    );

    assert.match(
      source,
      /storageKeyForRoute\(\s*state\.pathname,\s*state\.search\s*\)/
    );

    assert.match(
      source,
      /const key\s*=\s*storageKeyForRoute\(\)/
    );

    assert.match(
      source,
      /sessionStorage\.getItem\(key\)/
    );

    assert.doesNotMatch(
      source,
      /sessionStorage\.removeItem\(\s*STORAGE_KEY/
    );

    assert.match(
      source,
      /"focusin"/
    );

    assert.match(
      source,
      /"selectionchange"/
    );

    assert.match(
      source,
      /"input"/
    );
  }
);

test(
  "Studio reload recovery reapplies stored scroll after layout settlement",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    assert.match(
      source,
      /function applyStoredScrollPosition/
    );

    assert.match(
      source,
      /function scheduleStoredNavigationScrollStabilization/
    );

    assert.match(
      source,
      /document\.fonts\.ready\.then/
    );

    assert.match(
      source,
      /firstFrame\s*=\s*window\.requestAnimationFrame/
    );

    assert.match(
      source,
      /secondFrame\s*=\s*window\.requestAnimationFrame/
    );

    assert.match(
      source,
      /applyStoredScrollPosition\(state\)/
    );

    assert.match(
      source,
      /cancelStabilization\s*=\s*scheduleStoredNavigationScrollStabilization/
    );

    assert.match(
      source,
      /cancelStabilization\(\)/
    );

    assert.match(
      source,
      /window\.cancelAnimationFrame\(\s*firstFrame\s*\)/
    );

    assert.match(
      source,
      /window\.cancelAnimationFrame\(\s*secondFrame\s*\)/
    );
  }
);

test(
  "Studio stored scroll helper delegates without recursion",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    const helperStart =
      source.indexOf(
        "function applyStoredScrollPosition("
      );

    const helperEnd =
      source.indexOf(
        "\n}\n\nfunction applyStoredNavigationState",
        helperStart
      );

    assert.notEqual(
      helperStart,
      -1
    );

    assert.notEqual(
      helperEnd,
      -1
    );

    const helperSource =
      source.slice(
        helperStart,
        helperEnd
      );

    assert.match(
      helperSource,
      /window\.scrollTo\(\{/
    );

    assert.doesNotMatch(
      helperSource,
      /applyStoredScrollPosition\(state\)/
    );

    assert.equal(
      (
        source.match(
          /applyStoredScrollPosition\(state\);/g
        ) ?? []
      ).length,
      2
    );
  }
);

test(
  "Studio reload recovery snapshots stored state before the restore frame",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    const componentStart =
      source.indexOf(
        "export function StudioNavigationState()"
      );

    const captureEffectStart =
      source.indexOf(
        "    function capture()",
        componentStart
      );

    assert.notEqual(
      componentStart,
      -1
    );

    assert.notEqual(
      captureEffectStart,
      -1
    );

    const restoreSection =
      source.slice(
        componentStart,
        captureEffectStart
      );

    const stateRead =
      restoreSection.indexOf(
        "const state =\n      readStoredNavigationState();"
      );

    const frameStart =
      restoreSection.indexOf(
        "const frame =\n      window.requestAnimationFrame"
      );

    const applyStart =
      restoreSection.indexOf(
        "applyStoredNavigationState(state);"
      );

    assert.notEqual(
      stateRead,
      -1
    );

    assert.notEqual(
      frameStart,
      -1
    );

    assert.notEqual(
      applyStart,
      -1
    );

    assert.ok(
      stateRead < frameStart
    );

    assert.ok(
      frameStart < applyStart
    );

    const frameSection =
      restoreSection.slice(
        frameStart,
        applyStart
      );

    assert.doesNotMatch(
      frameSection,
      /readStoredNavigationState/
    );

    assert.match(
      restoreSection,
      /if \(!state\) \{\s*return;\s*\}/
    );

    assert.match(
      restoreSection,
      /scheduleStoredNavigationScrollStabilization\(\s*state\s*\)/
    );
  }
);

test(
  "Studio history recovery retries focus until the incoming route DOM exists",
  () => {
    const source = readStudioPrimitive(
      "studio-navigation-state.tsx"
    );

    const helperStart =
      source.indexOf(
        "function restoreStoredFocusAndSelection("
      );

    const helperEnd =
      source.indexOf(
        "\n}\n\nfunction applyStoredNavigationState",
        helperStart
      );

    const stabilizerStart =
      source.indexOf(
        "function scheduleStoredNavigationScrollStabilization("
      );

    const stabilizerEnd =
      source.indexOf(
        "\n}\n\nexport function registerStudioNavigationFlushable",
        stabilizerStart
      );

    assert.notEqual(
      helperStart,
      -1
    );

    assert.notEqual(
      helperEnd,
      -1
    );

    assert.notEqual(
      stabilizerStart,
      -1
    );

    assert.notEqual(
      stabilizerEnd,
      -1
    );

    const helper =
      source.slice(
        helperStart,
        helperEnd
      );

    const stabilizer =
      source.slice(
        stabilizerStart,
        stabilizerEnd
      );

    assert.match(
      helper,
      /document\.querySelector<HTMLElement>/
    );

    assert.match(
      helper,
      /target\.focus\(\{\s*preventScroll: true/
    );

    assert.match(
      helper,
      /target\.setSelectionRange\(/
    );

    assert.match(
      helper,
      /document\.activeElement !== target/
    );

    assert.match(
      stabilizer,
      /performance\.now\(\) \+ 2_000/
    );

    assert.match(
      stabilizer,
      /function restoreFocusWhenReady\(\)/
    );

    assert.match(
      stabilizer,
      /restoreStoredFocusAndSelection\(\s*state\s*\)/
    );

    assert.match(
      stabilizer,
      /focusFrame\s*=\s*window\.requestAnimationFrame/
    );

    assert.match(
      stabilizer,
      /performance\.now\(\) >=\s*focusDeadline/
    );

    assert.match(
      stabilizer,
      /"pointerdown",\s*interruptFocusRetry,\s*true/
    );

    assert.match(
      stabilizer,
      /"keydown",\s*interruptFocusRetry,\s*true/
    );

    assert.match(
      stabilizer,
      /cancelFocusRetry\(\)/
    );

    assert.match(
      stabilizer,
      /applyStoredScrollPosition\(state\)/
    );

    assert.doesNotMatch(
      stabilizer,
      /setInterval\(/
    );
  }
);
