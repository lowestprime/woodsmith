export type SeedPage = {
  slug: string;
  title: string;
  navLabel: string;
  status: "published" | "draft";
  intro: string;
  body: string;
  layout: string;
  sections: Array<Record<string, unknown>>;
  heroMediaPath?: string;
};

export type SeedPiece = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  status: "inventory" | "commission" | "archive";
  publicationStatus: "published" | "draft";
  availabilityLabel: string;
  summary: string;
  story: string;
  details: string[];
  tags: string[];
  materials: string[];
  dimensions: { width: number; depth: number; height: number; unit: "in" } | null;
  priceCents: number | null;
  inventoryCount: number;
  leadTimeDays: number;
  mediaPaths: string[];
  featuredRank: number;
  metadata: Record<string, unknown>;
};

export type SeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  publicationStatus: "published" | "draft";
  publishedAt: string;
  authorEmail: string;
  coverMediaPath?: string;
  tags: string[];
  sourceUrl?: string;
  sourceLabel?: string;
};

export type SeedCommissionType = {
  slug: string;
  label: string;
  description: string;
  baseLaborHours: number;
  baseMarkupPercent: number;
  materialOptions: string[];
  defaultDimensions: { width: number; depth: number; height: number; unit: "in" };
  active: boolean;
};

export type SeedProfile = {
  email: string;
  displayName: string;
  role: "admin" | "woodworker" | "customer";
  headline: string;
  bio: string;
  publicProfile: boolean;
  avatarPath?: string;
  links: Array<{ label: string; url: string }>;
  metadata: Record<string, unknown>;
};

export const pieceDividerNames = [
  "Dining Room Table",
  "End Table",
  "Scientists Desk",
  "Footstool",
  "Spice Rack",
  "Pantry Cabinets",
  "Pastry Table",
  "Hallway Bench"
];

export const siteSettingsSeed = {
  brandName: "Beaman Woodworks",
  brandTagline: "Custom furniture, cabinetry, and small-batch pieces built in wood.",
  supportEmail: "woodsmithbb@proton.me",
  builderEmail: "woodsmithbb@proton.me",
  builderName: "William Beaman",
  builderHeadline: "Master Builder",
  developerName: "Cooper Beaman",
  developerEmail: "lowestprime@proton.me",
  developerHeadline: "Website Developer",
  notificationForwardEmail: "wbeaman1@gmail.com",
  repoUrl: "https://x.gd/woodsmith_git",
  socialLinks: [
    { label: "Instagram", url: "" },
    { label: "Pinterest", url: "" },
    { label: "GitHub", url: "https://x.gd/woodsmith_git" }
  ],
  navigation: [
    { label: "Workshop", href: "/" },
    { label: "Portfolio", href: "/portfolio" },
    { label: "Shop", href: "/shop" },
    { label: "Journal", href: "/journal" },
    { label: "Commissions", href: "/commissions" },
    { label: "About", href: "/about" },
    { label: "Search", href: "/search" }
  ],
  homepageFeaturedMode: "manual",
  homepageFeaturedPieceSlugs: ["hallway-bench", "pastry-table", "pantry-cabinets", "footstool"],
  siteAnnouncement: "Studio calendar open for furniture, cabinetry, and room-specific commissions.",
  themeDefault: "dark",
  cartCurrency: "usd",
  cartTaxMode: "local",
  localTaxRate: 0.0825,
  shippingBaseCents: 9500,
  shippingPerItemCents: 2200,
  couponCodes: [
    { code: "STUDIO10", label: "Studio introduction", percentOff: 10, active: true }
  ],
  checkout: {
    provider: "stripe",
    automaticTax: true,
    collectShippingAddress: true,
    allowPromotionCodes: true,
    successPath: "/account/projects",
    cancelPath: "/shop"
  },
  marketplace: {
    readyForMultipleWoodworkers: true,
    revenueModelTitle: "Built for independent woodworkers",
    revenueModelBody: "Default platform settings preserve direct ownership of the work. The seeded model assumes no listing fee, a 6% completed-sale platform fee, and pass-through payment processor costs. Every rate is editable in the studio settings so the platform can stay fair as additional woodworkers join."
  },
  email: {
    fromName: "Beaman Woodworks",
    fromAddress: "woodsmithbb@proton.me",
    replyTo: "woodsmithbb@proton.me",
    forwardTo: "wbeaman1@gmail.com"
  },
  homeSections: [
    {
      key: "hero",
      eyebrow: "Beaman Woodworks",
      title: "Furniture, cabinetry, and custom commissions built to fit real rooms and daily use.",
      copy: "The site combines portfolio, journal, shop, and project tracking so buyers can review finished work, reserve available pieces, and follow a commission from first measurements through delivery.",
      primaryCta: { label: "View Portfolio", href: "/portfolio" },
      secondaryCta: { label: "Start a Commission", href: "/commissions" }
    },
    {
      key: "services",
      eyebrow: "What the studio builds",
      title: "Casework, work tables, seating, small furniture, and room-specific commissions.",
      copy: "Every project starts with use, dimensions, and material choices. The public pages remain concise; the studio dashboard and buyer account pages carry the details needed to keep work moving."
    },
    {
      key: "bandwidth",
      eyebrow: "Current bandwidth",
      title: "Lead time updates stay tied to the live project queue.",
      copy: "The availability bar and lead-time estimate update from active projects, projected bench hours, and open inventory so buyers see the current workload before they submit a brief."
    }
  ]
} as const;

