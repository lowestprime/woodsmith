export const metadata = {
  title: "Business administration",
  robots: { index: false, follow: false },
};
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { withDatabaseTransaction, listUsers } from "@/lib/db";
import { multiWorkerEnabled, listOwnershipConflicts, type Woodworker } from "@/lib/woodworkers-store";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { WoodworkerForm } from "@/components/woodworker-form";
export default async function WoodworkerAdministration() {
  await requireAdmin();
  const data = withDatabaseTransaction((db) => ({
    enabled: multiWorkerEnabled(db),
    workers: db
      .prepare(
        "SELECT * FROM woodworkers ORDER BY id='primary' DESC,business_name",
      )
      .all() as Woodworker[],
    conflicts: listOwnershipConflicts(db),
  }));
  const users = listUsers().filter((user) => user.role === "woodworker");
  return (
    <Shell>
      <PageSection>
        <PageIntro
          eyebrow="Studio · Woodworkers"
          title="Independent businesses"
          copy="Activate business access deliberately and keep each woodworker’s work and customer records separate."
        />
        <Link href="/studio?panel=people">Back to People</Link>
        <article className="studio-panel">
          <h2>Multi-worker mode</h2>
          <p>
            Disabled preserves the single-builder experience. Ownership
            conflicts must be resolved before enabling independent businesses.
          </p>
          <WoodworkerForm admin>
            <input name="operation" type="hidden" value="mode" />
            <label className="checkbox-row">
              <input
                defaultChecked={data.enabled}
                name="enabled"
                type="checkbox"
                value="1"
              />
              <span>
                Enable independent woodworker workspaces and public business
                profiles
              </span>
            </label>
          </WoodworkerForm>
        </article>
        <article className="studio-panel">
          <h2>Add a business</h2>
          <p>
            Create the person’s account with the woodworker role in People
            first.
          </p>
          <WoodworkerForm admin submitLabel="Add business">
            <input name="operation" type="hidden" value="provision" />
            <label>
              <span>Woodworker account</span>
              <select name="email" required>
                <option value="">Select an account</option>
                {users.map((user) => (
                  <option key={user.email} value={user.email}>
                    {user.displayName} · {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Business name</span>
              <input maxLength={120} name="businessName" required />
            </label>
          </WoodworkerForm>
        </article>
        <div className="profile-grid">
          {data.workers.map((worker) => (
            <article className="studio-panel" key={worker.id}>
              <h2>{worker.business_name}</h2>
              <p>{worker.contact_email}</p>
              <p>
                {worker.public_profile
                  ? "Public profile requested"
                  : "Profile is private"}{" "}
                · Fee policy {worker.fee_version}:{" "}
                {worker.accepted_fee_version === worker.fee_version
                  ? "accepted"
                  : "awaiting woodworker acceptance"}
              </p>
              <WoodworkerForm admin key={`active-${worker.updated_at}`}>
                <input name="operation" type="hidden" value="activate" />
                <input name="id" type="hidden" value={worker.id} />
                <label className="checkbox-row">
                  <input
                    defaultChecked={Boolean(worker.active)}
                    name="active"
                    type="checkbox"
                    value="1"
                  />
                  <span>Business is active</span>
                </label>
              </WoodworkerForm>
              <WoodworkerForm
                admin
                key={`fee-${worker.updated_at}`}
                submitLabel="Update fee policy"
              >
                <input name="operation" type="hidden" value="fee" />
                <input name="id" type="hidden" value={worker.id} />
                <label>
                  <span>Completed-sale fee (%)</span>
                  <input
                    defaultValue={worker.fee_basis_points / 100}
                    max={100}
                    min={0}
                    name="feePercent"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  <span>Policy shown to the woodworker</span>
                  <textarea
                    defaultValue={worker.fee_policy}
                    maxLength={3000}
                    name="feePolicy"
                    required
                    rows={4}
                  />
                </label>
                <p className="muted-copy">
                  A changed policy requires acceptance for new orders. Existing
                  sale snapshots remain unchanged.
                </p>
              </WoodworkerForm>
              {worker.id !== "primary" ? (
                <WoodworkerForm
                  admin
                  submitLabel="Bind verified Stripe account"
                >
                  <input
                    name="operation"
                    type="hidden"
                    value="stripe-account"
                  />
                  <input name="id" type="hidden" value={worker.id} />
                  <label>
                    <span>Connected account ID</span>
                    <input
                      name="stripeAccountId"
                      defaultValue={worker.stripe_account_id || ""}
                      pattern="acct_[a-zA-Z0-9]+"
                    />
                  </label>
                  <p>
                    Complete onboarding and verify the account belongs to this
                    business first. Existing order account snapshots remain
                    fixed.
                  </p>
                </WoodworkerForm>
              ) : null}
            </article>
          ))}
        </div>
        {data.conflicts.length ? (
          <article className="studio-panel">
            <h2>Ownership decisions required</h2>
            <ul>
              {data.conflicts.map((conflict) => (
                <li key={`${conflict.kind}:${conflict.resource_key}`}>
                  {conflict.kind}: {conflict.resource_key} — {conflict.conflict}
                </li>
              ))}
            </ul>
            <p>
              Correct cross-business relationships in Studio first. Assign only
              after verifying provenance; the server rejects transfers that
              split related records or change a sale snapshot.
            </p>
          </article>
        ) : null}
        <article className="studio-panel">
          <h2>Resolve or reassign ownership</h2>
          <WoodworkerForm admin submitLabel="Record ownership decision">
            <input name="operation" type="hidden" value="resolve" />
            <label>
              <span>Record type</span>
              <select name="kind">
                {[
                  "piece",
                  "post",
                  "media",
                  "project",
                  "order",
                  "review",
                  "inquiry",
                ].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Exact record key</span>
              <input name="key" required maxLength={2048} />
            </label>
            <label>
              <span>Verified business</span>
              <select name="id" required>
                <option value="">Choose business</option>
                {data.workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.business_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Evidence and reason for the decision</span>
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={2000}
                rows={4}
              />
            </label>
            <p>
              Every successful decision retains the previous owner,
              administrator, reason and time in the ownership audit.
            </p>
          </WoodworkerForm>
        </article>
      </PageSection>
    </Shell>
  );
}
