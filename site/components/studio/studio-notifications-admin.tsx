"use client";

import {
  useCallback,
  useState,
  useTransition,
  type KeyboardEvent
} from "react";

import {
  deleteNotificationDeliveryAction,
  loadNotificationDeliveryDetailAction,
  processNotificationRetryQueueAction,
  purgeExpiredNotificationDeliveriesAction,
  retryNotificationDeliveryAction,
  saveNotificationPolicyAutosaveAction,
  saveNotificationTemplateAutosaveAction,
  sendSmtpTestAction,
  verifySmtpConfigurationAction,
  type NotificationPolicyAutosavePatch,
  type NotificationTemplateAutosavePatch
} from "@/lib/actions";

import type {
  AdminAuditSummaryRecord,
  NotificationDeliveryDetail,
  NotificationDeliverySummary,
  NotificationPolicyRecord,
  NotificationTemplateRecord,
  SmtpVerificationRecord,
  VisitorAnalyticsPolicyRecord,
  VisitorInsightsSnapshot
} from "@/lib/db";

import {
  StudioVisitorInsights,
  type VisitorIdentityStatus
} from "@/components/studio/studio-visitor-insights";

import {
  StudioAuditLog
} from "@/components/studio/studio-audit-log";

import {
  notificationTypeDefinition,
  renderNotificationTemplate,
  validateNotificationTemplate
} from "@/lib/notification-policy";

import { formatDateTime } from "@/lib/format";

import {
  ConfirmDestructiveAction
} from "@/components/studio/confirm-destructive-action";

import {
  StudioAutosaveForm
} from "@/components/studio/studio-autosave-form";

import type {
  StudioMutationRequest,
  StudioMutationSnapshot
} from "@/lib/studio-mutations";

type NotificationAdminSummary = {
  total: number;
  sent: number;
  attention: number;
  pendingConfiguration: number;
  suppressed: number;
};

type SmtpPublicConfiguration = {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  userHint: string | null;
  fromName: string;
  fromAddress: string;
};

type NotificationsAdminProps = {
  initialPolicies: NotificationPolicyRecord[];
  initialTemplates: NotificationTemplateRecord[];
  initialDeliveries: NotificationDeliverySummary[];
  initialSummary: NotificationAdminSummary;
  smtpConfiguration: SmtpPublicConfiguration;
  initialSmtpVerification: SmtpVerificationRecord | null;
  initialVisitorInsights: VisitorInsightsSnapshot;
  initialVisitorPolicy: VisitorAnalyticsPolicyRecord;
  visitorIdentityStatus: VisitorIdentityStatus;
  initialAuditPage: {
    records: AdminAuditSummaryRecord[];
    total: number;
    page: number;
    pageSize: number;
  };
  auditFilterOptions: {
    entityTypes: string[];
    operations: string[];
  };
};

type WorkspaceTab =
  | "overview"
  | "types"
  | "templates"
  | "delivery"
  | "visitors"
  | "audit"
  | "smtp";

const WORKSPACE_TABS: Array<{
  key: WorkspaceTab;
  label: string;
}> = [
  { key: "overview", label: "Overview" },
  { key: "types", label: "Types" },
  { key: "templates", label: "Templates" },
  { key: "delivery", label: "Delivery" },
  { key: "visitors", label: "Visitors" },
  { key: "audit", label: "Audit" },
  { key: "smtp", label: "SMTP" }
];

function moveWorkspaceTab(
  event: KeyboardEvent<HTMLButtonElement>
) {
  if (
    ![
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End"
    ].includes(event.key)
  ) {
    return;
  }
  const tabs = Array.from(
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]'
      ) ?? []
  );
  const currentIndex = tabs.indexOf(
    event.currentTarget
  );
  if (currentIndex < 0 || tabs.length === 0) {
    return;
  }
  event.preventDefault();
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? tabs.length - 1
      : (
          currentIndex +
          (event.key === "ArrowRight" ? 1 : -1) +
          tabs.length
        ) % tabs.length;
  tabs[nextIndex]?.focus();
  tabs[nextIndex]?.click();
}

