import { useRef, useState } from "react";
import { ApiFeedback, useApiMutation, useApiQuery } from "@sokoni-digital/api-client/react";
import { ApiError, apiErrorMessage } from "@sokoni-digital/api-client";
import { api } from "../lib/api";

const base = "/v1/public/operations";
const id = () => crypto.randomUUID();
function useOperationId() {
  const pending = useRef<{ key: string; value: string; at: string } | null>(null);
  return {
    get(key: string) {
      if (pending.current?.key !== key) pending.current = { key, value: id(), at: new Date().toISOString() };
      return pending.current.value;
    },
    at(key: string) {
      if (pending.current?.key !== key) pending.current = { key, value: id(), at: new Date().toISOString() };
      return pending.current.at;
    },
    clear() { pending.current = null; },
  };
}
type CommandResult = { id: string; status: string; duplicate: boolean };
type Note = { id: string; note: string; created_at: string };
type Case = { id: string; status: "open" | "resolved"; version: number; resolution: string | null; opened_at: string };
type InvestigationList = { cases: Case[]; notes: (Note & { investigation_id: string })[] };
type PaymentRecord = { id: string; external_reference: string; observed_amount_ugx: number | null; note: string; observed_at: string; recorded_at: string };

function ErrorText({ error }: { error: unknown }) {
  return error ? <p role="alert">{apiErrorMessage(error)}{error instanceof ApiError && error.requestId ? ` · Request ${error.requestId}` : ""}</p> : null;
}
export function InvestigationPanel({ orderId }: { orderId: string }) {
  const operation = useOperationId();
  const path = `${base}/orders/${encodeURIComponent(orderId)}/investigations`;
  const key = ["operations", "investigations", orderId] as const;
  const query = useApiQuery({ queryKey: key, queryFn: ({ signal }) => api.get<InvestigationList>(path, { signal }) });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [message, setMessage] = useState("");
  const create = useApiMutation<CommandResult, { action: "open" | "notes" | "resolve"; caseId?: string; version?: number }>({
    mutationFn: async ({ action, caseId, version }) => api.post<CommandResult, object>(action === "open" ? path : `${path}/${action}`, {
      operationId: operation.get(JSON.stringify([orderId, action, caseId, version, reason, note, resolution])), reason: reason.trim() || (action === "notes" ? note.trim() : resolution.trim()),
      ...(caseId ? { investigationId: caseId, expectedVersion: version } : {}),
      ...(action === "notes" ? { note: note.trim() } : {}),
      ...(action === "resolve" ? { resolution: resolution.trim() } : {}),
    }),
    invalidate: [key, ["operations", "order", orderId]],
  });
  const active = query.data?.cases.find(item => item.status === "open");
  async function submit(action: "open" | "notes" | "resolve") {
    try {
      await create.mutateAsync({ action, ...(active ? { caseId: active.id, version: active.version } : {}) });
      operation.clear();
      setMessage(action === "open" ? "Investigation opened." : action === "notes" ? "Investigation note saved." : "Investigation resolved.");
      setNote(""); setResolution("");
    } catch { setMessage(""); }
  }
  return <section className="review-card investigation-wide">
    <h2>Investigation</h2>
    <ApiFeedback pending={query.isPending} refreshing={query.isFetching && !query.isPending} error={query.error} onRetry={() => void query.refetch()} />
    {query.data && <>
      {query.data.cases.length === 0 && <p>No investigations.</p>}
      {query.data.cases.map(item => <article key={item.id}><strong>{item.status}</strong> · Opened {new Date(item.opened_at).toLocaleString()}{item.resolution && <p>Resolution: {item.resolution}</p>}
        {query.data.notes.filter(entry => entry.investigation_id === item.id).map(entry => <p key={entry.id}>{entry.note} · {new Date(entry.created_at).toLocaleString()}</p>)}
      </article>)}
      {!active ? <><label>Reason <textarea value={reason} onChange={event => setReason(event.target.value)} /></label><button disabled={create.isPending || reason.trim().length < 3} onClick={() => void submit("open")}>Open investigation</button></> : <>
        <label>Investigation note <textarea value={note} onChange={event => setNote(event.target.value)} /></label><button disabled={create.isPending || note.trim().length < 3} onClick={() => void submit("notes")}>Save note</button>
        <label>Resolution <textarea value={resolution} onChange={event => setResolution(event.target.value)} /></label><button disabled={create.isPending || resolution.trim().length < 3} onClick={() => void submit("resolve")}>Resolve investigation</button>
      </>}
    </>}
    <ErrorText error={create.error} />{message && <p role="status">{message}</p>}
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh investigations</button>
  </section>;
}
export function PaymentRecordsPanel({ paymentId }: { paymentId: string }) {
  const operation = useOperationId();
  const path = `${base}/payments/${encodeURIComponent(paymentId)}/records`;
  const key = ["operations", "payment-records", paymentId] as const;
  const query = useApiQuery({ queryKey: key, queryFn: ({ signal }) => api.get<PaymentRecord[]>(path, { signal }) });
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const create = useApiMutation<CommandResult, void>({ mutationFn: () => {
    const fingerprint = JSON.stringify([paymentId, reference, note, amount]);
    return api.post<CommandResult, object>(path, { operationId: operation.get(fingerprint), reason: note.trim(), externalReference: reference.trim(), note: note.trim(), observedAt: operation.at(fingerprint), ...(amount ? { amount: Number(amount) } : {}) });
  }, invalidate: [key, ["operations", "payments"]] });
  async function submit() { try { await create.mutateAsync(); operation.clear(); setMessage("Payment observation recorded. Provider status is unchanged."); setReference(""); setNote(""); setAmount(""); } catch { setMessage(""); } }
  return <section className="review-card"><h3>Manual payment observations</h3><p>Records external evidence only. No provider verification or payment execution occurs.</p>
    <ApiFeedback pending={query.isPending} refreshing={query.isFetching && !query.isPending} error={query.error} onRetry={() => void query.refetch()} />
    {query.data?.length === 0 && <p>No manual observations.</p>}
    {query.data?.map(row => <p key={row.id}>{row.external_reference} · {row.observed_amount_ugx ? `UGX ${row.observed_amount_ugx.toLocaleString()}` : "Amount not recorded"} · {row.note}</p>)}
    <label>External reference <input value={reference} onChange={event => setReference(event.target.value)} /></label>
    <label>Observed amount (UGX, optional) <input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    <label>Note <textarea value={note} onChange={event => setNote(event.target.value)} /></label>
    <button disabled={create.isPending || reference.trim().length < 3 || note.trim().length < 3 || Boolean(amount && (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0))} onClick={() => void submit()}>Record observation</button>
    <ErrorText error={create.error} />{message && <p role="status">{message}</p>}
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh records</button>
  </section>;
}
export function ReviewNotesPanel({ kind, entityId, version }: { kind: "listings" | "price-requests" | "deliveries"; entityId: string; version?: number }) {
  const operation = useOperationId();
  const path = `${base}/${kind}/${encodeURIComponent(entityId)}/notes`;
  const key = ["operations", kind, entityId, "notes"] as const;
  const query = useApiQuery({ queryKey: key, queryFn: ({ signal }) => api.get<Note[]>(path, { signal }) });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const create = useApiMutation<CommandResult, void>({ mutationFn: () => api.post<CommandResult, object>(path, { operationId: operation.get(JSON.stringify([kind, entityId, version, note])), reason: note.trim(), note: note.trim(), ...(version ? { expectedVersion: version } : {}) }), invalidate: [key, ["operations", kind]] });
  async function submit() { try { await create.mutateAsync(); operation.clear(); setNote(""); setMessage("Review note saved."); } catch { setMessage(""); } }
  return <section><h3>Operational notes</h3><ApiFeedback pending={query.isPending} refreshing={query.isFetching && !query.isPending} error={query.error} onRetry={() => void query.refetch()} />
    {query.data?.length === 0 && <p>No notes yet.</p>}{query.data?.map(row => <p key={row.id}>{row.note} · {new Date(row.created_at).toLocaleString()}</p>)}
    <label>New note <textarea value={note} onChange={event => setNote(event.target.value)} /></label><button disabled={create.isPending || note.trim().length < 3} onClick={() => void submit()}>Save note</button><ErrorText error={create.error} />{message && <p role="status">{message}</p>}
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh notes</button>
  </section>;
}
