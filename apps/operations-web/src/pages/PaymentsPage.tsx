import { useEffect, useRef, useState } from "react";
import {
  DemoError,
  commandPaymentFinance,
  fetchPaymentFinanceDetail,
  fetchPaymentFinanceQueue,
  recheckPayment,
  reconcilePendingPayments,
} from "../demo/service";
import {
  paymentInvestigationReasons,
  refundRequestReasons,
  type PaymentFinanceDetail,
  type PaymentFinanceQueue,
} from "@sokoni-digital/domain";

const label = (s: string) => s.replaceAll("_", " ");
const date = (s: string) => new Date(s).toLocaleString();

export function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState("");
  const [queueResult, setQueue] = useState<{ key: string; data: PaymentFinanceQueue } | null>(null);
  const [detailResult, setDetail] = useState<{ key: string; data: PaymentFinanceDetail } | null>(
    null,
  );
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [investigationReason, setInvestigationReason] = useState<string>(
    paymentInvestigationReasons[0],
  );
  const [refundReason, setRefundReason] = useState<string>(refundRequestReasons[0]);
  const [amount, setAmount] = useState("");
  const inflight = useRef(false);
  const retry = useRef<{ key: string; operationId: string } | null>(null);
  const queueKey = JSON.stringify([page, query, filter, revision]);
  const detailKey = JSON.stringify([selected, revision]);
  const queue = queueResult?.key === queueKey ? queueResult.data : null;
  const detail =
    queue?.data.some((p) => p.paymentId === selected) && detailResult?.key === detailKey
      ? detailResult.data
      : null;
  const loading = loaded !== queueKey;
  useEffect(() => {
    const controller = new AbortController();
    fetchPaymentFinanceQueue({ page, q: query, reconciliationStatus: filter }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setQueue({ key: queueKey, data });
          setSelected((id) =>
            data.data.some((p) => p.paymentId === id) ? id : (data.data[0]?.paymentId ?? ""),
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load payments.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(queueKey);
      });
    return () => controller.abort();
  }, [page, query, filter, queueKey]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetchPaymentFinanceDetail(selected, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDetail({ key: detailKey, data });
          setReason("");
          setAmount("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load payment history.");
      });
    return () => controller.abort();
  }, [selected, detailKey]);
  async function execute(action: "reconcile" | "batch" | "flag-investigation" | "request-refund") {
    if (inflight.current || (action !== "batch" && !detail)) return;
    const input = {
      reason: reason.trim(),
      reasonCode: action === "request-refund" ? refundReason : investigationReason,
      ...(action === "request-refund" ? { amount: Number(amount) } : {}),
    };
    const key = JSON.stringify([
      action,
      action === "batch" ? null : selected,
      action === "reconcile" || action === "batch" ? null : input,
    ]);
    const operationId =
      retry.current?.key === key ? retry.current.operationId : crypto.randomUUID();
    retry.current = { key, operationId };
    inflight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "batch") {
        const result = await reconcilePendingPayments(operationId, reason.trim());
        setMessage(
          `Simulated batch: ${result.claimed} checked, ${result.resolved} resolved, ${result.pending} pending, ${result.needsReview} need review, ${result.failed} failed.`,
        );
      } else if (action === "reconcile") {
        const result = await recheckPayment(selected, operationId, detail!.version, reason.trim());
        setMessage(
          `Simulated provider recheck: ${label(result.outcome)}. Payment status: ${label(result.status)}.`,
        );
      } else {
        const result = await commandPaymentFinance(selected, action, {
          ...input,
          operationId,
          expectedVersion: detail!.version,
        });
        setMessage(
          action === "request-refund"
            ? `Refund request ${result.id} awaits approval. No money has been sent.`
            : "Investigation opened.",
        );
      }
      retry.current = null;
      setRevision((v) => v + 1);
    } catch (e) {
      if (e instanceof DemoError && e.code === "VERSION_CONFLICT") {
        retry.current = null;
        setRevision((value) => value + 1);
        setError(`${e.message} The latest payment has been loaded for review.`);
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "The operation could not be completed. Retry uses the same operation key.",
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Finance</p>
          <h1>Payment reconciliation</h1>
        </div>
        <div className="actions">
          <button
            disabled={busy || loading}
            onClick={() => {
              setError("");
              setRevision((v) => v + 1);
            }}
          >
            Refresh
          </button>
          <button disabled={busy || reason.trim().length < 5} onClick={() => void execute("batch")}>
            Recheck pending batch
          </button>
        </div>
      </div>
      <p>Rechecks simulate provider responses locally. No provider is contacted.</p>
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
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        <label>
          Reference or phone
          <input
            value={search}
            maxLength={100}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button disabled={busy}>Search</button>
        <label>
          Reconciliation state
          <select
            disabled={busy}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All payments</option>
            {["not_started", "pending", "reconciled", "needs_review"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </form>
      <div className="review-layout">
        <aside>
          {loading && <p role="status">Loading payments…</p>}
          {queue?.data.length === 0 && <p>No payments match.</p>}
          {queue?.data.map((p) => (
            <button
              key={p.paymentId}
              className={`queue-item ${selected === p.paymentId ? "selected" : ""}`}
              disabled={busy}
              onClick={() => setSelected(p.paymentId)}
            >
              <strong>{p.orderReference}</strong>
              <span>
                {p.currency} {p.amount.toLocaleString()} · {label(p.status)}
              </span>
              <span>{label(p.reconciliation.status)}</span>
              <span>{p.flags.map(label).join(" · ")}</span>
            </button>
          ))}
          <div className="actions">
            <button disabled={busy || loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={busy || loading || !queue || page >= queue.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </aside>
        <section className="review-card">
          {detail ? (
            <>
              <h2>{detail.reference}</h2>
              <p>
                {detail.currency} {detail.amount.toLocaleString()} · {label(detail.status)} ·{" "}
                {detail.provider}
              </p>
              <p>
                Merchant reference: {detail.merchantReference}
                <br />
                Provider reference: {detail.providerReference ?? "Missing"}
              </p>
              {detail.provider === "pesapal" && (
                <button
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => void execute("reconcile")}
                >
                  Simulate provider recheck
                </button>
              )}
              <label>
                Reason
                <textarea
                  disabled={busy}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <fieldset disabled={busy}>
                <legend>Financial investigation</legend>
                <label>
                  Issue
                  <select
                    value={investigationReason}
                    onChange={(e) => setInvestigationReason(e.target.value)}
                  >
                    {paymentInvestigationReasons.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={reason.trim().length < 5}
                  onClick={() => void execute("flag-investigation")}
                >
                  Flag investigation
                </button>
              </fieldset>
              {detail.status === "successful" && (
                <fieldset disabled={busy}>
                  <legend>Request a refund</legend>
                  <p>This creates an approval request only. It does not execute a refund.</p>
                  <label>
                    Reason code
                    <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)}>
                      {refundRequestReasons.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount (UGX)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={detail.amount}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      reason.trim().length < 5 ||
                      !Number.isSafeInteger(Number(amount)) ||
                      Number(amount) <= 0 ||
                      Number(amount) > detail.amount
                    }
                    onClick={() => void execute("request-refund")}
                  >
                    Submit refund for approval
                  </button>
                </fieldset>
              )}
              <h3>Reconciliation history</h3>
              <p>Local demo reconciliation history.</p>
              {!detail.reconciliations.length && <p>No rechecks yet.</p>}
              <ol className="delivery-timeline">
                {detail.reconciliations.map((r) => (
                  <li key={r.id}>
                    <strong>{label(r.result)}</strong> · {date(r.created_at)}
                    <p>
                      {label(r.previous_status)} → {label(r.local_status_after ?? "not recorded")};
                      provider: {r.provider_status ?? "unknown"}
                    </p>
                    <p>
                      {r.run_source} · {r.requested_by ?? "Automatic"}
                      {r.error_code ? ` · ${r.error_code}` : ""}
                    </p>
                    {r.provider_amount_ugx !== null && (
                      <p>
                        Provider amount: {r.provider_currency}{" "}
                        {r.provider_amount_ugx.toLocaleString()}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              <h3>Provider callbacks</h3>
              {!detail.providerEvents.length && <p>No callbacks received.</p>}
              <ul>
                {detail.providerEvents.map((e) => (
                  <li key={e.id}>
                    {date(e.received_at)} · {label(e.processing_status)} ·{" "}
                    {e.verification_method ?? "Not verified"}
                  </li>
                ))}
              </ul>
              <h3>Investigations</h3>
              <ul>
                {detail.investigations.map((i) => (
                  <li key={i.id}>
                    {label(i.reason_code)} · {i.status} · {date(i.created_at)}
                    <p>{i.reason}</p>
                  </li>
                ))}
              </ul>
              <h3>Refund requests</h3>
              <ul>
                {detail.refunds.map((r) => (
                  <li key={r.id}>
                    {r.id} · UGX {r.requested_amount_ugx.toLocaleString()} · {label(r.status)} ·{" "}
                    {label(r.approval_state)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{selected ? "Loading payment details…" : "Select a payment."}</p>
          )}
        </section>
      </div>
    </>
  );
}