const SAMPLE_VARIABLES: Record<string, string> = {
  siteName: "Beaman Woodworks",
  recipient: "buyer@example.com",
  recipientName: "Alex Morgan",
  actionUrl: "https://www.woodmat.ch/account/verify?token=preview",
  expiresIn: "48 hours",
  displayName: "Alex Morgan",
  email: "buyer@example.com",
  createdAt: "Aug 7, 2026, 10:30 AM",
  projectReference: "BW-260807-A1B2",
  statusUrl: "https://www.woodmat.ch/commissions/status",
  status: "Build in progress",
  stage: "Joinery",
  orderNumber: "BW-ORDER-1042",
  trackingNumber: "Tracking pending",
  invoiceUrl: "https://www.woodmat.ch/account/projects",
  carrier: "Carrier confirmed after booking",
  sentAt: "Aug 7, 2026, 10:30 AM"
};

function splitAddresses(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) =>
          item.trim().toLowerCase()
        )
        .filter(Boolean)
    )
  ];
}

function formString(
  formData: FormData,
  name: string
) {
  const value = formData.get(name);
  return typeof value === "string"
    ? value
    : "";
}

function formInteger(
  formData: FormData,
  name: string
) {
  return Number.parseInt(
    formString(formData, name),
    10
  );
}

function PolicyEditor({
  policy,
  onSaved
}: {
  policy: NotificationPolicyRecord;
  onSaved: (
    policy: NotificationPolicyRecord
  ) => void;
}) {
  const [draft, setDraft] =
    useState<NotificationPolicyAutosavePatch>({
      category: policy.category,
      label: policy.label,
      description: policy.description,
      enabled: policy.enabled,
      recipientMode: policy.recipientMode,
      recipients: policy.recipients,
      forwardRecipients:
        policy.forwardRecipients,
      retentionDays: policy.retentionDays,
      maxAttempts: policy.maxAttempts,
      retryBaseSeconds:
        policy.retryBaseSeconds
    });

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const formData = new FormData(form);
      return {
        category: policy.category,
        label: formString(
          formData,
          "label"
        ),
        description: formString(
          formData,
          "description"
        ),
        enabled:
          formData.get("enabled") === "1",
        recipientMode: formString(
          formData,
          "recipientMode"
        ) as NotificationPolicyAutosavePatch["recipientMode"],
        recipients: splitAddresses(
          formString(
            formData,
            "recipients"
          )
        ),
        forwardRecipients: splitAddresses(
          formString(
            formData,
            "forwardRecipients"
          )
        ),
        retentionDays: formInteger(
          formData,
          "retentionDays"
        ),
        maxAttempts: formInteger(
          formData,
          "maxAttempts"
        ),
        retryBaseSeconds: formInteger(
          formData,
          "retryBaseSeconds"
        )
      };
    },
    [policy.category]
  );

  const mutate = useCallback(
    (
      request: StudioMutationRequest<NotificationPolicyAutosavePatch>
    ) =>
      saveNotificationPolicyAutosaveAction({
        patch: request.payload,
        operationId: request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const adoptCanonical = useCallback(
    (
      snapshot: StudioMutationSnapshot<NotificationPolicyRecord>
    ) => {
      if (
        snapshot.phase !== "saved" ||
        snapshot.hasUnsavedChanges ||
        !snapshot.currentEntity
      ) {
        return;
      }
      const next = snapshot.currentEntity;
      setDraft({
        category: next.category,
        label: next.label,
        description: next.description,
        enabled: next.enabled,
        recipientMode: next.recipientMode,
        recipients: next.recipients,
        forwardRecipients:
          next.forwardRecipients,
        retentionDays: next.retentionDays,
        maxAttempts: next.maxAttempts,
        retryBaseSeconds:
          next.retryBaseSeconds
      });
      onSaved(next);
    },
    [onSaved]
  );

  return (
    <StudioAutosaveForm<
      NotificationPolicyAutosavePatch,
      NotificationPolicyRecord
    >
      className="request-form compact-form"
      createPayload={createPayload}
      entityKey={`notification-policy:${policy.category}`}
      expectedUpdatedAt={policy.updatedAt}
      mutate={mutate}
      onStatus={adoptCanonical}
    >
      <div className="studio-editor-head">
        <div>
          <p className="eyebrow">
            {policy.category}
          </p>
          <h3>{draft.label}</h3>
        </div>
        <label className="compact-switch">
          <input
            checked={draft.enabled}
            name="enabled"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                enabled: event.target.checked
              }));
            }}
            type="checkbox"
            value="1"
          />
          <span>
            {draft.enabled
              ? "Enabled"
              : "Paused"}
          </span>
        </label>
      </div>

      <div className="field-grid two-up compact-grid">
        <label>
          <span>Label</span>
          <input
            name="label"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                label: event.target.value
              }));
            }}
            required
            type="text"
            value={draft.label}
          />
        </label>
        <label>
          <span>Recipient source</span>
          <select
            name="recipientMode"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                recipientMode:
                  event.target.value as NotificationPolicyAutosavePatch["recipientMode"]
              }));
            }}
            value={draft.recipientMode}
          >
            <option value="request">
              Event recipient only
            </option>
            <option value="configured">
              Configured recipients only
            </option>
            <option value="request-and-configured">
              Event and configured recipients
            </option>
          </select>
        </label>
      </div>

      <label>
        <span>Description</span>
        <textarea
          name="description"
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              description: event.target.value
            }));
          }}
          rows={2}
          value={draft.description}
        />
      </label>

      <div className="field-grid two-up compact-grid">
        <label>
          <span>Configured recipients</span>
          <textarea
            name="recipients"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                recipients: splitAddresses(
                  event.target.value
                )
              }));
            }}
            placeholder="One address per line"
            rows={3}
            value={draft.recipients.join("\n")}
          />
        </label>
        <label>
          <span>Forwarding recipients (BCC)</span>
          <textarea
            name="forwardRecipients"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                forwardRecipients:
                  splitAddresses(
                    event.target.value
                  )
              }));
            }}
            placeholder="One address per line"
            rows={3}
            value={draft.forwardRecipients.join("\n")}
          />
        </label>
      </div>

      <div className="field-grid three-up compact-grid">
        <label>
          <span>Retention (days)</span>
          <input
            max={3650}
            min={1}
            name="retentionDays"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                retentionDays:
                  event.target.valueAsNumber
              }));
            }}
            type="number"
            value={draft.retentionDays}
          />
        </label>
        <label>
          <span>Maximum attempts</span>
          <input
            max={10}
            min={1}
            name="maxAttempts"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                maxAttempts:
                  event.target.valueAsNumber
              }));
            }}
            type="number"
            value={draft.maxAttempts}
          />
        </label>
        <label>
          <span>Retry base (seconds)</span>
          <input
            max={86400}
            min={30}
            name="retryBaseSeconds"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                retryBaseSeconds:
                  event.target.valueAsNumber
              }));
            }}
            type="number"
            value={draft.retryBaseSeconds}
          />
        </label>
      </div>

      <button
        className="button-primary"
        type="submit"
      >
        Save type policy
      </button>
    </StudioAutosaveForm>
  );
}

