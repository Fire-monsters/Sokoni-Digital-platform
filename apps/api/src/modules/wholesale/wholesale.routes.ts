import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Router, type Request } from "express";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticate } from "../../middleware/authenticate.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { supabase } from "../../infrastructure/supabase/client.js";

const db = supabase as unknown as SupabaseClient;
const uuid = z.uuid();
const operationId = z.uuid();
const catalogueInput = z.object({
  operationId,
  productId: uuid,
  sku: z.string().trim().min(3).max(60),
  name: z.string().trim().min(2).max(160),
  grade: z.string().trim().min(1).max(40),
  packageUnit: z.string().trim().min(1).max(30),
  baseUnit: z.enum(["kg", "nut", "pack", "bunch"]),
  unitsPerPackage: z.number().positive(),
  priceUgxPerPackage: z.number().int().positive(),
  minimumPackages: z.number().int().positive(),
  availablePackages: z.number().int().nonnegative(),
  status: z.enum(["draft", "published", "archived"]),
  expectedVersion: z.number().int().positive().optional(),
});
const submitInput = z.object({
  operationId,
  lines: z
    .array(
      z.object({
        catalogueItemId: uuid,
        quantityPackages: z.number().int().positive(),
        expectedPriceUgx: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(50),
  notes: z.string().max(2000).optional(),
});
const actionInput = z.object({
  operationId,
  reason: z.string().trim().min(3).max(2000).optional(),
});
const paymentInput = z.object({
  operationId,
  provider: z.string().trim().min(2).max(80),
  providerAccount: z.string().trim().min(2).max(160),
  externalReference: z.string().trim().min(2).max(160),
  amountUgx: z.number().int().positive(),
  evidencePath: z.string().max(500).optional(),
  paidAt: z.iso.datetime({ offset: true }),
});

function failure(error: { code?: string; message: string }): Error {
  const mapping: Record<string, [number, string]> = {
    "42501": [403, "FORBIDDEN"],
    "23514": [409, "INVALID_STATE_TRANSITION"],
    "23505": [409, "CONFLICT"],
    "40001": [409, "VERSION_CONFLICT"],
    "22023": [400, "VALIDATION_ERROR"],
    "22P02": [400, "VALIDATION_ERROR"],
    P0002: [404, "NOT_FOUND"],
  };
  const [statusCode, code] = mapping[error.code ?? ""] ?? [503, "INTERNAL_ERROR"];
  return Object.assign(
    new Error(statusCode === 503 ? "Wholesale storage is unavailable." : error.message),
    { statusCode, code },
  );
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result: unknown = await db.rpc(name, args);
  const { data, error } = result as {
    data: unknown;
    error: { code?: string; message: string } | null;
  };
  if (error) throw failure(error);
  return data as T;
}

async function rows(
  table: string,
  field: string,
  value: string,
): Promise<Record<string, unknown>[]> {
  const result: unknown = await db.from(table).select("*").eq(field, value);
  const { data, error } = result as {
    data: Record<string, unknown>[] | null;
    error: { code?: string; message: string } | null;
  };
  if (error) throw failure(error);
  return data ?? [];
}

async function member(actor: string, businessId: string, kind: "sme" | "warehouse", owner = false) {
  await rpc("wholesale_require_business", {
    p_actor: actor,
    p_business: businessId,
    p_kind: kind,
    p_owner: owner,
  });
}

async function finance(actor: string) {
  await rpc("wholesale_require_finance", { p_actor: actor });
}

function actor(req: Request): string {
  if (!req.auth)
    throw Object.assign(new Error("Authentication required"), {
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  return req.auth.userId;
}

function validated<T>(
  req: Request,
  res: Parameters<typeof sendZodValidationError>[1],
  schema: z.ZodType<T>,
): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendZodValidationError(req, res, parsed.error.issues);
    return null;
  }
  return parsed.data;
}

function id(value: string | undefined): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    throw Object.assign(new Error("Invalid ID"), { statusCode: 400, code: "VALIDATION_ERROR" });
  return parsed.data;
}
function param(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === "string" ? value : undefined;
}

async function orderDetails(order: Record<string, unknown>) {
  const orderId = order.id as string;
  const lines = await rows("wholesale_order_lines", "order_id", orderId);
  const history = await rows("wholesale_order_status_history", "order_id", orderId);
  const invoiceRows = await rows("wholesale_invoices", "order_id", orderId);
  const invoice = invoiceRows[0];
  let invoiceData = null;
  if (invoice) {
    const allocations = await rows(
      "wholesale_payment_allocations",
      "invoice_id",
      invoice.id as string,
    );
    const paidUgx = allocations.reduce((sum, row) => sum + Number(row.amount_ugx), 0);
    const document = (
      await rows("wholesale_invoice_documents", "invoice_id", invoice.id as string)
    )[0];
    invoiceData = {
      id: invoice.id,
      reference: invoice.reference,
      totalUgx: Number(invoice.total_ugx),
      paidUgx,
      balanceUgx: Number(invoice.total_ugx) - paidUgx,
      issuedAt: invoice.issued_at,
      documentStatus: document?.status ?? "pending",
    };
  }
  return {
    id: order.id,
    reference: order.reference,
    smeBusinessId: order.sme_business_id,
    warehouseBusinessId: order.warehouse_business_id,
    status: order.status,
    totalUgx: Number(order.total_ugx),
    notes: order.notes,
    createdAt: order.created_at,
    confirmedAt: order.confirmed_at,
    lines: lines.map((line) => ({
      id: line.id,
      catalogueItemId: line.catalogue_item_id,
      name: line.name,
      sku: line.sku,
      grade: line.grade,
      packageUnit: line.package_unit,
      baseUnit: line.base_unit,
      unitsPerPackage: Number(line.units_per_package),
      quantityPackages: line.quantity_packages,
      unitPriceUgx: Number(line.unit_price_ugx),
      lineTotalUgx: Number(line.line_total_ugx),
    })),
    history: history
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((event) => ({ status: event.new_status, at: event.created_at, reason: event.reason })),
    invoice: invoiceData,
  };
}

async function scopedOrder(
  actorId: string,
  businessId: string,
  side: "sme" | "warehouse",
  orderId: string,
) {
  await member(actorId, businessId, side);
  const field = side === "sme" ? "sme_business_id" : "warehouse_business_id";
  const { data, error } = await supabase
    .from("wholesale_orders")
    .select("*")
    .eq("id", orderId)
    .eq(field, businessId)
    .maybeSingle();
  if (error) throw failure(error);
  if (!data) throw failure({ code: "P0002", message: "Order not found" });
  return data;
}

async function mayReadInvoice(actorId: string, invoice: Record<string, unknown>) {
  for (const [business, kind] of [
    [invoice.sme_business_id, "sme"],
    [invoice.warehouse_business_id, "warehouse"],
  ] as const) {
    try {
      await member(actorId, business as string, kind);
      return;
    } catch {
      /* check next role */
    }
  }
  await finance(actorId);
}

function printable(value: unknown) {
  return (typeof value === "string" || typeof value === "number" ? String(value) : "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?");
}

async function invoicePdf(invoice: Record<string, unknown>) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Commercial invoice ${printable(invoice.reference)}`);
  doc.setCreationDate(new Date(invoice.issued_at as string));
  let page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 792;
  const write = (value: unknown, size = 11, strong = false) => {
    const content = printable(value);
    for (let offset = 0; offset < content.length; offset += 92) {
      if (y < 58) {
        page = doc.addPage([595, 842]);
        y = 792;
      }
      page.drawText(content.slice(offset, offset + 92), {
        x: 45,
        y,
        size,
        font: strong ? bold : font,
        color: rgb(0.09, 0.15, 0.11),
      });
      y -= size + 12;
    }
  };
  write("Sokoni Digital - Commercial Invoice", 18, true);
  write(`Invoice: ${printable(invoice.reference)}`, 13, true);
  write(`Issued: ${printable(invoice.issued_at)}`);
  const order = (await rows("wholesale_orders", "id", invoice.order_id as string))[0];
  write(`Order: ${printable(order?.reference ?? invoice.order_id)}`);
  write(`Seller: ${printable(invoice.seller_name)}`);
  write(`Buyer: ${printable(invoice.buyer_name)}`);
  y -= 12;
  for (const line of await rows("wholesale_invoice_lines", "invoice_id", invoice.id as string)) {
    write(
      `${printable(line.name)} / ${printable(line.grade)} - ${printable(line.quantity_packages)} ${printable(line.package_unit)} x UGX ${printable(line.unit_price_ugx)}`,
    );
    write(`Line total: UGX ${Number(line.line_total_ugx).toLocaleString("en-UG")}`, 10);
  }
  y -= 12;
  write(`Total due: UGX ${Number(invoice.total_ugx).toLocaleString("en-UG")}`, 14, true);
  write("Payment is verified separately against an external transaction reference.", 9);
  write("Commercial document. No tax or fiscal certification is asserted.", 9);
  return Buffer.from(await doc.save());
}

async function signedInvoice(invoice: Record<string, unknown>) {
  const invoiceId = invoice.id as string;
  const document = (await rows("wholesale_invoice_documents", "invoice_id", invoiceId))[0];
  let path = document?.storage_path as string | undefined;
  if (!path || document?.status !== "ready") {
    path = `${invoiceId}.pdf`;
    try {
      const bytes = await invoicePdf(invoice);
      const { error } = await db.storage
        .from("wholesale-invoices")
        .upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      await rpc("wholesale_set_invoice_document", {
        p_invoice: invoiceId,
        p_status: "ready",
        p_path: path,
        p_sha256: createHash("sha256").update(bytes).digest("hex"),
        p_error: null,
      });
    } catch (error) {
      await rpc("wholesale_set_invoice_document", {
        p_invoice: invoiceId,
        p_status: "failed",
        p_path: null,
        p_sha256: null,
        p_error: "PDF_GENERATION_FAILED",
      });
      throw error;
    }
  }
  const signed = await db.storage.from("wholesale-invoices").createSignedUrl(path, 120);
  if (signed.error) throw failure({ message: "Invoice PDF unavailable" });
  return { url: signed.data.signedUrl, expiresIn: 120 };
}

export function createWholesaleRouter() {
  const router = Router();
  router.use(
    [
      "/sme/businesses/:businessId/wholesale",
      "/warehouse/businesses/:businessId/wholesale",
      "/finance/wholesale",
      "/wholesale",
    ],
    authenticate,
  );
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/sme/businesses/:businessId/wholesale/catalogue", async (req, res, next) => {
    try {
      await member(actor(req), id(req.params.businessId), "sme");
      const { data, error } = await supabase
        .from("wholesale_catalogue_items")
        .select("*")
        .eq("status", "published")
        .gt("available_packages", 0)
        .order("name");
      if (error) throw failure(error);
      sendSuccess(
        req,
        res,
        200,
        data.map((item) => ({
          id: item.id,
          warehouseBusinessId: item.warehouse_business_id,
          productId: item.product_id,
          sku: item.sku,
          name: item.name,
          grade: item.grade,
          packageUnit: item.package_unit,
          baseUnit: item.base_unit,
          unitsPerPackage: item.units_per_package,
          priceUgxPerPackage: item.price_ugx_per_package,
          minimumPackages: item.minimum_packages,
          availablePackages: item.available_packages,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/warehouse/businesses/:businessId/wholesale/catalogue", async (req, res, next) => {
    try {
      const businessId = id(req.params.businessId);
      await member(actor(req), businessId, "warehouse");
      sendSuccess(
        req,
        res,
        200,
        await rows("wholesale_catalogue_items", "warehouse_business_id", businessId),
      );
    } catch (error) {
      next(error);
    }
  });
  for (const method of ["post", "put"] as const) {
    const path =
      method === "post"
        ? "/warehouse/businesses/:businessId/wholesale/catalogue"
        : "/warehouse/businesses/:businessId/wholesale/catalogue/:itemId";
    router[method](path, async (req, res, next) => {
      const input = validated(req, res, catalogueInput);
      if (!input) return;
      try {
        const { operationId: operation, ...values } = input;
        const itemId = await rpc<string>("wholesale_save_catalogue_item", {
          p_actor: actor(req),
          p_warehouse: id(req.params.businessId),
          p_operation: operation,
          p_input: values,
          p_id: param(req, "itemId") ? id(param(req, "itemId")) : null,
        });
        sendSuccess(req, res, method === "post" ? 201 : 200, { id: itemId });
      } catch (error) {
        next(error);
      }
    });
  }

  router.post("/sme/businesses/:businessId/wholesale/orders", async (req, res, next) => {
    const input = validated(req, res, submitInput);
    if (!input) return;
    try {
      const orderId = await rpc<string>("wholesale_submit_order", {
        p_actor: actor(req),
        p_sme: id(req.params.businessId),
        p_operation: input.operationId,
        p_lines: input.lines,
        p_notes: input.notes ?? null,
      });
      sendSuccess(
        req,
        res,
        201,
        await scopedOrder(actor(req), id(req.params.businessId), "sme", orderId).then(orderDetails),
      );
    } catch (error) {
      next(error);
    }
  });

  for (const side of ["sme", "warehouse"] as const) {
    const base = `/${side}/businesses/:businessId/wholesale/orders`;
    router.get(base, async (req, res, next) => {
      try {
        const businessId = id(param(req, "businessId"));
        await member(actor(req), businessId, side);
        const field = side === "sme" ? "sme_business_id" : "warehouse_business_id";
        const orders = await rows("wholesale_orders", field, businessId);
        sendSuccess(
          req,
          res,
          200,
          await Promise.all(
            orders
              .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
              .map(orderDetails),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
    router.get(`${base}/:orderId`, async (req, res, next) => {
      try {
        sendSuccess(
          req,
          res,
          200,
          await orderDetails(
            await scopedOrder(
              actor(req),
              id(param(req, "businessId")),
              side,
              id(param(req, "orderId")),
            ),
          ),
        );
      } catch (error) {
        next(error);
      }
    });
  }

  for (const [side, action] of [
    ["sme", "cancel"],
    ["warehouse", "confirm"],
    ["warehouse", "decline"],
  ] as const) {
    router.post(
      `/${side}/businesses/:businessId/wholesale/orders/:orderId/${action}`,
      async (req, res, next) => {
        const input = validated(req, res, actionInput);
        if (!input) return;
        try {
          const order = await scopedOrder(
            actor(req),
            id(req.params.businessId),
            side,
            id(req.params.orderId),
          );
          await rpc("wholesale_command_order", {
            p_actor: actor(req),
            p_order: order.id,
            p_operation: input.operationId,
            p_action: action,
            p_reason: input.reason ?? null,
          });
          const updated = await scopedOrder(
            actor(req),
            id(req.params.businessId),
            side,
            id(req.params.orderId),
          );
          sendSuccess(req, res, 200, await orderDetails(updated));
        } catch (error) {
          next(error);
        }
      },
    );
  }

  router.get("/finance/wholesale/invoices", async (req, res, next) => {
    try {
      await finance(actor(req));
      const { data, error } = await supabase
        .from("wholesale_invoices")
        .select("*")
        .order("issued_at", { ascending: false });
      if (error) throw failure(error);
      sendSuccess(
        req,
        res,
        200,
        await Promise.all(
          data.map(async (invoice) => {
            const allocations = await rows(
              "wholesale_payment_allocations",
              "invoice_id",
              invoice.id,
            );
            const paidUgx = allocations.reduce(
              (sum, payment) => sum + Number(payment.amount_ugx),
              0,
            );
            return {
              id: invoice.id,
              reference: invoice.reference,
              orderId: invoice.order_id,
              totalUgx: invoice.total_ugx,
              paidUgx,
              balanceUgx: invoice.total_ugx - paidUgx,
              issuedAt: invoice.issued_at,
            };
          }),
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/finance/wholesale/invoices/:invoiceId/payments", async (req, res, next) => {
    const input = validated(req, res, paymentInput);
    if (!input) return;
    try {
      const { operationId: operation, ...values } = input;
      const paymentId = await rpc("wholesale_verify_payment", {
        p_actor: actor(req),
        p_invoice: id(req.params.invoiceId),
        p_operation: operation,
        p_input: values,
      });
      sendSuccess(req, res, 201, { id: paymentId });
    } catch (error) {
      next(error);
    }
  });

  router.get("/wholesale/invoices/:invoiceId/pdf", async (req, res, next) => {
    try {
      const invoice = (await rows("wholesale_invoices", "id", id(req.params.invoiceId)))[0];
      if (!invoice) throw failure({ code: "P0002", message: "Invoice not found" });
      await mayReadInvoice(actor(req), invoice);
      sendSuccess(req, res, 200, await signedInvoice(invoice));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
