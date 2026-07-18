"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { submitContactRequestAction } from "@/lib/actions";
import { browserOperationId } from "@/lib/browser-id";
import type { CommissionTypeRecord } from "@/lib/db";
import { CustomWorkVisualizer3D } from "@/components/visualizer";

const STORAGE_KEY = "beaman-commission-draft-v2";
const STEPS = [
  "Intent",
  "Category",
  "Room & use",
  "Dimensions",
  "Materials",
  "References",
  "Preview",
  "Fulfillment",
  "Contact",
  "Review"
] as const;

type StoredDraft = {
  values?: Record<string, string>;
  currentStep?: number;
  idempotencyKey?: string;
  draftId?: string;
  draftUpdatedAt?: string;
};

function serializeForm(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (value instanceof File || name === "visualizationSvg") continue;
    values[name] = String(value);
  }
  return values;
}

function restoreForm(form: HTMLFormElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const fields = Array.from(form.elements).filter((field): field is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && field.name === name
    );
    for (const field of fields) {
      if (field instanceof HTMLInputElement && (field.type === "radio" || field.type === "checkbox")) field.checked = field.value === value;
      else if (!(field instanceof HTMLInputElement && field.type === "hidden")) field.value = value;
    }
  }
}

export function IdempotencyInput() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current && !inputRef.current.value) inputRef.current.value = browserOperationId();
  }, []);
  return <input defaultValue="" name="idempotencyKey" ref={inputRef} required type="hidden" />;
}

function CommissionSubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button aria-describedby="commission-submit-status" className="button-primary full-width" disabled={!ready || pending} type="submit">
      {pending ? "Uploading references and submitting..." : "Submit custom work request"}
    </button>
  );
}

