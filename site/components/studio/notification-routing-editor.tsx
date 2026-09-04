"use client";

import { useCallback, useState } from "react";
import { saveNotificationRoutingAutosaveAction, type NotificationPolicyAutosavePatch } from "@/lib/actions";
import { isAuthenticationNotification, resolveNotificationRouting, type NotificationRoutingRecord } from "@/lib/notification-routing";
import { StudioAutosaveForm } from "@/components/studio/studio-autosave-form";
import type { StudioMutationRequest, StudioMutationSnapshot } from "@/lib/studio-mutations";

export function GlobalRoutingEditor({ record, onSaved }: { record: NotificationRoutingRecord; onSaved: (record: NotificationRoutingRecord) => void }) {
  const [value, setValue] = useState(record.forwardTo);
  const createPayload = useCallback((form: HTMLFormElement) => ({ forwardTo: String(new FormData(form).get("forwardTo") ?? "") }), []);
  const mutate = useCallback((request: StudioMutationRequest<{ forwardTo: string }>) => saveNotificationRoutingAutosaveAction({ patch: request.payload, operationId: request.operationId, expectedUpdatedAt: request.expectedUpdatedAt }), []);
  const adopt = useCallback((snapshot: StudioMutationSnapshot<NotificationRoutingRecord>) => {
    if (snapshot.phase === "saved" && !snapshot.hasUnsavedChanges && snapshot.currentEntity) {
      setValue(snapshot.currentEntity.forwardTo);
      onSaved(snapshot.currentEntity);
    }
  }, [onSaved]);
  return <article className="studio-panel notification-routing" data-audit-id="notification-global-routing">
    <h3>Delivery defaults</h3>
    <StudioAutosaveForm className="request-form compact-form" createPayload={createPayload} entityKey="notification-routing:site" expectedUpdatedAt={record.updatedAt} mutate={mutate} onStatus={adopt}>
      <label><span>Global forwarding recipients (BCC)</span><textarea aria-describedby="global-forwarding-help" name="forwardTo" rows={3} value={value} onChange={event => setValue(event.target.value)} /></label>
      <p id="global-forwarding-help">Receives a copy of applicable application-generated notification emails. Separate addresses with commas, semicolons, or new lines. Clear this field to stop global copies. Changes apply to newly queued mail; Delivery shows the saved recipients for existing mail.</p>
      <p><strong>Security exception:</strong> verification and password-reset links go only to the account email that requested them. Global, per-Type, and event copies never receive these links. Older queued authentication emails without recipient proof require a fresh link.</p>
    </StudioAutosaveForm>
    <details><summary>Address roles and correspondence</summary>
      <dl className="notification-routing-roles">
        <dt>Builder email</dt><dd>{record.builderEmail}. Primary woodshop/customer correspondence; change it in Settings.</dd>
        <dt>Legacy account/visitor notice recipient</dt><dd>{record.notificationForwardEmail || "Builder email fallback"}. This is a primary notice destination, not global BCC.</dd>
        <dt>SMTP Reply-To</dt><dd>{record.replyTo}. Replies to notification emails use this address, independent of the Builder email and BCC.</dd>
        <dt>SMTP sender</dt><dd>See SMTP for the current From identity and transport verification. Routing does not change credentials or the sender.</dd>
        <dt>Per-Type routing</dt><dd>Types controls primary recipient selection and additional copies. Delivery records the exact normalized To/CC/BCC chosen when each message was queued.</dd>
        <dt>Mailbox forwarding</dt><dd>Rules in your email provider are separate and cannot be inspected or changed here.</dd>
      </dl>
    </details>
  </article>;
}

export function RoutingPreview({ policy, routing }: { policy: NotificationPolicyAutosavePatch; routing: NotificationRoutingRecord }) {
  const [eventRecipient, setEventRecipient] = useState(policy.category.endsWith("_admin") ? routing.builderEmail : "buyer@example.test");
  const [eventBcc, setEventBcc] = useState("");
  let effective: ReturnType<typeof resolveNotificationRouting> | undefined;
  let error = "";
  try { effective = resolveNotificationRouting({ category: policy.category, recipientMode: policy.recipientMode, requested: eventRecipient, configured: policy.recipients, globalForwarding: routing.forwardTo, categoryForwarding: policy.forwardRecipients, bcc: eventBcc }); }
  catch (reason) { error = (reason as Error).message; }
  return <details className="notification-routing-preview" open>
    <summary>Effective delivery routing</summary>
    {isAuthenticationNotification(policy.category) ? <p><strong>Account-link protection:</strong> the event account is the only recipient. The stored recipient-source and forwarding fields above do not override this security rule.</p> : <p>Effective BCC = global forwarding + per-Type forwarding + event-specific BCC, with duplicate To/CC recipients excluded. Paused types do not send.</p>}
    <p>Global BCC: <strong>{routing.forwardTo || "None"}</strong>{isAuthenticationNotification(policy.category) ? " (excluded for this type)" : ""}</p>
    <div className="field-grid two-up compact-grid">
      <label><span>Example event recipient (preview only)</span><input data-studio-autosave="ignore" value={eventRecipient} onChange={event => setEventRecipient(event.target.value)} /></label>
      <label><span>Example event BCC (preview only)</span><input data-studio-autosave="ignore" value={eventBcc} onChange={event => setEventBcc(event.target.value)} /></label>
    </div>
    <output aria-live="polite">{error || `Effective To: ${effective?.recipients.join(", ") || "None"}. Effective BCC: ${effective?.bccRecipients.join(", ") || "None"}.`}</output>
    <p>This example does not send mail or change routing. Each actual event supplies its recipient; Delivery is the record of what was queued.</p>
  </details>;
}
