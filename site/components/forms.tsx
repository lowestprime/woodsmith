import { CommissionVisualizerFields } from "@/components/visualizer";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signupAction,
  studioLoginAction,
  submitCommissionAction,
  submitProjectReplyAction,
  submitReviewAction,
  updateProfileAction
} from "@/lib/actions";
import type { CommissionTypeRecord, PieceRecord, ProjectRecord, UserRecord } from "@/lib/db";

export function CommissionRequestForm({ commissionTypes, bandwidthLeadTimeDays, bandwidthPercent, queueCount, piece }: {
  commissionTypes: CommissionTypeRecord[];
  bandwidthLeadTimeDays: number;
  bandwidthPercent: number;
  queueCount: number;
  piece?: PieceRecord | null;
}) {
  return (
    <form action={submitCommissionAction} className="request-form commission-form-shell">
      <div className="field-grid two-up compact-grid">
        <label>
          <span>Your name</span>
          <input name="customerName" required type="text" />
        </label>
        <label>
          <span>Email</span>
          <input name="email" required type="email" />
        </label>
      </div>
      <div className="field-grid three-up compact-grid">
        <label>
          <span>Phone</span>
          <input name="phone" type="text" />
        </label>
        <label>
          <span>City / region</span>
          <input name="city" type="text" />
        </label>
        <label>
          <span>Budget</span>
          <input name="budgetCents" placeholder="1200" type="number" />
        </label>
      </div>
      <input name="pieceSlug" type="hidden" value={piece?.slug ?? ""} />
      <CommissionVisualizerFields
        bandwidthLeadTimeDays={bandwidthLeadTimeDays}
        bandwidthPercent={bandwidthPercent}
        commissionTypes={commissionTypes.map((type) => ({
          slug: type.slug,
          label: type.label,
          description: type.description,
          materialOptions: type.materialOptions,
          defaultDimensions: type.defaultDimensions
        }))}
        queueCount={queueCount}
      />
      <button className="button-primary full-width" type="submit">Submit commission brief</button>
    </form>
  );
}

export function LoginForm({ redirectTo = "/account/profile", studio = false, email = "" }: { redirectTo?: string; studio?: boolean; email?: string }) {
  return (
    <form action={studio ? studioLoginAction : loginAction} className="request-form">
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <label>
        <span>Email</span>
        <input defaultValue={email} name="email" required type="email" />
      </label>
      <label>
        <span>Password</span>
        <input name="password" required type="password" />
      </label>
      <button className="button-primary" type="submit">{studio ? "Enter studio" : "Log in"}</button>
    </form>
  );
}

export function SignupForm() {
  return (
    <form action={signupAction} className="request-form">
      <label>
        <span>Name</span>
        <input name="displayName" required type="text" />
      </label>
      <label>
        <span>Email</span>
        <input name="email" required type="email" />
      </label>
      <label>
        <span>Password</span>
        <input name="password" required type="password" />
      </label>
      <button className="button-primary" type="submit">Create account</button>
    </form>
  );
}

export function ForgotPasswordForm() {
  return (
    <form action={forgotPasswordAction} className="request-form compact-form">
      <label>
        <span>Email</span>
        <input name="email" required type="email" />
      </label>
      <button className="button-secondary" type="submit">Send reset link</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <form action={resetPasswordAction} className="request-form compact-form">
      <input name="token" type="hidden" value={token} />
      <label>
        <span>New password</span>
        <input name="password" required type="password" />
      </label>
      <button className="button-primary" type="submit">Reset password</button>
    </form>
  );
}

export function ProfileForm({ user }: { user: UserRecord }) {
  return (
    <form action={updateProfileAction} className="request-form">
      <label>
        <span>Name</span>
        <input defaultValue={user.displayName} name="displayName" required type="text" />
      </label>
      <label>
        <span>Headline</span>
        <input defaultValue={user.headline} name="headline" type="text" />
      </label>
      <label>
        <span>Bio</span>
        <textarea defaultValue={user.bio} name="bio" rows={5} />
      </label>
      <label>
        <span>Links JSON</span>
        <textarea defaultValue={JSON.stringify(user.links, null, 2)} name="linksJson" rows={5} />
      </label>
      <label>
        <span>Profile picture</span>
        <input name="avatar" type="file" />
      </label>
      <button className="button-primary" type="submit">Save profile</button>
    </form>
  );
}

export function ProjectReplyForm({ project }: { project: ProjectRecord }) {
  return (
    <form action={submitProjectReplyAction} className="request-form compact-form">
      <input name="reference" type="hidden" value={project.reference} />
      <label>
        <span>Email</span>
        <input defaultValue={project.guestEmail} name="email" required type="email" />
      </label>
      <label>
        <span>Reply</span>
        <textarea name="body" required rows={4} />
      </label>
      <button className="button-secondary" type="submit">Post update</button>
    </form>
  );
}

export function ReviewForm({ piece }: { piece: PieceRecord }) {
  return (
    <form action={submitReviewAction} className="request-form compact-form">
      <input name="pieceSlug" type="hidden" value={piece.slug} />
      <div className="field-grid two-up compact-grid">
        <label>
          <span>Your name</span>
          <input name="reviewerName" required type="text" />
        </label>
        <label>
          <span>Email</span>
          <input name="email" type="email" />
        </label>
      </div>
      <div className="field-grid two-up compact-grid">
        <label>
          <span>Title</span>
          <input name="title" required type="text" />
        </label>
        <label>
          <span>Rating</span>
          <input defaultValue={5} max={5} min={1} name="rating" required type="number" />
        </label>
      </div>
      <label>
        <span>Review</span>
        <textarea name="body" required rows={4} />
      </label>
      <button className="button-secondary" type="submit">Submit review</button>
    </form>
  );
}
