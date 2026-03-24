import { marked } from "marked";
import {
  createInvoiceAction,
  createShippingLabelAction,
  deleteCommissionTypeAction,
  deleteMediaAction,
  deletePageAction,
  deletePieceAction,
  deletePostAction,
  deleteReviewAdminAction,
  refreshMediaLibraryAction,
  renameMediaAction,
  saveCommissionTypeAction,
  saveMediaMetadataAction,
  saveOrderAction,
  savePageAction,
  savePieceAction,
  savePostAction,
  saveProjectAction,
  saveReviewAdminAction,
  saveSiteSettingsAction,
  saveUserProfileAdminAction,
  uploadMediaAction
} from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import {
  getSiteSettings,
  getStudioDashboardSummary,
  listCommissionTypes,
  listMedia,
  listNotifications,
  listOrders,
  listPages,
  listPieces,
  listPosts,
  listProjects,
  listReviews,
  listUsers,
  type CommissionTypeRecord,
  type NotificationRecord,
  type OrderRecord,
  type PageRecord,
  type PieceRecord,
  type PostRecord,
  type ProjectRecord,
  type ReviewRecord,
  type SiteSettings,
  type UserRecord
} from "@/lib/db";
import { formatDateTime, formatMoney, toMediaUrl } from "@/lib/format";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";

function JsonEditor<T>({ action, deleteAction, value, hiddenField, slugField, slugValue, title }: {
  action: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  value: T;
  hiddenField: string;
  slugField: string;
  slugValue: string;
  title: string;
}) {
  return (
    <article className="studio-panel studio-editor-card">
      <div className="studio-editor-head">
        <h3>{title}</h3>
        {deleteAction ? (
          <form action={deleteAction}>
            <input name={slugField} type="hidden" value={slugValue} />
            <button className="button-secondary" type="submit">Delete</button>
          </form>
        ) : null}
      </div>
      <form action={action} className="studio-json-form">
        <input name={slugField} type="hidden" value={slugValue} />
        <textarea defaultValue={JSON.stringify(value, null, 2)} name={hiddenField} rows={18} />
        <button className="button-primary" type="submit">Save</button>
      </form>
    </article>
  );
}

function newPageDraft(): Omit<PageRecord, "createdAt" | "updatedAt"> {
  return {
    slug: "new-page-draft",
    title: "New Page Draft",
    navLabel: "New Page",
    status: "draft",
    intro: "Short introduction shown at the top of the page.",
    body: "Body copy for the page.",
    layout: "document",
    sections: [],
    heroMediaPath: null
  };
}

function newPieceDraft(): Omit<PieceRecord, "createdAt" | "updatedAt"> {
  return {
    slug: "new-piece-draft",
    title: "New Piece Draft",
    subtitle: "Short identifying subtitle",
    category: "Furniture",
    status: "commission",
    publicationStatus: "draft",
    availabilityLabel: "Draft",
    summary: "Card summary for the portfolio and shop.",
    story: "Longer story for the detail page.",
    details: ["Add dimensions, material notes, or handling details here."],
    tags: ["draft"],
    materials: ["Hardwood"],
    dimensions: { width: 48, depth: 24, height: 30, unit: "in" },
    priceCents: null,
    inventoryCount: 0,
    leadTimeDays: 56,
    mediaPaths: [],
    featuredRank: 99,
    ownerEmail: "woodsmithbb@proton.me",
    metadata: { verifiedMedia: false }
  };
}

function newPostDraft(): Omit<PostRecord, "createdAt" | "updatedAt"> {
  return {
    slug: "new-journal-entry",
    title: "New Journal Entry",
    excerpt: "Short excerpt for the journal index.",
    body: "Write the post body in markdown.",
    publicationStatus: "draft",
    publishedAt: null,
    authorEmail: "woodsmithbb@proton.me",
    coverMediaPath: null,
    tags: ["draft"],
    sourceUrl: null,
    sourceLabel: null
  };
}

function newCommissionTypeDraft(): Omit<CommissionTypeRecord, "createdAt" | "updatedAt"> {
  return {
    slug: "new-commission-type",
    label: "New Commission Type",
    description: "Describe the kind of build this commission type represents.",
    baseLaborHours: 24,
    baseMarkupPercent: 18,
    materialOptions: ["White Oak", "Walnut"],
    defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" },
    active: true
  };
}

