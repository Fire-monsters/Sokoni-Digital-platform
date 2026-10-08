import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { parseServerEnvironment } from "../config/index.js";
import { supabase } from "../infrastructure/supabase/client.js";

const env = parseServerEnvironment();
const host = new URL(env.SUPABASE_URL).hostname;
if (env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(host)) {
  throw new Error("This fixture script only runs against local Supabase.");
}
const destination = "/private/tmp/sokoni-local-wholesale-logins.txt";
const existingCredentials = existsSync(destination) ? readFileSync(destination, "utf8") : null;
const password =
  existingCredentials?.match(/^Password for all four: (.+)$/m)?.[1] ??
  `${randomBytes(18).toString("base64url")}!A1`;
const accounts = [
  { label: "SME", phone: "+256700001111" },
  { label: "Warehouse", phone: "+256700002222" },
  { label: "Admin", email: "wholesale-admin-local@example.test" },
  { label: "Finance", email: "wholesale-finance-local@example.test" },
] as const;
if (!existingCredentials) {
  // Keep the password before making any remote calls so a timed-out run can resume.
  writeFileSync(
    destination,
    [
      "Local Supabase wholesale test accounts",
      `SME phone: ${accounts[0].phone}`,
      `Warehouse phone: ${accounts[1].phone}`,
      `Finance email: ${accounts[3].email}`,
      `Admin email: ${accounts[2].email}`,
      `Password for all four: ${password}`,
    ].join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
} else if (!existingCredentials.includes(`Password for all four: ${password}`)) {
  throw new Error(`Cannot resume local fixture: missing password in ${destination}`);
}
const users = new Map<string, string>();
const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;

for (const account of accounts) {
  const existing = listed.data.users.find((user) =>
    "phone" in account
      ? user.phone?.replace(/\D/g, "").endsWith(account.phone.replace(/\D/g, ""))
      : user.email === account.email,
  );
  if (existing) {
    const updated = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (updated.error) throw updated.error;
    users.set(account.label, existing.id);
  } else {
    const result = await supabase.auth.admin.createUser({
      ...("phone" in account
        ? { phone: account.phone, phone_confirm: true }
        : { email: account.email, email_confirm: true }),
      password,
    });
    if (result.error)
      throw new Error(`Could not create local ${account.label} user: ${result.error.message}`);
    users.set(account.label, result.data.user.id);
  }
}

const userId = (label: string): string => {
  const value = users.get(label);
  if (!value) throw new Error(`Missing ${label} user`);
  return value;
};
const staff = await supabase.from("staff_members").upsert(
  [
    {
      user_id: userId("Admin"),
      role: "admin",
      status: "active",
      display_name: "Local wholesale admin",
    },
    {
      user_id: userId("Finance"),
      role: "finance",
      status: "active",
      display_name: "Local finance staff",
    },
  ],
  { onConflict: "user_id" },
);
if (staff.error) throw staff.error;

const crops = await supabase.rpc("list_agricultural_products", { p_category: "FOOD" });
if (crops.error) throw new Error(`Local canonical crops are unavailable: ${crops.error.message}`);
const crop = z
  .array(z.object({ id: z.uuid(), slug: z.string() }))
  .parse(crops.data)
  .find((item) => item.slug === "maize");
if (!crop) throw new Error("Local canonical maize crop is missing.");

const create = await supabase.rpc("command_business_account", {
  p_actor: userId("SME"),
  p_action: "create",
  p_operation: randomUUID(),
  p_input: { kind: "sme", name: "Local SME Buyer", location: "Kampala" },
});
if (create.error || !create.data || typeof create.data !== "object" || Array.isArray(create.data)) {
  throw new Error(`Could not create SME business: ${create.error?.message ?? "invalid result"}`);
}
const business = z
  .object({ id: z.uuid(), version: z.number(), status: z.string() })
  .parse(create.data);
const businessId = business.id;
let { status, version } = business;
const advance = async (action: string, input: Record<string, unknown>) => {
  const response = await supabase.rpc("command_business_account", {
    p_actor: action === "review" ? userId("Admin") : userId("SME"),
    p_action: action,
    p_operation: randomUUID(),
    p_id: businessId,
    p_input: { expectedVersion: version, ...input },
  });
  if (response.error) throw new Error(`SME ${action} failed: ${response.error.message}`);
  const next = z.object({ version: z.number(), status: z.string() }).parse(response.data);
  ({ version, status } = next);
};
if (status === "draft" || status === "changes_requested") {
  await advance("preferences", { categories: ["FOOD"], productIds: [crop.id] });
  await advance("submit", {});
}
if (status === "submitted") {
  await advance("review", { status: "approved", reason: "Local wholesale test account" });
}
if (status !== "approved") throw new Error(`Local SME account has unexpected status: ${status}`);

const existingWarehouse = await supabase.rpc("read_business_accounts", {
  p_actor: userId("Warehouse"),
});
if (existingWarehouse.error) throw existingWarehouse.error;
let warehouseId = z
  .array(z.object({ id: z.uuid(), kind: z.string() }))
  .parse(existingWarehouse.data)
  .find((item) => item.kind === "warehouse")?.id;
if (!warehouseId) {
  const warehouse = await supabase.rpc("wholesale_provision_warehouse", {
    p_admin: userId("Admin"),
    p_owner: userId("Warehouse"),
    p_name: "Local Agro Warehouse",
    p_location: "Kampala",
    p_operation: randomUUID(),
  });
  if (warehouse.error || !warehouse.data) {
    throw new Error(
      `Could not provision warehouse: ${warehouse.error?.message ?? "invalid result"}`,
    );
  }
  warehouseId = warehouse.data;
}
const existingOffer = await supabase
  .from("wholesale_catalogue_items")
  .select("id")
  .eq("warehouse_business_id", warehouseId)
  .eq("sku", "LOCAL-MAIZE-A-50")
  .maybeSingle();
if (existingOffer.error) throw existingOffer.error;
if (!existingOffer.data) {
  const offer = await supabase.rpc("wholesale_save_catalogue_item", {
    p_actor: userId("Warehouse"),
    p_warehouse: warehouseId,
    p_operation: randomUUID(),
    p_input: {
      productId: crop.id,
      sku: "LOCAL-MAIZE-A-50",
      name: "Maize grain",
      grade: "A",
      packageUnit: "bag",
      baseUnit: "kg",
      unitsPerPackage: 50,
      priceUgxPerPackage: 75000,
      minimumPackages: 1,
      availablePackages: 10,
      status: "published",
    },
  });
  if (offer.error) throw new Error(`Could not publish offer: ${offer.error.message}`);
}

writeFileSync(
  destination,
  [
    "Local Supabase wholesale test accounts",
    `SME phone: ${accounts[0].phone}`,
    `Warehouse phone: ${accounts[1].phone}`,
    `Finance email: ${accounts[3].email}`,
    `Admin email: ${accounts[2].email}`,
    `Password for all four: ${password}`,
    `SME business ID: ${businessId}`,
    `Warehouse business ID: ${warehouseId}`,
  ].join("\n") + "\n",
  { mode: 0o600 },
);
console.log(`Local wholesale fixture ready. Sign-in details: ${destination}`);
