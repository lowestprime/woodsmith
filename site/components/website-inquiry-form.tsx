"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitWebsiteInquiryAction } from "@/lib/actions";
import { INQUIRY_INTENT_LABELS, pieceInquiryIntents, type InquiryPiece, type WebsiteInquiryIntent } from "@/lib/website-inquiry";
import type { TurnstileClientConfiguration } from "@/lib/turnstile";
import { InquiryTurnstile } from "@/components/inquiry-turnstile";

export function WebsiteInquiryForm({ piece, sourceRoute = "/contact", intent, defaultName = "", defaultEmail = "", turnstile, submissionKey }: {
  piece?: InquiryPiece | null; sourceRoute?: string; intent?: WebsiteInquiryIntent; defaultName?: string; defaultEmail?: string; turnstile: TurnstileClientConfiguration; submissionKey: string;
}) {
  const [state, submit, pending] = useActionState(submitWebsiteInquiryAction, { ok: false, message: "" });
  const [key] = useState(submissionKey);
  const intents: WebsiteInquiryIntent[] = piece ? pieceInquiryIntents(piece) : ["general-inquiry", "custom-commission"];
  const [values, setValues] = useState({ customerName: defaultName, email: defaultEmail, intent: intent && intents.includes(intent) ? intent : intents[0], topic: piece ? "piece" : "general", message: "", pieceReference: "" });
  const notice = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.message) notice.current?.focus(); }, [state]);
  function update(name: keyof typeof values, value: string) { setValues(current => ({ ...current, [name]: value })); }
  return <form action={submit} aria-busy={pending} className="request-form website-inquiry-form">
    <input name="idempotencyKey" type="hidden" value={key} />
    <input name="pieceSlug" type="hidden" value={piece?.slug ?? ""} />
    <input name="sourceRoute" type="hidden" value={sourceRoute} />
    <label className="form-honeypot" hidden aria-hidden="true"><span>Company website</span><input name="companyWebsite" autoComplete="off" tabIndex={-1} /></label>
    {piece ? <p className="notice-panel"><strong>{piece.title}</strong><br />{piece.availabilityLabel || "Contact the woodshop"}</p> : null}
    {state.message ? <p className="notice-panel" ref={notice} role={state.ok ? "status" : "alert"} tabIndex={-1}>{state.message}</p> : null}
    {!state.ok ? <>
      <div className="field-grid two-up compact-grid">
        <label><span>Your name</span><input name="customerName" autoComplete="name" required maxLength={120} value={values.customerName} onChange={event => update("customerName", event.target.value)} /></label>
        <label><span>Email</span><input name="email" type="email" autoComplete="email" required maxLength={254} value={values.email} onChange={event => update("email", event.target.value)} /></label>
      </div>
      <div className="field-grid two-up compact-grid">
        <label><span>Inquiry type</span><select name="intent" value={values.intent} onChange={event => update("intent", event.target.value)}>{intents.map(value => <option key={value} value={value}>{INQUIRY_INTENT_LABELS[value]}</option>)}</select></label>
        <label><span>Topic</span><select name="topic" value={values.topic} onChange={event => update("topic", event.target.value)}><option value="general">General question</option><option value="piece">A piece</option><option value="custom-work">Custom work</option><option value="delivery">Delivery</option><option value="care-repair">Care or repair</option></select></label>
      </div>
      {!piece ? <label><span>Piece or project reference (optional)</span><input name="pieceReference" maxLength={120} value={values.pieceReference} onChange={event => update("pieceReference", event.target.value)} /></label> : null}
      <label><span>Message</span><textarea name="message" required rows={5} maxLength={20000} value={values.message} onChange={event => update("message", event.target.value)} /></label>
      <InquiryTurnstile configuration={turnstile} resetKey={state} />
      <button type="submit" className="button-primary" disabled={pending || turnstile.mode === "unavailable"}>{pending ? "Sending inquiry…" : "Send inquiry"}</button>
    </> : null}
    <p className="muted-copy">Have dimensions, materials, or reference photos ready? <Link href="/commissions">Use the full commission planner</Link>.</p>
  </form>;
}