function newUserDraft(): Omit<UserRecord, "id" | "resetToken" | "resetExpiresAt" | "createdAt" | "updatedAt"> {
  return {
    email: "new-woodworker@example.com",
    role: "woodworker",
    displayName: "New Woodworker",
    headline: "Woodworker",
    bio: "Public studio biography.",
    avatarPath: null,
    publicProfile: false,
    links: [],
    metadata: { showOnAboutPage: false }
  };
}

export default async function StudioPage() {
  await requireAdmin();
  const summary = getStudioDashboardSummary();
  const settings = getSiteSettings();
  const pages = listPages(true);
  const pieces = listPieces(true);
  const posts = listPosts(true);
  const commissionTypes = listCommissionTypes(true);
  const users = listUsers();
  const media = listMedia({ includeUnreviewed: true }).slice(0, 48);
  const projects = listProjects(true).slice(0, 20);
  const orders = listOrders().slice(0, 20);
  const reviews = listReviews().slice(0, 20);
  const notifications = listNotifications().slice(0, 20);

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Studio" title="Beaman Woodworks studio dashboard" copy="Browser-based editing, media management, inventory, orders, project stages, reviews, and operations settings all run from this private workspace." />
        <div className="admin-summary-grid">
          <article className="studio-panel"><span>{summary.bandwidth.bandwidthPercent}%</span><p>Capacity</p></article>
          <article className="studio-panel"><span>{summary.bandwidth.activeProjects}</span><p>Active projects</p></article>
          <article className="studio-panel"><span>{summary.publishedPieces}</span><p>Published pieces</p></article>
          <article className="studio-panel"><span>{summary.publishedPosts}</span><p>Published posts</p></article>
          <article className="studio-panel"><span>{summary.queuedNotifications}</span><p>Queued emails</p></article>
          <article className="studio-panel"><span>{formatMoney(summary.monthlyRevenueCents)}</span><p>Revenue this month</p></article>
        </div>
      </PageSection>

      <PageSection>
        <h2>Site settings</h2>
        <JsonEditor<SiteSettings>
          action={saveSiteSettingsAction}
          hiddenField="settingsJson"
          slugField="scope"
          slugValue="site"
          title="Global settings, navigation, coupons, revenue model, and contact information"
          value={settings}
        />
      </PageSection>

      <PageSection>
        <h2>Pages</h2>
        <div className="studio-grid two-column-grid">
          <JsonEditor<PageRecord>
            action={savePageAction}
            hiddenField="pageJson"
            slugField="slug"
            slugValue={newPageDraft().slug}
            title="Create page draft"
            value={newPageDraft() as PageRecord}
          />
          {pages.map((page) => <JsonEditor<PageRecord> action={savePageAction} deleteAction={deletePageAction} hiddenField="pageJson" key={page.slug} slugField="slug" slugValue={page.slug} title={page.title} value={page} />)}
        </div>
      </PageSection>

      <PageSection>
        <h2>Portfolio pieces</h2>
        <div className="studio-grid two-column-grid">
          <JsonEditor<PieceRecord>
            action={savePieceAction}
            hiddenField="pieceJson"
            slugField="slug"
            slugValue={newPieceDraft().slug}
            title="Create piece draft"
            value={newPieceDraft() as PieceRecord}
          />
          {pieces.map((piece) => <JsonEditor<PieceRecord> action={savePieceAction} deleteAction={deletePieceAction} hiddenField="pieceJson" key={piece.slug} slugField="slug" slugValue={piece.slug} title={piece.title} value={piece} />)}
        </div>
      </PageSection>

      <PageSection>
        <h2>Journal posts</h2>
        <div className="studio-grid two-column-grid">
          <article className="studio-panel studio-editor-card">
            <div className="studio-editor-head">
              <h3>Create journal draft</h3>
            </div>
            <form action={savePostAction} className="studio-json-form">
              <input name="slug" type="hidden" value={newPostDraft().slug} />
              <textarea defaultValue={JSON.stringify(newPostDraft(), null, 2)} name="postJson" rows={18} />
              <button className="button-primary" type="submit">Save</button>
            </form>
            <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: marked.parse(newPostDraft().body) }} />
          </article>
          {posts.map((post) => (
            <article className="studio-panel studio-editor-card" key={post.slug}>
              <div className="studio-editor-head">
                <h3>{post.title}</h3>
                <form action={deletePostAction}>
                  <input name="slug" type="hidden" value={post.slug} />
                  <button className="button-secondary" type="submit">Delete</button>
                </form>
              </div>
              <form action={savePostAction} className="studio-json-form">
                <input name="slug" type="hidden" value={post.slug} />
                <textarea defaultValue={JSON.stringify(post, null, 2)} name="postJson" rows={18} />
                <button className="button-primary" type="submit">Save</button>
              </form>
              <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: marked.parse(post.body) }} />
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <h2>Commission types</h2>
        <div className="studio-grid two-column-grid">
          <JsonEditor<CommissionTypeRecord>
            action={saveCommissionTypeAction}
            hiddenField="commissionTypeJson"
            slugField="slug"
            slugValue={newCommissionTypeDraft().slug}
            title="Create commission type"
            value={newCommissionTypeDraft() as CommissionTypeRecord}
          />
          {commissionTypes.map((type) => <JsonEditor<CommissionTypeRecord> action={saveCommissionTypeAction} deleteAction={deleteCommissionTypeAction} hiddenField="commissionTypeJson" key={type.slug} slugField="slug" slugValue={type.slug} title={type.label} value={type} />)}
        </div>
      </PageSection>

      <PageSection>
        <h2>Profiles & users</h2>
        <div className="studio-grid two-column-grid">
          <JsonEditor<UserRecord>
            action={saveUserProfileAdminAction}
            hiddenField="userJson"
            slugField="email"
            slugValue={newUserDraft().email}
            title="Create woodworker or staff profile"
            value={newUserDraft() as UserRecord}
          />
          {users.map((user) => <JsonEditor<UserRecord> action={saveUserProfileAdminAction} hiddenField="userJson" key={user.email} slugField="email" slugValue={user.email} title={`${user.displayName} (${user.role})`} value={user} />)}
        </div>
      </PageSection>

      <PageSection>
        <div className="section-heading"><p className="eyebrow">Media library</p><h2>Upload, map, rename, and review assets</h2><p>Uploads are written directly into the shared media root and then indexed into the database for pages, products, posts, and project records.</p></div>
        <div className="studio-grid two-column-grid">
          <article className="studio-panel">
            <h3>Upload media</h3>
            <form action={uploadMediaAction} className="request-form compact-form">
              <label><span>Folder</span><input defaultValue="Uploads" name="folder" type="text" /></label>
              <label><span>Alt text</span><input name="altText" type="text" /></label>
              <div className="field-grid two-up compact-grid">
                <label><span>Piece slug</span><input name="pieceSlug" type="text" /></label>
                <label><span>Post slug</span><input name="postSlug" type="text" /></label>
              </div>
              <div className="field-grid two-up compact-grid">
                <label><span>Page slug</span><input name="pageSlug" type="text" /></label>
                <label><span>Project reference</span><input name="projectReference" type="text" /></label>
              </div>
              <label><span>Tags JSON</span><textarea defaultValue="[]" name="tagsJson" rows={3} /></label>
              <label><span>File</span><input name="file" required type="file" /></label>
              <button className="button-primary" type="submit">Upload</button>
            </form>
            <form action={refreshMediaLibraryAction}><button className="button-secondary" type="submit">Refresh library</button></form>
          </article>
          <article className="studio-panel">
            <h3>Recent media</h3>
            <div className="media-admin-list">
              {media.map((item) => {
                const baseName = item.fileName.replace(/\.[^.]+$/, "");
                return (
                  <div className="media-admin-item" key={item.relativePath}>
                    {item.kind === "image" ? <img alt={item.altText} src={toMediaUrl(item.relativePath)} /> : <div className="piece-card-placeholder">{item.kind}</div>}
                    <div>
                      <p>{item.fileName}</p>
                      <p className="muted-copy">{item.relativePath}</p>
                      <p className="muted-copy">Cluster: {item.clusterKey}</p>
                      <form action={renameMediaAction} className="request-form compact-form">
                        <input name="relativePath" type="hidden" value={item.relativePath} />
                        <label><span>Rename file</span><input defaultValue={baseName} name="baseName" type="text" /></label>
                        <button className="button-secondary" type="submit">Rename</button>
                      </form>
                      <form action={saveMediaMetadataAction} className="inline-json-form">
                        <textarea name="mediaJson" rows={8} defaultValue={JSON.stringify(item, null, 2)} />
                        <button className="button-secondary" type="submit">Save metadata</button>
                      </form>
                      <form action={deleteMediaAction}><input name="relativePath" type="hidden" value={item.relativePath} /><button className="button-secondary" type="submit">Delete file</button></form>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </PageSection>

      <PageSection>
        <h2>Projects</h2>
        <div className="studio-grid two-column-grid">
          {projects.map((project) => (
            <article className="studio-panel studio-editor-card" key={project.reference}>
              <div className="studio-editor-head">
                <h3>{project.reference}</h3>
                <span>{project.status} · {project.stage}</span>
              </div>
              <form action={saveProjectAction} className="request-form compact-form">
                <input name="reference" type="hidden" value={project.reference} />
                <textarea defaultValue={JSON.stringify(project, null, 2)} name="projectJson" rows={14} />
                <label><span>Timeline update</span><textarea name="timelineBody" rows={3} /></label>
                <label><span>Visibility</span><select name="visibility"><option value="public">Public</option><option value="private">Private</option></select></label>
                <button className="button-primary" type="submit">Save project</button>
              </form>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <h2>Orders</h2>
        <div className="studio-grid two-column-grid">
          {orders.map((order) => (
            <article className="studio-panel studio-editor-card" key={order.orderNumber}>
              <div className="studio-editor-head">
                <h3>{order.orderNumber}</h3>
                <span>{formatMoney(order.totalCents)}</span>
              </div>
              <form action={saveOrderAction} className="request-form compact-form">
                <input name="orderNumber" type="hidden" value={order.orderNumber} />
                <textarea defaultValue={JSON.stringify(order, null, 2)} name="orderJson" rows={12} />
                <button className="button-primary" type="submit">Save order</button>
              </form>
              <div className="button-row">
                <form action={createInvoiceAction}><input name="orderNumber" type="hidden" value={order.orderNumber} /><button className="button-secondary" type="submit">Issue invoice</button></form>
                <form action={createShippingLabelAction}><input name="orderNumber" type="hidden" value={order.orderNumber} /><input name="weightOunces" type="hidden" value="96" /><button className="button-secondary" type="submit">Create label</button></form>
              </div>
              <p className="muted-copy">Updated {formatDateTime(order.updatedAt)}</p>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <h2>Reviews</h2>
        <div className="studio-grid two-column-grid">
          {reviews.map((review) => (
            <article className="studio-panel studio-editor-card" key={review.id}>
              <div className="studio-editor-head">
                <h3>{review.title}</h3>
                <form action={deleteReviewAdminAction}>
                  <input name="id" type="hidden" value={review.id} />
                  <input name="pieceSlug" type="hidden" value={review.pieceSlug} />
                  <button className="button-secondary" type="submit">Delete</button>
                </form>
              </div>
              <form action={saveReviewAdminAction} className="studio-json-form">
                <input name="id" type="hidden" value={review.id} />
                <input name="pieceSlug" type="hidden" value={review.pieceSlug} />
                <textarea defaultValue={JSON.stringify(review, null, 2)} name="reviewJson" rows={12} />
                <button className="button-primary" type="submit">Save review</button>
              </form>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <h2>Notifications</h2>
        <div className="studio-grid two-column-grid">
          {notifications.map((notification) => (
            <article className="studio-panel" key={notification.id}>
              <p className="eyebrow">{notification.status}</p>
              <h3>{notification.subject}</h3>
              <p>{notification.recipient}</p>
              <p className="muted-copy">Queued {formatDateTime(notification.createdAt)}</p>
              {notification.sentAt ? <p className="muted-copy">Sent {formatDateTime(notification.sentAt)}</p> : null}
              {notification.error ? <p className="notice-panel danger">{notification.error}</p> : null}
              <p className="muted-copy">{notification.body}</p>
            </article>
          ))}
          {notifications.length === 0 ? <article className="studio-panel"><p className="muted-copy">No notifications have been queued yet.</p></article> : null}
        </div>
      </PageSection>
    </Shell>
  );
}