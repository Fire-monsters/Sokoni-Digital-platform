export type WarehouseBusiness = { id: string; kind: string; status: string; name: string };
export type CatalogueItem = {
  id: string;
  warehouse_business_id: string;
  product_id: string;
  sku: string;
  name: string;
  grade: string;
  package_unit: string;
  base_unit: string;
  units_per_package: number;
  price_ugx_per_package: number;
  minimum_packages: number;
  available_packages: number;
  status: string;
  version: number;
};
export type Order = {
  id: string;
  reference: string;
  status: string;
  totalUgx: number;
  createdAt: string;
  notes: string | null;
  lines: Array<{
    id: string;
    name: string;
    grade: string;
    quantityPackages: number;
    packageUnit: string;
    unitPriceUgx: number;
    lineTotalUgx: number;
  }>;
  invoice: null | {
    id: string;
    reference: string;
    totalUgx: number;
    paidUgx: number;
    balanceUgx: number;
    documentStatus: string;
  };
  history: Array<{ status: string; at: string; reason: string | null }>;
};
export type FinanceInvoice = {
  id: string;
  reference: string;
  orderId: string;
  totalUgx: number;
  paidUgx: number;
  balanceUgx: number;
  issuedAt: string;
};

// This module deliberately has no network client or persistent storage.
const warehouse: WarehouseBusiness = {
  id: "demo-warehouse",
  kind: "warehouse",
  status: "approved",
  name: "Demo Central Warehouse",
};
const copy = <T>(value: T): T => structuredClone(value);
const products = [
  { id: "demo-beans", name: "Beans", slug: "beans" },
  { id: "demo-maize", name: "Maize", slug: "maize" },
];
const offers: CatalogueItem[] = [
  {
    id: "demo-offer",
    warehouse_business_id: warehouse.id,
    product_id: products[0].id,
    sku: "DEMO-BEANS",
    name: "Demo beans",
    grade: "A",
    package_unit: "bag",
    base_unit: "kg",
    units_per_package: 50,
    price_ugx_per_package: 150000,
    minimum_packages: 1,
    available_packages: 40,
    status: "published",
    version: 1,
  },
];
const records: Order[] = ["submitted", "confirmed"].map((status, i) => ({
  id: `demo-order-${i}`,
  reference: `DEMO-WH-${i + 1}`,
  status,
  totalUgx: 300000,
  createdAt: new Date().toISOString(),
  notes: "Fictional SME buyer order",
  lines: [
    {
      id: `demo-line-${i}`,
      name: "Demo beans",
      grade: "A",
      quantityPackages: 2,
      packageUnit: "bag",
      unitPriceUgx: 150000,
      lineTotalUgx: 300000,
    },
  ],
  invoice: i
    ? {
        id: "demo-invoice",
        reference: "DEMO-INV-1",
        totalUgx: 300000,
        paidUgx: 0,
        balanceUgx: 300000,
        documentStatus: "demo",
      }
    : null,
  history: [{ status, at: new Date().toISOString(), reason: "Sample order" }],
}));
export async function demoWarehouse() {
  return copy(warehouse);
}
export async function crops() {
  return copy(products);
}
export async function catalogue(warehouseId: string) {
  return copy(offers.filter((o) => o.warehouse_business_id === warehouseId));
}
export async function orders(warehouseId: string) {
  return warehouseId === warehouse.id ? copy(records) : [];
}
export async function financeInvoices(): Promise<FinanceInvoice[]> {
  return copy(
    records.flatMap((o) =>
      o.invoice ? [{ ...o.invoice, orderId: o.id, issuedAt: o.createdAt }] : [],
    ),
  );
}
export async function decideOrder(id: string, action: "confirm" | "decline", reason?: string) {
  const order = records.find((o) => o.id === id);
  if (!order || order.status !== "submitted") throw new Error("Select a submitted demo order.");
  if (action === "decline" && (!reason || reason.trim().length < 3))
    throw new Error("Enter a decline reason.");
  order.status = action === "confirm" ? "confirmed" : "declined";
  order.history.push({
    status: order.status,
    at: new Date().toISOString(),
    reason: `Demo operator: ${reason ?? "Confirmed exact terms"}`,
  });
  if (action === "confirm")
    order.invoice = {
      id: `demo-invoice-${id}`,
      reference: `DEMO-INV-${id}`,
      totalUgx: order.totalUgx,
      paidUgx: 0,
      balanceUgx: order.totalUgx,
      documentStatus: "demo",
    };
}
type OfferInput = {
  productId: string;
  sku: string;
  name: string;
  grade: string;
  packageUnit: string;
  baseUnit: string;
  unitsPerPackage: number;
  priceUgxPerPackage: number;
  minimumPackages: number;
  availablePackages: number;
  status: string;
  expectedVersion?: number;
};
export async function saveOffer(id: string | undefined, input: OfferInput) {
  const existing = id ? offers.find((o) => o.id === id) : undefined;
  if (id && (!existing || existing.version !== input.expectedVersion))
    throw new Error("The demo offer changed. Select it again.");
  if (
    !products.some((p) => p.id === input.productId) ||
    !input.name.trim() ||
    !input.sku.trim() ||
    ![input.unitsPerPackage, input.priceUgxPerPackage, input.minimumPackages].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    !Number.isFinite(input.availablePackages) ||
    input.availablePackages < 0
  )
    throw new Error("Complete the offer with valid positive quantities and price.");
  const offer: CatalogueItem = {
    id: id ?? crypto.randomUUID(),
    warehouse_business_id: warehouse.id,
    product_id: input.productId,
    sku: input.sku,
    name: input.name,
    grade: input.grade,
    package_unit: input.packageUnit,
    base_unit: input.baseUnit,
    units_per_package: input.unitsPerPackage,
    price_ugx_per_package: input.priceUgxPerPackage,
    minimum_packages: input.minimumPackages,
    available_packages: input.availablePackages,
    status: input.status,
    version: (existing?.version ?? 0) + 1,
  };
  if (existing) Object.assign(existing, offer);
  else offers.push(offer);
}
const references = new Set<string>();
export async function allocatePayment(invoiceId: string, amount: number, reference: string) {
  const invoice = records.find((o) => o.invoice?.id === invoiceId)?.invoice;
  if (!invoice) throw new Error("Select a demo invoice.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > invoice.balanceUgx)
    throw new Error("Enter an amount within the invoice balance.");
  if (!reference.trim() || references.has(reference.trim()))
    throw new Error("Enter a unique demo payment reference.");
  invoice.paidUgx += amount;
  invoice.balanceUgx -= amount;
  references.add(reference.trim());
  const order = records.find((o) => o.invoice?.id === invoiceId)!;
  order.history.push({
    status: order.status,
    at: new Date().toISOString(),
    reason: `Demo operator: simulated payment ${reference} (${amount} UGX)`,
  });
}