const furniture = (file: string) => `Furniture/${file}`;
const cabinets = (file: string) => `Cabinets/${file}`;

export const seedPieces: SeedPiece[] = [
  {
    slug: "hallway-bench",
    title: "Hallway Bench",
    subtitle: "Entry bench with exposed joinery and a low stance",
    category: "Seating",
    status: "commission",
    publicationStatus: "published",
    availabilityLabel: "Commission from this pattern",
    summary: "A low entry bench built with a long horizon line, visible joinery, and proportions that keep the piece useful without crowding the room.",
    story: "The bench was developed as an entry piece that reads clearly from across the room and remains comfortable when used every day for shoes, bags, and short waits by the door.",
    details: [
      "Scaled to suit narrow halls, mud rooms, and window walls.",
      "Joinery remains visible rather than hidden under trim.",
      "Available as a starting pattern for custom sizing and timber selection."
    ],
    tags: ["bench", "entry", "seating", "white oak", "commission"],
    materials: ["Solid hardwood", "Natural oil finish"],
    dimensions: { width: 60, depth: 15, height: 18, unit: "in" },
    priceCents: null,
    inventoryCount: 0,
    leadTimeDays: 84,
    mediaPaths: [furniture("DSC_0051.JPG"), furniture("DSC_0052.JPG"), furniture("DSC_0053.JPG")],
    featuredRank: 1,
    metadata: { verifiedMedia: true }
  },
  {
    slug: "end-table",
    title: "End Table",
    subtitle: "Compact occasional table for bedside or reading chair placement",
    category: "Occasional furniture",
    status: "inventory",
    publicationStatus: "published",
    availabilityLabel: "Reserve current piece",
    summary: "A compact table with a broad top, a quiet apron line, and enough surface for a lamp, books, or a cup beside a chair.",
    story: "The table was built as a versatile room piece that can work at bedside, beside a sofa, or as part of a pair. The proportions stay direct and the silhouette avoids excess weight.",
    details: [
      "Suitable for single-piece purchase or mirrored pairs.",
      "Can be resized into a side table set.",
      "Current inventory includes finish confirmation before delivery."
    ],
    tags: ["table", "end table", "inventory"],
    materials: ["Hardwood", "Hand-rubbed finish"],
    dimensions: { width: 22, depth: 22, height: 24, unit: "in" },
    priceCents: 82500,
    inventoryCount: 1,
    leadTimeDays: 21,
    mediaPaths: [furniture("IMG_20200628_153839.jpg"), furniture("IMG_20200628_153747.jpg"), furniture("IMG_20200621_172630.jpg")],
    featuredRank: 2,
    metadata: { verifiedMedia: true }
  },
  {
    slug: "scientists-desk",
    title: "Scientists Desk",
    subtitle: "Writing desk with black phenolic resin top and maple base",
    category: "Writing furniture",
    status: "commission",
    publicationStatus: "published",
    availabilityLabel: "Commission build",
    summary: "A writing desk designed around a black phenolic resin top, bird's-eye maple rails, and white maple legs.",
    story: "The design prioritizes a durable work surface, a bright maple base, and a straightforward profile suited to writing, instruments, and compact task work.",
    details: [
      "Archival media is still being verified before additional photos are published.",
      "Dimensions, cable handling, and drawer options are set during the commission review.",
      "The public listing remains available so buyers can reference the build while media review is in progress."
    ],
    tags: ["desk", "writing desk", "phenolic", "maple", "commission"],
    materials: ["Black phenolic resin top", "Bird's-eye maple rails", "White maple legs"],
    dimensions: { width: 48, depth: 24, height: 30, unit: "in" },
    priceCents: null,
    inventoryCount: 0,
    leadTimeDays: 98,
    mediaPaths: [],
    featuredRank: 6,
    metadata: { verifiedMedia: false, mediaReviewRequired: true }
  },
  {
    slug: "pantry-cabinets",
    title: "Pantry Cabinets",
    subtitle: "Built-in pantry storage sized to room conditions",
    category: "Cabinetry",
    status: "commission",
    publicationStatus: "published",
    availabilityLabel: "Cabinet project intake open",
    summary: "Wall and base cabinets designed around real storage habits, appliance clearances, and the dimensions of the room.",
    story: "The pantry project focuses on durable storage and calm proportions. Interior use drives the layout first, then door fronts, hardware, and finish decisions follow from the plan.",
    details: [
      "Measured and quoted per room.",
      "Drawers, shelves, pull-outs, and appliance clearances are captured before fabrication.",
      "Best suited to pantry walls, alcoves, and compact kitchens needing durable storage."
    ],
    tags: ["cabinetry", "pantry", "commission"],
    materials: ["Custom cabinet-grade hardwood", "Room-specific finish schedule"],
    dimensions: null,
    priceCents: null,
    inventoryCount: 0,
    leadTimeDays: 112,
    mediaPaths: [cabinets("PXL_20240624_021031088.jpg"), cabinets("PXL_20240624_021024485.jpg"), cabinets("PXL_20240624_021020003.jpg"), cabinets("PXL_20240624_020957542.jpg")],
    featuredRank: 3,
    metadata: { verifiedMedia: true }
  },
  {
    slug: "pastry-table",
    title: "Pastry Table",
    subtitle: "Stone-topped prep table with open shelf storage",
    category: "Work table",
    status: "inventory",
    publicationStatus: "published",
    availabilityLabel: "Reserve or request a variation",
    summary: "A pastry table built around a stone top, direct bracing, and open shelf space for daily kitchen prep.",
    story: "The table keeps the base lean so the stone remains the visual anchor. It works as a dedicated prep surface and still reads cleanly when left empty.",
    details: [
      "The current table is available for reservation.",
      "Commissioned versions can adjust height, stone, or shelf layout.",
      "Shipping and placement are reviewed before final payment."
    ],
    tags: ["pastry table", "kitchen", "inventory", "stone top"],
    materials: ["Stone top", "Hardwood base"],
    dimensions: { width: 48, depth: 26, height: 34, unit: "in" },
    priceCents: 285000,
    inventoryCount: 1,
    leadTimeDays: 28,
    mediaPaths: [furniture("PXL_20250302_223145008.jpg"), furniture("PXL_20250302_223155446.jpg"), furniture("PXL_20250222_201547090.jpg")],
    featuredRank: 4,
    metadata: { verifiedMedia: true }
  },
  {
    slug: "footstool",
    title: "Footstool",
    subtitle: "Low stool for extra seating, bedside use, or an entry perch",
    category: "Small furniture",
    status: "inventory",
    publicationStatus: "published",
    availabilityLabel: "Reserve recent build",
    summary: "A compact stool with shaped sides and enough structure to work as a footrest, spare seat, or low stand.",
    story: "The stool is sized to move from room to room without losing presence. It keeps the footprint modest while remaining strong enough for daily use.",
    details: [
      "Useful as a footrest, short seat, or bedside step.",
      "Current build available while stock lasts.",
      "Custom heights and timber substitutions are available on request."
    ],
    tags: ["footstool", "small furniture", "inventory"],
    materials: ["Solid hardwood", "Oil and wax finish"],
    dimensions: { width: 19, depth: 12, height: 10, unit: "in" },
    priceCents: 42000,
    inventoryCount: 1,
    leadTimeDays: 14,
    mediaPaths: [furniture("PXL_20260321_195141872.jpg"), furniture("PXL_20260319_000709864.jpg"), furniture("PXL_20260319_000724223.jpg")],
    featuredRank: 5,
    metadata: { verifiedMedia: true }
  },
  {
    slug: "serving-tray",
    title: "Serving Tray",
    subtitle: "Small-batch tray for daily handling",
    category: "Objects",
    status: "inventory",
    publicationStatus: "published",
    availabilityLabel: "Small-batch inquiry",
    summary: "A serving tray with soft edges and durable finish work, suited to daily table use rather than display only.",
    story: "Smaller objects help buyers see the studio's handling and finish decisions up close. The tray offers a lower-cost point of entry without treating the object as secondary.",
    details: [
      "Produced in small runs between larger commissions.",
      "Good fit for breakfast service, desk storage, or table presentation.",
      "Handle details and dimensions can be revised between runs."
    ],
    tags: ["tray", "object", "inventory"],
    materials: ["Hardwood", "Food-safe finish"],
    dimensions: { width: 18, depth: 12, height: 2, unit: "in" },
    priceCents: 21500,
    inventoryCount: 3,
    leadTimeDays: 10,
    mediaPaths: [furniture("IMG_20210420_175507.jpg"), furniture("IMG_20210420_175450.jpg"), furniture("IMG_20210420_175427.jpg")],
    featuredRank: 7,
    metadata: { verifiedMedia: true }
  }
];

