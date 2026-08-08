import {
  createInvoiceAction,
  createShippingLabelAction,
  applyMediaFolderRulesAction,
  assignMediaCandidateAction,
  cleanupMediaBackgroundAction,
  deleteMediaAction,
  deletePieceAction,
  deletePostAction,
  deleteReviewAdminAction,
  deleteUserProfileAdminAction,
  deleteCommissionTypeAction,
  deletePieceCategoryAction,
  loadMediaPageAction,
  loadMediaVerificationQueueAction,
  markMediaAiSuggestionWrongAction,
  organizeMediaBatchAction,
  refreshMediaLibraryAction,
  renameMediaAction,
  rollbackMediaBatchAction,
  saveCommissionTypeAction,
  savePieceCategoryAction,
  saveMediaMetadataAction,
  saveMediaSourceFolderRuleAction,
  saveOrderAction,
  savePieceAction,
  savePostAction,
  saveReviewAdminAction,
  saveSiteSettingsAction,
  saveSiteStructureAction,
  saveUserProfileAdminAction,
  uploadMediaAction,
  savePageAction,
} from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import {
  countMedia,
  getMedia,
  getMediaAccessAssociations,
  getSearchIndexStatus,
  getSiteSettings,
  getStudioDashboardSummary,
  getRuntimePersistenceStatus,
  getLatestSmtpVerification,
  getNotificationAdminSummary,
  getVisitorAnalyticsPolicy,
  getVisitorInsights,
  getAdminAuditFilterOptions,
  listCommissionTypes,
  listMedia,
  listMediaOperationBatches,
  listMediaForProjectReferences,
  previewMediaFolderRules,
  listNotificationDeliveries,
  listNotificationPolicies,
  listNotificationTemplates,
  listAdminEditAudits,
  listOrders,
  listPages,
  listPieceMediaLinks,
  listPieceMediaLinksForPath,
  listPieces,
  listPosts,
  listProjectLifecycleEvents,
  listProjects,
  listReviews,
  listUsers,
  type CommissionTypeRecord,
  type MediaAssignmentFilter,
  type MediaAssignmentSourceFilter,
  type MediaAiFilter,
  type MediaKindFilter,
  type MediaRecord,
  type MediaSort,
  type PieceRecord,
  type PostRecord,
  type UserRecord
} from "@/lib/db";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildMediaVerificationQueue } from "@/lib/media-audit";
import { getAiServiceStatus } from "@/lib/ai-services";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { StudioScrollRestore } from "@/components/studio-form";
import { StudioMediaWorkspace } from "@/components/studio-media-workspace";
import { StudioCategoryEditor } from "@/components/studio-category-editor";
import {
  StudioPageEditor,
  type StudioPageEditorRecord
} from "@/components/studio/studio-page-editor";
import {
  StudioNavigationState
} from "@/components/studio/studio-navigation-state";
import {
  StudioPieceEditor
} from "@/components/studio/studio-piece-editor";
import { SiteStructureEditor } from "@/components/site-structure-editor";
import { MediaPicker, type MediaPickerItem } from "@/components/media-picker";
import { PieceMediaEditor } from "@/components/piece-media-editor";
import { normalizePieceCategories, type PieceCategoryDefinition } from "@/lib/categories";
import { getPieceInquiryMode, getPiecePriceMode, getPieceReviewsMode } from "@/lib/piece-model";
import { visualAuditRequestAuthorized } from "@/lib/visual-audit";
import { classifyMediaAccess } from "@/lib/media-access";
import { getSmtpPublicConfiguration } from "@/lib/notifications";
import { StudioNotificationsAdmin } from "@/components/studio/studio-notifications-admin";
import { StudioProjectsAdmin } from "@/components/studio/studio-projects-admin";
import { StudioSearchIndexAdmin } from "@/components/studio/studio-search-index-admin";
import { visitorIdentityPublicStatus } from "@/lib/visitor-privacy";

const STUDIO_MEDIA_PAGE_SIZE = 48;
const STUDIO_PANELS = ["overview", "settings", "pages", "pieces", "categories", "custom", "people", "process", "media", "projects", "orders", "reviews", "notifications"] as const;

type StudioPanel = (typeof STUDIO_PANELS)[number];

function Field({ label, name, defaultValue = "", type = "text", required = false }: { label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean }) {
  return <label><span>{label}</span><input defaultValue={defaultValue ?? ""} name={name} required={required} type={type} /></label>;
}

function Area({ label, name, defaultValue = "", rows = 4 }: { label: string; name: string; defaultValue?: string; rows?: number }) {
  return <label><span>{label}</span><textarea defaultValue={defaultValue} name={name} rows={rows} /></label>;
}

function Check({ label, name, defaultChecked = false }: { label: string; name: string; defaultChecked?: boolean }) {
  return <label className="checkbox-row"><input defaultChecked={defaultChecked} name={name} type="checkbox" value="1" /><span>{label}</span></label>;
}

function toDomId(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item"}`;
}

function studioMediaWithAccess(
  item: MediaRecord,
  pieceSlug?: string | null
): MediaRecord {
  const associations =
    getMediaAccessAssociations(
      item.relativePath
    );

  const privateAssociation =
    listPieceMediaLinksForPath(
      item.relativePath
    ).some(
      (link) =>
        link.role ===
          "private-project" ||
        (
          !link.public &&
          link.pieceSlug !==
            pieceSlug
        )
    );

  const access =
    classifyMediaAccess(
      item.relativePath,
      {
        ...associations,
        privateAssociation
      }
    );

  return {
    ...item,
    metadata: {
      ...item.metadata,
      mediaAccessKind:
        access.kind,
      mediaDirectPublicEligible:
        access.kind ===
        "public-library"
    }
  };
}

function StudioMasterList({ items, newHref, newLabel, selectedKey }: { items: Array<{ key: string; label: string; meta: string; href: string }>; newHref: string; newLabel: string; selectedKey: string }) {
  return (
    <nav aria-label="Content records" className="studio-master-list">
      <Link className={`studio-master-create${selectedKey.startsWith("new-") ? " is-active" : ""}`} href={newHref} scroll={false}>+ {newLabel}</Link>
      {items.map((item) => <Link aria-current={item.key === selectedKey ? "page" : undefined} className={`studio-master-item${item.key === selectedKey ? " is-active" : ""}`} href={item.href} key={item.key} scroll={false}><strong>{item.label}</strong><span>{item.meta}</span></Link>)}
    </nav>
  );
}

function studioMessage(code: string) {
  const messages: Record<string, string> = {
    "cannot-delete-current-user": "The profile currently signed in cannot be deleted.",
    "cannot-delete-last-admin": "At least one admin profile must remain available.",
    "user-missing": "The requested profile could not be found.",
    "category-key": "Use a category key other than 'all'.",
    "category-last": "At least one portfolio category must remain available.",
    "category-missing": "The requested portfolio category could not be found.",
    "category-in-use": "This category still has pieces. Choose a replacement category before deleting it."
  };
  return messages[code] ?? code;
}

