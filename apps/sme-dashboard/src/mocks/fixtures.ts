import type {
  DemoDB,
  InventoryItem,
  SalesOrder,
  StockMovement,
  WholesaleProduct,
  PurchaseOrder,
} from "@/models/types";

const P = (p: WholesaleProduct) => p;

export const products: WholesaleProduct[] = [
  P({
    id: "p1",
    sku: "EK-COF-ARA-AA",
    name: "Arabica Coffee AA (Bugisu)",
    category: "coffee",
    cropType: "cash",
    grade: "AA",
    packaging: "60 kg jute bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 60,
    pricePerPackage: 1020000,
    moq: 2,
    availablePackages: 120,
    supplier: "Agro-Warehouse Mbale",
    etaDays: 3,
    marketPricePerUnit: 21000,
  }),
  P({
    id: "p2",
    sku: "EK-COF-ROB-FAQ",
    name: "Robusta Coffee FAQ",
    category: "coffee",
    cropType: "cash",
    grade: "FAQ",
    packaging: "60 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 60,
    pricePerPackage: 540000,
    moq: 2,
    availablePackages: 300,
    supplier: "Agro-Warehouse Masaka",
    etaDays: 2,
    marketPricePerUnit: 11500,
  }),
  P({
    id: "p3",
    sku: "EK-COF-RST-500",
    name: "E-Katale Roasted Coffee 500 g",
    category: "coffee",
    cropType: "cash",
    grade: "Premium",
    packaging: "Carton of 20 × 500 g packs",
    packageUnit: "carton",
    stockUnit: "pack",
    unitsPerPackage: 20,
    pricePerPackage: 380000,
    moq: 1,
    availablePackages: 80,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 1,
    marketPricePerUnit: 25000,
  }),
  P({
    id: "p4",
    sku: "EK-MAI-GRN-G1",
    name: "Maize Grain Grade 1",
    category: "maize",
    cropType: "cash",
    grade: "Grade 1",
    packaging: "100 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 100,
    pricePerPackage: 120000,
    moq: 5,
    availablePackages: 500,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 1,
    marketPricePerUnit: 1700,
  }),
  P({
    id: "p5",
    sku: "EK-MAI-FLR-25",
    name: "Maize Flour (Posho) Super",
    category: "maize",
    cropType: "cash",
    grade: "Grade A",
    packaging: "25 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 25,
    pricePerPackage: 65000,
    moq: 4,
    availablePackages: 260,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 1,
    marketPricePerUnit: 3600,
  }),
  P({
    id: "p6",
    sku: "EK-COC-FRM-64",
    name: "Cocoa Beans (Fermented)",
    category: "cocoa",
    cropType: "cash",
    grade: "Grade 1",
    packaging: "64 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 64,
    pricePerPackage: 832000,
    moq: 1,
    availablePackages: 40,
    supplier: "Agro-Warehouse Bundibugyo",
    etaDays: 4,
    marketPricePerUnit: 15500,
  }),
  P({
    id: "p7",
    sku: "EK-CNT-FRS-50",
    name: "Fresh Coconuts",
    category: "coconut",
    cropType: "cash",
    grade: "Grade A",
    packaging: "Sack of 50 nuts",
    packageUnit: "sack",
    stockUnit: "nut",
    unitsPerPackage: 50,
    pricePerPackage: 75000,
    moq: 2,
    availablePackages: 60,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 2,
    marketPricePerUnit: 2500,
  }),
  P({
    id: "p8",
    sku: "EK-BNS-NAM-50",
    name: "Nambale Beans",
    category: "beans",
    cropType: "food",
    grade: "Grade A",
    packaging: "50 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 50,
    pricePerPackage: 210000,
    moq: 2,
    availablePackages: 150,
    supplier: "Agro-Warehouse Masaka",
    etaDays: 2,
    marketPricePerUnit: 5300,
  }),
  P({
    id: "p9",
    sku: "EK-MTK-BNC-01",
    name: "Matooke (Green Bananas)",
    category: "bananas",
    cropType: "food",
    grade: "Large",
    packaging: "Bunch, approx. 20 kg",
    packageUnit: "bunch",
    stockUnit: "bunch",
    unitsPerPackage: 1,
    pricePerPackage: 28000,
    moq: 10,
    availablePackages: 200,
    supplier: "Agro-Warehouse Mbarara",
    etaDays: 2,
    marketPricePerUnit: 38000,
  }),
  P({
    id: "p10",
    sku: "EK-RCE-KAI-25",
    name: "Kaiso Rice",
    category: "rice",
    cropType: "food",
    grade: "Grade A",
    packaging: "25 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 25,
    pricePerPackage: 112500,
    moq: 4,
    availablePackages: 0,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 2,
    marketPricePerUnit: 5600,
  }),
  P({
    id: "p11",
    sku: "EK-GNT-RED-50",
    name: "Red Groundnuts",
    category: "groundnuts",
    cropType: "food",
    grade: "Grade A",
    packaging: "50 kg bag",
    packageUnit: "bag",
    stockUnit: "kg",
    unitsPerPackage: 50,
    pricePerPackage: 260000,
    moq: 2,
    availablePackages: 70,
    supplier: "Agro-Warehouse Lira",
    etaDays: 3,
    marketPricePerUnit: 6800,
  }),
  P({
    id: "p12",
    sku: "EK-TOM-CRT-25",
    name: "Tomatoes",
    category: "vegetables",
    cropType: "food",
    grade: "Grade A",
    packaging: "Crate, approx. 25 kg",
    packageUnit: "crate",
    stockUnit: "kg",
    unitsPerPackage: 25,
    pricePerPackage: 55000,
    moq: 4,
    availablePackages: 90,
    supplier: "Agro-Warehouse Kampala",
    etaDays: 1,
    marketPricePerUnit: 3000,
  }),
];