export const seedCommissionTypes: SeedCommissionType[] = [
  {
    slug: "dining-room-table",
    label: "Dining Room Table",
    description: "Room-sized tables planned around seating count, circulation, and finish wear.",
    baseLaborHours: 72,
    baseMarkupPercent: 22,
    materialOptions: ["White Oak", "Black Walnut", "Cherry", "Hard Maple"],
    defaultDimensions: { width: 84, depth: 40, height: 30, unit: "in" },
    active: true
  },
  {
    slug: "end-table",
    label: "End Table",
    description: "Compact tables for bedside, sofa, and reading-chair placement.",
    baseLaborHours: 24,
    baseMarkupPercent: 18,
    materialOptions: ["White Oak", "Walnut", "Cherry", "Maple"],
    defaultDimensions: { width: 22, depth: 22, height: 24, unit: "in" },
    active: true
  },
  {
    slug: "scientists-desk",
    label: "Scientists Desk",
    description: "Writing desk based on the phenolic-top maple build in the archive.",
    baseLaborHours: 48,
    baseMarkupPercent: 22,
    materialOptions: ["Bird's-eye maple", "White maple", "Phenolic resin top"],
    defaultDimensions: { width: 48, depth: 24, height: 30, unit: "in" },
    active: true
  },
  {
    slug: "footstool",
    label: "Footstool",
    description: "Low seating and utility stools with custom height options.",
    baseLaborHours: 12,
    baseMarkupPercent: 16,
    materialOptions: ["White Oak", "Walnut", "Maple"],
    defaultDimensions: { width: 19, depth: 12, height: 10, unit: "in" },
    active: true
  },
  {
    slug: "spice-rack",
    label: "Spice Rack",
    description: "Wall-mounted or counter spice storage with adjustable shelf spacing.",
    baseLaborHours: 10,
    baseMarkupPercent: 16,
    materialOptions: ["Maple", "Cherry", "White Oak"],
    defaultDimensions: { width: 20, depth: 4, height: 18, unit: "in" },
    active: true
  },
  {
    slug: "pantry-cabinets",
    label: "Pantry Cabinets",
    description: "Built-in pantry storage sized to room conditions and appliance clearances.",
    baseLaborHours: 140,
    baseMarkupPercent: 24,
    materialOptions: ["Paint-grade hardwood", "White Oak", "Maple"],
    defaultDimensions: { width: 96, depth: 24, height: 90, unit: "in" },
    active: true
  },
  {
    slug: "pastry-table",
    label: "Pastry Table",
    description: "Prep tables with stone or hardwood tops and open shelf storage.",
    baseLaborHours: 44,
    baseMarkupPercent: 21,
    materialOptions: ["Stone top", "White Oak", "Walnut"],
    defaultDimensions: { width: 48, depth: 26, height: 34, unit: "in" },
    active: true
  },
  {
    slug: "hallway-bench",
    label: "Hallway Bench",
    description: "Entry benches sized to walls, windows, and everyday use.",
    baseLaborHours: 28,
    baseMarkupPercent: 18,
    materialOptions: ["White Oak", "Walnut", "Ash"],
    defaultDimensions: { width: 60, depth: 15, height: 18, unit: "in" },
    active: true
  },
  {
    slug: "other-custom-work",
    label: "Other Custom Work",
    description: "Use the visualizer and brief form for custom work outside the listed templates.",
    baseLaborHours: 36,
    baseMarkupPercent: 20,
    materialOptions: ["White Oak", "Walnut", "Cherry", "Maple"],
    defaultDimensions: { width: 48, depth: 20, height: 30, unit: "in" },
    active: true
  }
];

