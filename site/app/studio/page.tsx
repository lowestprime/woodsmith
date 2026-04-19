import {
  createInvoiceAction,
  createShippingLabelAction,
  assignMediaCandidateAction,
  cleanupMediaBackgroundAction,
  deleteMediaAction,
  deletePageAction,
  deletePieceAction,
  deletePostAction,
  deleteReviewAdminAction,
  deleteUserProfileAdminAction,
  deleteCommissionTypeAction,
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
import Link from "next/link";
import {
  countMedia,
  getSiteSettings,
  getStudioDashboardSummary,
  listCommissionTypes,
  listMedia,
  listMediaForProjectReferences,
  listNotifications,
  listOrders,
  listPages,
  listPieces,
  listPosts,
  listProjects,
  listReviews,
  listVisitorCountrySummary,
  listVisitorSessions,
  listUsers,
  type CommissionTypeRecord,
  type MediaRecord,
  type PageRecord,
  type PieceRecord,
  type PostRecord,
  type UserRecord
} from "@/lib/db";
import { formatDateTime, formatMoney, toMediaUrl } from "@/lib/format";
import { buildMediaVerificationQueue } from "@/lib/media-audit";
import { getAiServiceStatus } from "@/lib/ai-services";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { StudioMediaFilter } from "@/components/studio-media-filter";
import { MediaPicker } from "@/components/media-picker";
import { StudioMediaWorkspace } from "@/components/studio-media-workspace";
import { VisitorInsights } from "@/components/visitor-insights";

const STUDIO_MEDIA_PAGE_SIZE = 48;
const STUDIO_VERIFICATION_MEDIA_CAP = 500;
const STUDIO_PANELS = ["overview", "settings", "pages", "pieces", "custom", "people", "process", "media", "projects", "orders", "reviews", "notifications"] as const;

type StudioPanel = (typeof STUDIO_PANELS)[number];
type StudioNavItem = {
  key: string;
  label: string;
  meta: string;
  href: string;
  active: boolean;
};

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

function studioMessage(code: string) {
  const messages: Record<string, string> = {
    "cannot-delete-current-user": "The profile currently signed in cannot be deleted.",
    "cannot-delete-last-admin": "At least one admin profile must remain available.",
    "user-missing": "The requested profile could not be found."
  };
  return messages[code] ?? code;
}

function StudioRecordNav({
  eyebrow,
  title,
  items
}: {
  eyebrow: string;
  title: string;
  items: StudioNavItem[];
}) {
  return (
    <aside className="studio-record-nav">
      <article className="studio-panel studio-record-nav-card">
        <p className="eyebrow">{eyebrow}</p>
        <h3>{title}</h3>
        <div className="studio-record-link-list">
          {items.map((item) => (
            <Link
              aria-current={item.active ? "page" : undefined}
              className={`studio-record-link${item.active ? " is-active" : ""}`.trim()}
              href={item.href}
              key={item.key}
              scroll={false}
            >
              <strong>{item.label}</strong>
              <small>{item.meta}</small>
            </Link>
          ))}
        </div>
      </article>
    </aside>
  );
}

function PageEditor({
  page,
  mediaLibrary,
  highlight = false
}: {
  page: Omit<PageRecord, "createdAt" | "updatedAt">;
  mediaLibrary: MediaRecord[];
  highlight?: boolean;
}) {
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("page", page.slug)}>
      <div className="studio-editor-head">
        <h3>{page.title}</h3>
        {page.slug !== "new-page-draft" ? <form action={deletePageAction}><input name="slug" type="hidden" value={page.slug} /><button className="button-secondary" type="submit">Delete</button></form> : null}
      </div>
      <form action={savePageAction} className="request-form compact-form">
        <input name="originalSlug" type="hidden" value={page.slug === "new-page-draft" ? "" : page.slug} />
        <div className="field-grid two-up compact-grid"><Field label="Slug" name="slug" defaultValue={page.slug} required /><Field label="Title" name="title" defaultValue={page.title} required /></div>
        <div className="field-grid two-up compact-grid">
          <Field label="Navigation label" name="navLabel" defaultValue={page.navLabel} />
          <label><span>Status</span><select defaultValue={page.status} name="status"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        </div>
        <Field label="Layout" name="layout" defaultValue={page.layout} />
        <MediaPicker defaultValue={page.heroMediaPath} helperText="Choose from every indexed file in the mounted NAS library." items={mediaLibrary} label="Hero media" name="heroMediaPath" />
        <Area label="Intro" name="intro" defaultValue={page.intro} rows={3} />
        <Area label="Body" name="body" defaultValue={page.body} rows={5} />
        {page.slug === "home" ? <p className="muted-copy">On the homepage, Intro feeds the hero copy and Body feeds the supporting services copy.</p> : null}
        <button className="button-primary" type="submit">Save page</button>
      </form>
    </article>
  );
}

