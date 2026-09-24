import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addOrderSupportNote,
  cancelUnpaidOrder,
  commandPaymentFinance,
  escalateOrderToDispatch,
  fetchOrderInvestigation,
  resendOrderNotification,
  revealOrderContact,
} from "@sokoni-digital/api-client";

import {
  refundRequestReasons,
  type OrderContactTarget,
  type OrderInvestigation,
} from "@sokoni-digital/domain";

import { useAuth } from "../auth/AuthContext";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const label = (value: string) => value.replaceAll("_", " ").replaceAll(".", " · ");
const when = (value: string) => new Date(value).toLocaleString();

export function OrderInvestigationPage({ initialData }: { initialData?: OrderInvestigation } = {}) {
  const { orderId = "" } = useParams();
  const { accessToken, can } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: OrderInvestigation } | null>(null);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState<string>(refundRequestReasons[0]);
  const [revealed, setRevealed] = useState<{ target: OrderContactTarget; phone: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const retry = useRef<{ key: string; operationId: string } | null>(null);
  const key = JSON.stringify([accessToken, orderId, revision]);
  const data = initialData ?? (result?.key === key ? result.data : null);
  const loading = !initialData && loaded !== key;
  useEffect(() => {
    if (!accessToken || !orderId) return;
    const controller = new AbortController();
    fetchOrderInvestigation({ baseUrl, accessToken }, orderId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, data: value });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not load this order.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(key);
      });
    return () => controller.abort();
  }, [accessToken, orderId, key]);

  async function execute(
    action: string,
    run: (operationId: string) => Promise<{ status: string; phoneNumber?: string }>,
    success: string,
  ) {
    if (inflight.current) return;
    const commandKey = JSON.stringify([
      action,
      orderId,
      reason.trim(),
      note.trim(),
      refundAmount,
      refundReason,
    ]);
    const operationId =
      retry.current?.key === commandKey ? retry.current.operationId : crypto.randomUUID();
    retry.current = { key: commandKey, operationId };
    inflight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setRevealed(null);
    try {
      const response = await run(operationId);
      retry.current = null;
      if (response.phoneNumber)
        setRevealed({
          target: action.endsWith("rider") ? "rider" : "consumer",
          phone: response.phoneNumber,
        });
      setMessage(
        response.phoneNumber
          ? "Contact revealed. This value is not retained by the dashboard."
          : success,
      );
      setRevision((value) => value + 1);
      if (action === "note") setNote("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The order operation failed. A retry will use the same operation key.",
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  const options = accessToken ? { baseUrl, accessToken } : null;
  const payment = data?.payment as
    { id?: string; status?: string; amount?: number; currency?: string } | null | undefined;
  const canCancel =
    data?.order.status === "awaiting_payment" &&
    (!payment?.status || ["failed", "cancelled", "expired"].includes(payment.status));
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Order investigation</p>
          <h1>{data?.order.reference ?? `Order ${orderId}`}</h1>
        </div>
        <div className="actions">
          <Link className="button-link" to="/dashboard/orders">
            Back to orders
          </Link>
          <button
            disabled={busy || loading}
            onClick={() => {
              setError("");
              setRevealed(null);
              setRevision((v) => v + 1);
            }}
          >
            Refresh
          </button>
        </div>
      </div>
      {loading && <p role="status">Loading the complete order history…</p>}
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
      {revealed && (
        <div className="review-warning" role="status">
          <strong>{label(revealed.target)} contact</strong>
          <p>{revealed.phone}</p>
          <button onClick={() => setRevealed(null)}>Hide contact</button>
        </div>
      )}
      {data && (
        <div className="investigation-grid">
          <section className="review-card">
            <h2>What happened?</h2>
            <p>
              {label(data.order.status)} · {label(data.order.fulfilmentType)} ·{" "}
              {data.order.market.name}
            </p>
            <p>
              Created {when(data.order.createdAt)} · Updated {when(data.order.updatedAt)}
            </p>
            <dl>
              <div>
                <dt>Items</dt>
                <dd>
                  {data.order.pricing.currency} {data.order.pricing.itemsSubtotal.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  {data.order.pricing.currency} {data.order.pricing.deliveryFee.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>
                  {data.order.pricing.currency} {data.order.pricing.total.toLocaleString()}
                </dd>
              </div>
            </dl>
          </section>
          <section className="review-card">
            <h2>Customer</h2>
            <p>
              {data.consumer.name}
              <br />
              {data.consumer.phoneMasked}
            </p>
            {data.deliveryAddress && <pre>{JSON.stringify(data.deliveryAddress, null, 2)}</pre>}
            {can("orders.support") && (
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  options &&
                  void execute(
                    "contact-consumer",
                    (op) => revealOrderContact(options, orderId, "consumer", op, reason.trim()),
                    "Contact access recorded.",
                  )
                }
              >
                Reveal phone number
              </button>
            )}
          </section>
          <section className="review-card">
            <h2>Payment</h2>
            {payment ? (
              <>
                <p>
                  {label(payment.status ?? "unknown")} · {payment.currency}{" "}
                  {payment.amount?.toLocaleString()}
                </p>
                <p>Payment ID: {payment.id}</p>
              </>
            ) : (
              <p>No payment attempt.</p>
            )}
          </section>
          <section className="review-card">
            <h2>Delivery</h2>
            {data.delivery ? (
              <>
                <p>
                  {data.delivery.reference} · {label(data.delivery.status)}
                </p>
                <p>
                  Rider: {data.delivery.rider?.name ?? "Unassigned"} ·{" "}
                  {data.delivery.rider?.phoneMasked ?? "No contact"}
                </p>
                {can("orders.support") && data.delivery.rider && (
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      options &&
                      void execute(
                        "contact-rider",
                        (op) => revealOrderContact(options, orderId, "rider", op, reason.trim()),
                        "Contact access recorded.",
                      )
                    }
                  >
                    Reveal rider phone
                  </button>
                )}
                <ul>
                  {data.delivery.issues.map((issue, index) => (
                    <li key={String(issue.id ?? index)}>
                      {label(String(issue.reason ?? "issue"))} ·{" "}
                      {label(String(issue.status ?? "unknown"))}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No delivery is linked.</p>
            )}
          </section>
          <section className="review-card investigation-wide">
            <h2>Vendor progress and items</h2>
            {data.vendors.map((vendor) => (
              <article key={vendor.sellerOrder.id}>
                <h3>
                  {vendor.vendor.name} · {vendor.sellerOrder.reference}
                </h3>
                <p>{label(vendor.sellerOrder.status)}</p>
                <ul>
                  {vendor.items.map((item) => (
                    <li key={item.id}>
                      {item.productName} × {item.quantity}
                    </li>
                  ))}
                </ul>
                <Evidence evidence={vendor.evidence} />
              </article>
            ))}
          </section>
          <section className="review-card">
            <h2>Delivery evidence</h2>
            <Evidence evidence={data.delivery?.evidence ?? []} />
          </section>
          <section className="review-card investigation-wide">
            <h2>Timeline</h2>
            <ol className="delivery-timeline">
              {[...data.timeline]
                .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
                .map((event, index) => (
                  <li key={`${event.type}-${event.entityId}-${event.occurredAt}-${index}`}>
                    <strong>{label(String(event.details.action ?? event.type))}</strong> ·{" "}
                    {when(event.occurredAt)}
                    <p>
                      {event.fromStatus ? label(event.fromStatus) : "Start"} →{" "}
                      {event.toStatus ? label(event.toStatus) : "Recorded"}
                    </p>
                    {event.details.reason !== undefined && event.details.reason !== null && (
                      <p>{String(event.details.reason)}</p>
                    )}
                  </li>
                ))}
            </ol>
          </section>
          <section className="review-card investigation-wide">
            <h2>Notifications</h2>
            {!data.notifications.length && <p>No notification history.</p>}
            {data.notifications.map((notification) => (
              <article key={notification.id}>
                <h3>{notification.title}</h3>
                <p>{notification.body}</p>
                <p>
                  {when(notification.createdAt)} ·{" "}
                  {notification.deliveries.map((d) => `${d.channel}: ${d.status}`).join(" · ")}
                </p>
                {can("notifications.manage") && (
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      options &&
                      void execute(
                        `notification-${notification.id}`,
                        (op) =>
                          resendOrderNotification(
                            options,
                            orderId,
                            notification.id,
                            op,
                            reason.trim(),
                          ),
                        "Approved notification template queued again.",
                      )
                    }
                  >
                    Resend current template
                  </button>
                )}
              </article>
            ))}
          </section>
          <section className="review-card">
            <h2>Refunds</h2>
            {!data.refunds.length && <p>No refund requests.</p>}
            <ul>
              {data.refunds.map((refund) => (
                <li key={refund.id}>
                  {refund.currency} {refund.requestedAmount.toLocaleString()} ·{" "}
                  {label(refund.status)} · {label(refund.approvalState)}
                </li>
              ))}
            </ul>
          </section>
          <section className="review-card">
            <h2>Internal support notes</h2>
            {!data.supportNotes.length && <p>No notes yet.</p>}
            <ol>
              {data.supportNotes.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.author.name}</strong> · {when(entry.createdAt)}
                  <p>{entry.note}</p>
                </li>
              ))}
            </ol>
            {can("orders.support") && (
              <>
                <label>
                  New internal note
                  <textarea
                    disabled={busy}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || note.trim().length < 3}
                  onClick={() =>
                    options &&
                    void execute(
                      "note",
                      (op) => addOrderSupportNote(options, orderId, op, note.trim()),
                      "Support note recorded.",
                    )
                  }
                >
                  Add note
                </button>
              </>
            )}
          </section>
          {(can("orders.support") || can("refunds.manage")) && (
            <section className="review-card investigation-wide">
              <h2>Controlled actions</h2>
              <label>
                Reason and context
                <textarea
                  disabled={busy}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="actions">
                {can("orders.support") && data.delivery && (
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      options &&
                      void execute(
                        "escalate",
                        (op) =>
                          escalateOrderToDispatch(
                            options,
                            orderId,
                            op,
                            reason.trim(),
                            data.delivery!.version,
                          ),
                        "Dispatch investigation opened.",
                      )
                    }
                  >
                    Escalate to dispatch
                  </button>
                )}
                {can("orders.support") && canCancel && (
                  <button
                    disabled={busy || reason.trim().length < 3}
                    onClick={() =>
                      options &&
                      void execute(
                        "cancel",
                        (op) => cancelUnpaidOrder(options, orderId, op, reason.trim()),
                        "Unpaid order cancelled and inventory released.",
                      )
                    }
                  >
                    Cancel unpaid order
                  </button>
                )}
              </div>
              {can("refunds.manage") && payment?.id && payment.status === "paid" && (
                <fieldset disabled={busy}>
                  <legend>Initiate refund approval</legend>
                  <p>This creates a review case; it does not send money.</p>
                  <label>
                    Reason code
                    <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)}>
                      {refundRequestReasons.map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount ({payment.currency})
                    <input
                      type="number"
                      min="1"
                      max={payment.amount}
                      step="1"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      reason.trim().length < 3 ||
                      !Number.isSafeInteger(Number(refundAmount)) ||
                      Number(refundAmount) <= 0 ||
                      Number(refundAmount) > (payment.amount ?? 0)
                    }
                    onClick={() =>
                      options &&
                      void execute(
                        "refund",
                        (op) =>
                          commandPaymentFinance(options, payment.id!, "request-refund", {
                            operationId: op,
                            reason: reason.trim(),
                            reasonCode: refundReason,
                            amount: Number(refundAmount),
                          }),
                        "Refund request sent for approval.",
                      )
                    }
                  >
                    Submit refund for approval
                  </button>
                </fieldset>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Evidence({ evidence }: { evidence: OrderInvestigation["vendors"][number]["evidence"] }) {
  if (!evidence.length) return <p>No evidence attached.</p>;
  return (
    <div className="image-row">
      {evidence.map((item) => (
        <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
          {item.mimeType?.startsWith("image/") !== false && (
            <img
              alt={item.isPackingProof ? "Packing evidence" : "Order evidence"}
              src={item.thumbnailUrl ?? item.url}
            />
          )}
          Open evidence
        </a>
      ))}
    </div>
  );
}