export const seedPosts: SeedPost[] = [
  {
    slug: "joinery-before-hardware",
    title: "Joinery Before Hardware",
    excerpt: "Proportion and structure settle the piece long before hardware is chosen.",
    body: `A strong piece does not wait for hardware to rescue it. The proportion, the stance, and the way light moves around the edges should already feel resolved before a knob or pull is considered.\n\nThat approach matters in both furniture and cabinetry. Drawer pulls, catches, and hinges still matter, but they should clarify the build rather than hide a weak form.\n\nWhen a table, bench, or cabinet face holds together without relying on decoration, the final details become easier to choose and easier to live with.`,
    publicationStatus: "published",
    publishedAt: "2026-03-18T08:00:00.000Z",
    authorEmail: "woodsmithbb@proton.me",
    coverMediaPath: furniture("DSC_0052.JPG"),
    tags: ["joinery", "design", "cabinetry"]
  },
  {
    slug: "why-cabinet-interiors-matter",
    title: "Why Cabinet Interiors Matter",
    excerpt: "Good cabinetry is judged every time a shelf is used, not only when the doors are closed.",
    body: `Cabinet fronts draw the first photograph, but the inside of the casework determines whether the project succeeds in daily use. Shelf spacing, door swing, pull-out access, and the way jars or trays are actually stored matter more than a decorative gesture.\n\nThat is why cabinetry commissions in the studio begin with habits and measurements. The plan starts with what needs to be stored, what needs to stay visible, and what needs to clear nearby appliances.\n\nOnce the inside works cleanly, the exterior can remain quiet and durable.`,
    publicationStatus: "published",
    publishedAt: "2026-03-12T08:00:00.000Z",
    authorEmail: "woodsmithbb@proton.me",
    coverMediaPath: cabinets("PXL_20240624_021024485.jpg"),
    tags: ["cabinetry", "pantry", "storage"]
  },
  {
    slug: "small-furniture-holds-a-room",
    title: "Small Furniture Holds a Room",
    excerpt: "Compact pieces often carry the rhythm of a room more clearly than the largest item in it.",
    body: `Large furniture defines function. Smaller pieces often define the rhythm of the room. A stool, side table, or tray is handled more often, moved more often, and seen at the edge of everyday activity.\n\nThat makes scale and finish decisions more exposed. When a compact piece is right, it quietly improves the entire room without demanding attention.\n\nSome of the studio's most durable ideas begin in these smaller builds, where proportions and handling can be judged without distraction.`,
    publicationStatus: "published",
    publishedAt: "2026-03-04T08:00:00.000Z",
    authorEmail: "woodsmithbb@proton.me",
    coverMediaPath: furniture("PXL_20260321_195141872.jpg"),
    tags: ["small furniture", "stools", "process"]
  },
  {
    slug: "nakashima-the-soul-of-a-tree",
    title: "George Nakashima, The Soul of a Tree",
    excerpt: "A reference worth revisiting for anyone interested in the relationship between timber, making, and long-term use.",
    body: `This external highlight points readers to George Nakashima's *The Soul of a Tree*, a foundational book for woodworkers thinking about material, form, and stewardship over time. The book remains useful because it keeps the conversation on timber itself rather than style alone.`,
    publicationStatus: "published",
    publishedAt: "2026-03-20T08:00:00.000Z",
    authorEmail: "lowestprime@proton.me",
    coverMediaPath: furniture("IMG_20210420_175450.jpg"),
    tags: ["highlight", "books", "woodworking"],
    sourceUrl: "https://www.goodreads.com/book/show/241360.The_Soul_of_a_Tree",
    sourceLabel: "Highlights from the Web"
  }
];