export function CommissionWorkflow({
  commissionTypes,
  bandwidthLeadTimeDays,
  queueCount,
  defaultName = "",
  defaultEmail = "",
  signedIn = false
}: {
  commissionTypes: CommissionTypeRecord[];
  bandwidthLeadTimeDays: number;
  queueCount: number;
  defaultName?: string;
  defaultEmail?: string;
  signedIn?: boolean;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const idempotencyRef = useRef("");
  const draftIdRef = useRef("");
  const draftUpdatedAtRef = useRef("");
  const [currentStep, setCurrentStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [draftId, setDraftId] = useState("");
  const [planningCategory, setPlanningCategory] = useState(commissionTypes[0]?.slug ?? "other-custom-work");
  const [requestedDimensions, setRequestedDimensions] = useState({ width: "", depth: "", height: "" });
  const [saveStatus, setSaveStatus] = useState("Draft saves in this browser.");
  const [filePreviews, setFilePreviews] = useState<Array<{ name: string; url: string }>>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let stored: StoredDraft = {};
    try { stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as StoredDraft; } catch { stored = {}; }
    const key = stored.idempotencyKey && /^[a-zA-Z0-9][a-zA-Z0-9._-]{15,127}$/.test(stored.idempotencyKey) ? stored.idempotencyKey : browserOperationId();
    idempotencyRef.current = key;
    draftIdRef.current = stored.draftId ?? "";
    draftUpdatedAtRef.current = stored.draftUpdatedAt ?? "";
    setIdempotencyKey(key);
    setDraftId(draftIdRef.current);
    const restoredStep = Math.max(1, Math.min(10, Number(stored.currentStep ?? 1)));
    setCurrentStep(restoredStep);
    setFurthestStep(restoredStep);
    if (stored.values) {
      restoreForm(form, stored.values);
      setPlanningCategory(stored.values.planningCategory || stored.values.commissionTypeSlug || commissionTypes[0]?.slug || "other-custom-work");
      setRequestedDimensions({
        width: stored.values.requestedWidth ?? "",
        depth: stored.values.requestedDepth ?? "",
        height: stored.values.requestedHeight ?? ""
      });
    }

    if (signedIn) {
      const draftUrl = draftIdRef.current ? `/api/commissions/draft?id=${encodeURIComponent(draftIdRef.current)}` : "/api/commissions/draft";
      void fetch(draftUrl, { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{
          draft?: { id?: string; payload?: Record<string, string>; currentStep?: number; updatedAt?: string; status?: string };
          drafts?: Array<{ id: string; payload?: Record<string, string>; currentStep?: number; updatedAt?: string; status?: string }>;
        }> : null)
        .then((payload) => {
          const accountDraft = payload?.draft ?? payload?.drafts?.find((candidate) => candidate.status === "draft");
          if (!accountDraft) return;
          const values = accountDraft.payload ?? {};
          restoreForm(form, values);
          const step = Math.max(1, Math.min(10, Number(accountDraft.currentStep ?? restoredStep)));
          setCurrentStep(step);
          setFurthestStep((current) => Math.max(current, step));
          draftIdRef.current = accountDraft.id ?? draftIdRef.current;
          draftUpdatedAtRef.current = accountDraft.updatedAt ?? "";
          setDraftId(draftIdRef.current);
          setPlanningCategory(values.planningCategory || values.commissionTypeSlug || commissionTypes[0]?.slug || "other-custom-work");
          setRequestedDimensions({
            width: values.requestedWidth ?? "",
            depth: values.requestedDepth ?? "",
            height: values.requestedHeight ?? ""
          });
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            values,
            currentStep: step,
            idempotencyKey: idempotencyRef.current,
            draftId: draftIdRef.current,
            draftUpdatedAt: draftUpdatedAtRef.current
          }));
          setSaveStatus("Resumed the latest saved account draft.");
          setRevision((current) => current + 1);
        })
        .catch(() => setSaveStatus("Browser draft restored. Account sync is temporarily unavailable."));
    }
  }, [commissionTypes, signedIn]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    filePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [filePreviews]);

  function persistDraft(step = currentStep) {
    const form = formRef.current;
    if (!form || !idempotencyRef.current) return Promise.resolve();
    const values = serializeForm(form);
    const localDraft: StoredDraft = {
      values,
      currentStep: step,
      idempotencyKey: idempotencyRef.current,
      draftId: draftIdRef.current,
      draftUpdatedAt: draftUpdatedAtRef.current
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localDraft));
    setSaveStatus(signedIn ? "Saving account draft..." : "Draft saved in this browser.");
    if (!signedIn) return Promise.resolve();
    const save = async () => {
      try {
        const response = await fetch("/api/commissions/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: draftIdRef.current || null,
            payload: values,
            currentStep: step,
            idempotencyKey: idempotencyRef.current,
            expectedUpdatedAt: draftUpdatedAtRef.current || null
          })
        });
        const result = await response.json() as { message?: string; draft?: { id: string; updatedAt: string } };
        if (!response.ok || !result.draft) throw new Error(result.message || "Draft save failed.");
        draftIdRef.current = result.draft.id;
        draftUpdatedAtRef.current = result.draft.updatedAt;
        setDraftId(result.draft.id);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...localDraft, draftId: result.draft.id, draftUpdatedAt: result.draft.updatedAt }));
        setSaveStatus("Account draft saved.");
      } catch (error) {
        setSaveStatus(error instanceof Error ? `${error.message} Browser copy retained.` : "Account sync failed. Browser copy retained.");
      }
    };
    const queued = draftSaveQueueRef.current.then(save, save);
    draftSaveQueueRef.current = queued;
    return queued;
  }

  function scheduleAutosave() {
    setRevision((current) => current + 1);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => void persistDraft(), 700);
  }

  function validateStep(step: number) {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-commission-step="${step}"]`);
    if (!section) return true;
    const fields = Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        field.focus();
        return false;
      }
    }
    return true;
  }

  function moveTo(step: number) {
    const next = Math.max(1, Math.min(10, step));
    if (next > currentStep && !validateStep(currentStep)) return;
    setCurrentStep(next);
    setFurthestStep((current) => Math.max(current, next));
    void persistDraft(next);
    formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function updateFiles() {
    filePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    const files = Array.from(fileInputRef.current?.files ?? []);
    setFilePreviews(files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })));
    scheduleAutosave();
  }

  function removeFile(index: number) {
    const input = fileInputRef.current;
    if (!input?.files) return;
    const transfer = new DataTransfer();
    Array.from(input.files).forEach((file, fileIndex) => { if (fileIndex !== index) transfer.items.add(file); });
    input.files = transfer.files;
    updateFiles();
  }

  const review = formRef.current ? serializeForm(formRef.current) : {};
  void revision;

  return (
    <form action={submitContactRequestAction} className="request-form commission-workflow" onChange={scheduleAutosave} onInput={scheduleAutosave} ref={formRef}>
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="draftId" type="hidden" value={draftId} />
      <input name="requestSource" type="hidden" value="commissions-workflow" />
      <input name="pieceSlug" type="hidden" value="" />
      <label aria-hidden="true" className="form-honeypot" hidden><span>Company website</span><input autoComplete="off" name="companyWebsite" tabIndex={-1} type="text" /></label>

      <div className="commission-progress" aria-label={`Step ${currentStep} of ${STEPS.length}`}>
        <div className="commission-progress-meter"><span style={{ width: `${currentStep / STEPS.length * 100}%` }} /></div>
        <div><strong>Step {currentStep} of {STEPS.length}</strong><span>{saveStatus}</span></div>
        <ol>
          {STEPS.map((label, index) => {
            const step = index + 1;
            return <li key={label}><button aria-current={step === currentStep ? "step" : undefined} disabled={step > furthestStep} onClick={() => moveTo(step)} type="button"><span>{step}</span>{label}</button></li>;
          })}
        </ol>
      </div>

      <section data-commission-step="1" hidden={currentStep !== 1}>
        <h2>What kind of help do you need?</h2>
        <div className="choice-card-grid">
          {[
            ["new-build", "New commissioned build", "Plan an original piece around a room, use, and dimensions."],
            ["variation", "Variation on existing work", "Use a portfolio piece as the starting point, then change proportion or material."],
            ["repair", "Repair or restoration review", "Send condition photos and describe the repair before transport is discussed."]
          ].map(([value, title, copy], index) => <label className="choice-card" key={value}><input defaultChecked={index === 0} name="intent" required type="radio" value={value} /><span><strong>{title}</strong><small>{copy}</small></span></label>)}
        </div>
      </section>

      <section data-commission-step="2" hidden={currentStep !== 2}>
        <h2>Choose a category or reference</h2>
        <label><span>General category</span><select name="planningCategory" onChange={(event) => setPlanningCategory(event.target.value)} required value={planningCategory}>{commissionTypes.map((type) => <option key={type.slug} value={type.slug}>{type.label}</option>)}{commissionTypes.some((type) => type.slug === "other-custom-work") ? null : <option value="other-custom-work">Other custom work</option>}</select></label>
        <label><span>Portfolio piece or link to use as a reference</span><input name="referencePieceSlug" placeholder="Piece name, portfolio slug, or reference URL" type="text" /></label>
      </section>

      <section data-commission-step="3" hidden={currentStep !== 3}>
        <h2>Describe the room and daily use</h2>
        <div className="field-grid two-up compact-grid"><label><span>Room or location</span><input name="roomLocation" required type="text" /></label><label><span>Primary use</span><input name="roomUse" required type="text" /></label></div>
        <div className="field-grid two-up compact-grid"><label><span>Load or function</span><input name="functionalLoad" placeholder="People, equipment, storage, weight" type="text" /></label><label><span>Accessibility or fit constraints</span><input name="fitConstraints" placeholder="Doorways, reach, mobility, clearances" type="text" /></label></div>
        <label><span>Project brief</span><textarea name="message" required rows={6} /></label>
      </section>

      <section data-commission-step="4" hidden={currentStep !== 4}>
        <h2>Record working dimensions</h2>
        <p className="muted-copy">Use exact measurements when known. Confirm or refine them again in the proportional preview.</p>
        <div className="field-grid three-up compact-grid"><label><span>Width (in)</span><input min="4" name="requestedWidth" onChange={(event) => setRequestedDimensions((current) => ({ ...current, width: event.target.value }))} required step="0.25" type="number" value={requestedDimensions.width} /></label><label><span>Depth (in)</span><input min="2" name="requestedDepth" onChange={(event) => setRequestedDimensions((current) => ({ ...current, depth: event.target.value }))} required step="0.25" type="number" value={requestedDimensions.depth} /></label><label><span>Height (in)</span><input min="2" name="requestedHeight" onChange={(event) => setRequestedDimensions((current) => ({ ...current, height: event.target.value }))} required step="0.25" type="number" value={requestedDimensions.height} /></label></div>
        <label><span>Configuration notes</span><textarea name="configurationNotes" placeholder="Doors, drawers, shelves, seating count, cable paths, or appliance clearances" rows={4} /></label>
      </section>

      <section data-commission-step="5" hidden={currentStep !== 5}>
        <h2>Materials and details</h2>
        <div className="field-grid two-up compact-grid"><label><span>Finish preference</span><input name="finishPreference" placeholder="Natural oil, clear finish, paint, open to recommendation" type="text" /></label><label><span>Joinery preference</span><select defaultValue="Mortise and tenon" name="joineryPreference"><option>Mortise and tenon</option><option>Exposed dovetail</option><option>Half-lap</option><option>Pinned frame</option><option>Concealed joinery</option></select></label></div>
        <label><span>Hardware preference</span><input name="hardwarePreference" placeholder="No hardware, dark metal, brass, concealed, open to recommendation" type="text" /></label>
      </section>

      <section data-commission-step="6" hidden={currentStep !== 6}>
        <h2>Add room photos, sketches, or measurements</h2>
        <label><span>Up to 8 images, 20 MB each, 60 MB total</span><input accept="image/avif,image/gif,image/heic,image/heif,image/jpeg,image/png,image/webp" multiple name="attachments" onChange={updateFiles} ref={fileInputRef} type="file" /></label>
        {filePreviews.length ? <div aria-label="Commission reference previews" className="commission-upload-previews" data-media-collection="commission-reference-previews" data-media-collection-variant="editorial-grid" role="region">{filePreviews.map((preview, index) => <figure data-media-id={`${preview.name}:${index}`} data-media-item="true" data-media-order={index} key={`${preview.name}-${index}`}><img alt={`Reference preview: ${preview.name}`} src={preview.url} /><figcaption>{preview.name}</figcaption><button onClick={() => removeFile(index)} type="button">Remove</button></figure>)}</div> : <p className="muted-copy">No files selected. References are optional and remain private to this project.</p>}
      </section>

      <section data-commission-step="7" hidden={currentStep !== 7}>
        <h2>Preview proportion and estimate</h2>
        <CustomWorkVisualizer3D
          bandwidthLeadTimeDays={bandwidthLeadTimeDays}
          commissionTypes={commissionTypes}
          initialDimensions={{
            width: Number(requestedDimensions.width),
            depth: Number(requestedDimensions.depth),
            height: Number(requestedDimensions.height)
          }}
          initialTypeSlug={planningCategory}
          key={`${planningCategory}-${requestedDimensions.width}-${requestedDimensions.depth}-${requestedDimensions.height}`}
          lockType
          queueCount={queueCount}
        />
      </section>

      <section data-commission-step="8" hidden={currentStep !== 8}>
        <h2>Fulfillment, location, timing, and budget</h2>
        <div className="field-grid two-up compact-grid"><label><span>City / region</span><input name="cityRegion" required type="text" /></label><label><span>Pickup / delivery</span><select defaultValue="" name="deliveryMode" required><option disabled value="">Choose one</option><option value="pickup">Pickup</option><option value="local-delivery">Local delivery</option><option value="shipment">Shipment or freight review</option></select></label></div>
        <div className="field-grid two-up compact-grid"><label><span>Timing preference</span><input name="timingPreference" placeholder="Event date, flexible season, or no deadline" type="text" /></label><label><span>Budget ceiling ($)</span><input min="0" name="budgetDollars" step="1" type="number" /></label></div>
        <p className="muted-copy">Current queue guidance is about {Math.max(1, Math.round(bandwidthLeadTimeDays / 7))} weeks with {queueCount} active project{queueCount === 1 ? "" : "s"}. The server recalculates lead time when you submit.</p>
      </section>

      <section data-commission-step="9" hidden={currentStep !== 9}>
        <h2>Contact identity</h2>
        <div className="field-grid two-up compact-grid"><label><span>Your name</span><input defaultValue={defaultName} name="customerName" required type="text" /></label><label><span>Email</span><input defaultValue={defaultEmail} name="email" required type="email" /></label></div>
        <label><span>Phone (optional)</span><input name="phone" type="tel" /></label>
      </section>

      <section data-commission-step="10" hidden={currentStep !== 10}>
        <h2>Review and submit</h2>
        <dl className="commission-review-list"><div><dt>Intent</dt><dd>{review.intent || "Not set"}</dd></div><div><dt>Category</dt><dd>{review.planningCategory || review.commissionTypeSlug || "Not set"}</dd></div><div><dt>Location</dt><dd>{review.cityRegion || review.roomLocation || "Not set"}</dd></div><div><dt>Fulfillment</dt><dd>{review.deliveryMode || "Not set"}</dd></div><div><dt>Contact</dt><dd>{review.customerName || defaultName || "Not set"}</dd></div></dl>
        <p className="notice-panel">The displayed estimate is planning guidance, not a quote. The server recalculates materials, labor, overhead, markup, queue load, and lead time from the submitted options before creating the private project.</p>
        <label className="checkbox-row"><input name="accuracyConfirmation" required type="checkbox" value="1" /><span>I reviewed the contact details, dimensions, and project brief.</span></label>
        <CommissionSubmitButton ready={Boolean(idempotencyKey)} />
        <p aria-live="polite" className="muted-copy" id="commission-submit-status">Files are uploaded only when you submit. Keep this page open until the private project page appears.</p>
      </section>

      <div className="commission-step-actions">
        <button className="button-secondary" disabled={currentStep === 1} onClick={() => moveTo(currentStep - 1)} type="button">Back</button>
        {currentStep < 10 ? <button className="button-primary" onClick={() => moveTo(currentStep + 1)} type="button">Save and continue</button> : null}
      </div>
    </form>
  );
}