function NewPageEditor({
  page,
  mediaItems,
  highlight = false
}: {
  page: Extract<
    StudioPageEditorRecord,
    {
      updatedAt: null;
    }
  >;
  mediaItems: MediaPickerItem[];
  highlight?: boolean;
}) {
  return (
    <article
      className={
        `studio-panel studio-editor-card${
          highlight
            ? " highlight-card"
            : ""
        }`.trim()
      }
      id={toDomId(
        "page",
        page.slug
      )}
    >
      <div className="studio-editor-head">
        <h3>{page.title}</h3>
      </div>

      <form
        action={savePageAction}
        className="request-form compact-form"
      >
        <div className="field-grid two-up compact-grid">
          <label>
            <span>Slug</span>
            <input
              defaultValue=""
              name="slug"
              required
              type="text"
            />
          </label>

          <label>
            <span>Title</span>
            <input
              defaultValue={page.title}
              name="title"
              required
              type="text"
            />
          </label>
        </div>

        <div className="field-grid two-up compact-grid">
          <label>
            <span>Navigation label</span>
            <input
              defaultValue={page.navLabel}
              name="navLabel"
              type="text"
            />
          </label>

          <label>
            <span>Status</span>
            <select
              defaultValue={page.status}
              name="status"
            >
              <option value="published">
                Published
              </option>

              <option value="draft">
                Draft
              </option>

              <option value="archived">
                Archived
              </option>
            </select>
          </label>
        </div>

        <label>
          <span>Layout</span>
          <input
            defaultValue={page.layout}
            name="layout"
            type="text"
          />
        </label>

        <MediaPicker
          defaultValue={
            page.heroMediaPath
          }
          helperText="Choose one image or video from the mounted media library."
          items={mediaItems}
          label="Hero media"
          loadPageAction={
            loadMediaPageAction
          }
          name="heroMediaPath"
        />

        <label>
          <span>Intro</span>
          <textarea
            defaultValue={page.intro}
            name="intro"
            rows={3}
          />
        </label>

        <label>
          <span>Body</span>
          <textarea
            defaultValue={page.body}
            name="body"
            rows={5}
          />
        </label>

        <input
          defaultValue={
            JSON.stringify(
              page.sections
            )
          }
          name="sections"
          type="hidden"
        />

        <button
          className="button-primary"
          type="submit"
        >
          Save page
        </button>
      </form>
    </article>
  );
}

function PageEditor({
  page,
  mediaItems,
  highlight = false
}: {
  page: StudioPageEditorRecord;
  mediaItems: MediaPickerItem[];
  highlight?: boolean;
}) {
  if (page.updatedAt === null) {
    return (
      <NewPageEditor
        highlight={highlight}
        mediaItems={mediaItems}
        page={page}
      />
    );
  }

  return (
    <StudioPageEditor
      highlight={highlight}
      key={`${page.slug}:${
        page.updatedAt
      }`}
      mediaItems={mediaItems}
      page={page}
    />
  );
}

function NewPieceEditor({ piece, categories, mediaItems, mediaLinks, highlight = false }: { piece: Omit<PieceRecord, "createdAt" | "updatedAt">; categories: PieceCategoryDefinition[]; mediaItems: MediaPickerItem[]; mediaLinks: ReturnType<typeof listPieceMediaLinks>; highlight?: boolean }) {
  const categoryValues = new Set(categories.map((category) => category.label));
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("piece", piece.slug)}>
      <div className="studio-editor-head">
        <h3>{piece.title}</h3>
        {piece.slug !== "new-piece-draft" ? <form action={deletePieceAction}><input name="slug" type="hidden" value={piece.slug} /><button className="button-secondary" type="submit">Delete</button></form> : null}
      </div>
      <form action={savePieceAction} className="request-form compact-form">
        <div className="field-grid two-up compact-grid"><Field label="Slug" name="slug" defaultValue={piece.slug} required /><Field label="Title" name="title" defaultValue={piece.title} required /></div>
        <div className="field-grid two-up compact-grid">
          <Field label="Subtitle" name="subtitle" defaultValue={piece.subtitle} />
          <label><span>Category</span><select defaultValue={piece.category} name="category">{categoryValues.has(piece.category) ? null : <option value={piece.category}>{piece.category} (legacy)</option>}{categories.map((category) => <option key={category.key} value={category.label}>{category.label}</option>)}</select></label>
        </div>
        <div className="field-grid three-up compact-grid">
          <label><span>Status</span><select defaultValue={piece.status} name="pieceStatus"><option value="inventory">Inventory</option><option value="commission">Custom pattern</option><option value="archive">Archive</option></select></label>
          <label><span>Publication</span><select defaultValue={piece.publicationStatus} name="publicationStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <Field label="Availability" name="availabilityLabel" defaultValue={piece.availabilityLabel} />
        </div>
        <div className="field-grid three-up compact-grid">
          <label><span>Price display</span><select defaultValue={getPiecePriceMode(piece)} name="priceMode"><option value="fixed">Fixed asking price</option><option value="contact-for-price">Contact for price</option><option value="not-listed">Not listed</option><option value="determined-after-approval">After project approval</option><option value="determined-at-order-completion">At order completion</option></select></label>
          <label><span>Inquiry behavior</span><select defaultValue={getPieceInquiryMode(piece)} name="inquiryMode"><option value="exact-piece">Ask about this piece</option><option value="related-commission">Related custom work</option><option value="disabled">No inquiries</option></select></label>
          <label><span>Reviews</span><select defaultValue={getPieceReviewsMode(piece)} name="reviewsMode"><option value="display-and-accept">Display and accept</option><option value="display-only">Display only</option><option value="hidden">Hidden</option></select></label>
        </div>
        <Area label="Summary" name="summary" defaultValue={piece.summary} rows={3} />
        <Area label="Story" name="story" defaultValue={piece.story} rows={5} />
        <Area label="Details, one per line" name="detailsText" defaultValue={piece.details.join("\n")} rows={4} />
        <div className="field-grid two-up compact-grid"><Area label="Materials" name="materialsText" defaultValue={piece.materials.join("\n")} rows={4} /><Area label="Tags" name="tagsText" defaultValue={piece.tags.join(", ")} rows={4} /></div>
        <PieceMediaEditor entityKey={`piece:${piece.slug}`} items={mediaItems} legacyPaths={piece.mediaPaths} links={mediaLinks} loadPageAction={loadMediaPageAction} />
        <div className="field-grid three-up compact-grid"><Field label="Width" name="width" defaultValue={piece.dimensions?.width ?? ""} type="number" /><Field label="Depth" name="depth" defaultValue={piece.dimensions?.depth ?? ""} type="number" /><Field label="Height" name="height" defaultValue={piece.dimensions?.height ?? ""} type="number" /></div>
        <div className="field-grid three-up compact-grid"><Field label="Asking price cents" name="priceCents" defaultValue={piece.priceCents ?? ""} type="number" /><Field label="Internal estimate cents" name="internalEstimateCents" defaultValue={piece.internalEstimateCents ?? ""} type="number" /><Field label="Public price label" name="publicPriceLabel" defaultValue={piece.publicPriceLabel ?? ""} /></div>
        <div className="field-grid three-up compact-grid"><Field label="Inventory" name="inventoryCount" defaultValue={piece.inventoryCount} type="number" /><Field label="Lead time days" name="leadTimeDays" defaultValue={piece.leadTimeDays} type="number" /><Field label="Commission type" name="commissionTypeSlug" defaultValue={piece.commissionTypeSlug ?? ""} /></div>
        <div className="field-grid two-up compact-grid"><Field label="Featured rank" name="featuredRank" defaultValue={piece.featuredRank} type="number" /><Field label="Media limit" name="publicMediaLimit" defaultValue={Number(piece.metadata.publicMediaLimit ?? 4)} type="number" /></div>
        <Area label="Fulfillment options" name="fulfillmentText" defaultValue={Array.isArray(piece.metadata.fulfillmentOptions) ? piece.metadata.fulfillmentOptions.join("\n") : ""} rows={3} />
        <button className="button-primary" type="submit">Save piece</button>
      </form>
    </article>
  );
}

