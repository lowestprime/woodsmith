import {
  forgotPasswordAction,
  loginAction,
  resendVerificationAction,
  resetPasswordAction,
  signupAction,
  studioLoginAction,
  submitContactRequestAction,
  submitProjectReplyAction,
  submitReviewAction,
  updateProfileAction
} from "@/lib/actions";
import type { CommissionTypeRecord, PieceRecord, ProjectRecord, UserRecord } from "@/lib/db";
import { CustomWorkVisualizer3D } from "@/components/visualizer";
import { ProfileAvatarFields } from "@/components/profile-avatar-fields";

export function ContactRequestForm({ commissionTypes, bandwidthLeadTimeDays, queueCount, piece }: {
  commissionTypes: CommissionTypeRecord[];
  bandwidthLeadTimeDays: number;
  queueCount: number;
  piece?: PieceRecord | null;
}) {
  return (
    <form action={submitContactRequestAction} className="request-form commission-form-shell">
      <input name="pieceSlug" type="hidden" value={piece?.slug ?? ""} />
      {piece ? <input name="leadTimeDays" type="hidden" value={bandwidthLeadTimeDays} /> : null}
      <input name="requestSource" type="hidden" value={piece ? "piece-page" : "custom-work"} />
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
          <input name="cityRegion" type="text" />
        </label>
        <label>
          <span>Budget ($)</span>
          <input min="0" name="budgetDollars" placeholder="1200" step="1" type="number" />
        </label>
      </div>
      {!piece ? <CustomWorkVisualizer3D bandwidthLeadTimeDays={bandwidthLeadTimeDays} commissionTypes={commissionTypes} queueCount={queueCount} /> : null}
      <div className="field-grid two-up compact-grid">
        {piece ? (
          <label>
            <span>Material preference</span>
            <select defaultValue="" name="materialPreference">
              <option value="">Open to recommendation</option>
              {commissionTypes.flatMap((type) => type.materialOptions).filter((option, index, all) => all.indexOf(option) === index).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>Pickup / delivery</span>
          <select defaultValue="" name="deliveryMode">
            <option value="">Decide during review</option>
            <option value="pickup">Pickup</option>
            <option value="local-delivery">Local delivery</option>
            <option value="shipment">Shipment / freight</option>
          </select>
        </label>
      </div>
      <label>
        <span>What should the piece do, where will it live, and what timing should we know?</span>
        <textarea name="message" required rows={6} />
      </label>
      <label>
        <span>Reference photos or sketches</span>
        <input multiple name="attachments" type="file" />
      </label>
      <p className="muted-copy">Current lead time is about {Math.max(1, Math.round(bandwidthLeadTimeDays / 7))} weeks with {queueCount} active project{queueCount === 1 ? "" : "s"} in progress.</p>
      <button className="button-primary full-width" type="submit">{piece ? "Ask about this piece" : "Send custom work request"}</button>
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
      <button className="button-primary" type="submit">{studio ? "Enter dashboard" : "Log in"}</button>
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
        <input minLength={8} name="password" required type="password" />
      </label>
      <label>
        <span>Confirm password</span>
        <input minLength={8} name="confirmPassword" required type="password" />
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

export function ResendVerificationForm({ email = "" }: { email?: string }) {
  return (
    <form action={resendVerificationAction} className="request-form compact-form">
      <label>
        <span>Email</span>
        <input defaultValue={email} name="email" required type="email" />
      </label>
      <button className="button-secondary" type="submit">Resend verification link</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  return (
    <form action={resetPasswordAction} className="request-form compact-form">
      <input name="token" type="hidden" value={token} />
      <label>
        <span>New password</span>
        <input minLength={8} name="password" required type="password" />
      </label>
      <button className="button-primary" type="submit">Reset password</button>
    </form>
  );
}

export function ProfileForm({ user }: { user: UserRecord }) {
  const website = user.links.find((link) => link.label.toLowerCase() === "website")?.url ?? "";
  const instagram = user.links.find((link) => link.label.toLowerCase() === "instagram")?.url ?? "";
  const github = user.links.find((link) => link.label.toLowerCase() === "github")?.url ?? "";

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
      <div className="field-grid three-up compact-grid">
        <label><span>Website</span><input defaultValue={website} name="websiteUrl" type="url" /></label>
        <label><span>Instagram</span><input defaultValue={instagram} name="instagramUrl" type="url" /></label>
        <label><span>GitHub</span><input defaultValue={github} name="githubUrl" type="url" /></label>
      </div>
      <input name="linksJson" type="hidden" value={JSON.stringify(user.links)} />
      <ProfileAvatarFields avatarPath={user.avatarPath} displayName={user.displayName} email={user.email} metadata={user.metadata} />
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