function PieceEditor({
  piece,
  mediaLibrary,
  highlight = false
}: {
  piece: Omit<PieceRecord, "createdAt" | "updatedAt">;
  mediaLibrary: MediaRecord[];
  highlight?: boolean;
}) {
  return (
    <article className={`studio-panel studio-editor-card${highlight ? " highlight-card" : ""}`.trim()} id={toDomId("piece", piece.slug)}>
      <div className="studio-editor-head">
        <h3>{piece.title}</h3>
        {piece.slug !== "new-piece-draft" ? <form action={deletePieceAction}><input name="slug" type="hidden" value={piece.slug} /><button className="button-secondary" type="submit">Delete</button></form> : null}
      </div>
      <form action={savePieceAction} className="request-form compact-form">
        <div className="field-grid two-up compact-grid"><Field label="Slug" name="slug" defaultValue={piece.slug} required /><Field label="Title" name="title" defaultValue={piece.title} required /></div>
        <div className="field-grid two-up compact-grid"><Field label="Subtitle" name="subtitle" defaultValue={piece.subtitle} /><Field label="Category" name="category" defaultValue={piece.category} /></div>
        <div className="field-grid three-up compact-grid">
          <label><span>Status</span><select defaultValue={piece.status} name="pieceStatus"><option value="inventory">Inventory</option><option value="commission">Custom pattern</option><option value="archive">Archive</option></select></label>
          <label><span>Publication</span><select defaultValue={piece.publicationStatus} name="publicationStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <Field label="Availability" name="availabilityLabel" defaultValue={piece.availabilityLabel} />
        </div>
        <Area label="Summary" name="summary" defaultValue={piece.summary} rows={3} />
        <Area label="Story" name="story" defaultValue={piece.story} rows={5} />
        <Area label="Details, one per line" name="detailsText" defaultValue={piece.details.join("\n")} rows={4} />
        <div className="field-grid two-up compact-grid"><Area label="Materials" name="materialsText" defaultValue={piece.materials.join("\n")} rows={4} /><Area label="Tags" name="tagsText" defaultValue={piece.tags.join(", ")} rows={4} /></div>
        <MediaPicker defaultValue={piece.mediaPaths} helperText="Select the exact images that belong with this piece. Manual file-path entry is no longer required." items={mediaLibrary} label="Piece media" maxSelections={16} name="mediaPathsText" selectionMode="multiple" />
        <div className="field-grid three-up compact-grid"><Field label="Width" name="width" defaultValue={piece.dimensions?.width ?? ""} type="number" /><Field label="Depth" name="depth" defaultValue={piece.dimensions?.depth ?? ""} type="number" /><Field label="Height" name="height" defaultValue={piece.dimensions?.height ?? ""} type="number" /></div>
        <div className="field-grid three-up compact-grid"><Field label="Asking price cents" name="priceCents" defaultValue={piece.priceCents ?? ""} type="number" /><Field label="Inventory" name="inventoryCount" defaultValue={piece.inventoryCount} type="number" /><Field label="Lead time days" name="leadTimeDays" defaultValue={piece.leadTimeDays} type="number" /></div>
        <div className="field-grid two-up compact-grid"><Field label="Featured rank" name="featuredRank" defaultValue={piece.featuredRank} type="number" /><Field label="Media limit" name="publicMediaLimit" defaultValue={Number(piece.metadata.publicMediaLimit ?? 4)} type="number" /></div>
        <Area label="Fulfillment options" name="fulfillmentText" defaultValue={Array.isArray(piece.metadata.fulfillmentOptions) ? piece.metadata.fulfillmentOptions.join("\n") : ""} rows={3} />
        <div className="field-grid two-up compact-grid"><Check label="Verified media" name="verifiedMedia" defaultChecked={piece.metadata.verifiedMedia !== false} /><Check label="Media review required" name="mediaReviewRequired" defaultChecked={Boolean(piece.metadata.mediaReviewRequired)} /></div>
        <button className="button-primary" type="submit">Save piece</button>
      </form>
    </article>
  );
}