function PostEditor({ post, mediaItems, highlight = false }: { post: Omit<PostRecord, "createdAt" | "updatedAt">; mediaItems: MediaPickerItem[]; highlight?: boolean }) {
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("post", post.slug)}>
      <div className="studio-editor-head">
        <h3>{post.title}</h3>
        {post.slug !== "new-process-entry" ? <form action={deletePostAction}><input name="slug" type="hidden" value={post.slug} /><button className="button-secondary" type="submit">Delete</button></form> : null}
      </div>
      <form action={savePostAction} className="request-form compact-form">
        <div className="field-grid two-up compact-grid"><Field label="Slug" name="slug" defaultValue={post.slug} required /><Field label="Title" name="title" defaultValue={post.title} required /></div>
        <Area label="Excerpt" name="excerpt" defaultValue={post.excerpt} rows={3} />
        <Area label="Body" name="body" defaultValue={post.body} rows={8} />
        <Field label="Published at" name="publishedAt" defaultValue={post.publishedAt ?? ""} />
        <MediaPicker defaultValue={post.coverMediaPath} helperText="Choose a cover image from the mounted media library." items={mediaItems} label="Cover media" loadPageAction={loadMediaPageAction} name="coverMediaPath" />
        <div className="field-grid two-up compact-grid"><Field label="Source URL" name="sourceUrl" defaultValue={post.sourceUrl ?? ""} /><Field label="Source label" name="sourceLabel" defaultValue={post.sourceLabel ?? ""} /></div>
        <Area label="Tags" name="tagsText" defaultValue={post.tags.join(", ")} rows={2} />
        <label><span>Publication</span><select defaultValue={post.publicationStatus} name="publicationStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        <button className="button-primary" type="submit">Save process note</button>
      </form>
      <p className="muted-copy">Live preview is omitted in the dashboard for performance. Use the public Process page to confirm formatting after saving.</p>
    </article>
  );
}

function pageDraft():
StudioPageEditorRecord {
  return {
    slug: "new-page-draft",
    title: "New Page Draft",
    navLabel: "New Page",
    status: "draft",
    intro: "",
    body: "",
    layout: "document",
    sections: [],
    heroMediaPath: null,
    updatedAt: null
  };
}

function pieceDraft(ownerEmail: string): Omit<PieceRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-piece-draft", title: "New Piece Draft", subtitle: "", category: "Tables", status: "commission", publicationStatus: "draft", availabilityLabel: "Draft", summary: "", story: "", details: [], tags: ["draft"], materials: ["Hardwood"], dimensions: { width: 48, depth: 24, height: 30, unit: "in" }, priceCents: null, inventoryCount: 0, leadTimeDays: 56, mediaPaths: [], featuredRank: 99, ownerEmail, metadata: { verifiedMedia: false, mediaReviewRequired: false, publicMediaLimit: 4, fulfillmentOptions: [] } };
}

type StudioPieceEditorRecord =
  | PieceRecord
  | ReturnType<typeof pieceDraft>;

function PieceEditor({
  piece,
  categories,
  mediaItems,
  mediaLinks,
  highlight = false
}: {
  piece: StudioPieceEditorRecord;
  categories: PieceCategoryDefinition[];
  mediaItems: MediaPickerItem[];
  mediaLinks: ReturnType<typeof listPieceMediaLinks>;
  highlight?: boolean;
}) {
  if ("updatedAt" in piece) {
    return (
      <StudioPieceEditor
        categories={categories}
        highlight={highlight}
        mediaItems={mediaItems}
        mediaLinks={mediaLinks}
        piece={piece}
      />
    );
  }

  return (
    <NewPieceEditor
      categories={categories}
      highlight={highlight}
      mediaItems={mediaItems}
      mediaLinks={mediaLinks}
      piece={piece}
    />
  );
}

function postDraft(authorEmail: string): Omit<PostRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-process-entry", title: "New Process Note", excerpt: "", body: "", publicationStatus: "draft", publishedAt: null, authorEmail, coverMediaPath: null, tags: ["draft"], sourceUrl: null, sourceLabel: null };
}

function commissionTypeDraft(): Omit<CommissionTypeRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-custom-type", label: "New Custom Type", description: "", baseLaborHours: 12, baseMarkupPercent: 30, materialOptions: ["White maple", "Birds-eye maple", "Walnut", "Cherry", "Ebony accent"], defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" }, active: true };
}

function userDraft(): Omit<UserRecord, "id" | "resetToken" | "resetExpiresAt" | "emailVerified" | "verificationToken" | "verificationExpiresAt" | "createdAt" | "updatedAt"> {
  return { email: "new@beamanwoodworks.local", role: "woodworker", displayName: "New Woodworker", headline: "Independent woodworker", bio: "", avatarPath: null, publicProfile: false, links: [], metadata: { woodworker: true, developer: false, showOnAboutPage: false } };
}

