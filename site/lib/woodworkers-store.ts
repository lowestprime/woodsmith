import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const PRIMARY_WOODWORKER_ID = "primary";
export const PRIMARY_WOODWORKER_EMAIL = "woodsmithbb@proton.me";
export const RESOURCE_KINDS = [
  "piece",
  "post",
  "media",
  "project",
  "order",
  "review",
  "inquiry",
] as const;
export type OwnedResourceKind = (typeof RESOURCE_KINDS)[number];
export type Woodworker = {
  id: string;
  slug: string;
  business_name: string;
  bio: string;
  contact_email: string;
  avatar_path: string | null;
  active: number;
  public_profile: number;
  fee_basis_points: number;
  fee_policy: string;
  fee_version: number;
  accepted_fee_version: number | null;
  stripe_account_id: string | null;
  created_at: string;
  updated_at: string;
};
export type WorkerPrincipal = { email: string; role: string };
const resources = {
  piece: { table: "pieces", key: "slug" },
  post: { table: "posts", key: "slug" },
  project: { table: "projects", key: "reference" },
  order: { table: "orders", key: "order_number" },
  review: { table: "reviews", key: "id" },
  media: { table: "media_items", key: "relative_path" },
  inquiry: { table: "website_inquiries", key: "id" },
} as const;
const timestamp = () => new Date().toISOString();
const workerId = (email: string) =>
  `worker-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24)}`;