function TemplateEditor({
  template,
  onSaved
}: {
  template: NotificationTemplateRecord;
  onSaved: (
    template: NotificationTemplateRecord
  ) => void;
}) {
  const [draft, setDraft] =
    useState<NotificationTemplateAutosavePatch>({
      category: template.category,
      subjectTemplate:
        template.subjectTemplate,
      textTemplate: template.textTemplate,
      htmlTemplate: template.htmlTemplate
    });

  const validation =
    validateNotificationTemplate(draft);
  let preview: ReturnType<
    typeof renderNotificationTemplate
  > | null = null;
  if (validation.ok) {
    try {
      preview = renderNotificationTemplate({
        ...draft,
        variables: SAMPLE_VARIABLES
      });
    } catch {
      preview = null;
    }
  }

  const definition =
    notificationTypeDefinition(
      template.category
    );

  const createPayload = useCallback(
    (form: HTMLFormElement) => {
      const formData = new FormData(form);
      return {
        category: template.category,
        subjectTemplate: formString(
          formData,
          "subjectTemplate"
        ),
        textTemplate: formString(
          formData,
          "textTemplate"
        ),
        htmlTemplate: formString(
          formData,
          "htmlTemplate"
        )
      };
    },
    [template.category]
  );

  const mutate = useCallback(
    (
      request: StudioMutationRequest<NotificationTemplateAutosavePatch>
    ) =>
      saveNotificationTemplateAutosaveAction({
        patch: request.payload,
        operationId: request.operationId,
        expectedUpdatedAt:
          request.expectedUpdatedAt
      }),
    []
  );

  const adoptCanonical = useCallback(
    (
      snapshot: StudioMutationSnapshot<NotificationTemplateRecord>
    ) => {
      if (
        snapshot.phase !== "saved" ||
        snapshot.hasUnsavedChanges ||
        !snapshot.currentEntity
      ) {
        return;
      }
      const next = snapshot.currentEntity;
      setDraft({
        category: next.category,
        subjectTemplate:
          next.subjectTemplate,
        textTemplate: next.textTemplate,
        htmlTemplate: next.htmlTemplate
      });
      onSaved(next);
    },
    [onSaved]
  );

  return (
    <div className="studio-template-grid">
      <StudioAutosaveForm<
        NotificationTemplateAutosavePatch,
        NotificationTemplateRecord
      >
        className="request-form compact-form studio-panel"
        createPayload={createPayload}
        entityKey={`notification-template:${template.category}`}
        expectedUpdatedAt={template.updatedAt}
        mutate={mutate}
        onStatus={adoptCanonical}
      >
        <div className="studio-editor-head">
          <div>
            <p className="eyebrow">
              Template
            </p>
            <h3>
              {definition?.label ??
                template.category}
            </h3>
          </div>
        </div>

        <p className="muted-copy notification-variable-list">
          Variables: {definition?.variables
            .map((value) => `{{${value}}}`)
            .join(", ") || "None"}
        </p>

        <label>
          <span>Subject</span>
          <input
            name="subjectTemplate"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                subjectTemplate:
                  event.target.value
              }));
            }}
            required
            type="text"
            value={draft.subjectTemplate}
          />
        </label>
        <label>
          <span>Plain text</span>
          <textarea
            name="textTemplate"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                textTemplate:
                  event.target.value
              }));
            }}
            required
            rows={7}
            value={draft.textTemplate}
          />
        </label>
        <label>
          <span>Limited HTML</span>
          <textarea
            name="htmlTemplate"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                htmlTemplate:
                  event.target.value
              }));
            }}
            rows={7}
            value={draft.htmlTemplate}
          />
        </label>

        {!validation.ok ? (
          <div
            className="notice-panel danger"
            role="alert"
          >
            {validation.errors.join(" ")}
          </div>
        ) : null}

        <button
          className="button-primary"
          disabled={!validation.ok}
          type="submit"
        >
          Save template
        </button>
      </StudioAutosaveForm>

      <article
        aria-live="polite"
        className="studio-panel notification-preview"
      >
        <p className="eyebrow">Safe preview</p>
        {preview ? (
          <>
            <h3>{preview.subject}</h3>
            <pre>{preview.text}</pre>
            {preview.html ? (
              <div
                className="notification-html-preview"
                dangerouslySetInnerHTML={{
                  __html: preview.html
                }}
              />
            ) : null}
          </>
        ) : (
          <p className="muted-copy">
            Correct the template errors to render a preview.
          </p>
        )}
      </article>
    </div>
  );
}

