import { StudioShippingForm } from "@/components/studio/studio-shipping-form";
export const metadata = {
  title: "Woodworker workspace",
  robots: { index: false, follow: false },
};
import { MediaCropEditor } from "@/components/media-crop-editor";
import { WorkerUploadInput } from "@/components/worker-upload-input";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { AvatarBadge } from "@/components/avatar-badge";
import { WoodworkerForm } from "@/components/woodworker-form";
import {
  workerWorkspaceSnapshot,
  WORKER_PANELS,
  type WorkerPanel,
} from "@/lib/woodworker-workspace";
import { withDatabaseTransaction } from "@/lib/db";
import {
  workerForPrincipal,
  assertWorkerAccess,
} from "@/lib/woodworkers-store";
import { formatMoney, toMediaUrl } from "@/lib/format";

const labels = {
  profile: "Business",
  pieces: "Pieces",
  media: "Media",
  process: "Process",
  projects: "Projects",
  orders: "Orders",
  reviews: "Reviews",
  inquiries: "Inquiries",
  search: "Search",
};
function Identity({
  operation,
  id,
  version,
}: {
  operation: string;
  id?: string;
  version?: string;
}) {
  return (
    <>
      <input name="operation" type="hidden" value={operation} />
      <input name="key" type="hidden" value={id || ""} />
      {version ? (
        <input name="expectedUpdatedAt" type="hidden" value={version} />
      ) : null}
    </>
  );
}
function Publication({ value = "draft" }: { value?: string }) {
  return (
    <label>
      <span>Publication</span>
      <select defaultValue={value} name="publicationStatus">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
    </label>
  );
}
function MediaChoice({name,value,label,choices}:{name:string;value?:string|null;label:string;choices:Array<{path:string;name:string}>}){
 return <label><span>{label}</span><select defaultValue={value||''} name={name}><option value="">None</option>{choices.map(media=><option key={media.path} value={media.path}>{media.name}</option>)}</select></label>;
}
export default async function WoodworkerWorkspace({
  searchParams,
}: {
  searchParams: Promise<{
    panel?: string;
    page?: string;
    q?: string;
    selected?: string;
  }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/studio/woodworkers");
  const worker = withDatabaseTransaction((db) => workerForPrincipal(db, user));
  if (!worker)
    return (
      <Shell>
        <PageSection>
          <PageIntro
            eyebrow="Woodworker workspace"
            title="Access is not enabled"
            copy="Your business must be activated by the site administrator before you can manage its work."
          />
          <Link href="/account/profile">Your account</Link>
        </PageSection>
      </Shell>
    );
  const params = await searchParams,
    panel = WORKER_PANELS.includes(params.panel as WorkerPanel)
      ? (params.panel as WorkerPanel)
      : "profile",
    page = Math.max(1, Number.parseInt(params.page || "1") || 1),
    query = (params.q || "").slice(0, 200);
  if (params.selected) {
    const kind = {
      pieces: "piece",
      media: "media",
      process: "post",
      projects: "project",
      orders: "order",
      reviews: "review",
      inquiries: "inquiry",
    } as const;
    if (panel in kind) {
      try {
        withDatabaseTransaction((db) =>
          assertWorkerAccess(
            db,
            user,
            kind[panel as keyof typeof kind],
            params.selected!,
          ),
        );
      } catch {
        notFound();
      }
    }
  }
  const data = workerWorkspaceSnapshot(
    user,
    panel,
    page,
    query,
    params.selected || "",
  );
  return (
    <Shell>
      <PageSection className="studio-workspace">
        <PageIntro
          eyebrow="Woodworker workspace"
          title={worker.business_name}
          copy="Manage your business, work and customer projects."
        />
        <nav aria-label="Woodworker workspace" className="share-links">
          {WORKER_PANELS.map((item) => (
            <Link
              aria-current={panel === item ? "page" : undefined}
              href={`/studio/woodworker?panel=${item}`}
              key={item}
            >
              {labels[item]}
            </Link>
          ))}
        </nav>
        {panel !== "profile" ? (
          <form
            action="/studio/woodworker"
            className="request-form compact-form"
          >
            <input name="panel" type="hidden" value={panel} />
            <label>
              <span>Search {labels[panel].toLowerCase()}</span>
              <input defaultValue={query} name="q" />
            </label>
            <button className="button-secondary" type="submit">
              Search
            </button>
          </form>
        ) : null}
        {panel === "profile" ? (
          <div className="contact-grid">
            <article className="studio-panel">
              <AvatarBadge
                avatarPath={worker.avatar_path}
                label={worker.business_name.slice(0, 2)}
                seed={worker.id}
                variant="editor"
              />
              <WoodworkerForm key={worker.updated_at}>
                <Identity operation="profile" version={worker.updated_at} />
                <label>
                  <span>Business name</span>
                  <input
                    defaultValue={worker.business_name}
                    maxLength={120}
                    name="businessName"
                    required
                  />
                </label>
                <label>
                  <span>Public profile address</span>
                  <input
                    defaultValue={worker.slug}
                    maxLength={80}
                    name="slug"
                    pattern="([a-z0-9]+-)*[a-z0-9]+"
                    required
                  />
                </label>
                <label>
                  <span>About your woodshop</span>
                  <textarea
                    defaultValue={worker.bio}
                    maxLength={6000}
                    name="bio"
                    rows={6}
                  />
                </label>
                <MediaChoice choices={data.mediaChoices}
                  label="Business photograph"
                  name="avatarPath"
                  value={worker.avatar_path}
                />
                <label className="checkbox-row">
                  <input
                    defaultChecked={Boolean(worker.public_profile)}
                    name="publicProfile"
                    type="checkbox"
                    value="1"
                  />
                  <span>Publish this business profile</span>
                </label>
              </WoodworkerForm>
              <p>
                <Link href={`/woodworkers/${worker.slug}`}>
                  View public profile
                </Link>{" "}
                ·{" "}
                <Link href="/account/profile">Account and personal avatar</Link>
              </p>
            </article>
            <article className="studio-panel">
              <h2>Revenue policy</h2>
              <p>{worker.fee_policy}</p>
              <p>
                Completed-sale fee:{" "}
                <strong>{(worker.fee_basis_points / 100).toFixed(2)}%</strong>{" "}
                of goods after discounts. Shipping and tax are excluded.
              </p>
              <p>
                Policy version {worker.fee_version}.{" "}
                {worker.accepted_fee_version === worker.fee_version
                  ? "Accepted."
                  : "Your acceptance is required before online checkout."}
              </p>
              {worker.accepted_fee_version !== worker.fee_version ? (
                <WoodworkerForm submitLabel="Accept this fee policy">
                  <Identity operation="accept-fee" />
                  <input
                    name="feeVersion"
                    type="hidden"
                    value={worker.fee_version}
                  />
                  <label className="checkbox-row">
                    <input required type="checkbox" />
                    <span>I accept the displayed policy for new orders.</span>
                  </label>
                </WoodworkerForm>
              ) : null}
              <p className="muted-copy">
                Existing sale records retain their agreed fee. Online payments
                also require the business payment account to be configured.
              </p>
            </article>
          </div>
        ) : null}
        {panel === "pieces" ? (
          <>
            <h2>Pieces</h2>
            {[...data.pieces, null].map((piece) => (
              <details
                className="studio-panel"
                key={piece?.slug || "new"}
                open={piece?.slug === params.selected || !piece}
              >
                <summary>{piece?.title || "Add a piece"}</summary>
                <WoodworkerForm key={piece?.updatedAt || "new-piece"}>
                  <Identity
                    id={piece?.slug}
                    operation="piece"
                    version={piece?.updatedAt}
                  />
                  <label>
                    <span>Title</span>
                    <input
                      defaultValue={piece?.title}
                      maxLength={160}
                      name="title"
                      required
                    />
                  </label>
                  <label>
                    <span>Subtitle</span>
                    <input
                      defaultValue={piece?.subtitle}
                      maxLength={400}
                      name="subtitle"
                    />
                  </label>
                  <label>
                    <span>Category</span>
                    <select
                      defaultValue={
                        piece?.category || data.categories[0]?.label
                      }
                      name="category"
                    >
                      {data.categories.map((category) => (
                        <option key={category.key} value={category.label}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Publication value={piece?.publicationStatus} />
                  <label>
                    <span>Summary</span>
                    <textarea
                      defaultValue={piece?.summary}
                      name="summary"
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Story</span>
                    <textarea
                      defaultValue={piece?.story}
                      name="story"
                      rows={6}
                    />
                  </label>
                  <label>
                    <span>Details, one per line</span>
                    <textarea
                      defaultValue={piece?.details.join("\n")}
                      name="details"
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Materials</span>
                    <input
                      defaultValue={piece?.materials.join(", ")}
                      name="materials"
                    />
                  </label>
                  <label>
                    <span>Tags</span>
                    <input defaultValue={piece?.tags.join(", ")} name="tags" />
                  </label>
                  <label>
                    <span>Availability</span>
                    <input
                      defaultValue={
                        piece?.availabilityLabel || "Contact for availability"
                      }
                      name="availabilityLabel"
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      <span>Price mode</span>
                      <select
                        defaultValue={piece?.priceMode || "inquiry"}
                        name="priceMode"
                      >
                        <option value="inquiry">Price by inquiry</option>
                        <option value="fixed">Fixed price</option>
                        <option value="not-listed">No listed price</option>
                      </select>
                    </label>
                    <label>
                      <span>Price in dollars</span>
                      <input
                        defaultValue={
                          piece?.priceCents
                            ? String(piece.priceCents / 100)
                            : ""
                        }
                        inputMode="decimal"
                        name="price"
                      />
                    </label>
                    <label>
                      <span>Available quantity</span>
                      <input
                        defaultValue={piece?.inventoryCount ?? 0}
                        min={0}
                        name="inventoryCount"
                        required
                        type="number"
                      />
                    </label>
                    <label>
                      <span>Lead time in days</span>
                      <input
                        defaultValue={piece?.leadTimeDays ?? 0}
                        min={0}
                        name="leadTimeDays"
                        required
                        type="number"
                      />
                    </label>
                  </div>
                </WoodworkerForm>
                {piece ? (
                  <>
                    <Link href={`/portfolio/${piece.slug}`}>View piece</Link>
                    <WoodworkerForm submitLabel="Delete piece">
                      <Identity
                        id={piece.slug}
                        operation="delete-piece"
                        version={piece.updatedAt}
                      />
                      <label className="checkbox-row">
                        <input
                          name="confirmDelete"
                          required
                          type="checkbox"
                          value="1"
                        />
                        <span>
                          Delete this piece. Pieces referenced by orders must be
                          archived instead.
                        </span>
                      </label>
                    </WoodworkerForm>
                  </>
                ) : null}
              </details>
            ))}
          </>
        ) : null}
        {panel === "process" ? (
          <>
            <h2>Process</h2>
            {[...data.posts, null].map((post) => (
              <details
                className="studio-panel"
                key={post?.slug || "new"}
                open={post?.slug === params.selected || !post}
              >
                <summary>{post?.title || "Add a Process post"}</summary>
                <WoodworkerForm key={post?.updatedAt || "new-post"}>
                  <Identity
                    id={post?.slug}
                    operation="post"
                    version={post?.updatedAt}
                  />
                  <label>
                    <span>Title</span>
                    <input defaultValue={post?.title} name="title" required />
                  </label>
                  <Publication value={post?.publicationStatus} />
                  <label>
                    <span>Excerpt</span>
                    <textarea
                      defaultValue={post?.excerpt}
                      name="excerpt"
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Writing</span>
                    <textarea defaultValue={post?.body} name="body" rows={12} />
                  </label>
                  <label>
                    <span>Tags</span>
                    <input defaultValue={post?.tags.join(", ")} name="tags" />
                  </label>
                  <MediaChoice choices={data.mediaChoices}
                    label="Cover photograph"
                    name="coverMediaPath"
                    value={post?.coverMediaPath}
                  />
                </WoodworkerForm>
                {post ? (
                  <>
                    <Link href={`/process/${post.slug}`}>View post</Link>
                    <WoodworkerForm submitLabel="Delete post">
                      <Identity
                        id={post.slug}
                        operation="delete-post"
                        version={post.updatedAt}
                      />
                      <label className="checkbox-row">
                        <input
                          name="confirmDelete"
                          required
                          type="checkbox"
                          value="1"
                        />
                        <span>Delete this Process post</span>
                      </label>
                    </WoodworkerForm>
                  </>
                ) : null}
              </details>
            ))}
          </>
        ) : null}
        {panel === "media" ? (
          <>
            <h2>Media</h2>
            <article className="studio-panel">
              <WoodworkerForm submitLabel="Upload privately">
                <Identity operation="upload" />
                <WorkerUploadInput />
              </WoodworkerForm>
            </article>
            {data.media.map((media) => (
              <details
                className="studio-panel"
                key={media.relativePath}
                open={media.relativePath === params.selected}
              >
                <summary>{media.fileName}</summary>
                {media.kind === "video" ? (
                  <video
                    controls
                    preload="metadata"
                    src={toMediaUrl(media.relativePath)}
                    style={{ maxWidth: "100%", maxHeight: 280 }}
                  />
                ) : (
                  <a
                    href={toMediaUrl(media.relativePath)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open photograph
                  </a>
                )}
                <WoodworkerForm key={media.updatedAt}>
                  <Identity
                    id={media.relativePath}
                    operation="media"
                    version={media.updatedAt}
                  />
                  <label>
                    <span>Description</span>
                    <input defaultValue={media.altText} name="altText" />
                  </label>
                  <label>
                    <span>Assign to piece</span>
                    <select
                      defaultValue={media.pieceSlug || ""}
                      name="pieceSlug"
                    >
                      <option value="">Unassigned</option>
                      {data.pieceChoices.map((piece) => (
                        <option key={piece.slug} value={piece.slug}>
                          {piece.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Tags</span>
                    <input defaultValue={media.tags.join(", ")} name="tags" />
                  </label>
                  {media.kind === "image" ? (
                    <MediaCropEditor
                      altText={media.altText || media.fileName}
                      cleanupMode={String(media.metadata.cleanupMode || "none")}
                      cropAspect={String(media.metadata.cropAspect || "free")}
                      focalX={media.focalX}
                      focalY={media.focalY}
                      relativePath={media.relativePath}
                      sourceSignature={media.updatedAt}
                      zoom={media.zoom}
                    />
                  ) : (
                    <>
                      <input name="focalX" type="hidden" value={media.focalX} />
                      <input name="focalY" type="hidden" value={media.focalY} />
                      <input name="zoom" type="hidden" value={media.zoom} />
                    </>
                  )}
                  <label>
                    <span>Display order</span>
                    <input
                      defaultValue={media.assignment?.displayOrder ?? 0}
                      min={0}
                      name="displayOrder"
                      required
                      type="number"
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      defaultChecked={media.reviewed}
                      name="reviewed"
                      type="checkbox"
                      value="1"
                    />
                    <span>I have verified what this photograph depicts.</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      defaultChecked={Boolean(media.assignment?.public)}
                      name="public"
                      type="checkbox"
                      value="1"
                    />
                    <span>Publish on the selected piece</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      defaultChecked={media.assignment?.role === "hero"}
                      name="hero"
                      type="checkbox"
                      value="1"
                    />
                    <span>Use as the primary piece photograph</span>
                  </label>
                </WoodworkerForm>
              </details>
            ))}
          </>
        ) : null}
        {panel === "projects" ? (
          <>
            <h2>Projects</h2>
            {data.projects.map((project) => (
              <details
                className="studio-panel"
                key={project.reference}
                open={project.reference === params.selected}
              >
                <summary>
                  {project.reference} · {project.guestName} · {project.status}
                </summary>
                <p>{project.brief}</p>
                <p>{project.guestEmail}</p>
                <WoodworkerForm key={project.updatedAt}>
                  <Identity
                    id={project.reference}
                    operation="project"
                    version={project.updatedAt}
                  />
                  <label>
                    <span>Current stage</span>
                    <input
                      name="stage"
                      defaultValue={project.stage}
                      maxLength={120}
                    />
                  </label>
                  <label>
                    <span>Customer-visible notes</span>
                    <textarea
                      defaultValue={project.publicNotes}
                      name="publicNotes"
                      rows={4}
                    />
                  </label>
                  <label>
                    <span>Private work notes</span>
                    <textarea
                      defaultValue={project.internalNotes}
                      name="internalNotes"
                      rows={4}
                    />
                  </label>
                  <label>
                    <span>Lead time in days</span>
                    <input
                      defaultValue={project.leadTimeDays ?? 0}
                      min={0}
                      name="leadTimeDays"
                      required
                      type="number"
                    />
                  </label>
                </WoodworkerForm>
                <WoodworkerForm submitLabel="Update project lifecycle">
                  <Identity
                    id={project.reference}
                    operation="project-lifecycle"
                    version={project.updatedAt}
                  />
                  <label>
                    <span>Lifecycle</span>
                    <select
                      name="lifecycleState"
                      defaultValue={project.lifecycleState}
                    >
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label>
                    <span>Reason</span>
                    <textarea name="reason" maxLength={2000} rows={2} />
                  </label>
                </WoodworkerForm>
                <h3>Updates</h3>
                {project.updates.map((update) => (
                  <article key={update.id}>
                    <p>{update.body}</p>
                    <small>
                      {update.visibility === "private"
                        ? "Private work note"
                        : "Customer-visible update"}
                    </small>
                  </article>
                ))}
                <WoodworkerForm submitLabel="Add update">
                  <Identity id={project.reference} operation="project-update" />
                  <label>
                    <span>Update</span>
                    <textarea name="body" required rows={4} />
                  </label>
                  <label>
                    <span>Visibility</span>
                    <select name="visibility">
                      <option value="public">Customer-visible</option>
                      <option value="private">Private work note</option>
                    </select>
                  </label>
                </WoodworkerForm>
                <Link
                  href={`/commissions/status?reference=${encodeURIComponent(project.reference)}`}
                >
                  Open project status
                </Link>
              </details>
            ))}
          </>
        ) : null}
        {panel === "orders" ? (
          <>
            <h2>Orders</h2>
            {data.orders.map((order) => (
              <article className="studio-panel" key={order.orderNumber}>
                <h3>{order.orderNumber}</h3>
                <p>
                  {order.status} · {order.paymentStatus || "Unpaid"}
                </p>
                <p>
                  {formatMoney(order.totalCents)} · {order.userEmail}
                </p>
                <p>
                  Invoice: {order.invoiceStatus || "Not issued"} · Tracking:{" "}
                  {order.trackingNumber || "Not assigned"}
                </p>
                <WoodworkerForm key={order.updatedAt}>
                  <Identity
                    id={order.orderNumber}
                    operation="order"
                    version={order.updatedAt}
                  />
                  {(
                    [
                      "name",
                      "street1",
                      "city",
                      "state",
                      "zip",
                      "country",
                    ] as const
                  ).map((field) => (
                    <label key={field}>
                      <span>
                        {
                          {
                            name: "Recipient",
                            street1: "Street address",
                            city: "City",
                            state: "State / province",
                            zip: "Postal code",
                            country: "Country code",
                          }[field]
                        }
                      </span>
                      <input
                        name={field}
                        defaultValue={String(
                          order.shippingAddress[field] || "",
                        )}
                        maxLength={200}
                      />
                    </label>
                  ))}
                  <label>
                    <span>Fulfillment</span>
                    <select name="status" defaultValue={order.status}>
                      {Array.from(
                        new Set([
                          order.status,
                          "Preparing",
                          "Ready for pickup",
                          "Shipped",
                          "Delivered",
                        ]),
                      ).map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                </WoodworkerForm>
                <WoodworkerForm submitLabel="Issue invoice">
                  <Identity id={order.orderNumber} operation="invoice" />
                </WoodworkerForm>
                <StudioShippingForm orderNumber={order.orderNumber} worker />
              </article>
            ))}
          </>
        ) : null}
        {panel === "reviews" ? (
          <>
            <h2>Reviews</h2>
            {data.reviews.map((review) => (
              <article className="studio-panel" key={review.id}>
                <h3>
                  {review.title} · {review.rating}/5
                </h3>
                <p>{review.reviewerName}</p>
                <p>{review.body}</p>
                <WoodworkerForm key={review.updatedAt}>
                  <Identity
                    id={review.id}
                    operation="review"
                    version={review.updatedAt}
                  />
                  <label>
                    <span>Moderation</span>
                    <select defaultValue={review.status} name="status">
                      <option value="draft">Pending</option>
                      <option value="published">Published</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                </WoodworkerForm>
              </article>
            ))}
          </>
        ) : null}
        {panel === "inquiries" ? (
          <>
            <h2>Customer inquiries</h2>
            {data.inquiries.map((record) => (
              <article className="studio-panel" key={record.id}>
                <h3>{record.inquiry.customerName}</h3>
                <p>{record.inquiry.customerEmail}</p>
                <p>{record.inquiry.message}</p>
                <p>
                  {record.inquiry.piece?.title || "General inquiry"} ·{" "}
                  {record.inquiry.intent}
                </p>
              </article>
            ))}
          </>
        ) : null}
        {panel === "search" ? (
          <>
            <h2>Your search results</h2>
            {data.searchResults.map((result) => (
              <article className="studio-panel" key={result.embeddingKey}>
                <h3>{result.title}</h3>
                <p>{result.summary}</p>
                <Link
                  href={
                    result.type === "page"
                      ? result.href
                      : `/studio/woodworker?panel=${result.type === "piece" ? "pieces" : result.type === "post" ? "process" : result.type === "project" ? "projects" : "media"}&selected=${encodeURIComponent(result.id)}`
                  }
                >
                  Open {result.type}
                </Link>
              </article>
            ))}
          </>
        ) : null}
        {data.total > 0 ? (
          <nav aria-label="Results pages" className="share-links">
            {page > 1 ? (
              <Link
                href={`/studio/woodworker?panel=${panel}&page=${page - 1}&q=${encodeURIComponent(query)}`}
              >
                Previous
              </Link>
            ) : null}
            <span>
              Page {page} · {data.total} records
            </span>
            {page * 50 < data.total ? (
              <Link
                href={`/studio/woodworker?panel=${panel}&page=${page + 1}&q=${encodeURIComponent(query)}`}
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </PageSection>
    </Shell>
  );
}