function UserEditor({
  user,
  currentAdminEmail,
  mediaItems,
  highlight = false
}: {
  user: Omit<UserRecord, "id" | "resetToken" | "resetExpiresAt" | "emailVerified" | "verificationToken" | "verificationExpiresAt" | "createdAt" | "updatedAt">;
  currentAdminEmail: string;
  mediaItems: MediaPickerItem[];
  highlight?: boolean;
}) {
  const link = (label: string) => user.links.find((entry) => entry.label.toLowerCase() === label)?.url ?? "";
  const isCurrentAdmin = currentAdminEmail.toLowerCase() === user.email.toLowerCase();
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("user", user.email)}>
      <div className="studio-editor-head">
        <h3>{user.displayName}</h3>
        <div className="studio-head-actions">
          <span>{user.role}</span>
          {user.email !== "new@beamanwoodworks.local" ? (
            <form action={deleteUserProfileAdminAction}>
              <input name="email" type="hidden" value={user.email} />
              <button className="button-secondary" disabled={isCurrentAdmin} title={isCurrentAdmin ? "Sign out of this account before deleting it." : "Delete profile"} type="submit">Delete</button>
            </form>
          ) : null}
        </div>
      </div>
      <form action={saveUserProfileAdminAction} className="request-form compact-form">
        <input name="originalEmail" type="hidden" value={user.email} />
        <div className="field-grid two-up compact-grid"><Field label="Email" name="email" defaultValue={user.email} required /><Field label="Display name" name="displayName" defaultValue={user.displayName} required /></div>
        <div className="field-grid two-up compact-grid">
          <label><span>Role</span><select defaultValue={user.role} name="role"><option value="admin">Admin</option><option value="woodworker">Woodworker</option><option value="customer">Customer</option></select></label>
          <Field label="Headline" name="headline" defaultValue={user.headline} />
        </div>
        <MediaPicker defaultValue={user.avatarPath} helperText="Choose a profile image from the mounted media library." items={mediaItems} label="Profile image" loadPageAction={loadMediaPageAction} name="avatarPath" />
        <Area label="Bio" name="bio" defaultValue={user.bio} rows={4} />
        <div className="field-grid three-up compact-grid"><Field label="Website URL" name="websiteUrl" defaultValue={link("website")} /><Field label="Instagram URL" name="instagramUrl" defaultValue={link("instagram")} /><Field label="GitHub URL" name="githubUrl" defaultValue={link("github")} /></div>
        <div className="field-grid three-up compact-grid">
          <Check label="Public profile" name="publicProfile" defaultChecked={user.publicProfile} />
          <Check label="Show on About" name="showOnAboutPage" defaultChecked={Boolean(user.metadata.showOnAboutPage)} />
          <Check label="Woodworker profile" name="woodworkerProfile" defaultChecked={Boolean(user.metadata.woodworker)} />
        </div>
        <Check label="Developer profile" name="developerProfile" defaultChecked={Boolean(user.metadata.developer)} />
        <button className="button-primary" type="submit">Save profile</button>
      </form>
      {isCurrentAdmin ? <p className="muted-copy">This is the account currently signed into the dashboard and cannot be deleted from this session.</p> : null}
    </article>
  );
}

function CommissionTypeEditor({ item, highlight = false }: { item: Omit<CommissionTypeRecord, "createdAt" | "updatedAt">; highlight?: boolean }) {
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("commission-type", item.slug)}>
      <div className="studio-editor-head">
        <h3>{item.label}</h3>
        {item.slug !== "new-custom-type" ? <form action={deleteCommissionTypeAction}><input name="slug" type="hidden" value={item.slug} /><button className="button-secondary" type="submit">Delete</button></form> : null}
      </div>
      <form action={saveCommissionTypeAction} className="request-form compact-form">
        <div className="field-grid two-up compact-grid"><Field label="Slug" name="slug" defaultValue={item.slug} required /><Field label="Label" name="label" defaultValue={item.label} required /></div>
        <Area label="Description" name="description" defaultValue={item.description} rows={3} />
        <div className="field-grid two-up compact-grid"><Field label="Base labor hours" name="baseLaborHours" defaultValue={item.baseLaborHours} type="number" /><Field label="Markup percent" name="baseMarkupPercent" defaultValue={item.baseMarkupPercent} type="number" /></div>
        <Area label="Material choices" name="materialOptionsText" defaultValue={item.materialOptions.join("\n")} rows={4} />
        <div className="field-grid three-up compact-grid"><Field label="Default width" name="width" defaultValue={item.defaultDimensions.width} type="number" /><Field label="Default depth" name="depth" defaultValue={item.defaultDimensions.depth} type="number" /><Field label="Default height" name="height" defaultValue={item.defaultDimensions.height} type="number" /></div>
        <Check label="Available in contact workflow" name="active" defaultChecked={item.active} />
        <button className="button-primary" type="submit">Save custom type</button>
      </form>
    </article>
  );
}

