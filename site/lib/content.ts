export type PieceStatus = "inventory" | "commission" | "archive";

export type Piece = {
  slug: string;
  name: string;
  category: string;
  status: PieceStatus;
  yearLabel: string;
  summary: string;
  story: string;
  availabilityLabel: string;
  leadTime: string;
  images: string[];
  notes: string[];
};

export type JournalPost = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  readTime: string;
  body: string;
};

const media = (folder: string, file: string) => `${folder}/${file}`;

export const pieceNames = [
  "Dining Room Table",
  "End Table",
  "Scientists Desk",
  "Footstool",
  "Spice Rack",
  "Pantry Cabinets",
  "Pastry Table",
  "Hallway Bench"
];

export const pieces: Piece[] = [
  {
    slug: "hallway-bench",
    name: "Hallway Bench",
    category: "Seating",
    status: "commission",
    yearLabel: "Archive study",
    summary: "A low entry bench with a long horizon line, sculpted feet, and enough restraint to let the room breathe.",
    story: "This bench sits close to the floor and keeps the joinery visible without turning the whole piece into a demonstration. It sets the tone for the rest of the site: useful, calm, and exacting.",
    availabilityLabel: "Commission from this pattern",
    leadTime: "8 to 12 weeks depending on wood choice and finish schedule",
    images: [
      media("Furniture", "DSC_0051.JPG"),
      media("Furniture", "DSC_0052.JPG"),
      media("Furniture", "DSC_0053.JPG")
    ],
    notes: [
      "Best suited to entry halls, reading rooms, and window walls.",
      "Scaled to custom lengths without losing the stance of the original.",
      "Offered as a commission rather than a standing inventory item."
    ]
  },
  {
    slug: "end-table",
    name: "End Table",
    category: "Occasional furniture",
    status: "inventory",
    yearLabel: "Available to reserve",
    summary: "Compact enough for a lamp or a stack of books, with a quiet top profile and an architectural base.",
    story: "This table works as a bedside piece, an end table, or a compact perch for tea. It reads modern at first glance and older the longer you sit with it.",
    availabilityLabel: "Reserve current piece",
    leadTime: "Ready to discuss now; delivery timing confirmed after inquiry",
    images: [
      media("Furniture", "IMG_20200628_153839.jpg"),
      media("Furniture", "IMG_20200628_153747.jpg"),
      media("Furniture", "IMG_20200621_172630.jpg")
    ],
    notes: [
      "A good fit for smaller city apartments and narrow rooms.",
      "Can be translated into a pair or scaled into a side table set.",
      "Reservations stay inquiry-based so final shipping and finish details stay accurate."
    ]
  },
  {
    slug: "scientists-desk",
    name: "Scientists Desk",
    category: "Writing furniture",
    status: "commission",
    yearLabel: "Commission pattern",
    summary: "A disciplined writing desk with a single drawer, upright stance, and enough surface for notebooks, instruments, and a laptop.",
    story: "The language here is spare and practical: one drawer, a clean top, and legs that hold the piece upright without trying to disappear. It is the kind of desk that rewards regular use.",
    availabilityLabel: "Build to order",
    leadTime: "10 to 14 weeks with room-specific adjustments",
    images: [
      media("Furniture", "IMG_20210520_144323.jpg"),
      media("Furniture", "IMG_20210520_144209.jpg"),
      media("Furniture", "IMG_20210520_144200.jpg")
    ],
    notes: [
      "Can be adapted for writing, drafting, or compact laboratory-style work.",
      "Drawer hardware and cable management are decided during the commission brief.",
      "Often requested with a matching stool or companion side table."
    ]
  },
  {
    slug: "pantry-cabinets",
    name: "Pantry Cabinets",
    category: "Cabinetry",
    status: "commission",
    yearLabel: "Cabinetry commission",
    summary: "Wall and base cabinets designed to hold daily kitchen work without looking fussy.",
    story: "Cabinet interiors matter as much as the fronts. The aim here is durable storage, calm proportions, and doors that feel settled in their openings.",
    availabilityLabel: "Cabinet project intake open",
    leadTime: "Project-based scheduling after site measurements",
    images: [
      media("Cabinets", "PXL_20240624_021031088.jpg"),
      media("Cabinets", "PXL_20240624_021024485.jpg"),
      media("Cabinets", "PXL_20240624_021020003.jpg")
    ],
    notes: [
      "Designed around the room first, not around stock cabinet boxes.",
      "Best handled through the commission workflow so measurements and appliance clearances are captured early.",
      "Well suited to pantry walls, alcoves, and compact kitchens that need honest storage."
    ]
  },
  {
    slug: "pastry-table",
    name: "Pastry Table",
    category: "Work table",
    status: "inventory",
    yearLabel: "Available to reserve",
    summary: "A stone-topped pastry table with direct bracing, open shelf space, and the right amount of weight.",
    story: "The stone does the heavy lifting visually, while the base stays lean and square. It is a practical work surface, but it still feels composed when it is left empty.",
    availabilityLabel: "Reserve or request a variation",
    leadTime: "Current piece available; custom versions quoted separately",
    images: [
      media("Furniture", "PXL_20250302_223145008.jpg"),
      media("Furniture", "PXL_20250302_223155446.jpg"),
      media("Furniture", "PXL_20250222_201547090.jpg")
    ],
    notes: [
      "Excellent for bakers, cooks, and anyone who wants a dedicated prep surface.",
      "Stone selection can be revisited for commissioned versions.",
      "Shipping and placement are discussed after the reservation comes in."
    ]
  },
  {
    slug: "footstool",
    name: "Footstool",
    category: "Small furniture",
    status: "inventory",
    yearLabel: "Recent studio piece",
    summary: "A small stool or low perch with shaped sides, useful enough to live anywhere and distinct enough to stand alone.",
    story: "The form leans compact and architectural rather than rustic. It works as a footstool, an extra seat, or a low stand for plants and books.",
    availabilityLabel: "Reserve recent build",
    leadTime: "Current build under review; final delivery window shared after inquiry",
    images: [
      media("Furniture", "PXL_20260321_195141872.jpg"),
      media("Furniture", "PXL_20260319_000709864.jpg"),
      media("Furniture", "PXL_20260319_000724223.jpg")
    ],
    notes: [
      "Small enough to move from room to room without losing presence.",
      "Ideal as an entry perch, a bedside step, or a studio stool.",
      "Also available as a commission if you want a different height or timber."
    ]
  },
  {
    slug: "serving-tray",
    name: "Serving Tray",
    category: "Objects",
    status: "inventory",
    yearLabel: "Small-batch work",
    summary: "A restrained tray with a forged pull and soft edges, made for daily handling rather than display only.",
    story: "Not every object has to dominate a room. This tray is the smaller end of the studio language: tactile, durable, and meant to be picked up often.",
    availabilityLabel: "Small-batch inquiry",
    leadTime: "Made in small runs between larger commissions",
    images: [
      media("Furniture", "IMG_20210420_175507.jpg"),
      media("Furniture", "IMG_20210420_175450.jpg"),
      media("Furniture", "IMG_20210420_175427.jpg")
    ],
    notes: [
      "Useful as a breakfast tray, writing-table catchall, or coffee-table object.",
      "A good entry point if you want a smaller piece before commissioning furniture.",
      "Handle hardware and dimensions can be adjusted in future batches."
    ]
  }
];