export const seedPages: SeedPage[] = [
  {
    slug: "home",
    title: "The Workshop",
    navLabel: "Workshop",
    status: "published",
    intro: "Portfolio, available work, project tracking, and commission planning in one place.",
    body: "The home page combines featured pieces, current studio bandwidth, and buyer pathways for shop orders or custom work.",
    layout: "editorial-oled",
    heroMediaPath: furniture("DSC_0051.JPG"),
    sections: []
  },
  {
    slug: "portfolio",
    title: "Portfolio",
    navLabel: "Portfolio",
    status: "published",
    intro: "Past pieces and current build patterns.",
    body: "Each piece page pairs verified media, material details, and the right next step: reserve the current build or use the piece as the basis for a commission.",
    layout: "gallery",
    sections: []
  },
  {
    slug: "shop",
    title: "The Piece Ledger",
    navLabel: "Shop",
    status: "published",
    intro: "Available work with cart, checkout, shipping, and invoice support.",
    body: "Inventory counts, prices, coupon handling, and order status are managed in the studio dashboard and reflected live on the public shop page.",
    layout: "ledger",
    sections: []
  },
  {
    slug: "journal",
    title: "Shop Talk",
    navLabel: "Journal",
    status: "published",
    intro: "Process notes, material observations, and curated links worth keeping close to the bench.",
    body: "Posts can be written directly in the studio with markdown preview, inline images, and optional external source links for the web highlights section.",
    layout: "journal",
    sections: []
  },
  {
    slug: "commissions",
    title: "Commission Flow & Visualizer",
    navLabel: "Commissions",
    status: "published",
    intro: "Configure a custom build, see a to-scale preview, and submit a commission brief with budget and schedule details.",
    body: "The commission page combines the visualizer, cost estimator, material selection, buyer uploads, and project intake form in one workflow.",
    layout: "visualizer",
    sections: []
  },
  {
    slug: "about",
    title: "About & Contact",
    navLabel: "About",
    status: "published",
    intro: "Master builder and developer profiles, contact routes, and the studio story.",
    body: "This page introduces William Beaman and Cooper Beaman, provides business contact information, and surfaces social links plus the public project repository.",
    layout: "profiles",
    sections: []
  },
  {
    slug: "care-and-warranty",
    title: "Care & Warranty",
    navLabel: "Care & Warranty",
    status: "published",
    intro: "Care guidance for hardwood furniture and cabinetry.",
    body: "Wipe surfaces with a soft damp cloth, avoid prolonged standing water, and keep pieces away from direct heat vents. Finish refresh and structural repair support are coordinated through the studio dashboard or the contact page.",
    layout: "document",
    sections: []
  }
];

export const seedProfiles: SeedProfile[] = [
  {
    email: "woodsmithbb@proton.me",
    displayName: "William Beaman",
    role: "admin",
    headline: "Master Builder",
    bio: "William Beaman builds furniture, cabinetry, and commissioned room pieces with an emphasis on durable joinery, measured proportions, and practical daily use. The public site reflects current work, available inventory, and the active commission queue from his bench.",
    publicProfile: true,
    avatarPath: "profiles/william-beaman.svg",
    links: [],
    metadata: { showOnAboutPage: true, woodworker: true }
  },
  {
    email: "lowestprime@proton.me",
    displayName: "Cooper Beaman",
    role: "admin",
    headline: "Website Developer",
    bio: "Cooper Beaman designed and built the Beaman Woodworks platform so the portfolio, journal, media archive, shop, project tracking, and studio operations can all be managed directly from the same self-hosted system.",
    publicProfile: true,
    avatarPath: "profiles/cooper-beaman.svg",
    links: [
      { label: "Email", url: "mailto:lowestprime@proton.me" },
      { label: "GitHub", url: "https://x.gd/woodsmith_git" }
    ],
    metadata: { showOnAboutPage: true, developer: true }
  }
];