function PostEditor({
  post,
  mediaLibrary,
  highlight = false
}: {
  post: Omit<PostRecord, "createdAt" | "updatedAt">;
  mediaLibrary: MediaRecord[];
  highlight?: boolean;
}) {
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
        <MediaPicker defaultValue={post.coverMediaPath} helperText="Choose the process cover image directly from the mounted library." items={mediaLibrary} label="Cover media" name="coverMediaPath" />
        <div className="field-grid two-up compact-grid"><Field label="Source URL" name="sourceUrl" defaultValue={post.sourceUrl ?? ""} /><Field label="Source label" name="sourceLabel" defaultValue={post.sourceLabel ?? ""} /></div>
        <Area label="Tags" name="tagsText" defaultValue={post.tags.join(", ")} rows={2} />
        <label><span>Publication</span><select defaultValue={post.publicationStatus} name="publicationStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
        <button className="button-primary" type="submit">Save process note</button>
      </form>
      <p className="muted-copy">Live preview is omitted in the dashboard for performance. Use the public Process page to confirm formatting after saving.</p>
    </article>
  );
}

function pageDraft(): Omit<PageRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-page-draft", title: "New Page Draft", navLabel: "New Page", status: "draft", intro: "", body: "", layout: "document", sections: [], heroMediaPath: null };
}

function pieceDraft(ownerEmail: string): Omit<PieceRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-piece-draft", title: "New Piece Draft", subtitle: "", category: "Tables", status: "commission", publicationStatus: "draft", availabilityLabel: "Draft", summary: "", story: "", details: [], tags: ["draft"], materials: ["Hardwood"], dimensions: { width: 48, depth: 24, height: 30, unit: "in" }, priceCents: null, inventoryCount: 0, leadTimeDays: 56, mediaPaths: [], featuredRank: 99, ownerEmail, metadata: { verifiedMedia: false, publicMediaLimit: 4, fulfillmentOptions: [] } };
}

function postDraft(authorEmail: string): Omit<PostRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-process-entry", title: "New Process Note", excerpt: "", body: "", publicationStatus: "draft", publishedAt: null, authorEmail, coverMediaPath: null, tags: ["draft"], sourceUrl: null, sourceLabel: null };
}