function DeliveryWorkspace({
  initialDeliveries
}: {
  initialDeliveries: NotificationDeliverySummary[];
}) {
  const [deliveries, setDeliveries] =
    useState(initialDeliveries);
  const [selectedId, setSelectedId] =
    useState(
      initialDeliveries[0]?.id ?? ""
    );
  const [detail, setDetail] =
    useState<NotificationDeliveryDetail | null>(
      null
    );
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  const selected = deliveries.find(
    (item) => item.id === selectedId
  ) ?? null;

  function loadDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setMessage("");
    startTransition(async () => {
      const result =
        await loadNotificationDeliveryDetailAction(
          id
        );
      setMessage(result.message);
      if (result.ok) {
        setDetail(result.data);
      }
    });
  }

  function retry(id: string) {
    startTransition(async () => {
      const result =
        await retryNotificationDeliveryAction(
          id
        );
      setMessage(result.message);
      if (result.ok && result.data) {
        setDeliveries((current) =>
          current.map((item) =>
            item.id === id
              ? result.data!
              : item
          )
        );
        setDetail(null);
      }
    });
  }

  function deleteSelected(id: string) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result =
          await deleteNotificationDeliveryAction(
            id
          );
        setMessage(result.message);
        if (result.ok) {
          setDeliveries((current) =>
            current.filter((item) =>
              item.id !== id
            )
          );
          setSelectedId("");
          setDetail(null);
        }
        resolve();
      });
    });
  }

  function processDue() {
    startTransition(async () => {
      const result =
        await processNotificationRetryQueueAction();
      setMessage(result.message);
      setDetail(null);
    });
  }

  function purgeExpired() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const result =
          await purgeExpiredNotificationDeliveriesAction();
        setMessage(result.message);
        resolve();
      });
    });
  }

  return (
    <div className="studio-delivery-workspace">
      <div className="studio-panel studio-master-list notification-delivery-list">
        <div className="studio-editor-head">
          <strong>
            {deliveries.length} recent deliveries
          </strong>
          <button
            className="button-secondary"
            disabled={pending}
            onClick={processDue}
            type="button"
          >
            Process due retries
          </button>
        </div>
        {deliveries.length ? (
          deliveries.map((item) => (
            <button
              aria-pressed={
                item.id === selectedId
              }
              className={`studio-master-item notification-delivery-item${
                item.id === selectedId
                  ? " is-active"
                  : ""
              }`}
              key={item.id}
              onClick={() => {
                loadDetail(item.id);
              }}
              type="button"
            >
              <strong>{item.subject}</strong>
              <span>
                {item.status} - {formatDateTime(item.createdAt)}
              </span>
            </button>
          ))
        ) : (
          <p className="muted-copy">
            No delivery records yet.
          </p>
        )}
      </div>

      <article
        aria-busy={pending}
        className="studio-panel notification-delivery-detail"
      >
        {message ? (
          <p
            className="notice-panel"
            role="status"
          >
            {message}
          </p>
        ) : null}

        {selected ? (
          <>
            <div className="studio-editor-head">
              <div>
                <p className="eyebrow">
                  {selected.category} - {selected.status}
                </p>
                <h3>{selected.subject}</h3>
              </div>
              <span>
                {selected.attemptCount}/{selected.maxAttempts} attempts
              </span>
            </div>
            <dl className="estimate-list compact-estimate">
              <div>
                <dt>Recipients</dt>
                <dd>{selected.recipients.join(", ")}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(selected.createdAt)}</dd>
              </div>
              <div>
                <dt>Next attempt</dt>
                <dd>
                  {selected.nextAttemptAt
                    ? formatDateTime(selected.nextAttemptAt)
                    : "Not scheduled"}
                </dd>
              </div>
            </dl>
            {selected.errorSummary ? (
              <p className="notice-panel danger">
                {selected.errorSummary}
              </p>
            ) : null}

            {!detail ? (
              <button
                className="button-secondary"
                disabled={pending}
                onClick={() => {
                  loadDetail(selected.id);
                }}
                type="button"
              >
                Load message and attempts
              </button>
            ) : (
              <details open>
                <summary>
                  Message and attempt history
                </summary>
                <pre className="notification-body-preview">
                  {detail.textBody}
                </pre>
                <ol className="compact-event-list">
                  {detail.attempts.map(
                    (attempt) => (
                      <li key={attempt.id}>
                        <strong>
                          Attempt {attempt.attemptNumber}: {attempt.status}
                        </strong>
                        <span>
                          {formatDateTime(attempt.startedAt)}
                          {attempt.errorSummary
                            ? ` - ${attempt.errorSummary}`
                            : ""}
                        </span>
                      </li>
                    )
                  )}
                </ol>
              </details>
            )}

            <div className="button-row">
              <button
                className="button-secondary"
                disabled={pending || selected.status === "sent"}
                onClick={() => {
                  retry(selected.id);
                }}
                type="button"
              >
                Retry now
              </button>
              <ConfirmDestructiveAction
                disabled={pending}
                confirmLabel="Delete delivery"
                description="Delete this delivery body and its attempt history? This does not recall email already accepted by SMTP."
                onConfirm={() =>
                  deleteSelected(selected.id)
                }
                title="Delete delivery record?"
                triggerLabel="Delete"
              />
            </div>
          </>
        ) : (
          <p className="muted-copy">
            Select a delivery to inspect its summary. Message bodies remain server-side until requested.
          </p>
        )}

        <div className="notification-retention-action">
          <ConfirmDestructiveAction
            disabled={pending}
            confirmLabel="Purge expired records"
            description="Delete delivery records older than each notification type's retention period?"
            onConfirm={purgeExpired}
            title="Apply retention policies?"
            triggerLabel="Purge expired"
          />
        </div>
      </article>
    </div>
  );
}

