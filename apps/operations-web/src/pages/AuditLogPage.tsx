import { useEffect, useMemo, useState, type FormEvent } from "react";
import { fetchAuditEvent, fetchAuditEvents } from "@sokoni-digital/api-client";
import type { AuditEventDetail, AuditEventPage, AuditEventQuery } from "@sokoni-digital/domain";
import { useAuth } from "../auth/AuthContext";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const label = (value: string) => value.replaceAll("_", " ").replaceAll(".", " · ");
const displayDate = (value: string) => new Date(value).toLocaleString();
const emptyPage: AuditEventPage = {
  data: [],
  pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
};

interface AuditLogPageProps {
  initialPage?: AuditEventPage;
  initialDetail?: AuditEventDetail;
}

export function AuditLogPage({ initialPage, initialDetail }: AuditLogPageProps = {}) {
  const { accessToken } = useAuth();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", action: "", entityType: "", from: "", to: "" });
  const [filters, setFilters] = useState(draft);
  const [result, setResult] = useState<AuditEventPage | null>(initialPage ?? null);
  const [selectedId, setSelectedId] = useState(initialDetail?.id ?? initialPage?.data[0]?.id ?? "");
  const [detail, setDetail] = useState<AuditEventDetail | null>(initialDetail ?? null);
  const [loading, setLoading] = useState(!initialPage);
  const [error, setError] = useState("");
  const query = useMemo<AuditEventQuery>(
    () => ({
      page,
      pageSize: 25,
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.from ? { from: new Date(`${filters.from}T00:00:00`).toISOString() } : {}),
      ...(filters.to ? { to: new Date(`${filters.to}T23:59:59.999`).toISOString() } : {}),
    }),
    [filters, page],
  );
  const queryKey = JSON.stringify([accessToken, query]);
  const selectedDetail = detail?.id === selectedId ? detail : null;
  const detailLoading = Boolean(selectedId && !selectedDetail);

  useEffect(() => {
    if (initialPage || !accessToken) return;
    const controller = new AbortController();
    fetchAuditEvents({ baseUrl, accessToken }, query, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        setSelectedId((current) =>
          data.data.some((event) => event.id === current) ? current : (data.data[0]?.id ?? ""),
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load the audit log.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, initialPage, query, queryKey]);

  useEffect(() => {
    if (!selectedId || !accessToken || initialDetail?.id === selectedId) return;
    const controller = new AbortController();
    fetchAuditEvent({ baseUrl, accessToken }, selectedId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load audit details.");
      });
    return () => controller.abort();
  }, [accessToken, initialDetail, selectedId]);

  function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setPage(1);
    setFilters({
      q: draft.q.trim(),
      action: draft.action.trim(),
      entityType: draft.entityType,
      from: draft.from,
      to: draft.to,
    });
  }

  const events = result ?? emptyPage;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Governance</p>
          <h1>Audit log</h1>
        </div>
        <span className="audit-integrity">Append-only ledger</span>
      </div>
      <p>Trace sensitive staff operations from request to state change.</p>
      <form className="audit-filters" onSubmit={search}>
        <label>
          Search
          <input
            value={draft.q}
            maxLength={128}
            placeholder="Reference, action or request ID"
            onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))}
          />
        </label>
        <label>
          Action
          <input
            value={draft.action}
            maxLength={100}
            placeholder="payment.reconciled"
            onChange={(event) => setDraft((value) => ({ ...value, action: event.target.value }))}
          />
        </label>
        <label>
          Entity
          <select
            value={draft.entityType}
            onChange={(event) =>
              setDraft((value) => ({ ...value, entityType: event.target.value }))
            }
          >
            <option value="">All entities</option>
            {[
              "application",
              "delivery",
              "delivery_pickup",
              "listing",
              "order",
              "payment",
              "price_request",
              "quality_check",
              "vendor_order",
            ].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))}
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      <div className="audit-layout">
        <section className="audit-list" aria-label="Audit events">
          {loading && <p role="status">Loading audit events…</p>}
          {!loading && events.data.length === 0 && <p>No audit events match these filters.</p>}
          {events.data.map((event) => (
            <button
              key={event.id}
              className={`audit-event ${selectedId === event.id ? "selected" : ""}`}
              onClick={() => {
                setError("");
                setSelectedId(event.id);
              }}
            >
              <span className="audit-event-heading">
                <strong>{label(event.action)}</strong>
                <time dateTime={event.occurredAt}>{displayDate(event.occurredAt)}</time>
              </span>
              <span>{event.entity.reference ?? event.entity.id}</span>
              <span>
                {event.actor?.name ?? "System"} · {label(event.entity.type)}
              </span>
              <small>{event.reason}</small>
            </button>
          ))}
          <div className="actions">
            <button
              disabled={loading || page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((value) => value - 1);
              }}
            >
              Previous
            </button>
            <span>
              Page {events.pagination.page} of {Math.max(1, events.pagination.totalPages)}
            </span>
            <button
              disabled={loading || page >= events.pagination.totalPages}
              onClick={() => {
                setLoading(true);
                setPage((value) => value + 1);
              }}
            >
              Next
            </button>
          </div>
        </section>
        <section className="review-card audit-detail" aria-label="Audit event details">
          {detailLoading && <p role="status">Loading event details…</p>}
          {!detailLoading && !selectedDetail && (
            <p>Select an event to inspect its immutable record.</p>
          )}
          {selectedDetail && (
            <>
              <p className="eyebrow">{label(selectedDetail.entity.type)}</p>
              <h2>{label(selectedDetail.action)}</h2>
              <dl>
                <dt>Actor</dt>
                <dd>
                  {selectedDetail.actor
                    ? `${selectedDetail.actor.name} (${selectedDetail.actor.role})`
                    : "System"}
                </dd>
                <dt>Entity</dt>
                <dd>{selectedDetail.entity.reference ?? selectedDetail.entity.id}</dd>
                <dt>Reason</dt>
                <dd>{selectedDetail.reason}</dd>
                <dt>Operation ID</dt>
                <dd className="audit-identifier">{selectedDetail.operationId ?? "Not supplied"}</dd>
                <dt>Request ID</dt>
                <dd className="audit-identifier">{selectedDetail.requestId ?? "Not supplied"}</dd>
                <dt>IP address</dt>
                <dd>{selectedDetail.context.ip ?? "Not captured"}</dd>
                <dt>User agent</dt>
                <dd>{selectedDetail.context.userAgent ?? "Not captured"}</dd>
                <dt>Occurred</dt>
                <dd>{displayDate(selectedDetail.occurredAt)}</dd>
              </dl>
              <AuditState title="Previous state" value={selectedDetail.previousState} />
              <AuditState title="New state" value={selectedDetail.newState} />
              {Object.keys(selectedDetail.details).length > 0 && (
                <AuditState title="Additional details" value={selectedDetail.details} />
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

function AuditState({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <section className="audit-state">
      <h3>{title}</h3>
      <pre>{value ? JSON.stringify(value, null, 2) : "No state recorded"}</pre>
    </section>
  );
}