function tableExists(db: DatabaseSync, table: string) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table),
  );
}
function columns(db: DatabaseSync, table: string) {
  return new Set(
    (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((row) => row.name),
  );
}

export function installWoodworkerSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE woodworker_config (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))) STRICT;
    INSERT INTO woodworker_config VALUES(1,0);
    CREATE TABLE woodworkers (
      id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,business_name TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL,avatar_path TEXT,active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
      public_profile INTEGER NOT NULL DEFAULT 0 CHECK(public_profile IN (0,1)),
      fee_basis_points INTEGER NOT NULL DEFAULT 600 CHECK(fee_basis_points BETWEEN 0 AND 10000),
      fee_policy TEXT NOT NULL DEFAULT 'No listing fee. The completed-sale fee applies to goods after discounts, excluding shipping and tax. Payment processing costs pass through separately.',
      fee_version INTEGER NOT NULL DEFAULT 1,accepted_fee_version INTEGER,stripe_account_id TEXT UNIQUE,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE woodworker_memberships (
      user_email TEXT PRIMARY KEY REFERENCES users(email) ON UPDATE CASCADE ON DELETE CASCADE,
      woodworker_id TEXT NOT NULL REFERENCES woodworkers(id) ON DELETE RESTRICT
    ) STRICT;
    CREATE TABLE resource_ownership (
      kind TEXT NOT NULL CHECK(kind IN ('piece','post','media','project','order','review','inquiry')),
      resource_key TEXT NOT NULL,woodworker_id TEXT REFERENCES woodworkers(id) ON DELETE RESTRICT,
      conflict TEXT NOT NULL DEFAULT '',PRIMARY KEY(kind,resource_key),
      CHECK((woodworker_id IS NULL AND length(conflict)>0) OR (woodworker_id IS NOT NULL AND conflict=''))
    ) STRICT;
    CREATE INDEX resource_ownership_worker ON resource_ownership(woodworker_id,kind,resource_key);
    CREATE TABLE woodworker_fee_ledger (
      order_number TEXT PRIMARY KEY REFERENCES orders(order_number) ON DELETE RESTRICT,
      woodworker_id TEXT NOT NULL REFERENCES woodworkers(id) ON DELETE RESTRICT,
      fee_version INTEGER NOT NULL,basis_points INTEGER NOT NULL,goods_net_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,currency TEXT NOT NULL,created_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE woodworker_provider_snapshots (
      order_number TEXT NOT NULL REFERENCES orders(order_number) ON DELETE RESTRICT,
      provider TEXT NOT NULL CHECK(provider IN ('stripe','easypost')),
      woodworker_id TEXT NOT NULL REFERENCES woodworkers(id) ON DELETE RESTRICT,
      account_reference TEXT NOT NULL,from_address_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,
      PRIMARY KEY(order_number,provider)
    ) STRICT;
    CREATE TABLE woodworker_ownership_audit (
      id TEXT PRIMARY KEY,kind TEXT NOT NULL,resource_key TEXT NOT NULL,old_owner TEXT,new_owner TEXT,
      actor_email TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL
    ) STRICT;
  `);
  const now = timestamp();
  db.prepare(
    "INSERT INTO woodworkers(id,slug,business_name,contact_email,active,public_profile,fee_basis_points,accepted_fee_version,created_at,updated_at) VALUES('primary','william-beaman','Beaman Woodworks',?,1,1,0,1,?,?)",
  ).run(PRIMARY_WOODWORKER_EMAIL, now, now);
  const userColumns = columns(db, "users");
  const users = db.prepare("SELECT * FROM users").all() as Array<
    Record<string, unknown>
  >;
  const candidates = new Set<string>([PRIMARY_WOODWORKER_EMAIL]);
  for (const user of users)
    if (userColumns.has("role") && user.role === "woodworker")
      candidates.add(String(user.email).toLowerCase());
  if (columns(db, "pieces").has("owner_email"))
    for (const row of db
      .prepare(
        "SELECT DISTINCT owner_email FROM pieces WHERE owner_email IS NOT NULL AND owner_email<>''",
      )
      .all())
      candidates.add(String(row.owner_email).toLowerCase());
  for (const email of candidates) {
    const user = users.find(
      (user) => String(user.email).toLowerCase() === email,
    );
    if (
      !user ||
      (email !== PRIMARY_WOODWORKER_EMAIL && user.role !== "woodworker")
    )
      continue;
    const id =
      email === PRIMARY_WOODWORKER_EMAIL
        ? PRIMARY_WOODWORKER_ID
        : workerId(email);
    if (id !== PRIMARY_WOODWORKER_ID)
      db.prepare(
        "INSERT INTO woodworkers(id,slug,business_name,bio,contact_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id,
        id,
        String(user.display_name || "Woodworker"),
        String(user.bio || ""),
        email,
        now,
        now,
      );
    db.prepare("INSERT INTO woodworker_memberships VALUES(?,?)").run(
      String(user.email),
      id,
    );
  }
  const membership = (email: unknown) =>
    email
      ? (db
          .prepare(
            "SELECT woodworker_id FROM woodworker_memberships WHERE lower(user_email)=lower(?)",
          )
          .get(String(email))?.woodworker_id as string | undefined)
      : undefined;
  const bind = (
    kind: OwnedResourceKind,
    key: string,
    owner: string | null,
    conflict = "",
  ) =>
    db
      .prepare("INSERT INTO resource_ownership VALUES(?,?,?,?)")
      .run(kind, key, owner, conflict);
  const lookup = (kind: OwnedResourceKind, key: unknown) =>
    key ? resourceOwner(db, kind, String(key)) : undefined;
  let conflicts = 0;
  for (const [kind, definition] of Object.entries(resources) as Array<
    [OwnedResourceKind, (typeof resources)[OwnedResourceKind]]
  >) {
    if (!tableExists(db, definition.table)) continue;
    for (const row of db
      .prepare(`SELECT * FROM ${definition.table}`)
      .all() as Array<Record<string, unknown>>) {
      let owner: string | null = PRIMARY_WOODWORKER_ID,
        conflict = "";
      if (kind === "piece" && row.owner_email) {
        owner = membership(row.owner_email) ?? null;
        if (!owner)
          conflict =
            "Explicit piece owner has no matching business membership.";
      }
      if (kind === "post")
        owner = membership(row.author_email) ?? PRIMARY_WOODWORKER_ID;
      if (kind === "project") {
        const pieceOwner = lookup("piece", row.piece_slug),
          assignee = membership(row.assignee_email);
        if (pieceOwner && assignee && pieceOwner !== assignee) {
          owner = null;
          conflict = "Project piece and assignee have different businesses.";
        } else owner = pieceOwner ?? assignee ?? PRIMARY_WOODWORKER_ID;
      }
      if (kind === "order")
        owner =
          lookup("project", row.project_reference) ?? PRIMARY_WOODWORKER_ID;
      if (kind === "review")
        owner = lookup("piece", row.piece_slug) ?? PRIMARY_WOODWORKER_ID;
      if (kind === "media") {
        const related = new Set(
          [
            lookup("piece", row.piece_slug),
            lookup("post", row.post_slug),
            lookup("project", row.project_reference),
          ].filter(Boolean),
        );
        if (tableExists(db, "piece_media_links"))
          for (const link of db
            .prepare(
              "SELECT piece_slug FROM piece_media_links WHERE relative_path=?",
            )
            .all(String(row[definition.key]))) {
            const found = lookup("piece", link.piece_slug);
            if (found) related.add(found);
          }
        if (related.size > 1) {
          owner = null;
          conflict =
            "Media references multiple businesses; administrator resolution is required.";
        } else owner = related.values().next().value ?? PRIMARY_WOODWORKER_ID;
      }
      if (kind === "inquiry") {
        const inquiry = JSON.parse(String(row.inquiry_json || "{}")) as {
          piece?: { slug?: string };
          pieceSlug?: string;
        };
        owner =
          lookup("project", row.project_reference) ??
          lookup("piece", inquiry.piece?.slug ?? inquiry.pieceSlug) ??
          PRIMARY_WOODWORKER_ID;
      }
      if (conflict) conflicts++;
      bind(kind, String(row[definition.key]), owner, conflict);
    }
    const fields = columns(db, definition.table);
    const relatedOwner = (relationKind: OwnedResourceKind, field: string) =>
      fields.has(field)
        ? `(SELECT woodworker_id FROM resource_ownership WHERE kind='${relationKind}' AND resource_key=NEW.${field})`
        : "NULL";
    const memberOwner = (field: string) =>
      fields.has(field)
        ? `(SELECT woodworker_id FROM woodworker_memberships WHERE lower(user_email)=lower(NEW.${field}))`
        : "NULL";
    let newOwner = "'primary'";
    if (kind === "piece" && fields.has("owner_email"))
      newOwner = `CASE WHEN COALESCE(NEW.owner_email,'')='' THEN 'primary' ELSE ${memberOwner("owner_email")} END`;
    if (kind === "post")
      newOwner = `COALESCE(${memberOwner("author_email")},'primary')`;
    if (kind === "project")
      newOwner = `COALESCE(${relatedOwner("piece", "piece_slug")},${memberOwner("assignee_email")},'primary')`;
    if (kind === "order")
      newOwner = `COALESCE(${relatedOwner("project", "project_reference")},'primary')`;
    if (kind === "inquiry")
      newOwner = `COALESCE(${relatedOwner("project", "project_reference")},(SELECT woodworker_id FROM resource_ownership WHERE kind='piece' AND resource_key=json_extract(NEW.inquiry_json,'$.piece.slug')),'primary')`;
    if (kind === "review")
      newOwner = `COALESCE(${relatedOwner("piece", "piece_slug")},'primary')`;
    if (kind === "media")
      newOwner = `COALESCE((SELECT id FROM woodworkers WHERE NEW.relative_path LIKE 'workers/'||id||'/%'),${relatedOwner("project", "project_reference")},${relatedOwner("piece", "piece_slug")},${relatedOwner("post", "post_slug")},'primary')`;
    db.exec(`CREATE TRIGGER owner_${definition.table}_insert AFTER INSERT ON ${definition.table} BEGIN INSERT INTO resource_ownership(kind,resource_key,woodworker_id,conflict) VALUES('${kind}',NEW.${definition.key},${newOwner},CASE WHEN (${newOwner}) IS NULL THEN 'The explicit owner needs a business membership.' ELSE '' END); END;
      CREATE TRIGGER owner_${definition.table}_delete AFTER DELETE ON ${definition.table} BEGIN DELETE FROM resource_ownership WHERE kind='${kind}' AND resource_key=OLD.${definition.key}; END;
      CREATE TRIGGER owner_${definition.table}_rename AFTER UPDATE OF ${definition.key} ON ${definition.table} BEGIN UPDATE resource_ownership SET resource_key=NEW.${definition.key} WHERE kind='${kind}' AND resource_key=OLD.${definition.key}; END;`);
  }
  return {
    primaryBusiness: PRIMARY_WOODWORKER_ID,
    multiWorkerEnabled: false,
    knownUserCount: users.length,
    businessCount: db.prepare("SELECT count(*) AS n FROM woodworkers").get()?.n,
    ownershipConflicts: conflicts,
  };
}

export function multiWorkerEnabled(db: DatabaseSync) {
  return (
    db.prepare("SELECT enabled FROM woodworker_config WHERE id=1").get()
      ?.enabled === 1
  );
}
export function resourceOwner(
  db: DatabaseSync,
  kind: OwnedResourceKind,
  key: string,
) {
  return (
    (db
      .prepare(
        "SELECT woodworker_id FROM resource_ownership WHERE kind=? AND resource_key=?",
      )
      .get(kind, key)?.woodworker_id as string | null | undefined) ?? null
  );
}
export function workerForPrincipal(
  db: DatabaseSync,
  principal: WorkerPrincipal,
) {
  if (principal.role !== "woodworker" || !multiWorkerEnabled(db)) return null;
  return (
    (db
      .prepare(
        "SELECT w.* FROM woodworkers w JOIN woodworker_memberships m ON m.woodworker_id=w.id JOIN users u ON u.email=m.user_email WHERE lower(m.user_email)=lower(?) AND u.role='woodworker' AND w.active=1",
      )
      .get(principal.email) as Woodworker | undefined) ?? null
  );
}
export function assertWorkerAccess(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  kind: OwnedResourceKind,
  key: string,
) {
  const worker = workerForPrincipal(db, principal);
  if (
    !worker ||
    resourceOwner(db, kind, key) !== worker.id ||
    !resourceRelationshipsMatch(db, kind, key)
  )
    throw new Error("This record is not available to this woodworker.");
  if (
    kind === "inquiry" &&
    columns(db, "website_inquiries").has("disposition") &&
    db.prepare("SELECT disposition FROM website_inquiries WHERE id=?").get(key)
      ?.disposition !== "legitimate"
  )
    throw new Error("This record is not available to this woodworker.");
  const resource = resources[kind];
  if (
    !db
      .prepare(`SELECT 1 FROM ${resource.table} WHERE ${resource.key}=?`)
      .get(key)
  )
    throw new Error("Record not found.");
  return worker;
}
export function assertWorkerRelations(
  db: DatabaseSync,
  workerId: string,
  relations: Array<{ kind: OwnedResourceKind; key: string | null | undefined }>,
) {
  for (const relation of relations)
    if (
      relation.key &&
      resourceOwner(db, relation.kind, relation.key) !== workerId
    )
      throw new Error("Related records must belong to the same woodworker.");
}
export function assignResourceOwner(
  db: DatabaseSync,
  input: {
    kind: OwnedResourceKind;
    key: string;
    ownerId: string;
    actorEmail: string;
    reason: string;
  },
) {
  if (!input.reason.trim()) throw new Error("Record the ownership decision.");
  if (!db.prepare("SELECT 1 FROM woodworkers WHERE id=?").get(input.ownerId))
    throw new Error("Business not found.");
  const definition = resources[input.kind];
  if (
    !db
      .prepare(`SELECT 1 FROM ${definition.table} WHERE ${definition.key}=?`)
      .get(input.key)
  )
    throw new Error("Record not found.");
  const previous = resourceOwner(db, input.kind, input.key);
  db.prepare(
    "INSERT INTO resource_ownership(kind,resource_key,woodworker_id,conflict) VALUES(?,?,?,'') ON CONFLICT(kind,resource_key) DO UPDATE SET woodworker_id=excluded.woodworker_id,conflict=''",
  ).run(input.kind, input.key, input.ownerId);
  db.prepare(
    "INSERT INTO woodworker_ownership_audit VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    input.kind,
    input.key,
    previous,
    input.ownerId,
    input.actorEmail,
    input.reason.trim(),
    timestamp(),
  );
}
export function singleOrderOwner(
  db: DatabaseSync,
  pieceSlugs: readonly string[],
) {
  if (!pieceSlugs.length) throw new Error("Order has no pieces.");
  const owners = new Set(
    pieceSlugs.map((slug) => resourceOwner(db, "piece", slug)),
  );
  if (owners.has(null) || owners.size !== 1)
    throw new Error("Please order from one woodworker at a time.");
  return [...owners][0]!;
}
export function snapshotWorkerFee(
  db: DatabaseSync,
  orderNumber: string,
  ownerId: string,
  goodsNetCents: number,
  currency: string,
) {
  const worker = db
    .prepare("SELECT * FROM woodworkers WHERE id=?")
    .get(ownerId) as Woodworker | undefined;
  if (
    !worker ||
    !worker.active ||
    worker.accepted_fee_version !== worker.fee_version
  )
    throw new Error(
      "The woodworker must accept the current fee policy before checkout.",
    );
  if (!Number.isSafeInteger(goodsNetCents) || goodsNetCents < 0)
    throw new Error("Invalid fee basis.");
  const fee = Number(
    (BigInt(goodsNetCents) * BigInt(worker.fee_basis_points) + 5000n) / 10000n,
  );
  if (!Number.isSafeInteger(fee))
    throw new Error("Fee exceeds supported integer precision.");
  db.prepare("INSERT INTO woodworker_fee_ledger VALUES(?,?,?,?,?,?,?,?)").run(
    orderNumber,
    ownerId,
    worker.fee_version,
    worker.fee_basis_points,
    goodsNetCents,
    fee,
    currency.toLowerCase(),
    timestamp(),
  );
  return fee;
}

function requirePlatformAdmin(principal: WorkerPrincipal) {
  if (principal.role !== "admin")
    throw new Error("Administrator access required.");
}
export function setMultiWorkerMode(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  enabled: boolean,
) {
  requirePlatformAdmin(principal);
  if (
    enabled &&
    db
      .prepare(
        "SELECT 1 FROM resource_ownership WHERE woodworker_id IS NULL LIMIT 1",
      )
      .get()
  )
    throw new Error(
      "Resolve recorded ownership conflicts before enabling multiple woodworkers.",
    );
  if(enabled && listOwnershipConflicts(db).length)throw new Error("Resolve inconsistent ownership relationships before enabling multiple woodworkers.");
  db.prepare("UPDATE woodworker_config SET enabled=? WHERE id=1").run(
    Number(enabled),
  );
}
export function provisionWorkerBusiness(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  email: string,
  businessName: string,
) {
  requirePlatformAdmin(principal);
  const user = db
    .prepare("SELECT email,role FROM users WHERE lower(email)=lower(?)")
    .get(email.trim()) as { email: string; role: string } | undefined;
  if (!user || user.role !== "woodworker")
    throw new Error("Choose an existing woodworker account.");
  if (!businessName.trim() || businessName.length > 120)
    throw new Error("Enter a business name of at most 120 characters.");
  const existing = db
    .prepare(
      "SELECT woodworker_id FROM woodworker_memberships WHERE user_email=?",
    )
    .get(user.email);
  if (existing) return String(existing.woodworker_id);
  const id = workerId(user.email),
    now = timestamp();
  db.prepare(
    "INSERT INTO woodworkers(id,slug,business_name,contact_email,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(id, id, businessName.trim(), user.email, now, now);
  db.prepare("INSERT INTO woodworker_memberships VALUES(?,?)").run(
    user.email,
    id,
  );
  return id;
}
export function activateWorkerBusiness(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  id: string,
  active: boolean,
) {
  requirePlatformAdmin(principal);
  if (id === PRIMARY_WOODWORKER_ID && !active)
    throw new Error("The primary business cannot be disabled.");
  if (
    !db
      .prepare("UPDATE woodworkers SET active=?,updated_at=? WHERE id=?")
      .run(Number(active), timestamp(), id).changes
  )
    throw new Error("Business not found.");
}
export function saveWorkerBusinessProfile(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  input: {
    id: string;
    businessName: string;
    bio: string;
    publicProfile: boolean;
    slug: string;
    avatarPath: string | null;
  },
) {
  const worker =
    principal.role === "admin"
      ? (db.prepare("SELECT * FROM woodworkers WHERE id=?").get(input.id) as
          | Woodworker
          | undefined)
      : workerForPrincipal(db, principal);
  if (!worker || worker.id !== input.id)
    throw new Error("Business not available.");
  if (
    !input.businessName.trim() ||
    input.businessName.length > 120 ||
    input.bio.length > 6000 ||
    !/^([a-z0-9]+-)*[a-z0-9]+$/.test(input.slug) ||
    input.slug.length > 80
  )
    throw new Error("Check the business name, biography and URL slug.");
  assertWorkerRelations(db, worker.id, [
    { kind: "media", key: input.avatarPath },
  ]);
  if (["admin", "api", "studio", "new", "edit"].includes(input.slug))
    throw new Error("Choose another business URL slug.");
  if (input.avatarPath) {
    const media = db
      .prepare(
        "SELECT reviewed,project_reference FROM media_items WHERE relative_path=?",
      )
      .get(input.avatarPath);
    if (
      !media ||
      media.project_reference ||
      (input.publicProfile && media.reviewed !== 1)
    )
      throw new Error(
        "A public business photograph must be verified and cannot be a project attachment.",
      );
  }
  db.prepare(
    "UPDATE woodworkers SET business_name=?,bio=?,public_profile=?,slug=?,avatar_path=?,updated_at=? WHERE id=?",
  ).run(
    input.businessName.trim(),
    input.bio.trim(),
    Number(input.publicProfile),
    input.slug,
    input.avatarPath,
    timestamp(),
    worker.id,
  );
}
export function updateWorkerFeePolicy(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  id: string,
  basisPoints: number,
  policy: string,
) {
  requirePlatformAdmin(principal);
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000 ||
    !policy.trim() ||
    policy.length > 3000
  )
    throw new Error("Enter a valid fee percentage and policy.");
  if(id===PRIMARY_WOODWORKER_ID&&basisPoints!==0)throw new Error("The primary business cannot pay an application fee to itself.");
  const current = db
    .prepare("SELECT fee_basis_points,fee_policy FROM woodworkers WHERE id=?")
    .get(id);
  if (!current) throw new Error("Business not found.");
  if (
    current.fee_basis_points === basisPoints &&
    current.fee_policy === policy.trim()
  )
    return;
  db.prepare(
    "UPDATE woodworkers SET fee_basis_points=?,fee_policy=?,fee_version=fee_version+1,accepted_fee_version=CASE WHEN id='primary' THEN fee_version+1 ELSE NULL END,updated_at=? WHERE id=?",
  ).run(basisPoints, policy.trim(), timestamp(), id);
}
export function acceptWorkerFeePolicy(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  version: number,
) {
  const worker = workerForPrincipal(db, principal);
  if (!worker || worker.fee_version !== version)
    throw new Error("Reload the current fee policy before accepting.");
  db.prepare(
    "UPDATE woodworkers SET accepted_fee_version=fee_version,updated_at=? WHERE id=?",
  ).run(timestamp(), worker.id);
}
export function ownedResourceKeys(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  kind: OwnedResourceKind,
  search = "",
  page = 1,
) {
  const worker = workerForPrincipal(db, principal);
  if (!worker) throw new Error("Active woodworker access required.");
  const limit = 50,
    offset = (Math.max(1, Math.min(10000, Math.trunc(page) || 1)) - 1) * limit;
  const condition =
    kind === "inquiry" && columns(db, "website_inquiries").has("disposition")
      ? " AND resource_key IN (SELECT id FROM website_inquiries WHERE disposition='legitimate')"
      : "";
  return (
    db
      .prepare(
        `SELECT resource_key FROM resource_ownership WHERE woodworker_id=? AND kind=? AND instr(lower(resource_key),lower(?))>0 ${condition} ORDER BY resource_key LIMIT ? OFFSET ?`,
      )
      .all(worker.id, kind, search.slice(0, 200), limit, offset) as Array<{
      resource_key: string;
    }>
  ).map((row) => row.resource_key);
}

export function publicWorkerResourceAvailable(
  db: DatabaseSync,
  kind: OwnedResourceKind,
  key: string,
) {
  const owner = resourceOwner(db, kind, key);
  if (!resourceRelationshipsMatch(db, kind, key)) return false;
  if (owner === PRIMARY_WOODWORKER_ID) return true;
  if (!owner || !multiWorkerEnabled(db)) return false;
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM woodworkers WHERE id=? AND active=1 AND public_profile=1",
      )
      .get(owner),
  );
}

export function prepareOrderBusiness(db: DatabaseSync, orderNumber: string) {
  const lines = db
    .prepare("SELECT piece_slug FROM order_line_items WHERE order_number=?")
    .all(orderNumber) as Array<{ piece_slug: string }>;
  const owner = singleOrderOwner(
    db,
    lines.map((line) => line.piece_slug),
  );
  const order = db
    .prepare("SELECT * FROM orders WHERE order_number=?")
    .get(orderNumber) as Record<string, unknown> | undefined;
  if (!order) throw new Error("Order not found.");
  assertWorkerRelations(db, owner, [
    {
      kind: "project",
      key: order.project_reference ? String(order.project_reference) : null,
    },
  ]);
  if (owner !== PRIMARY_WOODWORKER_ID && !multiWorkerEnabled(db))
    throw new Error("This woodworker is not currently accepting checkout.");
  const existing = db
    .prepare("SELECT * FROM woodworker_fee_ledger WHERE order_number=?")
    .get(orderNumber);
  if (existing) {
    if (
      existing.woodworker_id !== owner ||
      existing.goods_net_cents !==
        Number(order.subtotal_cents) - Number(order.discount_cents) ||
      existing.currency !== String(order.currency).toLowerCase()
    )
      throw new Error(
        "The saved seller or fee basis no longer matches this order.",
      );
    return { ownerId: owner, feeCents: Number(existing.platform_fee_cents) };
  }
  assignResourceOwner(db, {
    kind: "order",
    key: orderNumber,
    ownerId: owner,
    actorEmail: "system:verified-order-items",
    reason: "All verified item snapshots identify this business.",
  });
  const feeCents = snapshotWorkerFee(
    db,
    orderNumber,
    owner,
    Number(order.subtotal_cents) - Number(order.discount_cents),
    String(order.currency),
  );
  return { ownerId: owner, feeCents };
}

export function workerMediaPublic(db: DatabaseSync, relativePath: string) {
  if (!publicWorkerResourceAvailable(db, "media", relativePath)) return false;
  const owner = resourceOwner(db, "media", relativePath);
  const media = db
    .prepare(
      "SELECT reviewed,project_reference FROM media_items WHERE relative_path=?",
    )
    .get(relativePath);
  if (!media || media.reviewed !== 1 || media.project_reference) return false;
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM piece_media_links l JOIN pieces p ON p.slug=l.piece_slug
    JOIN resource_ownership ro ON ro.kind='piece' AND ro.resource_key=p.slug
    WHERE l.relative_path=? AND l.is_public=1 AND l.role<>'private-project' AND p.publication_status='published' AND ro.woodworker_id=?
    UNION ALL SELECT 1 FROM posts p JOIN resource_ownership ro ON ro.kind='post' AND ro.resource_key=p.slug
    WHERE p.cover_media_path=? AND p.publication_status='published' AND ro.woodworker_id=?
    UNION ALL SELECT 1 FROM woodworkers WHERE avatar_path=? AND id=? AND active=1 AND public_profile=1 LIMIT 1`,
      )
      .get(relativePath, owner, relativePath, owner, relativePath, owner),
  );
}