const customers = [
  ["Sarah Namubiru", "+256 772 418 903"],
  ["Joseph Okello", "+256 701 556 210"],
  ["Grace Achieng", "+256 783 904 117"],
  ["Brian Ssemwanga", "+256 759 230 448"],
  ["Esther Nakato", "+256 774 661 052"],
  ["Ivan Mugisha", "+256 706 118 790"],
];

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

export function createSeed(now = new Date()): DemoDB {
  const t = (daysAgo: number, hour = 10) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(hour - 3, 15, 0, 0); // EAT = UTC+3
    return d.toISOString();
  };

  const inventory: InventoryItem[] = [
    {
      id: "i1",
      productId: "p5",
      name: "Maize Flour (Posho) Super",
      location: "Dry goods store",
      category: "maize",
      cropType: "cash",
      stockUnit: "kg",
      onHand: 180,
      reserved: 0,
      lowStockThreshold: 100,
      avgUnitCost: 2600,
    },
    {
      id: "i2",
      productId: "p8",
      name: "Nambale Beans",
      location: "Dry goods store",
      category: "beans",
      cropType: "food",
      stockUnit: "kg",
      onHand: 60,
      reserved: 0,
      lowStockThreshold: 100,
      avgUnitCost: 4200,
    },
    {
      id: "i3",
      productId: "p3",
      name: "E-Katale Roasted Coffee 500 g",
      location: "Shop floor",
      category: "coffee",
      cropType: "cash",
      stockUnit: "pack",
      onHand: 30,
      reserved: 0,
      lowStockThreshold: 20,
      avgUnitCost: 19000,
    },
    {
      id: "i4",
      productId: "p9",
      name: "Matooke (Green Bananas)",
      location: "Fresh produce area",
      category: "bananas",
      cropType: "food",
      stockUnit: "bunch",
      onHand: 25,
      reserved: 0,
      lowStockThreshold: 15,
      avgUnitCost: 28000,
    },
    {
      id: "i5",
      productId: "p12",
      name: "Tomatoes",
      location: "Fresh produce area",
      category: "vegetables",
      cropType: "food",
      stockUnit: "kg",
      onHand: 40,
      reserved: 0,
      lowStockThreshold: 50,
      avgUnitCost: 2200,
    },
    {
      id: "i6",
      productId: "p11",
      name: "Red Groundnuts",
      location: "Dry goods store",
      category: "groundnuts",
      cropType: "food",
      stockUnit: "kg",
      onHand: 120,
      reserved: 0,
      lowStockThreshold: 50,
      avgUnitCost: 5200,
    },
  ];

  const listings = [
    {
      id: "L1",
      inventoryItemId: "i1",
      title: "Posho (Maize Flour) — per kg",
      description: "Fine super-grade maize flour, packed fresh in Ntinda.",
      retailPrice: 3500,
      status: "live" as const,
    },
    {
      id: "L2",
      inventoryItemId: "i2",
      title: "Nambale Beans — per kg",
      description: "Clean, sorted Nambale beans. Cooks fast.",
      retailPrice: 5200,
      status: "live" as const,
    },
    {
      id: "L3",
      inventoryItemId: "i3",
      title: "Roasted Coffee 500 g pack",
      description: "Medium roast Ugandan coffee, ground.",
      retailPrice: 24000,
      status: "live" as const,
    },
    {
      id: "L4",
      inventoryItemId: "i4",
      title: "Matooke bunch (large)",
      description: "Fresh green matooke from Mbarara.",
      retailPrice: 38000,
      status: "live" as const,
    },
    {
      id: "L5",
      inventoryItemId: "i5",
      title: "Fresh Tomatoes — per kg",
      description: "Firm red tomatoes, sorted daily.",
      retailPrice: 3000,
      status: "live" as const,
    },
    {
      id: "L6",
      inventoryItemId: "i6",
      title: "Red Groundnuts — per kg",
      description: "Sun-dried red groundnuts.",
      retailPrice: 7000,
      status: "draft" as const,
    },
  ].map((l) => ({
    ...l,
    discountPct: 0,
    dailySpecial: l.id === "L4",
    createdAt: t(20),
    updatedAt: t(20),
  }));

  const r = rng(42);
  const salesOrders: SalesOrder[] = [];
  const movements: StockMovement[] = [];
  let n = 1001;
  const liveListings = listings.filter((l) => l.status === "live");
  const mk = (
    daysAgo: number,
    hour: number,
    status: SalesOrder["status"],
    picks: [number, number][],
  ): SalesOrder => {
    const [name, phone] = customers[Math.floor(r() * customers.length)];
    const lines = picks.map(([li, q]) => {
      const l = liveListings[li];
      const inv = inventory.find((i) => i.id === l.inventoryItemId)!;
      return {
        listingId: l.id,
        inventoryItemId: inv.id,
        title: l.title,
        stockUnit: inv.stockUnit,
        quantity: q,
        unitPrice: l.retailPrice,
      };
    });
    const id = `SO-${n++}`;
    const createdAt = t(daysAgo, hour);
    return {
      id,
      customerName: name,
      customerPhone: phone,
      pickupNote: "Pickup at Ntinda shop counter",
      createdAt,
      status,
      lines,
      total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      checklist: {
        qualityChecked: status === "completed",
        weighed: status === "completed",
        packed: status === "completed",
      },
      history: [
        { status: "new", at: createdAt },
        ...(status === "completed" ? [{ status: "completed" as const, at: createdAt }] : []),
      ],
    };
  };
  for (let d = 13; d >= 1; d--) {
    const count = 1 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const li = Math.floor(r() * liveListings.length);
      const unit = inventory.find((i) => i.id === liveListings[li].inventoryItemId)!.stockUnit;
      const q = unit === "kg" ? 2 + Math.floor(r() * 6) : 1 + Math.floor(r() * 2);
      salesOrders.push(mk(d, 9 + k * 3, "completed", [[li, q]]));
    }
  }
  salesOrders.push(
    mk(0, 8, "completed", [
      [0, 5],
      [1, 3],
    ]),
  );
  salesOrders.push(mk(0, 9, "accepted", [[0, 10]]));
  salesOrders.push(
    mk(0, 10, "new", [
      [2, 2],
      [4, 3],
    ]),
  );
  salesOrders.push(
    mk(0, 11, "new", [
      [3, 1],
      [1, 4],
    ]),
  );
  // History entries for accepted + reservations
  for (const so of salesOrders) {
    if (so.status === "accepted") {
      so.history.push({ status: "accepted", at: so.createdAt });
      for (const l of so.lines) {
        const inv = inventory.find((i) => i.id === l.inventoryItemId)!;
        inv.reserved += l.quantity;
        movements.push({
          id: `M-${so.id}-r`,
          itemId: inv.id,
          at: so.createdAt,
          type: "reserved",
          quantity: l.quantity,
          reason: "Reserved for consumer order",
          ref: so.id,
        });
      }
    }
    if (so.status === "completed") {
      for (const l of so.lines) {
        movements.push({
          id: `M-${so.id}-${l.listingId}`,
          itemId: l.inventoryItemId,
          at: so.createdAt,
          type: "sale",
          quantity: -l.quantity,
          reason: "Consumer order collected",
          ref: so.id,
        });
      }
    }
  }

  const poLine = (pid: string, q: number) => {
    const p = products.find((x) => x.id === pid)!;
    return {
      productId: p.id,
      name: p.name,
      packageUnit: p.packageUnit,
      stockUnit: p.stockUnit,
      unitsPerPackage: p.unitsPerPackage,
      quantity: q,
      unitPrice: p.pricePerPackage,
    };
  };
  const po = (
    id: string,
    daysAgo: number,
    status: PurchaseOrder["status"],
    lines: ReturnType<typeof poLine>[],
    etaDaysFromNow: number,
  ): PurchaseOrder => {
    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const createdAt = t(daysAgo, 9);
    const eta = new Date(now.getTime() + etaDaysFromNow * 864e5).toISOString();
    return {
      id,
      createdAt,
      status,
      lines,
      subtotal,
      deliveryFee: 25000,
      total: subtotal + 25000,
      paymentMethod: "mobile_money",
      paymentStatus: "paid",
      eta,
      receivedAt: status === "received" ? t(daysAgo - 1, 14) : undefined,
      history: [
        { status: "submitted", at: createdAt },
        ...(status !== "submitted" ? [{ status, at: t(daysAgo - 1, 14) }] : []),
      ],
    };
  };
  const purchaseOrders = [
    po("PO-2026-0141", 12, "received", [poLine("p5", 8), poLine("p11", 3)], -11),
    po("PO-2026-0148", 2, "in_transit", [poLine("p8", 2), poLine("p12", 4)], 1),
    po("PO-2026-0152", 0, "submitted", [poLine("p3", 2)], 1),
  ];
  movements.push(
    {
      id: "M-rcv-1",
      itemId: "i1",
      at: t(11, 14),
      type: "received",
      quantity: 200,
      reason: "8 bags × 25 kg received",
      ref: "PO-2026-0141",
    },
    {
      id: "M-rcv-2",
      itemId: "i6",
      at: t(11, 14),
      type: "received",
      quantity: 150,
      reason: "3 bags × 50 kg received",
      ref: "PO-2026-0141",
    },
    {
      id: "M-adj-1",
      itemId: "i5",
      at: t(3, 17),
      type: "adjustment",
      quantity: -5,
      reason: "Spoiled in heat — written off",
    },
  );

  return {
    version: 1,
    profile: {
      name: "Nakato Fresh Mart",
      owner: "Esther Nakato",
      location: "Plot 14, Ntinda Road, Ntinda",
      district: "Kampala",
      phone: "+256 772 100 245",
      email: "orders@nakatofresh.ug",
      description:
        "Neighbourhood grocery selling quality staples, fresh produce and Ugandan coffee.",
      hours: "Mon–Sat 07:00–20:00 EAT",
      cropTypes: ["cash", "food"],
      categories: ["coffee", "maize", "beans", "bananas", "vegetables", "groundnuts"],
      notifications: { lowStock: true, newOrders: true, deliveries: true },
    },
    products,
    cart: [],
    purchaseOrders,
    inventory,
    movements,
    listings,
    salesOrders,
  };
}
