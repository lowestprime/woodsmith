"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveConditionalRoutingAutosaveAction } from "@/lib/actions";
import { CONDITIONAL_DIMENSIONS, CONDITIONAL_NOTIFICATION_TYPES, matchConditionalRules, normalizeConditionalRules, type ConditionalContext, type ConditionalRoutingRecord, type ConditionalRule } from "@/lib/conditional-notification-routing";
import { resolveNotificationRouting, type NotificationRoutingRecord } from "@/lib/notification-routing";
import type { NotificationPolicyRecord } from "@/lib/db";
import type { StudioMutationRequest, StudioMutationSnapshot } from "@/lib/studio-mutations";
import { StudioAutosaveForm } from "./studio-autosave-form";

const labels: Record<keyof ConditionalContext, string> = { intent: "Inquiry intent", topic: "Inquiry topic", sourceSurface: "Source surface", channel: "Channel", pieceAvailability: "Piece availability", sourceRoute: "Exact source route", pieceSlug: "Canonical piece slug" };
const dimensions = Object.keys(labels) as Array<keyof ConditionalContext>;
const typeLabels = { customer_inquiry_admin: "Operator inquiry notice", commission_submitted: "Planner customer confirmation" };
const emptyRule = (): ConditionalRule => ({ id: globalThis.crypto?.randomUUID?.() ?? `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name: "", enabled: true, category: "", conditions: {}, bccRecipients: [] });

function RuleFields({ rule, prefix, update }: { rule: ConditionalRule; prefix: string; update: (rule: ConditionalRule) => void }) {
  return <>
    <div className="field-grid two-up compact-grid">
      <label><span>Rule name</span><input name={`${prefix}name`} value={rule.name} maxLength={80} onChange={event => update({ ...rule, name: event.target.value })} /></label>
      <label><span>Notification type</span><select aria-label="Notification type" name={`${prefix}category`} value={rule.category} onChange={event => update({ ...rule, category: event.target.value as ConditionalRule["category"] })}><option value="">Both inquiry mail types</option>{CONDITIONAL_NOTIFICATION_TYPES.map(type => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
      {dimensions.map(key => <label key={key}><span>{labels[key]}</span>{key in CONDITIONAL_DIMENSIONS
        ? <select aria-label={labels[key]} name={`${prefix}${key}`} value={rule.conditions[key] ?? ""} onChange={event => update({ ...rule, conditions: { ...rule.conditions, [key]: event.target.value } })}><option value="">Any</option>{CONDITIONAL_DIMENSIONS[key as keyof typeof CONDITIONAL_DIMENSIONS].map(value => <option key={value} value={value}>{value}</option>)}</select>
        : <input name={`${prefix}${key}`} value={rule.conditions[key] ?? ""} maxLength={key === "pieceSlug" ? 120 : 256} placeholder={key === "pieceSlug" ? "Any piece" : "Any supported route"} onChange={event => update({ ...rule, conditions: { ...rule.conditions, [key]: event.target.value } })} />}</label>)}
    </div>
    <label><span>Private BCC recipients</span><textarea aria-label="Private BCC recipients" name={`${prefix}bcc`} rows={2} value={rule.bccRecipients.join("\n")} onChange={event => update({ ...rule, bccRecipients: [event.target.value] })} /></label>
    <label className="checkbox-row"><input name={`${prefix}enabled`} type="checkbox" checked={rule.enabled} onChange={event => update({ ...rule, enabled: event.target.checked })} /><span>Rule enabled</span></label>
  </>;
}

export function ConditionalRoutingEditor({ initialRecord, routing, policies }: { initialRecord: ConditionalRoutingRecord; routing: NotificationRoutingRecord; policies: NotificationPolicyRecord[] }) {
  const [record, setRecord] = useState(initialRecord);
  const [rules, setRules] = useState(record.rules);
  const [draft, setDraft] = useState<ConditionalRule | null>(null);
  const [draftError, setDraftError] = useState("");
  const [structuralSave, setStructuralSave] = useState(0);
  const host = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const draftErrorRef = useRef<HTMLParagraphElement>(null);
  const createPayload = useCallback((form: HTMLFormElement) => {
    const data = new FormData(form);
    return { rules: Array.from(form.querySelectorAll<HTMLElement>("[data-rule-id]")).map(row => {
      const id = row.dataset.ruleId!;
      const prefix = `${id}:`;
      return { id, name: String(data.get(`${prefix}name`) ?? ""), category: String(data.get(`${prefix}category`) ?? "") as ConditionalRule["category"], enabled: data.has(`${prefix}enabled`), bccRecipients: [String(data.get(`${prefix}bcc`) ?? "")], conditions: Object.fromEntries(dimensions.map(key => [key, String(data.get(`${prefix}${key}`) ?? "")])) } as ConditionalRule;
    }) };
  }, []);
  const mutate = useCallback((request: StudioMutationRequest<{ rules: ConditionalRule[] }>) => saveConditionalRoutingAutosaveAction({ patch: request.payload, operationId: request.operationId, expectedUpdatedAt: request.expectedUpdatedAt }), []);
  const adopt = useCallback((snapshot: StudioMutationSnapshot<ConditionalRoutingRecord>) => {
    if (snapshot.phase === "saved" && !snapshot.hasUnsavedChanges && snapshot.currentEntity) {
      setRecord(snapshot.currentEntity); setRules(snapshot.currentEntity.rules);
    }
  }, []);
  useEffect(() => {
    if (structuralSave) host.current?.querySelector<HTMLFormElement>("form[data-studio-autosave]")?.requestSubmit();
  }, [structuralSave]);
  return <article ref={host} className="studio-panel notification-routing" data-audit-id="notification-conditional-routing">
    <h3>Conditional website-generated BCC</h3>
    <p>Private copies of legitimate website inquiry notices and planner customer confirmations. Primary recipients, global forwarding and per-Type forwarding keep their separate roles. Account links never receive copies.</p>
    <p>All conditions within a rule must match; matching rules add their recipients together. Available means the submitted canonical piece was in stock and accepted exact-piece inquiries; reference-only means a linked piece without that availability. Source routes are validated inquiry context, not proof of navigation. Rules do not inspect messages, uploads or security tokens.</p>
    <StudioAutosaveForm className="request-form compact-form" createPayload={createPayload} entityKey="notification-conditional-routing:website" expectedUpdatedAt={record.updatedAt} mutate={mutate} onStatus={adopt}>
      {!rules.length && <p>No conditional rules. New mail uses the existing routing defaults.</p>}
      {rules.map((rule, index) => <fieldset className="notification-conditional-rule" data-rule-id={rule.id} key={rule.id}>
        <legend>Rule {index + 1}</legend>
        <RuleFields rule={rule} prefix={`${rule.id}:`} update={value => setRules(current => current.map(item => item.id === rule.id ? value : item))} />
        <button type="button" className="button-secondary" data-studio-autosave="ignore" onClick={() => { setRules(current => current.filter(item => item.id !== rule.id)); setStructuralSave(value => value + 1); addButton.current?.focus(); }}>Remove rule {index + 1}</button>
      </fieldset>)}
      {rules.length > 0 && <button type="button" data-studio-autosave="ignore" className="button-secondary" onClick={() => { setRules([]); setStructuralSave(value => value + 1); addButton.current?.focus(); }}>Clear all conditional rules</button>}
    </StudioAutosaveForm>
    <button ref={addButton} type="button" className="button-secondary" disabled={rules.length >= 20 || Boolean(draft)} onClick={() => { setDraft(emptyRule()); setDraftError(""); }}>New conditional rule</button>
    {draft && <form className="request-form compact-form" aria-label="New conditional rule" onSubmit={event => {
      event.preventDefault();
      try {
        const normalized = normalizeConditionalRules([...rules, draft]);
        setRules(normalized); setDraft(null); setDraftError(""); setStructuralSave(value => value + 1); requestAnimationFrame(() => addButton.current?.focus());
      } catch (error) { setDraftError((error as Error).message); requestAnimationFrame(() => draftErrorRef.current?.focus()); }
    }}>
      <h4>New rule (unsaved until added)</h4>
      <RuleFields rule={draft} prefix="draft:" update={setDraft} />
      {draftError && <p ref={draftErrorRef} role="alert" tabIndex={-1}>{draftError}</p>}
      <div className="button-row"><button type="submit">Add rule</button><button type="button" className="button-secondary" onClick={() => { setDraft(null); requestAnimationFrame(() => addButton.current?.focus()); }}>Cancel new rule</button></div>
    </form>}
    <ConditionalPreview rules={record.rules} routing={routing} policies={policies} />
  </article>;
}

function ConditionalPreview({ rules, routing, policies }: { rules: ConditionalRule[]; routing: NotificationRoutingRecord; policies: NotificationPolicyRecord[] }) {
  const [category, setCategory] = useState<string>("customer_inquiry_admin");
  const [context, setContext] = useState<ConditionalContext>({ intent: "general-inquiry", topic: "general", sourceSurface: "contact", channel: "inquiry", sourceRoute: "/contact", pieceSlug: "", pieceAvailability: "no-piece" });
  const [to, setTo] = useState(routing.builderEmail);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [hasContext, setHasContext] = useState(false);
  const policy = policies.find(item => item.category === category);
  const matches = matchConditionalRules(rules, category, hasContext ? context : null);
  let result = "";
  try {
    const effective = resolveNotificationRouting({ category, recipientMode: policy?.recipientMode ?? "request", requested: to, configured: policy?.recipients, globalForwarding: routing.forwardTo, categoryForwarding: policy?.forwardRecipients, cc, bcc, conditionalBcc: matches.bccRecipients });
    result = `Effective To: ${effective.recipients.join(", ") || "None"}. Effective CC: ${effective.ccRecipients.join(", ") || "None"}. Effective BCC: ${effective.bccRecipients.join(", ") || "None"}.`;
  } catch (error) { result = (error as Error).message; }
  return <details className="notification-routing-preview" open>
    <summary>Conditional effective-routing preview</summary>
    <p>Uses saved rules and current routing settings. All fields below are hypothetical, never saved or sent. Actual mail uses the persisted legitimate inquiry, including catalog truth at submission. Quarantine creates no mail. Existing queued recipients remain frozen.</p>
    <label><span>Example notification type (preview only)</span><select aria-label="Example notification type (preview only)" value={category} onChange={event => setCategory(event.target.value)}>{policies.map(item => <option key={item.category} value={item.category}>{item.label}</option>)}</select></label>
    <label className="checkbox-row"><input type="checkbox" checked={hasContext} onChange={event => setHasContext(event.target.checked)} /><span>Example has legitimate persisted inquiry context (preview only)</span></label>
    <div className="field-grid two-up compact-grid">
      {dimensions.map(key => <label key={key}><span>Example {labels[key].toLowerCase()} (preview only)</span>{key in CONDITIONAL_DIMENSIONS
        ? <select aria-label={`Example ${labels[key].toLowerCase()} (preview only)`} value={context[key]} onChange={event => setContext({ ...context, [key]: event.target.value })}>{CONDITIONAL_DIMENSIONS[key as keyof typeof CONDITIONAL_DIMENSIONS].map(value => <option key={value} value={value}>{value}</option>)}</select>
        : <input value={context[key]} onChange={event => setContext({ ...context, [key]: event.target.value })} />}</label>)}
      <label><span>Example To (preview only)</span><input value={to} onChange={event => setTo(event.target.value)} /></label>
      <label><span>Example CC (preview only)</span><input value={cc} onChange={event => setCc(event.target.value)} /></label>
      <label><span>Example event BCC (preview only)</span><input value={bcc} onChange={event => setBcc(event.target.value)} /></label>
    </div>
    <p>Matching saved rules: {matches.ruleNames.join(", ") || "None"}. {policy?.enabled ? "Type enabled." : "Type paused; new mail will not send."}</p>
    <output aria-live="polite">{result}</output>
  </details>;
}
