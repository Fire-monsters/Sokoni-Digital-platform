import {
  assignDispatcherDelivery,
  fetchDispatcherDeliveryEvidence,
  fetchDispatcherNearbyRiders,
  performDispatcherDeliveryAction,
  resolveDispatcherDeliveryIssue,
} from "@sokoni-digital/api-client";
import {
  deliveryIssueResolutionCodes,
  type DeliveryEvidence,
  type DeliveryIssueResolutionCode,
  type DispatcherDelivery,
  type DispatcherDeliveryAction,
  type DispatcherDeliveryBoard,
  type DispatcherRider,
} from "@sokoni-digital/domain";
import { useMemo, useState } from "react";
import { deliveryBoardColumn } from "./delivery-board-policy";

const columns = [
  { id: "waiting", label: "Waiting for rider" },
  { id: "offers", label: "Offers sent" },
  { id: "assigned", label: "Rider assigned" },
  { id: "market", label: "At market" },
  { id: "transit", label: "In transit" },
  { id: "problems", label: "Problems" },
  { id: "completed", label: "Completed" },
] as const;

function age(updatedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 60_000));
  return minutes < 1 ? "now" : `${minutes} min`;
}

export function DeliveryBoard({
  token,
  board,
  riders,
  busy,
  onBusy,
  onMessage,
  onReload,
}: {
  token: string;
  board: DispatcherDeliveryBoard;
  riders: DispatcherRider[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onMessage: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [riderId, setRiderId] = useState("");
  const [reason, setReason] = useState("");
  const [nearby, setNearby] = useState<DispatcherRider[]>();
  const [resolutionCode, setResolutionCode] =
    useState<DeliveryIssueResolutionCode>("RESUME_DELIVERY");
  const [evidence, setEvidence] = useState<DeliveryEvidence>();
  const selected = board.deliveries.find((delivery) => delivery.id === selectedId);
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          board.deliveries.filter((delivery) => deliveryBoardColumn(delivery) === column.id),
        ]),
      ) as Record<(typeof columns)[number]["id"], DispatcherDelivery[]>,
    [board.deliveries],
  );
  const selectableRiders = nearby ?? riders.filter((rider) => rider.availability === "available");

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    onBusy(true);
    onMessage("");
    try {
      await action();
      onMessage(success);
      setReason("");
      setNearby(undefined);
      await onReload();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Dispatcher action failed.");
    } finally {
      onBusy(false);
    }
  }

  async function assignment(reassign: boolean): Promise<void> {
    if (!selected || !riderId) return;
    await run(
      () =>
        assignDispatcherDelivery(
          { baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000", accessToken: token },
          selected.id,
          reassign,
          {
            transporterId: riderId,
            reason,
            expectedVersion: selected.version,
            operationId: crypto.randomUUID(),
          },
        ),
      reassign ? "Delivery reassigned." : "Delivery assigned.",
    );
  }

  async function deliveryAction(action: DispatcherDeliveryAction): Promise<void> {
    if (!selected) return;
    onBusy(true);
    try {
      const result = await performDispatcherDeliveryAction(
        { baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000", accessToken: token },
        selected.id,
        { action, reason, expectedVersion: selected.version, operationId: crypto.randomUUID() },
      );
      if (result.contactPhoneNumber) window.open(`tel:${result.contactPhoneNumber}`, "_self");
      onMessage(
        result.contactPhoneNumber ? "Contact access audited." : "Delivery action completed.",
      );
      setReason("");
      await onReload();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Dispatcher action failed.");
    } finally {
      onBusy(false);
    }
  }

  return (
    <section className="delivery-operations">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Live dispatch</p>
          <h2>Delivery board</h2>
        </div>
        <span className="live-badge">● Live · 30 day window</span>
      </div>
      <div className="delivery-board">
        {columns.map((column) => (
          <div className="delivery-column" key={column.id}>
            <div className="column-heading">
              <h3>{column.label}</h3>
              <span>{grouped[column.id].length}</span>
            </div>
            {grouped[column.id].map((delivery) => (
              <button
                className={`delivery-ticket ${selectedId === delivery.id ? "selected" : ""}`}
                key={delivery.id}
                onClick={() => {
                  setSelectedId(delivery.id);
                  setRiderId("");
                  setNearby(undefined);
                  setEvidence(undefined);
                }}
              >
                <strong>{delivery.reference}</strong>
                <span>
                  {delivery.marketName} → {delivery.zoneName}
                </span>
                <small>
                  {delivery.transporter?.displayName ?? "No rider"} · {age(delivery.updatedAt)}
                </small>
                {delivery.openIssueCount ? (
                  <em>
                    {delivery.openIssueCount} open issue{delivery.openIssueCount === 1 ? "" : "s"}
                  </em>
                ) : null}
              </button>
            ))}
            {grouped[column.id].length === 0 ? <p className="empty-column">Nothing here</p> : null}
          </div>
        ))}
      </div>

      {selected ? (
        <div className="dispatcher-panel">
          <div className="dispatcher-summary">
            <div>
              <p className="eyebrow">{selected.status.replaceAll("_", " ")}</p>
              <h3>{selected.reference}</h3>
              <p>{selected.destinationSummary}</p>
            </div>
            <div className="contact-summary">
              <strong>{selected.transporter?.displayName ?? "Unassigned"}</strong>
              <span>{selected.consumerPhoneNumber}</span>
            </div>
          </div>
          <label>
            Required operations reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this override is necessary"
            />
          </label>

          {(["unassigned", "offering", "assigned", "arrived_at_market"] as string[]).includes(
            selected.status,
          ) ? (
            <div className="assignment-controls">
              <select
                aria-label="Available rider"
                value={riderId}
                onChange={(event) => setRiderId(event.target.value)}
              >
                <option value="">Select an available rider</option>
                {selectableRiders.map((rider) => (
                  <option key={rider.id} value={rider.id}>
                    {rider.displayName}
                    {rider.distanceKm !== undefined ? ` · ${rider.distanceKm.toFixed(1)} km` : ""}
                  </option>
                ))}
              </select>
              {selected.status === "unassigned" || selected.status === "offering" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void fetchDispatcherNearbyRiders(
                      {
                        baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
                        accessToken: token,
                      },
                      selected.id,
                    )
                      .then(setNearby)
                      .catch((error: unknown) =>
                        onMessage(error instanceof Error ? error.message : "Nearby search failed."),
                      )
                  }
                >
                  Search nearby
                </button>
              ) : null}
              <button
                className="approve"
                disabled={busy || !riderId || reason.trim().length < 3}
                onClick={() =>
                  void assignment(
                    selected.status === "assigned" || selected.status === "arrived_at_market",
                  )
                }
              >
                {selected.status === "assigned" || selected.status === "arrived_at_market"
                  ? "Reassign rider"
                  : "Assign rider"}
              </button>
            </div>
          ) : null}

          <div className="override-actions">
            {(["assigned", "arrived_at_market"] as string[]).includes(selected.status) ? (
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void deliveryAction("CANCEL_ASSIGNMENT")}
              >
                Cancel assignment
              </button>
            ) : null}
            {(["in_transit", "arrived_at_customer"] as string[]).includes(selected.status) ? (
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void deliveryAction("MARK_CUSTOMER_UNAVAILABLE")}
              >
                Customer unavailable
              </button>
            ) : null}
            {(
              ["picked_up", "in_transit", "arrived_at_customer", "customer_unavailable"] as string[]
            ).includes(selected.status) ? (
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void deliveryAction("RETURN_TO_MARKET")}
              >
                Return to market
              </button>
            ) : null}
            {selected.transporter ? (
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={() => void deliveryAction("CONTACT_RIDER")}
              >
                Contact rider
              </button>
            ) : null}
            <button
              disabled={busy || reason.trim().length < 3}
              onClick={() => void deliveryAction("CONTACT_CONSUMER")}
            >
              Contact consumer
            </button>
            {selected.status === "delivered" ? (
              <button
                disabled={busy}
                onClick={() =>
                  void fetchDispatcherDeliveryEvidence(
                    {
                      baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
                      accessToken: token,
                    },
                    selected.id,
                  )
                    .then(setEvidence)
                    .catch((error: unknown) =>
                      onMessage(error instanceof Error ? error.message : "Evidence unavailable."),
                    )
                }
              >
                View evidence
              </button>
            ) : null}
          </div>
          {evidence ? (
            <div className="evidence-gallery">
              {evidence.images.map((image) => (
                <a href={image.originalUrl} key={image.id} rel="noreferrer" target="_blank">
                  <img
                    alt={`Delivery evidence captured ${new Date(image.capturedAt).toLocaleString()}`}
                    src={image.thumbnailUrl}
                  />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="exception-queue">
        <h3>Exception queue ({board.issues.length})</h3>
        {board.issues.map((issue) => (
          <div className="exception-row" key={issue.id}>
            <div>
              <strong>
                {issue.deliveryReference} · {issue.reason.replaceAll("_", " ")}
              </strong>
              <p>{issue.note || "No rider note"}</p>
              <small>{new Date(issue.createdAt).toLocaleString()}</small>
            </div>
            <div className="resolution-controls">
              <select
                value={resolutionCode}
                onChange={(event) =>
                  setResolutionCode(event.target.value as DeliveryIssueResolutionCode)
                }
              >
                {deliveryIssueResolutionCodes.map((code) => (
                  <option key={code} value={code}>
                    {code.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <button
                className="approve"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  void run(
                    () =>
                      resolveDispatcherDeliveryIssue(
                        {
                          baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
                          accessToken: token,
                        },
                        issue.id,
                        {
                          resolutionCode,
                          resolutionNote: reason,
                          operationId: crypto.randomUUID(),
                        },
                      ),
                    "Issue resolved.",
                  )
                }
              >
                Resolve issue
              </button>
            </div>
          </div>
        ))}
        {board.issues.length === 0 ? <p>No open delivery exceptions.</p> : null}
      </div>
    </section>
  );
}
