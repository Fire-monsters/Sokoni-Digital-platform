import {
  DemoError,
  assignDispatcherDelivery,
  fetchDispatcherDelivery,
  fetchDispatcherNearbyRiders,
  performDispatcherDeliveryAction,
  resolveDispatcherDeliveryIssue,
} from "./demo/service";
import {
  deliveryIssueResolutionCodes,
  type DeliveryIssueResolutionCode,
  type DispatcherDelivery,
  type DispatcherDeliveryAction,
  type DispatcherDeliveryBoard,
  type DispatcherDeliveryDetail,
  type DispatcherRider,
} from "@sokoni-digital/domain";
import { useMemo, useRef, useState } from "react";
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
  board,
  riders,
  busy,
  onBusy,
  onMessage,
  onReload,
}: {
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
  const [detail, setDetail] = useState<DispatcherDeliveryDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const pendingOperations = useRef(new Map<string, string>());
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

  async function loadDetail(deliveryId: string): Promise<void> {
    const requestNumber = ++detailRequest.current;
    setDetailLoading(true);
    try {
      const result = await fetchDispatcherDelivery(deliveryId);
      if (requestNumber === detailRequest.current) setDetail(result);
    } catch (error) {
      if (requestNumber === detailRequest.current) {
        setDetail(undefined);
        onMessage(error instanceof Error ? error.message : "Delivery details could not be loaded.");
      }
    } finally {
      if (requestNumber === detailRequest.current) setDetailLoading(false);
    }
  }

  function operationIdFor(key: string): string {
    const operationId = pendingOperations.current.get(key) ?? crypto.randomUUID();
    pendingOperations.current.set(key, operationId);
    return operationId;
  }

  async function run(
    operationKey: string,
    action: (operationId: string) => Promise<unknown>,
    success: string,
  ): Promise<void> {
    const operationId = operationIdFor(operationKey);
    onBusy(true);
    onMessage("");
    try {
      await action(operationId);
      pendingOperations.current.delete(operationKey);
      onMessage(success);
      setReason("");
      setNearby(undefined);
      await onReload();
      if (selected) await loadDetail(selected.id);
    } catch (error) {
      if (error instanceof DemoError && error.code === "VERSION_CONFLICT") {
        pendingOperations.current.delete(operationKey);
        onMessage(`${error.message} The latest delivery has been loaded for review.`);
        await onReload();
        if (selected) await loadDetail(selected.id);
        return;
      }
      onMessage(error instanceof Error ? error.message : "Dispatcher action failed.");
    } finally {
      onBusy(false);
    }
  }

  async function assignment(reassign: boolean): Promise<void> {
    if (!selected || !riderId) return;
    const operationKey = JSON.stringify([
      reassign ? "reassign" : "assign",
      selected.id,
      riderId,
      reason.trim(),
      selected.version,
    ]);
    await run(
      operationKey,
      (operationId) =>
        assignDispatcherDelivery(selected.id, reassign, {
          transporterId: riderId,
          reason,
          expectedVersion: selected.version,
          operationId,
        }),
      reassign ? "Delivery reassigned." : "Delivery assigned.",
    );
  }

  async function deliveryAction(action: DispatcherDeliveryAction): Promise<void> {
    if (!selected) return;
    const operationKey = JSON.stringify([action, selected.id, reason.trim(), selected.version]);
    const operationId = operationIdFor(operationKey);
    onBusy(true);
    try {
      const result = await performDispatcherDeliveryAction(selected.id, {
        action,
        reason,
        expectedVersion: selected.version,
        operationId,
      });
      pendingOperations.current.delete(operationKey);
      onMessage(result.contactPhoneNumber ?? "Demo delivery action completed.");
      setReason("");
      await onReload();
      await loadDetail(selected.id);
    } catch (error) {
      if (error instanceof DemoError && error.code === "VERSION_CONFLICT") {
        pendingOperations.current.delete(operationKey);
        onMessage(`${error.message} The latest delivery has been loaded for review.`);
        await onReload();
        await loadDetail(selected.id);
        return;
      }
      onMessage(error instanceof Error ? error.message : "Dispatcher action failed.");
    } finally {
      onBusy(false);
    }
  }

  return (
    <section className="delivery-operations">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dispatch queue</p>
          <h2>Delivery board</h2>
        </div>
        <span className="live-badge">Location snapshots · 30-day window</span>
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
                  setDetail(undefined);
                  void loadDetail(delivery.id);
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
              <span>{selected.destinationSummary}</span>
            </div>
          </div>
          {detailLoading ? <p className="detail-loading">Loading delivery details…</p> : null}
          {detail ? (
            <div className="delivery-detail-grid">
              <section>
                <h4>Order</h4>
                <dl>
                  <dt>Reference</dt>
                  <dd>{detail.order.reference}</dd>
                  <dt>Status</dt>
                  <dd>{detail.order.status.replaceAll("_", " ")}</dd>
                  <dt>Total</dt>
                  <dd>
                    {detail.order.currency} {detail.order.total.toLocaleString()}
                  </dd>
                  <dt>Destination</dt>
                  <dd>{detail.delivery.destination.summary}</dd>
                </dl>
              </section>
              <section>
                <h4>Assigned rider</h4>
                {detail.assignedRider ? (
                  <dl>
                    <dt>Name</dt>
                    <dd>{detail.assignedRider.displayName}</dd>
                    <dt>Availability</dt>
                    <dd>{detail.assignedRider.availability}</dd>
                    <dt>Location</dt>
                    <dd>
                      {detail.assignedRider.lastLocation
                        ? `Updated ${age(detail.assignedRider.lastLocation.receivedAt)} ago${detail.assignedRider.locationIsFresh ? "" : " · stale"}`
                        : "No location snapshot"}
                    </dd>
                  </dl>
                ) : (
                  <p>No rider assigned.</p>
                )}
              </section>
              <section>
                <h4>Pickup checklist</h4>
                {detail.pickups.length ? (
                  <ul className="detail-list">
                    {detail.pickups.map((pickup) => (
                      <li key={pickup.id}>
                        <span>{pickup.vendorName}</span>
                        <strong>{pickup.status}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Pickup checklist starts after assignment.</p>
                )}
              </section>
              <section>
                <h4>Vendor orders</h4>
                <ul className="detail-list">
                  {detail.vendors.map((vendor) => (
                    <li key={vendor.sellerOrder.id}>
                      <span>
                        {vendor.vendor.name} · {vendor.sellerOrder.reference}
                      </span>
                      <strong>{vendor.sellerOrder.status.replaceAll("_", " ")}</strong>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h4>Customer confirmation</h4>
                <dl>
                  <dt>PIN state</dt>
                  <dd>
                    {detail.customerPin.confirmedAt
                      ? "Confirmed"
                      : detail.customerPin.lockedAt
                        ? "Locked"
                        : detail.customerPin.configured
                          ? "Awaiting confirmation"
                          : "Not generated"}
                  </dd>
                  <dt>Attempts</dt>
                  <dd>{detail.customerPin.failedAttempts}</dd>
                </dl>
              </section>
              <section className="detail-wide">
                <h4>Assignment history</h4>
                {detail.assignmentHistory.length ? (
                  <ul className="detail-list">
                    {detail.assignmentHistory.map((assignment) => (
                      <li key={assignment.operationId}>
                        <span>
                          {assignment.riderName} · {assignment.reason}
                        </span>
                        <small>{new Date(assignment.assignedAt).toLocaleString()}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No assignment history.</p>
                )}
              </section>
              <section className="detail-wide">
                <h4>Timeline</h4>
                <ol className="delivery-timeline">
                  {detail.timeline.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <span>
                        {entry.fromStatus && entry.toStatus
                          ? ` ${entry.fromStatus.replaceAll("_", " ")} → ${entry.toStatus.replaceAll("_", " ")}`
                          : ""}
                      </span>
                      {entry.reason ? <p>{entry.reason}</p> : null}
                      <small>{new Date(entry.occurredAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ) : null}
          {
            <>
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
                        {rider.distanceKm !== undefined
                          ? ` · ${rider.distanceKm.toFixed(1)} km`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void fetchDispatcherNearbyRiders(selected.id)
                        .then(setNearby)
                        .catch((error: unknown) =>
                          onMessage(
                            error instanceof Error ? error.message : "Nearby search failed.",
                          ),
                        )
                    }
                  >
                    Search nearby
                  </button>
                  <button
                    className="approve"
                    disabled={busy || !riderId || reason.trim().length < 5}
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
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => void deliveryAction("CANCEL_ASSIGNMENT")}
                  >
                    Cancel assignment
                  </button>
                ) : null}
                {(["in_transit", "arrived_at_customer"] as string[]).includes(selected.status) ? (
                  <button
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => void deliveryAction("MARK_CUSTOMER_UNAVAILABLE")}
                  >
                    Customer unavailable
                  </button>
                ) : null}
                {(
                  [
                    "picked_up",
                    "in_transit",
                    "arrived_at_customer",
                    "customer_unavailable",
                  ] as string[]
                ).includes(selected.status) ? (
                  <button
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => void deliveryAction("RETURN_TO_MARKET")}
                  >
                    Return to market
                  </button>
                ) : null}
                {selected.transporter ? (
                  <button
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => void deliveryAction("CONTACT_RIDER")}
                  >
                    Contact rider
                  </button>
                ) : null}
                <button
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => void deliveryAction("CONTACT_CONSUMER")}
                >
                  Contact consumer
                </button>
              </div>
            </>
          }
          {detail?.evidence.images.length ? (
            <div className="evidence-gallery">
              {detail.evidence.images.map((image) => (
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
            {
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
                  disabled={busy || reason.trim().length < 5}
                  onClick={() =>
                    void run(
                      JSON.stringify([
                        "resolve",
                        issue.id,
                        resolutionCode,
                        reason.trim(),
                        issue.reportedVersion,
                      ]),
                      (operationId) =>
                        resolveDispatcherDeliveryIssue(issue.id, {
                          resolutionCode,
                          resolutionNote: reason,
                          reason,
                          expectedVersion: issue.reportedVersion,
                          operationId,
                        }),
                      "Issue resolved.",
                    )
                  }
                >
                  Resolve issue
                </button>
              </div>
            }
          </div>
        ))}
        {board.issues.length === 0 ? <p>No open delivery exceptions.</p> : null}
      </div>
    </section>
  );
}
