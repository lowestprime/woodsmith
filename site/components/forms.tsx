import { commissionOptions, type Piece } from "@/lib/content";
import type { RequestRecord } from "@/lib/db";
import {
  loginStudioAction,
  logoutStudioAction,
  submitBuyerUpdate,
  submitCommissionRequest,
  submitPurchaseRequest,
  updateStudioRequestAction
} from "@/lib/actions";

export function CommissionRequestForm({
  pieceLabel,
  pieceSlug,
  className = ""
}: {
  pieceLabel?: string;
  pieceSlug?: string;
  className?: string;
}) {
  return (
    <form action={submitCommissionRequest} className={`request-form ${className}`.trim()}>
      <div className="field-grid two-up">
        <label>
          <span>Project type</span>
          <select defaultValue={pieceLabel || commissionOptions[0]} name="pieceLabel" required>
            {commissionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Your name</span>
          <input name="customerName" placeholder="Full name" required type="text" />
        </label>
      </div>
      <div className="field-grid two-up">
        <label>
          <span>Email</span>
          <input name="email" placeholder="you@example.com" required type="email" />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" placeholder="Optional" type="text" />
        </label>
      </div>
      <div className="field-grid three-up">
        <label>
          <span>Location</span>
          <input name="city" placeholder="City / region" type="text" />
        </label>
        <label>
          <span>Budget</span>
          <input name="budget" placeholder="Range or target" type="text" />
        </label>
        <label>
          <span>Timing</span>
          <input name="timeline" placeholder="Needed by / flexible" type="text" />
        </label>
      </div>
      <div className="field-grid two-up">
        <label>
          <span>Materials / finish</span>
          <input name="materials" placeholder="Preferred woods, stone, finish tone" type="text" />
        </label>
        <label>
          <span>Dimensions / room notes</span>
          <input name="dimensions" placeholder="Known dimensions or room constraints" type="text" />
        </label>
      </div>
      <label>
        <span>Project brief</span>
        <textarea name="message" placeholder="How the piece will be used, where it will live, and what matters most." required rows={6} />
      </label>
      <input name="pieceSlug" type="hidden" value={pieceSlug || ""} />
      <button className="button-primary" type="submit">Start Commission</button>
    </form>
  );
}

export function PurchaseRequestForm({ piece, className = "" }: { piece: Piece; className?: string }) {
  return (
    <form action={submitPurchaseRequest} className={`request-form ${className}`.trim()}>
      <div className="field-grid two-up">
        <label>
          <span>Piece</span>
          <input defaultValue={piece.name} name="pieceLabel" readOnly type="text" />
        </label>
        <label>
          <span>Your name</span>
          <input name="customerName" placeholder="Full name" required type="text" />
        </label>
      </div>
      <div className="field-grid two-up">
        <label>
          <span>Email</span>
          <input name="email" placeholder="you@example.com" required type="email" />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" placeholder="Optional" type="text" />
        </label>
      </div>
      <div className="field-grid three-up">
        <label>
          <span>Location</span>
          <input name="city" placeholder="City / region" type="text" />
        </label>
        <label>
          <span>Budget</span>
          <input name="budget" placeholder="Useful if you want a variation" type="text" />
        </label>
        <label>
          <span>Timing</span>
          <input name="timeline" placeholder="When you would want delivery" type="text" />
        </label>
      </div>
      <label>
        <span>Reservation note</span>
        <textarea name="message" placeholder="Tell the studio whether you want the current piece, a finish adjustment, or shipping information." required rows={5} />
      </label>
      <input name="pieceSlug" type="hidden" value={piece.slug} />
      <input name="materials" type="hidden" value="" />
      <input name="dimensions" type="hidden" value="" />
      <button className="button-primary" type="submit">Reserve This Piece</button>
    </form>
  );
}

export function BuyerUpdateForm({ request }: { request: RequestRecord }) {
  return (
    <form action={submitBuyerUpdate} className="request-form compact-form">
      <div className="field-grid two-up">
        <label>
          <span>Reference</span>
          <input defaultValue={request.reference} name="reference" readOnly type="text" />
        </label>
        <label>
          <span>Email</span>
          <input defaultValue={request.email} name="email" required type="email" />
        </label>
      </div>
      <label>
        <span>Add a follow-up</span>
        <textarea name="body" placeholder="Share revisions, delivery questions, or room measurements here." required rows={4} />
      </label>
      <button className="button-secondary" type="submit">Post Update</button>
    </form>
  );
}

export function StudioLoginForm() {
  return (
    <form action={loginStudioAction} className="request-form studio-login">
      <label>
        <span>Studio password</span>
        <input name="password" placeholder="Enter password" required type="password" />
      </label>
      <button className="button-primary" type="submit">Enter Studio</button>
    </form>
  );
}

export function StudioToolbar() {
  return (
    <form action={logoutStudioAction}>
      <button className="button-secondary" type="submit">Log Out</button>
    </form>
  );
}

export function StudioRequestForm({ request }: { request: RequestRecord }) {
  return (
    <form action={updateStudioRequestAction} className="request-form studio-detail-form">
      <input name="reference" type="hidden" value={request.reference} />
      <div className="field-grid two-up">
        <label>
          <span>Status</span>
          <input defaultValue={request.status} name="status" required type="text" />
        </label>
        <label>
          <span>Stage</span>
          <input defaultValue={request.adminStage} name="adminStage" required type="text" />
        </label>
      </div>
      <label>
        <span>Public note</span>
        <textarea defaultValue={request.publicNotes} name="publicNotes" rows={4} />
      </label>
      <label>
        <span>Internal note</span>
        <textarea defaultValue={request.internalNotes} name="internalNotes" rows={4} />
      </label>
      <div className="field-grid two-up">
        <label>
          <span>Timeline message</span>
          <textarea name="studioMessage" placeholder="Optional update to append to the project timeline." rows={4} />
        </label>
        <label>
          <span>Visibility</span>
          <select defaultValue="public" name="messageVisibility">
            <option value="public">Public to buyer</option>
            <option value="private">Studio only</option>
          </select>
        </label>
      </div>
      <button className="button-primary" type="submit">Save Request</button>
    </form>
  );
}