function commissionTypeDraft(): Omit<CommissionTypeRecord, "createdAt" | "updatedAt"> {
  return { slug: "new-custom-type", label: "New Custom Type", description: "", baseLaborHours: 12, baseMarkupPercent: 30, materialOptions: ["White maple", "Birds-eye maple", "Walnut", "Cherry", "Ebony accent"], defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" }, active: true };
}

function userDraft(): Omit<UserRecord, "id" | "resetToken" | "resetExpiresAt" | "createdAt" | "updatedAt"> {
  return { email: "new@beamanwoodworks.local", role: "woodworker", displayName: "New Woodworker", headline: "Independent woodworker", bio: "", avatarPath: null, publicProfile: false, links: [], metadata: { woodworker: true, developer: false, showOnAboutPage: false } };
}

function UserEditor({
  user,
  currentAdminEmail,
  highlight = false
}: {
  user: Omit<UserRecord, "id" | "resetToken" | "resetExpiresAt" | "createdAt" | "updatedAt">;
  currentAdminEmail: string;
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
        <Field label="Profile image path" name="avatarPath" defaultValue={user.avatarPath ?? ""} />
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
  }>;
}) {
  const currentAdmin = await requireAdmin();
  const {
    panel: requestedPanel = "",
    media: mediaQuery = "",
    mediaPage: mediaPageRaw = "",
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
    email = ""
  } = await searchParams;
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
                    : saved === "commission-type" || deleted === "commission-type" ? "custom"
                      : saved === "review" || deleted === "review" ? "reviews"
                        : "overview";
  const mediaPage = Math.max(1, Number.parseInt(mediaPageRaw, 10) || 1);
  const mediaOffset = (mediaPage - 1) * STUDIO_MEDIA_PAGE_SIZE;
  const summary = getStudioDashboardSummary();
  const queryOpt = mediaQuery.trim() || undefined;
  const settings = currentPanel === "settings" ? getSiteSettings() : null;
  const aiStatus = currentPanel === "overview" || currentPanel === "media" ? getAiServiceStatus() : null;
  const pages = currentPanel === "pages" || currentPanel === "media" ? listPages(true) : [];
  const pieces = currentPanel === "pieces" || currentPanel === "media" ? listPieces(true) : [];
  const posts = currentPanel === "process" || currentPanel === "media" ? listPosts(true) : [];
  const mediaLibrary = currentPanel === "pages" || currentPanel === "pieces" || currentPanel === "process" || currentPanel === "media"
    ? listMedia({ includeUnreviewed: true, limit: 5000 })
    : [];
  const commissionTypes = currentPanel === "custom" ? listCommissionTypes(true) : [];
  const users = currentPanel === "people" ? listUsers() : [];
  const mediaTotal = currentPanel === "media" ? countMedia({ includeUnreviewed: true, query: queryOpt }) : 0;
  const media = currentPanel === "media" ? listMedia({ includeUnreviewed: true, query: queryOpt, limit: STUDIO_MEDIA_PAGE_SIZE, offset: mediaOffset }) : [];
  const verificationMedia = currentPanel === "media" ? listMedia({ includeUnreviewed: true, query: queryOpt, limit: STUDIO_VERIFICATION_MEDIA_CAP }) : [];
  const verificationQueue = currentPanel === "media" ? buildMediaVerificationQueue(pieces, verificationMedia.filter((m) => m.kind === "image")) : [];
  const projects = currentPanel === "projects" ? listProjects(true).slice(0, 20) : [];
  const projectMedia = currentPanel === "projects" ? listMediaForProjectReferences(projects.map((p) => p.reference)) : [];
  const orders = currentPanel === "orders" ? listOrders().slice(0, 20) : [];
  const reviews = currentPanel === "reviews" ? listReviews().slice(0, 20) : [];
  const notifications = currentPanel === "notifications" ? listNotifications().slice(0, 20) : [];
  const visitorCountrySummary = currentPanel === "overview" ? listVisitorCountrySummary(18) : [];
  const recentVisitors = currentPanel === "overview" ? listVisitorSessions(8) : [];
  const panelHref = (panel: StudioPanel, extras?: Record<string, string>) => {
    const params = new URLSearchParams({ panel });
    if (panel === "media" && queryOpt) {
      params.set("media", queryOpt);
    }
    for (const [key, value] of Object.entries(extras ?? {})) {
      if (value) {
        params.set(key, value);
      }
    }
    return `/studio?${params.toString()}`;
  };
  const selectedPageSlug = currentPanel === "pages"
    ? pageHighlight === "new-page-draft"
      ? "new-page-draft"
      : pages.find((page) => page.slug === pageHighlight)?.slug || pages[0]?.slug || "new-page-draft"
    : "";
  const selectedPage = currentPanel === "pages"
    ? selectedPageSlug === "new-page-draft"
      ? pageDraft()
      : pages.find((page) => page.slug === selectedPageSlug) ?? pageDraft()
    : null;

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="Woodshop" title="Dashboard" copy="Switch between focused workspaces for pages, pieces, media, process notes, projects, orders, and profiles." />
        {error ? <p className="notice-panel danger">Dashboard action failed: {studioMessage(error)}</p> : null}
        {cleaned ? <p className="notice-panel">Cleaned media copy created: {cleaned}</p> : null}
        {assigned ? <p className="notice-panel">Media assigned and marked reviewed: {assigned}</p> : null}
        {uploaded ? <p className="notice-panel">Media uploaded: {uploaded}</p> : null}
        {renamed ? <p className="notice-panel">Media renamed: {renamed}</p> : null}
        {refreshed ? <p className="notice-panel">Media library refreshed.</p> : null}
        {saved ? <p className="notice-panel">{saved === "user" && email ? `Profile saved: ${email}` : `Saved: ${saved}`}</p> : null}
        {deleted ? <p className="notice-panel">{deleted === "user" && email ? `Profile deleted: ${email}` : `Deleted: ${deleted}`}</p> : null}
        <div className="admin-summary-grid">
          <article className="studio-panel"><span>{summary.bandwidth.bandwidthPercent}%</span><p>Capacity</p></article>
          <article className="studio-panel"><span>{summary.bandwidth.activeProjects}</span><p>Active projects</p></article>
          <article className="studio-panel"><span>{summary.publishedPieces}</span><p>Published pieces</p></article>
          <article className="studio-panel"><span>{summary.publishedPosts}</span><p>Process notes</p></article>
          <article className="studio-panel"><span>{currentPanel === "media" ? mediaTotal : "Panel"}</span><p>{currentPanel === "media" ? "Indexed media" : currentPanel}</p></article>
          <article className="studio-panel"><span>{formatMoney(summary.monthlyRevenueCents)}</span><p>Revenue this month</p></article>
        </div>
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
            <Link className="studio-panel studio-workspace-card" href={panelHref("media")}><p className="eyebrow">Media</p><h3>Mounted NAS library</h3><p>Upload, review, crop, assign, and verify piece accuracy.</p></Link>
            <Link className="studio-panel studio-workspace-card" href={panelHref("projects")}><p className="eyebrow">Projects</p><h3>{summary.bandwidth.activeProjects} active</h3><p>Lead time, queue visibility, notes, and project stages.</p></Link>
            {aiStatus ? <article className="studio-panel"><p className="eyebrow">AI services</p><h3>{aiStatus.backgroundCleanup || aiStatus.embeddingSearch || aiStatus.mediaAnalysis || aiStatus.publicRendering ? "Mixed availability" : "Credential-free mode"}</h3><p className="muted-copy">Optional AI services remain honest and off by default unless their environment configuration is present.</p></article> : null}
          </div>
          <article className="studio-panel visitor-insights-panel">
            <div className="studio-editor-head">
              <div>
                <p className="eyebrow">Visitors</p>
                <h3>Recent access map</h3>
              </div>
              <p className="muted-copy">New visitor sessions queue an email when SMTP is configured. Country, city, and coordinates depend on Cloudflare location headers being enabled.</p>
            </div>
            <VisitorInsights
              countrySummary={visitorCountrySummary}
              recentVisitors={recentVisitors.map((visitor) => ({
                id: visitor.id,
                countryCode: visitor.countryCode,
                city: visitor.city,
                region: visitor.region,
                lastPath: visitor.lastPath,
                lastSeenAt: visitor.lastSeenAt,
                visitCount: visitor.visitCount
              }))}
            />
          </article>
        </PageSection>
      ) : null}

      {currentPanel === "settings" && settings ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Settings</p><h2>Brand and homepage</h2><p>Core contact information, global labels, and the featured pieces shown on the Workshop page.</p></div>
        <article className="studio-panel">
          <form action={saveSiteSettingsAction} className="request-form compact-form">
            <div className="field-grid two-up compact-grid"><Field label="Brand name" name="brandName" defaultValue={settings.brandName} /><Field label="Tagline" name="brandTagline" defaultValue={settings.brandTagline} /></div>
            <Area label="Site announcement" name="siteAnnouncement" defaultValue={settings.siteAnnouncement} rows={3} />
            <div className="field-grid three-up compact-grid"><Field label="Builder email" name="builderEmail" defaultValue={settings.builderEmail} /><Field label="Developer email" name="developerEmail" defaultValue={settings.developerEmail} /><Field label="Repository URL" name="repoUrl" defaultValue={settings.repoUrl} /></div>
            <Area label="Piece divider names" name="pieceDividerNames" defaultValue={settings.pieceDividerNames.join("\n")} rows={4} />
            <Area label="Homepage featured piece slugs (one per line, in display order)" name="homepageFeaturedPieceSlugs" defaultValue={settings.homepageFeaturedPieceSlugs.join("\n")} rows={4} />
            <p className="muted-copy">Public page wording now lives in the Pages workspace so saved edits correspond directly to the live routes they control.</p>
            <button className="button-primary" type="submit">Save settings</button>
          </form>
        </article>
      </PageSection>
      ) : null}

      {currentPanel === "pages" ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Pages</p><h2>Public pages</h2><p>Edit one page at a time so the workspace stays compact and the saved content maps directly to the live route.</p></div>
        <div className="studio-record-workspace">
          <StudioRecordNav
            eyebrow="Pages"
            items={[
              {
                key: "new-page-draft",
                label: "New page draft",
                meta: "Create a new public route",
                href: panelHref("pages", { page: "new-page-draft" }),
                active: selectedPageSlug === "new-page-draft"
              },
              ...pages.map((page) => ({
                key: page.slug,
                label: page.title,
                meta: `${page.status} · ${page.slug === "home" ? "/" : `/${page.slug}`}`,
                href: panelHref("pages", { page: page.slug }),
                active: page.slug === selectedPageSlug
              }))
            ]}
            title="Select a page"
          />
          <div className="studio-record-editor">
            {selectedPage ? <PageEditor highlight mediaLibrary={mediaLibrary} page={selectedPage} /> : null}
          </div>
        </div>
      </PageSection>
      ) : null}
      {currentPanel === "pieces" ? <PageSection><div className="section-heading"><p className="eyebrow">Pieces</p><h2>Portfolio and shop pieces</h2><p>Categories, availability, media assignments, shop asking price, and metadata.</p></div><div className="studio-grid two-column-grid"><PieceEditor mediaLibrary={mediaLibrary} piece={pieceDraft(currentAdmin.email)} />{pieces.map((piece) => <PieceEditor highlight={piece.slug === pieceHighlight} key={piece.slug} mediaLibrary={mediaLibrary} piece={piece} />)}</div></PageSection> : null}
      {currentPanel === "custom" ? <PageSection><div className="section-heading"><p className="eyebrow">Custom work</p><h2>Contact workflow types</h2><p>Material menus, estimator defaults, and active custom request categories.</p></div><div className="studio-grid two-column-grid"><CommissionTypeEditor item={commissionTypeDraft()} />{commissionTypes.map((item) => <CommissionTypeEditor key={item.slug} item={item} />)}</div></PageSection> : null}
      {currentPanel === "people" ? <PageSection><div className="section-heading"><p className="eyebrow">People</p><h2>Accounts and public profiles</h2><p>Rename profiles, replace contact emails, and remove accounts directly from the dashboard.</p></div><div className="studio-grid two-column-grid"><UserEditor currentAdminEmail={currentAdmin.email} user={userDraft()} />{users.map((user) => <UserEditor currentAdminEmail={currentAdmin.email} highlight={user.email.toLowerCase() === (userHighlight || email).toLowerCase()} key={user.email} user={user} />)}</div></PageSection> : null}
      {currentPanel === "process" ? <PageSection><div className="section-heading"><p className="eyebrow">Process</p><h2>Process notes and references</h2><p>Markdown body, cover images, external links, and publication state.</p></div><div className="studio-grid two-column-grid"><PostEditor mediaLibrary={mediaLibrary} post={postDraft(currentAdmin.email)} />{posts.map((post) => <PostEditor highlight={post.slug === postHighlight} key={post.slug} mediaLibrary={mediaLibrary} post={post} />)}</div></PageSection> : null}

      {currentPanel === "media" ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Media</p><h2>All media</h2><p>Upload, filter, rename, assign, tag, and adjust focal crop controls.</p></div>
        <div className="studio-grid two-column-grid studio-media-top-row">
          <article className="studio-panel">
            <h3>Browse and filter</h3>
            <StudioMediaFilter defaultQuery={mediaQuery} />
            {mediaTotal > STUDIO_MEDIA_PAGE_SIZE ? (
              <nav aria-label="Media pagination" className="studio-media-pagination">
                {mediaPage > 1 ? <Link className="button-secondary" href={panelHref("media", { ...(queryOpt ? { media: queryOpt } : {}), mediaPage: String(mediaPage - 1) })} scroll={false}>Previous page</Link> : <span className="muted-copy">Previous page</span>}
                <span className="muted-copy">Page {mediaPage} of {Math.ceil(mediaTotal / STUDIO_MEDIA_PAGE_SIZE)}</span>
                {mediaOffset + media.length < mediaTotal ? <Link className="button-secondary" href={panelHref("media", { ...(queryOpt ? { media: queryOpt } : {}), mediaPage: String(mediaPage + 1) })} scroll={false}>Next page</Link> : <span className="muted-copy">Next page</span>}
              </nav>
            ) : null}
          </article>
          <article className="studio-panel"><h3>Media status</h3>
            <p className="muted-copy">{mediaTotal} indexed total; showing {media.length === 0 ? 0 : mediaOffset + 1}–{mediaOffset + media.length} on this page. Synology <code>@eaDir</code> and <code>SYNOFILE_THUMB</code> paths are excluded from lists and scans.</p>
            <p className="muted-copy">Automatic clustering uses folder, filename, and date patterns locally. AI vision analysis and embedding similarity stay optional when configured. Manual assignments always take priority.</p>
            <dl className="estimate-list compact-estimate">
              <div><dt>AI background cleanup</dt><dd>{aiStatus?.backgroundCleanup ? `Enabled (${aiStatus.imageModel})` : "Not configured"}</dd></div>
              <div><dt>Embedding search</dt><dd>{aiStatus?.embeddingSearch ? `Enabled (${aiStatus.embeddingModel})` : "Not configured"}</dd></div>
              <div><dt>AI media analysis</dt><dd>{aiStatus?.mediaAnalysis ? `Enabled (${aiStatus.visionModel})` : "Not configured"}</dd></div>
              <div><dt>Photorealistic rendering</dt><dd>{aiStatus?.publicRendering ? `Enabled (${aiStatus.imageModel})` : "Not configured"}</dd></div>
            </dl>
            <p className="muted-copy">The workspace below edits in place without redirecting back to the top of the page. Use the thumbnail browser to keep position while assigning, renaming, cropping, or reviewing files.</p>
          </article>
        </div>
        <StudioMediaWorkspace
          assignAction={assignMediaCandidateAction}
          cleanupAction={cleanupMediaBackgroundAction}
          deleteAction={deleteMediaAction}
          initialItems={media}
          key={`${mediaPage}:${queryOpt ?? ""}:${media.length}:${media[0]?.relativePath ?? "empty"}`}
          pages={pages.map((page) => ({ slug: page.slug, title: page.title }))}
          pieces={pieces.map((piece) => ({ slug: piece.slug, title: piece.title }))}
          posts={posts.map((post) => ({ slug: post.slug, title: post.title }))}
          refreshAction={refreshMediaLibraryAction}
          renameAction={renameMediaAction}
          saveAction={saveMediaMetadataAction}
          uploadAction={uploadMediaAction}
          verificationQueue={verificationQueue.map((entry) => ({
            pieceSlug: entry.piece.slug,
            pieceTitle: entry.piece.title,
            needsReview: entry.needsReview,
            suggestions: entry.suggestions.map(({ item, score }) => ({ relativePath: item.relativePath, score }))
          }))}
        />
        {mediaTotal > STUDIO_MEDIA_PAGE_SIZE ? (
          <nav aria-label="Media pagination footer" className="studio-media-pagination studio-media-pagination-footer">
            {mediaPage > 1 ? <Link className="button-secondary" href={panelHref("media", { ...(queryOpt ? { media: queryOpt } : {}), mediaPage: String(mediaPage - 1) })} scroll={false}>Previous page</Link> : null}
            <span className="muted-copy">Page {mediaPage} of {Math.ceil(mediaTotal / STUDIO_MEDIA_PAGE_SIZE)}</span>
            {mediaOffset + media.length < mediaTotal ? <Link className="button-secondary" href={panelHref("media", { ...(queryOpt ? { media: queryOpt } : {}), mediaPage: String(mediaPage + 1) })} scroll={false}>Next page</Link> : null}
          </nav>
        ) : null}
      </PageSection>
      ) : null}

      {currentPanel === "projects" ? (
      <PageSection>
        <div className="section-heading"><p className="eyebrow">Projects</p><h2>Queue and status</h2><p>Project status, stage, notes, and timeline updates.</p></div>
        <div className="studio-grid two-column-grid">
          {projects.map((project) => (
            <article className={`studio-panel studio-editor-card${projectHighlight === project.reference ? " highlight-card" : ""}`} id={`project-${project.reference}`} key={project.reference}>
              <div className="studio-editor-head"><h3>{project.reference}</h3><span>{project.status} · {project.stage}</span></div>
              <div className="project-media-strip">
                {projectMedia.filter((item) => item.projectReference === project.reference).sort((left, right) => Number(left.metadata.displayOrder ?? 0) - Number(right.metadata.displayOrder ?? 0)).map((item) => (
                  <a href={toMediaUrl(item.relativePath)} key={item.relativePath}><img alt={item.altText || item.fileName} decoding="async" loading="lazy" src={toMediaUrl(item.relativePath)} /></a>
                ))}
              </div>
              <form action={saveProjectAction} className="request-form compact-form">
                <input name="reference" type="hidden" value={project.reference} />
                <div className="field-grid two-up compact-grid"><Field label="Status" name="status" defaultValue={project.status} /><Field label="Stage" name="stage" defaultValue={project.stage} /></div>
                <div className="field-grid three-up compact-grid"><Field label="Piece slug" name="pieceSlug" defaultValue={project.pieceSlug ?? ""} /><Field label="Type slug" name="commissionTypeSlug" defaultValue={project.commissionTypeSlug ?? ""} /><Field label="Lead time days" name="leadTimeDays" defaultValue={project.leadTimeDays ?? ""} type="number" /></div>
                <Area label="Public notes" name="publicNotes" defaultValue={project.publicNotes} rows={3} /><Area label="Internal notes" name="internalNotes" defaultValue={project.internalNotes} rows={3} /><Area label="Timeline update" name="timelineBody" rows={3} />
                <label><span>Visibility</span><select defaultValue="public" name="visibility"><option value="public">Public</option><option value="private">Private</option></select></label>
                <button className="button-primary" type="submit">Save project</button>
              </form>
            </article>
          ))}
        </div>
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
      {currentPanel === "notifications" ? <PageSection><div className="section-heading"><p className="eyebrow">Notifications</p><h2>Email queue</h2><p>Queued and sent notification records.</p></div><div className="studio-grid two-column-grid">{notifications.length > 0 ? notifications.map((notification) => <article className="studio-panel" key={notification.id}><p className="eyebrow">{notification.status}</p><h3>{notification.subject}</h3><p>{notification.recipient}</p><p className="muted-copy">Queued {formatDateTime(notification.createdAt)}</p>{notification.sentAt ? <p className="muted-copy">Sent {formatDateTime(notification.sentAt)}</p> : null}{notification.error ? <p className="notice-panel danger">{notification.error}</p> : null}<p className="muted-copy">{notification.body}</p></article>) : <article className="studio-panel"><p className="muted-copy">No notifications have been queued yet.</p></article>}</div></PageSection> : null}
    </Shell>
  );
}