export type PublicWoodworker = Pick<
  Woodworker,
  "id" | "slug" | "business_name" | "bio" | "avatar_path" | "updated_at"
>;
export function publicWoodworkers(db: DatabaseSync): PublicWoodworker[] {
  if (!multiWorkerEnabled(db)) return [];
  return (
    db
      .prepare(
        "SELECT id,slug,business_name,bio,avatar_path,updated_at FROM woodworkers WHERE active=1 AND public_profile=1 ORDER BY business_name,id",
      )
      .all() as PublicWoodworker[]
  ).map((worker) => ({
    ...worker,
    avatar_path:
      worker.avatar_path && workerMediaPublic(db, worker.avatar_path)
        ? worker.avatar_path
        : null,
  }));
}
export function publicResourceWoodworker(
  db: DatabaseSync,
  kind: "piece" | "post",
  key: string,
) {
  if (!multiWorkerEnabled(db)) return null;
  const owner = resourceOwner(db, kind, key);
  return publicWoodworkers(db).find((worker) => worker.id === owner) ?? null;
}

// These relationships concern business ownership only; user_email is always a customer identity.
export function resourceRelations(
  db: DatabaseSync,
  kind: OwnedResourceKind,
  key: string,
) {
  const related: Array<{ kind: OwnedResourceKind; key: string }> = [];
  const add = (kind: OwnedResourceKind, key: unknown) => {
    if (typeof key === "string" && key) related.push({ kind, key });
  };
  const definition = resources[kind],
    row = db
      .prepare(`SELECT * FROM ${definition.table} WHERE ${definition.key}=?`)
      .get(key);
  if (!row) return related;
  for (const [field, target] of [
    ["piece_slug", "piece"],
    ["post_slug", "post"],
    ["project_reference", "project"],
    ["cover_media_path", "media"],
  ] as const)
    if (!(kind === target && row[field] === key)) add(target, row[field]);
  if (kind === "inquiry") {
    const inquiry = JSON.parse(String(row.inquiry_json || "{}")) as {
      piece?: { slug?: string };
      pieceSlug?: string;
    };
    add("piece", inquiry.piece?.slug ?? inquiry.pieceSlug);
  }
  if (tableExists(db, "piece_media_links")) {
    if (kind === "media")
      for (const link of db
        .prepare(
          "SELECT piece_slug FROM piece_media_links WHERE relative_path=?",
        )
        .all(key))
        add("piece", link.piece_slug);
    if (kind === "piece")
      for (const link of db
        .prepare(
          "SELECT relative_path FROM piece_media_links WHERE piece_slug=?",
        )
        .all(key))
        add("media", link.relative_path);
  }
  if (kind === "order" && tableExists(db, "order_line_items"))
    for (const line of db
      .prepare("SELECT piece_slug FROM order_line_items WHERE order_number=?")
      .all(key))
      add("piece", line.piece_slug);
  return related;
}
export function resourceRelationshipsMatch(
  db: DatabaseSync,
  kind: OwnedResourceKind,
  key: string,
) {
  const owner = resourceOwner(db, kind, key);
  if(kind==='project'&&columns(db,'projects').has('assignee_email')){
    const assignee=db.prepare('SELECT m.woodworker_id FROM projects p JOIN woodworker_memberships m ON lower(m.user_email)=lower(p.assignee_email) WHERE p.reference=?').get(key);
    if(assignee&&assignee.woodworker_id!==owner)return false;
  }
  return Boolean(
    owner &&
      resourceRelations(db, kind, key).every(
        (relation) => resourceOwner(db, relation.kind, relation.key) === owner ||
          (relation.kind==='media'&&!db.prepare('SELECT 1 FROM media_items WHERE relative_path=?').get(relation.key)),
      ),
  );
}
export function resolveResourceOwnership(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  input: {
    kind: OwnedResourceKind;
    key: string;
    ownerId: string;
    reason: string;
  },
) {
  requirePlatformAdmin(principal);
  if (
    !RESOURCE_KINDS.includes(input.kind) ||
    !input.key ||
    input.key.length > 2048 ||
    input.reason.trim().length < 10 ||
    input.reason.length > 2000
  )
    throw new Error(
      "Identify the record and explain the verified ownership decision.",
    );
  assertWorkerRelations(
    db,
    input.ownerId,
    resourceRelations(db, input.kind, input.key),
  );
  // Also protect incoming references. A transfer must not split an existing relationship graph.
  for (const [otherKind, definition] of Object.entries(resources) as Array<
    [OwnedResourceKind, (typeof resources)[OwnedResourceKind]]
  >) {
    if (!tableExists(db, definition.table)) continue;
    for (const row of db
      .prepare(
        `SELECT ${definition.key} AS resource_key FROM ${definition.table}`,
      )
      .all()) {
      const key = String(row.resource_key);
      if (otherKind === input.kind && key === input.key) continue;
      if (
        resourceRelations(db, otherKind, key).some(
          (relation) =>
            relation.kind === input.kind && relation.key === input.key,
        ) &&
        resourceOwner(db, otherKind, key) !== input.ownerId
      )
        throw new Error(
          "Related records belong to another business or remain unresolved. Correct their relationships in Studio before this ownership decision.",
        );
    }
  }
  if (input.kind === "order") {
    const fee = db
      .prepare(
        "SELECT woodworker_id FROM woodworker_fee_ledger WHERE order_number=?",
      )
      .get(input.key);
    if (fee && fee.woodworker_id !== input.ownerId)
      throw new Error("A sale snapshot prevents reassignment of this order.");
  }
  assignResourceOwner(db, { ...input, actorEmail: principal.email });
}

export function setWorkerStripeAccount(
  db: DatabaseSync,
  principal: WorkerPrincipal,
  id: string,
  accountId: string,
) {
  requirePlatformAdmin(principal);
  if (id === PRIMARY_WOODWORKER_ID)
    throw new Error("The primary business uses the platform Stripe account.");
  if (accountId && !/^acct_[a-zA-Z0-9]+$/.test(accountId))
    throw new Error("Enter a verified connected account ID.");
  if (
    !db
      .prepare(
        "UPDATE woodworkers SET stripe_account_id=?,updated_at=? WHERE id=?",
      )
      .run(accountId || null, timestamp(), id).changes
  )
    throw new Error("Business not found.");
}

export function listOwnershipConflicts(db:DatabaseSync){
 return (db.prepare('SELECT kind,resource_key,conflict FROM resource_ownership ORDER BY kind,resource_key').all() as Array<{kind:OwnedResourceKind;resource_key:string;conflict:string}>)
  .filter(row=>row.conflict||!resourceRelationshipsMatch(db,row.kind,row.resource_key))
  .map(row=>({...row,conflict:row.conflict||'Related records have inconsistent business ownership.'}));
}
