"use client";

import {
  useCallback,
  useRef,
  useState
} from "react";

import {
  flushStudioNavigationQueues
} from "@/components/studio/studio-navigation-state";

import type {
  StudioMutationQueue,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

export function useStudioRecordDraft<
  TPatch,
  TEntity
>(
  initialDraft: TPatch,
  fromEntity: (entity: TEntity) => TPatch
) {
  const [draft, setDraft] =
    useState<TPatch>(initialDraft);

  const draftRef =
    useRef<TPatch>(initialDraft);

  const queueRef =
    useRef<
      StudioMutationQueue<
        TPatch,
        TEntity
      > | null
    >(null);

  const immediateMutationDepthRef =
    useRef(0);

  const adoptDraft =
    useCallback((next: TPatch) => {
      draftRef.current = next;
      setDraft(next);
    }, []);

  const captureQueue =
    useCallback(
      (
        queue:
          StudioMutationQueue<
            TPatch,
            TEntity
          >
      ) => {
        queueRef.current = queue;
      },
      []
    );

  const adoptCanonicalSnapshot =
    useCallback(
      (
        snapshot:
          StudioMutationSnapshot<
            TEntity
          >
      ) => {
        if (
          immediateMutationDepthRef
            .current !== 0 ||
          snapshot.phase !== "saved" ||
          snapshot.hasUnsavedChanges ||
          !snapshot.currentEntity
        ) {
          return;
        }

        adoptDraft(
          fromEntity(
            snapshot.currentEntity
          )
        );
      },
      [adoptDraft, fromEntity]
    );

  const saveImmediatePayload =
    useCallback(
      async (payload: TPatch) => {
        immediateMutationDepthRef
          .current += 1;

        try {
          await flushStudioNavigationQueues();

          const queue =
            queueRef.current;

          if (!queue) {
            return;
          }

          queue.enqueue(payload);
          await queue.flush();
        } catch {
          // The queue snapshot exposes validation, conflict, and transport failures.
        } finally {
          immediateMutationDepthRef
            .current -= 1;

          const queue =
            queueRef.current;

          if (
            immediateMutationDepthRef
              .current === 0 &&
            queue
          ) {
            adoptCanonicalSnapshot(
              queue.getSnapshot()
            );
          }
        }
      },
      [adoptCanonicalSnapshot]
    );

  return {
    draft,
    draftRef,
    queueRef,
    adoptDraft,
    captureQueue,
    adoptCanonicalSnapshot,
    saveImmediatePayload
  };
}