function SmtpWorkspace({
  configuration,
  initialVerification
}: {
  configuration: SmtpPublicConfiguration;
  initialVerification: SmtpVerificationRecord | null;
}) {
  const [verification, setVerification] =
    useState(initialVerification);
  const [recipient, setRecipient] =
    useState(configuration.fromAddress);
  const [message, setMessage] =
    useState("");
  const [pending, startTransition] =
    useTransition();

  function verify() {
    startTransition(async () => {
      const result =
        await verifySmtpConfigurationAction();
      setMessage(result.message);
      if (result.ok) {
        setVerification(result.data);
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result =
        await sendSmtpTestAction(recipient);
      setMessage(result.message);
    });
  }

  return (
    <div className="studio-grid two-column-grid">
      <article className="studio-panel">
        <p className="eyebrow">Connection</p>
        <h3>
          {configuration.configured
            ? "SMTP configured"
            : "SMTP not configured"}
        </h3>
        <dl className="estimate-list compact-estimate">
          <div>
            <dt>Host</dt>
            <dd>{configuration.host ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Port</dt>
            <dd>{configuration.port}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{configuration.secure ? "TLS" : "STARTTLS/plain"}</dd>
          </div>
          <div>
            <dt>User</dt>
            <dd>{configuration.userHint ?? "Not set"}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{configuration.fromAddress || "Not set"}</dd>
          </div>
        </dl>
        <p className="muted-copy">
          Passwords remain in runtime environment variables and are never returned to this page.
        </p>
        <button
          className="button-primary"
          disabled={pending}
          onClick={verify}
          type="button"
        >
          Verify connection
        </button>
      </article>

      <article className="studio-panel request-form compact-form">
        <p className="eyebrow">Authenticated test</p>
        <h3>Send one test message</h3>
        <label>
          <span>Recipient</span>
          <input
            onChange={(event) => {
              setRecipient(event.target.value);
            }}
            type="email"
            value={recipient}
          />
        </label>
        <button
          className="button-secondary"
          disabled={pending || !recipient.trim()}
          onClick={sendTest}
          type="button"
        >
          Send test
        </button>
        {message ? (
          <p className="notice-panel" role="status">
            {message}
          </p>
        ) : null}
        {verification ? (
          <dl className="estimate-list compact-estimate">
            <div>
              <dt>Last check</dt>
              <dd>{formatDateTime(verification.checkedAt)}</dd>
            </div>
            <div>
              <dt>Result</dt>
              <dd>{verification.status}</dd>
            </div>
            {verification.errorSummary ? (
              <div>
                <dt>Action needed</dt>
                <dd>{verification.errorSummary}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="muted-copy">
            No connection check has been recorded.
          </p>
        )}
      </article>
    </div>
  );
}

export function StudioNotificationsAdmin({
  initialPolicies,
  initialTemplates,
  initialDeliveries,
  initialSummary,
  smtpConfiguration,
  initialSmtpVerification,
  initialVisitorInsights,
  initialVisitorPolicy,
  visitorIdentityStatus,
  initialAuditPage,
  auditFilterOptions
}: NotificationsAdminProps) {
  const [tab, setTab] =
    useState<WorkspaceTab>("overview");
  const [policies, setPolicies] =
    useState(initialPolicies);
  const [templates, setTemplates] =
    useState(initialTemplates);
  const [category, setCategory] =
    useState(
      initialPolicies[0]?.category ?? ""
    );

  const selectedPolicy = policies.find(
    (item) => item.category === category
  ) ?? policies[0] ?? null;
  const selectedTemplate = templates.find(
    (item) => item.category === category
  ) ?? templates[0] ?? null;

  const replacePolicy = useCallback(
    (next: NotificationPolicyRecord) => {
      setPolicies((current) =>
        current.map((item) =>
          item.category === next.category
            ? next
            : item
        )
      );
    },
    []
  );

  const replaceTemplate = useCallback(
    (next: NotificationTemplateRecord) => {
      setTemplates((current) =>
        current.map((item) =>
          item.category === next.category
            ? next
            : item
        )
      );
    },
    []
  );

  function chooseCategory(next: string) {
    setCategory(next);
  }

  return (
    <div className="studio-admin-workspace">
      <div
        aria-label="Notification administration"
        className="studio-subtabs"
        role="tablist"
      >
        {WORKSPACE_TABS.map((item) => (
          <button
            aria-controls="notification-workspace-panel"
            aria-selected={tab === item.key}
            className={tab === item.key ? "is-active" : ""}
            id={`notification-workspace-tab-${item.key}`}
            key={item.key}
            onClick={() => {
              setTab(item.key);
            }}
            onKeyDown={moveWorkspaceTab}
            role="tab"
            tabIndex={tab === item.key ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`notification-workspace-tab-${tab}`}
        className="studio-workspace-panel"
        id="notification-workspace-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {tab === "overview" ? (
        <div className="studio-grid notification-summary-grid">
          <article className="studio-panel">
            <strong>{initialSummary.total}</strong>
            <span>Total deliveries</span>
          </article>
          <article className="studio-panel">
            <strong>{initialSummary.sent}</strong>
            <span>Sent</span>
          </article>
          <article className="studio-panel">
            <strong>{initialSummary.attention}</strong>
            <span>Need attention</span>
          </article>
          <article className="studio-panel">
            <strong>{initialSummary.pendingConfiguration}</strong>
            <span>Await configuration</span>
          </article>
          <article className="studio-panel">
            <strong>{policies.filter((item) => item.enabled).length}</strong>
            <span>Enabled types</span>
          </article>
          <article className="studio-panel">
            <strong>{initialSummary.suppressed}</strong>
            <span>Suppressed</span>
          </article>
        </div>
      ) : null}

      {tab === "types" || tab === "templates" ? (
        <div className="studio-master-detail">
          <nav
            aria-label="Notification types"
            className="studio-master-list"
          >
            {policies.map((policy) => (
              <button
                aria-current={
                  selectedPolicy?.category === policy.category
                    ? "page"
                    : undefined
                }
                className={`studio-master-item${
                  selectedPolicy?.category === policy.category
                    ? " is-active"
                    : ""
                }`}
                key={policy.category}
                onClick={() => {
                  chooseCategory(policy.category);
                }}
                type="button"
              >
                <strong>{policy.label}</strong>
                <span>{policy.enabled ? "Enabled" : "Paused"}</span>
              </button>
            ))}
          </nav>

          {tab === "types" && selectedPolicy ? (
            <article className="studio-panel studio-editor-card">
              <PolicyEditor
                key={selectedPolicy.category}
                onSaved={replacePolicy}
                policy={selectedPolicy}
              />
            </article>
          ) : null}

          {tab === "templates" && selectedTemplate ? (
            <TemplateEditor
              key={selectedTemplate.category}
              onSaved={replaceTemplate}
              template={selectedTemplate}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "delivery" ? (
        <DeliveryWorkspace
          initialDeliveries={initialDeliveries}
        />
      ) : null}

      {tab === "visitors" ? (
        <StudioVisitorInsights
          identityStatus={visitorIdentityStatus}
          initialInsights={initialVisitorInsights}
          initialPolicy={initialVisitorPolicy}
        />
      ) : null}

      {tab === "audit" ? (
        <StudioAuditLog
          filterOptions={auditFilterOptions}
          initialPage={initialAuditPage}
        />
      ) : null}

      {tab === "smtp" ? (
        <SmtpWorkspace
          configuration={smtpConfiguration}
          initialVerification={initialSmtpVerification}
        />
      ) : null}
      </div>
    </div>
  );
}
