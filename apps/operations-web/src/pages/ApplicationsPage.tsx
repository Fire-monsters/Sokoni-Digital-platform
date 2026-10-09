import { useCallback, useEffect, useRef, useState } from "react";
import {
  DemoError,
  fetchApplicationQueue,
  fetchApplicationReview,
  reviewApplication,
} from "../demo/service";
import type {
  ApplicationAction,
  ApplicationQueue,
  ApplicationReview,
  ApplicationStatus,
  ApplicationType,
} from "@sokoni-digital/domain";

const statuses: ApplicationStatus[] = [
  "pending_review",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
];
const label = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ");

export function ApplicationsPage({ type }: { type: ApplicationType }) {
  const [status, setStatus] = useState<ApplicationStatus>("pending_review");
  const [page, setPage] = useState(1);
  const [queueResult, setQueue] = useState<{ key: string; data: ApplicationQueue } | null>(null);
  const [selected, setSelected] = useState("");
  const [detailResult, setDetail] = useState<{ key: string; data: ApplicationReview } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadedQueueKey, setLoadedQueueKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [issues, setIssues] = useState("");
  const [revision, setRevision] = useState(0);
  const queueKey = JSON.stringify([type, status, page, revision]);
  const detailKey = JSON.stringify([selected, revision]);
  const queue = queueResult?.key === queueKey ? queueResult.data : null;
  const detail =
    queue?.data.some((item) => item.id === selected) && detailResult?.key === detailKey
      ? detailResult.data
      : null;
  const loading = loadedQueueKey !== queueKey;
  const inflight = useRef(false);
  const retry = useRef<{ key: string; operationId: string } | null>(null);
  const refresh = useCallback(() => {
    setError("");
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    let cancelled = false;

    fetchApplicationQueue({ type, status, page })
      .then((data) => {
        if (cancelled) return;
        setQueue({ key: queueKey, data });
        setReason("");
        setNotes("");
        setIssues("");
        setSelected((current) =>
          data.data.some((item) => item.id === current) ? current : (data.data[0]?.id ?? ""),
        );
      })
      .catch((error) => {
        if (!cancelled)
          setError(error instanceof Error ? error.message : "Could not load applications.");
      })
      .finally(() => {
        if (!cancelled) setLoadedQueueKey(queueKey);
      });
    return () => {
      cancelled = true;
    };
  }, [type, status, page, revision, queueKey]);
  useEffect(() => {
    const controller = new AbortController();
    if (selected) {
      fetchApplicationReview(selected, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setDetail({ key: detailKey, data });
            setReason("");
            setNotes("");
            setIssues("");
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setError(error instanceof Error ? error.message : "Could not load the application.");
        });
    }
    return () => controller.abort();
  }, [selected, revision, detailKey]);
  async function execute(action: ApplicationAction) {
    if (!detail || inflight.current) return;
    const input = {
      expectedVersion: detail.version,
      reason: reason.trim() || (action === "notes" ? notes.trim() : ""),
      ...(notes.trim() ? { internalNotes: notes.trim() } : {}),
      issues: issues
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
    const key = JSON.stringify({ id: detail.id, action, input });
    const operationId =
      retry.current?.key === key ? retry.current.operationId : crypto.randomUUID();
    retry.current = { key, operationId };
    inflight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await reviewApplication(detail.id, action, {
        ...input,
        operationId,
      });
      retry.current = null;
      setMessage(`${label(action)} recorded.`);
      refresh();
    } catch (error) {
      if (error instanceof DemoError && error.code === "VERSION_CONFLICT") {
        retry.current = null;
        setRevision((value) => value + 1);
        setError(`${error.message} The latest application has been loaded for review.`);
        return;
      }
      setError(error instanceof Error ? error.message : "The review failed.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  const reviewer = "demo-operator";
  const assigned = detail?.status === "in_review" && detail.reviewerId === reviewer;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Application review</p>
          <h1>{type === "vendor" ? "Vendor" : "Rider"} approvals</h1>
        </div>
        <button disabled={busy || loading} onClick={refresh}>
          Refresh
        </button>
      </div>
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
      <label>
        Status{" "}
        <select
          value={status}
          disabled={busy}
          onChange={(event) => {
            setStatus(event.target.value as ApplicationStatus);
            setPage(1);
            setSelected("");
          }}
        >
          {statuses.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </label>
      <div className="review-layout">
        <aside>
          {loading ? (
            <p role="status">Loading applications…</p>
          ) : queue?.data.length === 0 ? (
            <p>No applications in this queue.</p>
          ) : null}
          {queue?.data.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              className={`queue-item ${selected === item.id ? "selected" : ""}`}
              onClick={() => setSelected(item.id)}
            >
              <strong>{item.applicant.name}</strong>
              <span>{item.applicant.phoneMasked}</span>
              <span>{item.reviewer?.name ?? "Unassigned"}</span>
            </button>
          ))}
          <div className="actions">
            <button
              disabled={busy || loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, queue?.pagination.totalPages ?? 1)}
            </span>
            <button
              disabled={busy || loading || !queue || page >= queue.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </aside>
        <section className="review-card">
          {detail ? (
            <>
              <h2>{detail.applicantName}</h2>
              <p>
                {label(detail.status)} · {detail.phone ?? "No phone"} ·{" "}
                {detail.phoneVerified ? "Phone verified" : "Phone not verified"}
              </p>
              <p>
                Market: {detail.market?.name ?? "Not recorded"} · Reviewer:{" "}
                {detail.reviewerName ?? "Unassigned"}
              </p>
              {detail.reason && <p>Applicant feedback: {detail.reason}</p>}
              {detail.missingRequirements.length > 0 && (
                <div className="review-warning">
                  <strong>Incomplete requirements</strong>
                  <ul>
                    {detail.missingRequirements.map((item) => (
                      <li key={item}>{label(item)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.entries(detail.details).map(([section, fields]) => (
                <section key={section}>
                  <h3>{label(section)}</h3>
                  <dl>
                    {Object.entries(fields).map(([key, value]) => (
                      <div key={key}>
                        <dt>{label(key)}</dt>
                        <dd>
                          {typeof value === "boolean"
                            ? value
                              ? "Yes"
                              : "No"
                            : Array.isArray(value)
                              ? value.join(", ")
                              : value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
              <h3>Verification documents</h3>
              <p>Demo documents contain fictional information.</p>
              <div className="image-row">
                {detail.documents.map((document) => (
                  <a key={document.id} href={document.url} target="_blank" rel="noreferrer">
                    {document.contentType.startsWith("image/") && (
                      <img alt={label(document.type)} src={document.url} />
                    )}
                    {label(document.type)}
                  </a>
                ))}
              </div>
              <>
                <label>
                  Applicant feedback
                  <textarea
                    maxLength={1000}
                    value={reason}
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label>
                  Issue codes (comma separated)
                  <input
                    value={issues}
                    disabled={busy}
                    placeholder="NATIONAL_ID_IMAGE_UNREADABLE"
                    onChange={(event) => setIssues(event.target.value)}
                  />
                </label>
                <label>
                  Private staff note
                  <textarea
                    maxLength={2000}
                    value={notes}
                    disabled={busy}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <>
                    {detail.status === "pending_review" && (
                      <button
                        disabled={busy || reason.trim().length < 5}
                        onClick={() => void execute("start-review")}
                      >
                        Start review
                      </button>
                    )}
                    {assigned && (
                      <>
                        <button
                          disabled={
                            busy ||
                            reason.trim().length < 5 ||
                            detail.missingRequirements.length > 0
                          }
                          onClick={() => void execute("approve")}
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy || reason.trim().length < 5}
                          onClick={() => void execute("request-changes")}
                        >
                          Request changes
                        </button>
                        <button
                          disabled={busy || reason.trim().length < 5}
                          onClick={() => void execute("reject")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      disabled={busy || notes.trim().length < 5}
                      onClick={() => void execute("notes")}
                    >
                      Add private note
                    </button>
                  </>
                  {detail.status === "approved" && (
                    <button
                      disabled={busy || reason.trim().length < 5}
                      onClick={() => void execute("suspend")}
                    >
                      Suspend
                    </button>
                  )}
                </div>
              </>
              <h3>Review timeline</h3>
              <ol className="delivery-timeline">
                {detail.timeline.map((event) => (
                  <li key={event.id}>
                    <strong>{label(event.action)}</strong> ·{" "}
                    {new Date(event.createdAt).toLocaleString()}
                    <p>
                      {label(event.fromStatus)} → {label(event.toStatus)}
                    </p>
                    {event.reason && <p>{event.reason}</p>}
                    {event.internalNotes && <p>Private note: {event.internalNotes}</p>}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>{selected ? "Loading review details…" : "Select an application."}</p>
          )}
        </section>
      </div>
    </>
  );
}