export const journalPosts: JournalPost[] = [
  {
    slug: "joinery-before-hardware",
    title: "Joinery Before Hardware",
    date: "2026-03-18",
    readTime: "4 min read",
    excerpt: "A room usually remembers the proportion and the stance of a piece long before it remembers the knob.",
    body: `The first decision is almost never the hardware. It is the stance of the piece in the room: the height of the top, the weight of the apron, the amount of light passing under it, the line the eye catches when you enter.

Once that is right, pulls, hinges, and catches become quieter decisions. They still matter, but they stop trying to rescue a weak form. A strong woodworking commission should feel resolved with the hardware removed.

That is the filter I use when I revise a bench, a desk, or a cabinet front. If the silhouette does not feel calm and inevitable, I keep working before I ever shop for a fitting.`
  },
  {
    slug: "why-cabinet-interiors-matter",
    title: "Why Cabinet Interiors Matter",
    date: "2026-03-12",
    readTime: "5 min read",
    excerpt: "A good cabinet is opened more often than it is admired from across the room. The inside deserves the same attention as the face frame.",
    body: `Cabinetry gets judged from the exterior because that is what photographs best. Daily use happens on the inside: shelves that actually clear the jars you own, doors that move cleanly, partitions that do not waste awkward corners, and finishes that tolerate repetition.

When a pantry or kitchen project begins, I want to know how the room is really used. What gets reached for every day? What needs to disappear? What should remain visible? The answers shape the cabinet more than any decorative gesture.

That is why the commission brief asks about habits before it asks about style. Utility is not the enemy of elegance. It is usually the thing that makes elegance believable.`
  },
  {
    slug: "small-furniture-holds-a-room",
    title: "Small Furniture Holds a Room",
    date: "2026-03-04",
    readTime: "3 min read",
    excerpt: "A footstool or a side table often sets the emotional scale of a room more effectively than the largest piece in it.",
    body: `Large furniture defines function. Small furniture defines rhythm. A low stool, a side table, or a tray is what gets moved, touched, and noticed at the edge of everyday life.

That makes small pieces a good place to be exact. Their proportions are exposed, and any hesitation in the design shows immediately. When they are right, they make the entire room feel more deliberate without demanding attention.

Some of my favorite builds are the quiet ones: the piece that lives beside a chair, under a window, or next to the bed and simply keeps earning its place.`
  }
];

export const studioValues = [
  "Minimal forms that still feel handmade up close.",
  "Quiet rooms over loud furniture statements.",
  "Commission workflows that begin with use, proportion, and placement.",
  "Self-hosted tools so portfolio, journal, and buyer communication stay under your control."
];

export const commissionOptions = [
  "Dining Room Table",
  "End Table",
  "Scientists Desk",
  "Footstool",
  "Spice Rack",
  "Pantry Cabinets",
  "Pastry Table",
  "Hallway Bench",
  "Other Custom Work"
];

export function getPiece(slug: string) {
  return pieces.find((piece) => piece.slug === slug);
}

export function getPost(slug: string) {
  return journalPosts.find((post) => post.slug === slug);
}