export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{
    panel?: string;
    media?: string;
    mediaPage?: string;
    mediaPiece?: string;
    mediaAssignment?: string;
    mediaSource?: string;
    mediaSort?: string;
    mediaKind?: string;
    mediaAi?: string;
    error?: string;
    cleaned?: string;
    assigned?: string;
    uploaded?: string;
    renamed?: string;
    refreshed?: string;
    saved?: string;
    deleted?: string;
    project?: string;
    order?: string;
    invoice?: string;
    shipped?: string;
    page?: string;
    piece?: string;
    post?: string;
    user?: string;
    email?: string;
    category?: string;
    audit?: string;
  }>;
}) {
  const currentAdmin = await requireAdmin();
  const {
    panel: requestedPanel = "",
    media: mediaQuery = "",
    mediaPage: mediaPageRaw = "",
    mediaPiece: mediaPieceRaw = "",
    mediaAssignment: mediaAssignmentRaw = "",
    mediaSource: mediaSourceRaw = "",
    mediaSort: mediaSortRaw = "",
    mediaKind: mediaKindRaw = "",
    mediaAi: mediaAiRaw = "",
    error = "",
    cleaned = "",
    assigned = "",
    uploaded = "",
    renamed = "",
    refreshed = "",
    saved = "",
    deleted = "",
    project: projectHighlight = "",
    order: orderHighlight = "",
    invoice = "",
    shipped = "",
    page: pageHighlight = "",
    piece: pieceHighlight = "",
    post: postHighlight = "",
    user: userHighlight = "",
    audit = "",
    email = "",
    category: categoryHighlight = ""
  } = await searchParams;
  const includeAllAuditRecords =
    audit === "all" &&
    await visualAuditRequestAuthorized();
  const currentPanel: StudioPanel =
    STUDIO_PANELS.includes(requestedPanel as StudioPanel) ? requestedPanel as StudioPanel
      : cleaned || assigned || uploaded || renamed || refreshed || mediaQuery || saved === "media" || deleted === "media" || error.startsWith("media-") || error.startsWith("cleanup-") ? "media"
        : saved === "settings" ? "settings"
          : projectHighlight ? "projects"
          : orderHighlight || invoice || shipped ? "orders"
            : pageHighlight || saved === "page" || deleted === "page" ? "pages"
              : pieceHighlight || saved === "piece" || deleted === "piece" ? "pieces"
                : postHighlight || saved === "post" || deleted === "post" ? "process"
                  : userHighlight || email || saved === "user" || deleted === "user" ? "people"
                    : categoryHighlight || saved === "category" || deleted === "category" ? "categories"
                      : saved === "commission-type" || deleted === "commission-type" ? "custom"
                      : saved === "review" || deleted === "review" ? "reviews"
                        : "overview";
  const requestedMediaPage = Math.max(1, Number.parseInt(mediaPageRaw, 10) || 1);
  const mediaPiece = mediaPieceRaw.trim();
  const mediaAssignment: MediaAssignmentFilter = ["unassigned", "assigned", "review"].includes(mediaAssignmentRaw)
    ? mediaAssignmentRaw as MediaAssignmentFilter
    : "all";
  const mediaSource: MediaAssignmentSourceFilter = ["none", "manual-piece-editor", "manual-media-panel", "folder-rule", "AI-suggestion", "legacy"].includes(mediaSourceRaw)
    ? mediaSourceRaw as MediaAssignmentSourceFilter
    : "all";
  const mediaSort: MediaSort = ["updated-desc", "path-asc", "folder-asc", "piece-asc"].includes(mediaSortRaw)
    ? mediaSortRaw as MediaSort
    : "updated-desc";
  const mediaKind: MediaKindFilter = ["image", "video"].includes(mediaKindRaw)
    ? mediaKindRaw as MediaKindFilter
    : "all";
  const mediaAi: MediaAiFilter = ["high", "ambiguous", "details", "unanalyzed", "missing-alt", "representatives"].includes(mediaAiRaw)
    ? mediaAiRaw as MediaAiFilter
    : "all";
  const summary = getStudioDashboardSummary();
  const persistence = getRuntimePersistenceStatus();
  const searchIndexStatus = currentPanel === "overview"
    ? getSearchIndexStatus()
    : null;
  const queryOpt = mediaQuery.trim() || undefined;
  const settings = currentPanel === "settings" || currentPanel === "categories" || currentPanel === "pieces" ? getSiteSettings() : null;
  const categories = normalizePieceCategories(settings?.pieceCategories);
  const aiStatus = currentPanel === "overview" || currentPanel === "media" ? getAiServiceStatus() : null;
  const pages = currentPanel === "pages" || currentPanel === "media" ? listPages(true) : [];
  const pieces = currentPanel === "pieces" || currentPanel === "media" || currentPanel === "projects" ? listPieces(true) : [];
  const posts = currentPanel === "process" || currentPanel === "media" ? listPosts(true) : [];
  const commissionTypes = currentPanel === "custom" || currentPanel === "projects" ? listCommissionTypes(true) : [];
  const users = currentPanel === "people" ? listUsers() : [];
  const mediaFilters = {
    includeUnreviewed: true,
    query: queryOpt,
    ...(mediaPiece ? { pieceSlug: mediaPiece } : {}),
    assignment: mediaAssignment,
    assignmentSource: mediaSource,
    sort: mediaSort,
    kind: mediaKind,
    aiFilter: mediaAi
  } as const;
  const allMediaTotal = currentPanel === "media" ? countMedia({ includeUnreviewed: true }) : 0;
  const folderRulePreview = currentPanel === "media" ? previewMediaFolderRules() : null;
  const mediaTotal = currentPanel === "media" ? countMedia(mediaFilters) : 0;
  const mediaPage = Math.min(Math.max(1, Math.ceil(mediaTotal / STUDIO_MEDIA_PAGE_SIZE)), requestedMediaPage);
  const mediaOffset = (mediaPage - 1) * STUDIO_MEDIA_PAGE_SIZE;
  const media = currentPanel === "media"
    ? listMedia({
        ...mediaFilters,
        limit:
          STUDIO_MEDIA_PAGE_SIZE,
        offset:
          mediaOffset
      }).map(
        (item) =>
          studioMediaWithAccess(
            item
          )
      )
    : [];
  const verificationMedia = currentPanel === "media" ? listMedia({ includeUnreviewed: true }) : [];
  const verificationQueue = currentPanel === "media" ? buildMediaVerificationQueue(pieces, verificationMedia.filter((m) => m.kind === "image")) : [];
  const projects = currentPanel === "projects"
    ? (
        includeAllAuditRecords
          ? listProjects(true)
          : listProjects(true).slice(0, 20)
      )
    : [];

  const projectMedia = currentPanel === "projects"
    ? listMediaForProjectReferences(
        projects.map(project => project.reference)
      )
    : [];

  const projectLifecycleEvents = currentPanel === "projects"
    ? Object.fromEntries(
        projects.map((project) => [
          project.reference,
          listProjectLifecycleEvents(project.reference)
        ])
      )
    : {};

  const orders = currentPanel === "orders"
    ? (
        includeAllAuditRecords
          ? listOrders()
          : listOrders().slice(0, 20)
      )
    : [];

  const reviews = currentPanel === "reviews"
    ? (
        includeAllAuditRecords
          ? listReviews()
          : listReviews().slice(0, 20)
      )
    : [];

  const notificationPolicies = currentPanel === "notifications"
    ? listNotificationPolicies()
    : [];
  const notificationTemplates = currentPanel === "notifications"
    ? listNotificationTemplates()
    : [];
  const notificationDeliveries = currentPanel === "notifications"
    ? listNotificationDeliveries({
        limit: includeAllAuditRecords ? 200 : 50
      })
    : [];
  const notificationSummary = currentPanel === "notifications"
    ? getNotificationAdminSummary()
    : {
        total: 0,
        sent: 0,
        attention: 0,
        pendingConfiguration: 0,
        suppressed: 0
      };
  const smtpConfiguration = currentPanel === "notifications"
    ? getSmtpPublicConfiguration()
    : null;
  const latestSmtpVerification = currentPanel === "notifications"
    ? getLatestSmtpVerification()
    : null;
  const visitorPolicy = currentPanel === "notifications"
    ? getVisitorAnalyticsPolicy()
    : null;
  const visitorInsights = currentPanel === "notifications"
    ? getVisitorInsights({
        rangeDays: 30,
        page: 1,
        pageSize: 20
      })
    : null;
  const visitorIdentityStatus = currentPanel === "notifications"
    ? visitorIdentityPublicStatus()
    : null;
  const auditPage = currentPanel === "notifications"
    ? listAdminEditAudits({
        page: 1,
        limit: 25
      })
    : null;
  const auditFilterOptions = currentPanel === "notifications"
    ? getAdminAuditFilterOptions()
    : null;
  const editingPage = currentPanel === "pages"
    ? pageHighlight === "new-page-draft" ? pageDraft() : pages.find((page) => page.slug === pageHighlight) ?? pages[0] ?? pageDraft()
    : null;
  const editingPiece = currentPanel === "pieces"
    ? pieceHighlight === "new-piece-draft" ? pieceDraft(currentAdmin.email) : pieces.find((piece) => piece.slug === pieceHighlight) ?? pieces[0] ?? pieceDraft(currentAdmin.email)
    : null;
  const editingPost = currentPanel === "process"
    ? postHighlight === "new-process-entry" ? postDraft(currentAdmin.email) : posts.find((post) => post.slug === postHighlight) ?? posts[0] ?? postDraft(currentAdmin.email)
    : null;
  const editingPieceLinks = editingPiece && editingPiece.slug !== "new-piece-draft"
    ? listPieceMediaLinks(editingPiece.slug).filter((link) => link.role !== "private-project")
    : [];
  const linkedDisplayPaths = editingPieceLinks.filter((link) => ["hero", "gallery", "detail", "context"].includes(link.role)).map((link) => link.relativePath);
  const editingPiecePaths = linkedDisplayPaths.length > 0 ? linkedDisplayPaths : editingPiece?.mediaPaths ?? [];
  const editingPieceMediaPaths = [...new Set([...editingPiecePaths, ...editingPieceLinks.map((link) => link.relativePath)])];
  const editorMediaPaths = [...new Set([
    ...(editingPage?.heroMediaPath ? [editingPage.heroMediaPath] : []),
    ...editingPieceMediaPaths,
    ...(editingPost?.coverMediaPath ? [editingPost.coverMediaPath] : []),
    ...users.flatMap((user) => user.avatarPath ? [user.avatarPath] : [])
  ])];
  const editorInitialMedia = currentPanel === "pieces"
    ? listMedia({
        includeUnreviewed: true,
        limit: STUDIO_MEDIA_PAGE_SIZE,
        offset: 0
      })
    : [];
  const editorSelectedMedia = editorMediaPaths.map((relativePath) => getMedia(relativePath)).filter((item): item is NonNullable<ReturnType<typeof getMedia>> => Boolean(item));
  const editorMediaItems = [...new Map(
    [...editorInitialMedia, ...editorSelectedMedia]
      .map(
        (item) =>
          studioMediaWithAccess(
            item,
            editingPiece &&
            editingPiece.slug !==
              "new-piece-draft"
              ? editingPiece.slug
              : null
          )
      )
      .map((item) => [item.relativePath, item])
  ).values()];
  const panelHref = (panel: StudioPanel, extras?: Record<string, string>) => {
    const params = new URLSearchParams({ panel });
    if (panel === "media") {
      if (queryOpt) params.set("media", queryOpt);
      if (mediaPiece) params.set("mediaPiece", mediaPiece);
      if (mediaAssignment !== "all") params.set("mediaAssignment", mediaAssignment);
      if (mediaSource !== "all") params.set("mediaSource", mediaSource);
      if (mediaSort !== "updated-desc") params.set("mediaSort", mediaSort);
      if (mediaKind !== "all") params.set("mediaKind", mediaKind);
      if (mediaAi !== "all") params.set("mediaAi", mediaAi);
    }
    for (const [key, value] of Object.entries(extras ?? {})) {
      if (value) {
        params.set(key, value);
      }
    }
    const hash = panel === "pieces" && extras?.piece
      ? `#${toDomId("piece", extras.piece)}`
      : "";
    return `/studio?${params.toString()}${hash}`;
  };

  return (
    <Shell>
      <StudioScrollRestore />
      <StudioNavigationState />
      <div data-studio-root="true">
      <PageSection className={`studio-command-header${currentPanel === "overview" ? "" : " is-workspace"}`}>
        {currentPanel === "overview" ? (
          <PageIntro eyebrow="Woodshop" title="Dashboard" copy="Switch between focused workspaces for pages, pieces, media, process notes, projects, orders, and profiles." />
        ) : (
          <div className="studio-workspace-title"><p className="eyebrow">Woodshop dashboard</p><h1>{currentPanel.charAt(0).toUpperCase() + currentPanel.slice(1)}</h1></div>
        )}
        {error ? <p className="notice-panel danger">Dashboard action failed: {studioMessage(error)}</p> : null}
        {cleaned ? <p className="notice-panel">Cleaned media copy created: {cleaned}</p> : null}
        {assigned ? <p className="notice-panel">Media assigned and marked reviewed: {assigned}</p> : null}
        {uploaded ? <p className="notice-panel">Media uploaded: {uploaded}</p> : null}
        {renamed ? <p className="notice-panel">Media renamed: {renamed}</p> : null}
        {refreshed ? <p className="notice-panel">Media library refreshed.</p> : null}
        {saved ? <p className="notice-panel">{saved === "user" && email ? `Profile saved: ${email}` : `Saved: ${saved}`}</p> : null}
        {deleted ? <p className="notice-panel">{deleted === "user" && email ? `Profile deleted: ${email}` : `Deleted: ${deleted}`}</p> : null}
        {currentPanel === "overview" ? <div className="admin-summary-grid">
          <article className="studio-panel"><span>{summary.bandwidth.bandwidthPercent}%</span><p>Capacity</p></article>
          <article className="studio-panel"><span>{summary.bandwidth.activeProjects}</span><p>Active projects</p></article>
          <article className="studio-panel"><span>{summary.publishedPieces}</span><p>Published pieces</p></article>
          <article className="studio-panel"><span>{summary.publishedPosts}</span><p>Process notes</p></article>
          <article className="studio-panel"><span>Overview</span><p>Panel</p></article>
          <article className="studio-panel"><span>{formatMoney(summary.monthlyRevenueCents)}</span><p>Revenue this month</p></article>
        </div> : null}
        <nav aria-label="Studio workspaces" className="studio-workspace-nav">
          {STUDIO_PANELS.map((panel) => (
            <Link aria-current={panel === currentPanel ? "page" : undefined} className={`studio-workspace-pill ${panel === currentPanel ? "is-active" : ""}`.trim()} href={panelHref(panel)} key={panel}>
              {panel === "overview" ? "Overview" : panel.charAt(0).toUpperCase() + panel.slice(1)}
            </Link>
          ))}
        </nav>
      </PageSection>

      {currentPanel === "overview" ? (
        <PageSection>
          <div className="section-heading"><p className="eyebrow">Overview</p><h2>Focused workspaces</h2><p>The dashboard now loads one workspace at a time to keep the editing surface lighter and easier to scan.</p></div>
          <div className="studio-grid two-column-grid">
            <Link className="studio-panel studio-workspace-card" href={panelHref("settings")}><p className="eyebrow">Brand</p><h3>Site settings</h3><p>Homepage copy, contact details, and divider labels.</p></Link>
            <Link className="studio-panel studio-workspace-card" href={panelHref("pieces")}><p className="eyebrow">Pieces</p><h3>{summary.publishedPieces} published</h3><p>Portfolio, shop, pricing visibility, and fulfillment details.</p></Link>
            <Link className="studio-panel studio-workspace-card" href={panelHref("categories")}><p className="eyebrow">Categories</p><h3>{categories.length} portfolio groups</h3><p>Add, rename, reorder, or consolidate the public portfolio filters.</p></Link>
            <Link className="studio-panel studio-workspace-card" href={panelHref("media")}><p className="eyebrow">Media</p><h3>Mounted NAS library</h3><p>Upload, review, crop, assign, and verify piece accuracy.</p></Link>
            <Link className="studio-panel studio-workspace-card" href={panelHref("projects")}><p className="eyebrow">Projects</p><h3>{summary.bandwidth.activeProjects} active</h3><p>Lead time, queue visibility, notes, and project stages.</p></Link>
            <article className={`studio-panel persistence-status-card${persistence.dataRootConfigured && persistence.dataRootWritable && persistence.quickCheck === "ok" ? " is-healthy" : " is-warning"}`}>
              <p className="eyebrow">Persistence</p>
              <h3>{persistence.dataRootConfigured && persistence.dataRootWritable ? "Mounted data store" : "Check data mount"}</h3>
              <dl className="estimate-list compact-estimate">
                <div><dt>Data root</dt><dd>{persistence.dataRoot}</dd></div>
                <div><dt>SQLite</dt><dd>{persistence.quickCheck} · {persistence.journalMode}</dd></div>
                <div><dt>Seed</dt><dd>v{persistence.seededVersion}</dd></div>
              </dl>
              <p className="muted-copy">Studio edits are written to this database path and reused by future container rebuilds when the Compose mount remains active.</p>
            </article>
            {searchIndexStatus ? <StudioSearchIndexAdmin initialStatus={searchIndexStatus} /> : null}
            {aiStatus ? <article className="studio-panel"><p className="eyebrow">AI services</p><h3>{aiStatus.backgroundCleanup || aiStatus.embeddingSearch || aiStatus.mediaAnalysis || aiStatus.publicRendering ? "Mixed availability" : "Credential-free mode"}</h3><p className="muted-copy">Optional AI services remain honest and off by default unless their environment configuration is present.</p></article> : null}
          </div>
        </PageSection>
      ) : null}

      {currentPanel === "settings" && settings ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Settings</p><h2>Brand and homepage</h2><p>Core contact information and homepage wording.</p></div>
        <article className="studio-panel">
          <form action={saveSiteSettingsAction} className="request-form">
            <div className="field-grid two-up compact-grid"><Field label="Brand name" name="brandName" defaultValue={settings.brandName} /><Field label="Tagline" name="brandTagline" defaultValue={settings.brandTagline} /></div>
            <Area label="Site announcement" name="siteAnnouncement" defaultValue={settings.siteAnnouncement} rows={3} />
            <div className="field-grid three-up compact-grid"><Field label="Builder email" name="builderEmail" defaultValue={settings.builderEmail} /><Field label="Developer email" name="developerEmail" defaultValue={settings.developerEmail} /><Field label="Repository URL" name="repoUrl" defaultValue={settings.repoUrl} /></div>
            <Area label="Homepage featured piece slugs (one per line, in display order)" name="homepageFeaturedPieceSlugs" defaultValue={settings.homepageFeaturedPieceSlugs.join("\n")} rows={4} />
            <Area label="Hero title" name="heroTitle" defaultValue={String(settings.homeSections.find((section) => section.key === "hero")?.title ?? "")} rows={3} />
            <Area label="Hero copy" name="heroCopy" defaultValue={String(settings.homeSections.find((section) => section.key === "hero")?.copy ?? "")} rows={4} />
            <button className="button-primary" type="submit">Save settings</button>
          </form>
        </article>
        <SiteStructureEditor footer={settings.footer} homeServices={settings.homeServices} saveAction={saveSiteStructureAction} />
      </PageSection>
      ) : null}

      {currentPanel === "pages" && editingPage ? <PageSection><div className="section-heading"><p className="eyebrow">Pages</p><h2>Public pages</h2><p>Select one record, edit it in place, and choose hero media visually from the mounted library.</p></div><div className="studio-master-detail"><StudioMasterList items={pages.map((page) => ({ key: page.slug, label: page.title, meta: page.status, href: panelHref("pages", { page: page.slug }) }))} newHref={panelHref("pages", { page: "new-page-draft" })} newLabel="New page" selectedKey={editingPage.slug} /><PageEditor highlight mediaItems={editorMediaItems} page={editingPage} /></div></PageSection> : null}
      {currentPanel === "pieces" && editingPiece ? <PageSection><div className="section-heading"><p className="eyebrow">Pieces</p><h2>Portfolio and shop pieces</h2><p>Pricing, inquiry and review policies, inventory, fulfillment, and normalized visual media assignment.</p></div><div className="studio-master-detail"><StudioMasterList items={pieces.map((piece) => ({ key: piece.slug, label: piece.title, meta: `${piece.publicationStatus} · ${piece.status}`, href: panelHref("pieces", { piece: piece.slug }) }))} newHref={panelHref("pieces", { piece: "new-piece-draft" })} newLabel="New piece" selectedKey={editingPiece.slug} /><PieceEditor categories={categories} highlight key={editingPiece.slug} mediaItems={editorMediaItems} mediaLinks={editingPieceLinks} piece={editingPiece} /></div></PageSection> : null}
      {currentPanel === "categories" ? <PageSection><div className="section-heading"><p className="eyebrow">Categories</p><h2>Portfolio filters</h2><p>Choose a furniture icon, import a safe custom SVG, and control order and visibility without editing code.</p></div><div className="studio-grid category-editor-grid"><StudioCategoryEditor categories={categories} category={{ key: "new-category", label: "New category", icon: "object", iconName: "object", iconType: "builtin", customIconSvg: null, aliases: [], sortOrder: categories.length * 10, visible: true }} deleteAction={deletePieceCategoryAction} isNew saveAction={savePieceCategoryAction} />{categories.map((category) => <StudioCategoryEditor categories={categories} category={category} deleteAction={deletePieceCategoryAction} key={category.key} saveAction={savePieceCategoryAction} />)}</div></PageSection> : null}
      {currentPanel === "custom" ? <PageSection><div className="section-heading"><p className="eyebrow">Custom work</p><h2>Contact workflow types</h2><p>Material menus, estimator defaults, and active custom request categories.</p></div><div className="studio-grid two-column-grid"><CommissionTypeEditor item={commissionTypeDraft()} />{commissionTypes.map((item) => <CommissionTypeEditor key={item.slug} item={item} />)}</div></PageSection> : null}
      {currentPanel === "people" ? <PageSection><div className="section-heading"><p className="eyebrow">People</p><h2>Accounts and public profiles</h2><p>Rename profiles, replace contact emails, and remove accounts directly from the dashboard.</p></div><div className="studio-grid two-column-grid"><UserEditor currentAdminEmail={currentAdmin.email} mediaItems={editorMediaItems} user={userDraft()} />{users.map((user) => <UserEditor currentAdminEmail={currentAdmin.email} highlight={user.email.toLowerCase() === (userHighlight || email).toLowerCase()} key={user.email} mediaItems={editorMediaItems} user={user} />)}</div></PageSection> : null}
      {currentPanel === "process" && editingPost ? <PageSection><div className="section-heading"><p className="eyebrow">Process</p><h2>Process notes and references</h2><p>Select one note, edit Markdown and source details, and choose its cover media visually.</p></div><div className="studio-master-detail"><StudioMasterList items={posts.map((post) => ({ key: post.slug, label: post.title, meta: post.publicationStatus, href: panelHref("process", { post: post.slug }) }))} newHref={panelHref("process", { post: "new-process-entry" })} newLabel="New process note" selectedKey={editingPost.slug} /><PostEditor highlight mediaItems={editorMediaItems} post={editingPost} /></div></PageSection> : null}

      {currentPanel === "media" ? (
      <PageSection className="studio-media-section">
        <div className="studio-media-page-head">
          <div className="section-heading"><p className="eyebrow">Media</p><h2>Library assignment desk</h2><p>Filter, inspect, assign, crop, tag, and verify one media record at a time without leaving the current position.</p></div>
          <div className="studio-media-page-tools">
            <p className="muted-copy">{allMediaTotal} indexed · {verificationQueue.filter((entry) => entry.needsReview).length} pieces need review</p>
          </div>
        </div>
        <StudioMediaWorkspace
          applyFolderRulesAction={applyMediaFolderRulesAction}
          assignAction={assignMediaCandidateAction}
          cleanupAction={cleanupMediaBackgroundAction}
          deleteAction={deleteMediaAction}
          initialItems={media}
          initialOperations={listMediaOperationBatches(12)}
          initialAssignment={mediaAssignment}
          initialAssignmentSource={mediaSource}
          initialPieceSlug={mediaPiece}
          initialSort={mediaSort}
          initialKind={mediaKind}
          initialAiFilter={mediaAi}
          initialPage={mediaPage}
          initialPageSize={STUDIO_MEDIA_PAGE_SIZE}
          initialQuery={mediaQuery}
          initialTotal={mediaTotal}
          loadPageAction={loadMediaPageAction}
          loadVerificationQueueAction={loadMediaVerificationQueueAction}
          folderRulePreview={folderRulePreview!}
          rejectSuggestionAction={markMediaAiSuggestionWrongAction}
          pages={pages.map((page) => ({ slug: page.slug, title: page.title }))}
          pieces={pieces.map((piece) => ({
            slug: piece.slug,
            title: piece.title,
            mediaCount: countMedia({ includeUnreviewed: true, pieceSlug: piece.slug })
          }))}
          posts={posts.map((post) => ({ slug: post.slug, title: post.title }))}
          organizeBatchAction={organizeMediaBatchAction}
          refreshAction={refreshMediaLibraryAction}
          renameAction={renameMediaAction}
          rollbackBatchAction={rollbackMediaBatchAction}
          saveAction={saveMediaMetadataAction}
          saveFolderRuleAction={saveMediaSourceFolderRuleAction}
          uploadAction={uploadMediaAction}
          verificationQueue={verificationQueue.map((entry) => ({ pieceSlug: entry.piece.slug, pieceTitle: entry.piece.title, assignedCount: entry.assigned.length, needsReview: entry.needsReview, suggestions: entry.suggestions }))}
        />
        <details className="studio-panel media-service-status"><summary>Automation configuration</summary><dl className="estimate-list compact-estimate"><div><dt>Analysis</dt><dd>{aiStatus?.mediaAnalysis ? `${aiStatus.activeAnalysisProvider} · ${aiStatus.visionModel}` : "Disabled"}</dd></div><div><dt>Visual embeddings</dt><dd>{aiStatus?.embeddingSearch ? `${aiStatus.activeEmbeddingProvider} · ${aiStatus.embeddingModel}` : "Disabled"}</dd></div><div><dt>Background cleanup</dt><dd>{aiStatus?.backgroundCleanup ? `OpenAI · ${aiStatus.imageModel}` : "Optional · not configured"}</dd></div></dl><p className="muted-copy">The local filesystem index and manual editor always remain available. Automation stores review evidence only; it cannot publish or silently assign media.</p></details>
      </PageSection>
      ) : null}

      {currentPanel === "projects" ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Projects</p><h2>Queue and status</h2><p>Select one project to update its schedule, buyer timeline, lifecycle, and delivery notices without reloading the dashboard.</p></div>
        <StudioProjectsAdmin
          commissionTypes={commissionTypes.map((item) => ({ slug: item.slug, title: item.label }))}
          initialProjects={projects}
          initialReference={projectHighlight}
          lifecycleEvents={projectLifecycleEvents}
          media={projectMedia.filter((item) => item.kind === "image" || item.kind === "video").map((item) => ({
            relativePath: item.relativePath,
            altText: item.altText,
            fileName: item.fileName,
            kind: item.kind === "video" ? "video" : "image",
            width: null,
            height: null,
            projectReference: item.projectReference ?? "",
            displayOrder: Number(item.metadata.displayOrder ?? 0)
          }))}
          pieces={pieces.map((item) => ({ slug: item.slug, title: item.title }))}
        />
      </PageSection>
      ) : null}

      {currentPanel === "orders" ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Orders</p><h2>Payments and shipping</h2><p>Order status, invoice, and label actions.</p></div>
        <div className="studio-grid two-column-grid">
          {orders.map((orderRecord) => (
            <article className={`studio-panel studio-editor-card${orderRecord.orderNumber === orderHighlight || orderRecord.orderNumber === invoice || orderRecord.orderNumber === shipped ? " highlight-card" : ""}`} key={orderRecord.orderNumber}>
              <div className="studio-editor-head"><h3>{orderRecord.orderNumber}</h3><span>{formatMoney(orderRecord.totalCents)}</span></div>
              <form action={saveOrderAction} className="request-form compact-form"><input name="orderNumber" type="hidden" value={orderRecord.orderNumber} /><Field label="Status" name="status" defaultValue={orderRecord.status} /><Field label="Payment status" name="paymentStatus" defaultValue={orderRecord.paymentStatus ?? ""} /><Field label="Tracking number" name="trackingNumber" defaultValue={orderRecord.trackingNumber ?? ""} /><button className="button-primary" type="submit">Save order</button></form>
              <div className="button-row"><form action={createInvoiceAction}><input name="orderNumber" type="hidden" value={orderRecord.orderNumber} /><button className="button-secondary" type="submit">Issue invoice</button></form><form action={createShippingLabelAction}><input name="orderNumber" type="hidden" value={orderRecord.orderNumber} /><input name="weightOunces" type="hidden" value="96" /><button className="button-secondary" type="submit">Create label</button></form></div>
              <p className="muted-copy">Updated {formatDateTime(orderRecord.updatedAt)}</p>
            </article>
          ))}
        </div>
      </PageSection>
      ) : null}

      {currentPanel === "reviews" ? <PageSection><div className="section-heading"><p className="eyebrow">Reviews</p><h2>Customer feedback</h2><p>Moderate review copy and publication state.</p></div><div className="studio-grid two-column-grid">{reviews.map((review) => <article className={`studio-panel studio-editor-card${pieceHighlight && review.pieceSlug === pieceHighlight ? " highlight-card" : ""}`} key={review.id}><div className="studio-editor-head"><h3>{review.title}</h3><form action={deleteReviewAdminAction}><input name="id" type="hidden" value={review.id} /><input name="pieceSlug" type="hidden" value={review.pieceSlug} /><button className="button-secondary" type="submit">Delete</button></form></div><form action={saveReviewAdminAction} className="request-form compact-form"><input name="id" type="hidden" value={review.id} /><input name="pieceSlug" type="hidden" value={review.pieceSlug} /><Field label="Reviewer" name="reviewerName" defaultValue={review.reviewerName} /><Field label="Title" name="title" defaultValue={review.title} /><Area label="Body" name="body" defaultValue={review.body} rows={4} /><label><span>Status</span><select defaultValue={review.status} name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><button className="button-primary" type="submit">Save review</button></form></article>)}</div></PageSection> : null}
      {currentPanel === "notifications" && smtpConfiguration && visitorPolicy && visitorInsights && visitorIdentityStatus && auditPage && auditFilterOptions ? <PageSection><div className="section-heading"><p className="eyebrow">Operations</p><h2>Delivery, visitors, and audit</h2><p>Control notification policy and delivery, review privacy-preserving visitor trends, and inspect redacted administrative changes.</p></div><StudioNotificationsAdmin auditFilterOptions={auditFilterOptions} initialAuditPage={auditPage} initialDeliveries={notificationDeliveries} initialPolicies={notificationPolicies} initialSmtpVerification={latestSmtpVerification} initialSummary={notificationSummary} initialTemplates={notificationTemplates} initialVisitorInsights={visitorInsights} initialVisitorPolicy={visitorPolicy} smtpConfiguration={smtpConfiguration} visitorIdentityStatus={visitorIdentityStatus} /></PageSection> : null}
      </div>
    </Shell>
  );
}
