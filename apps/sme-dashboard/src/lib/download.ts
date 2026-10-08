import type { PurchaseOrder } from "@/models/types";
import { eat, paymentLabel, ugx } from "./format";

function save(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(name: string, rows: Record<string, string | number>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  save(
    name,
    [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n"),
    "text/csv",
  );
}

/** Printable HTML invoice (open and "Save as PDF"). */
export function downloadInvoice(po: PurchaseOrder, business: string) {
  const rows = po.lines
    .map(
      (l) =>
        `<tr><td>${l.name}</td><td>${l.quantity} ${l.packageUnit}(s) × ${l.unitsPerPackage} ${l.stockUnit}</td><td>${ugx(l.unitPrice)}</td><td>${ugx(l.quantity * l.unitPrice)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${po.id}</title><style>body{font-family:sans-serif;color:#17211B;padding:32px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}h1{color:#1F7A4D}</style></head><body onload="window.print()"><h1>E-Katale Agro-Warehouse — Invoice</h1><p><b>${po.id}</b> · ${eat(po.createdAt)}<br/>Billed to: ${business}<br/>Payment: ${paymentLabel[po.paymentMethod]} (${po.paymentStatus})<br/>Estimated delivery: ${eat(po.eta)}</p><table><tr><th>Item</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr>${rows}<tr><td colspan=3>Delivery</td><td>${ugx(po.deliveryFee)}</td></tr><tr><th colspan=3>Total</th><th>${ugx(po.total)}</th></tr></table><p style="margin-top:24px;font-size:12px">Demo document — not a tax invoice.</p></body></html>`;
  save(`invoice-${po.id}.html`, html, "text/html");
}
