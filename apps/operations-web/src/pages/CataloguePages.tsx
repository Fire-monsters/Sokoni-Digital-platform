import {
  DemoError,
  approveAdminListing,
  requestAdminListingChanges,
  reviewAdminPrice,
} from "../demo/service";
import type { AdminListingReview, AdminPriceReview } from "@sokoni-digital/domain";
import { useEffect, useRef, useState } from "react";
import { useOperations } from "../operations/OperationsContext";

export function CatalogueListingsPage() {
  const operations = useOperations();
  const { loadCatalogue } = operations;
  const [selected, setSelected] = useState<AdminListingReview>();
  const [note, setNote] = useState("");
  const pendingOperations = useRef(new Map<string, string>());
  const listing =
    operations.listings.find((item) => item.id === selected?.id) ?? operations.listings[0];
  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);
  async function decide(decision: "approve" | "changes") {
    if (!listing) return;
    const operationKey = `${listing.id}:${decision}`;
    const operationId = pendingOperations.current.get(operationKey) ?? crypto.randomUUID();
    pendingOperations.current.set(operationKey, operationId);
    operations.setLoading(true);
    try {
      if (decision === "approve")
        await approveAdminListing(listing.id, listing.version, operationId, note);
      else await requestAdminListingChanges(listing.id, listing.version, operationId, note);
      setNote("");
      pendingOperations.current.delete(operationKey);
      operations.setMessage(decision === "approve" ? "Listing approved." : "Changes requested.");
      await operations.loadCatalogue();
    } catch (error) {
      if (error instanceof DemoError && error.code === "VERSION_CONFLICT") {
        pendingOperations.current.delete(operationKey);
        operations.setMessage(`${error.message} The latest listing has been loaded for review.`);
        await operations.loadCatalogue();
        return;
      }
      operations.setMessage(error instanceof Error ? error.message : "Review failed.");
    } finally {
      operations.setLoading(false);
    }
  }
  return (
    <>
      <Title
        eyebrow="Catalogue governance"
        title="Listing approvals"
        description="Review products before they appear in the marketplace."
      />
      {operations.message ? <p className="message">{operations.message}</p> : null}
      <div className="review-layout">
        <aside>
          <h2>Pending ({operations.listings.length})</h2>
          {operations.listings.map((item) => (
            <button
              className={`queue-item ${listing?.id === item.id ? "selected" : ""}`}
              key={item.id}
              onClick={() => setSelected(item)}
            >
              <strong>{item.productName}</strong>
              <span>{item.vendorName}</span>
            </button>
          ))}
          {!operations.listings.length ? <Empty load={operations.loadCatalogue} /> : null}
        </aside>
        <section className="review-card">
          {listing ? (
            <>
              <div className="review-heading">
                <div>
                  <p className="eyebrow">{listing.categoryName}</p>
                  <h2>{listing.productName}</h2>
                  <p>
                    {listing.vendorName} · {listing.marketName ?? "No market"}
                  </p>
                </div>
                <strong>
                  UGX {listing.latestPriceRequest?.proposedPriceUgx.toLocaleString() ?? "—"}
                </strong>
              </div>
              <div className="image-row">
                {listing.images.map((image) => (
                  <img
                    alt={listing.productName}
                    key={image.id}
                    src={image.thumbnailUrl ?? image.url}
                  />
                ))}
              </div>
              <dl>
                <dt>Package</dt>
                <dd>
                  {listing.packageQuantity} {listing.packageUnit}
                </dd>
                <dt>Availability</dt>
                <dd>{listing.availability.replace("_", " ")}</dd>
                <dt>Description</dt>
                <dd>{listing.description || "No description"}</dd>
                <dt>Current approved price</dt>
                <dd>
                  {listing.approvedPriceUgx
                    ? `UGX ${listing.approvedPriceUgx.toLocaleString()}`
                    : "Not yet approved"}
                </dd>
              </dl>
              <ReviewHistory listing={listing} />
              <>
                <textarea
                  aria-label="Review note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Review note or required changes"
                />
                <div className="actions">
                  <button
                    className="approve"
                    disabled={operations.loading || note.trim().length < 5}
                    onClick={() => void decide("approve")}
                  >
                    Approve listing
                  </button>
                  <button
                    disabled={operations.loading || note.trim().length < 5}
                    onClick={() => void decide("changes")}
                  >
                    Request changes
                  </button>
                </div>
              </>
            </>
          ) : (
            <p>Select a pending listing to review.</p>
          )}
        </section>
      </div>
    </>
  );
}

export function PriceChangesPage() {
  const operations = useOperations();
  const { loadCatalogue } = operations;
  const [selected, setSelected] = useState<AdminPriceReview>();
  const [note, setNote] = useState("");
  const pendingOperations = useRef(new Map<string, string>());
  const price =
    operations.prices.find((item) => item.requestId === selected?.requestId) ??
    operations.prices[0];
  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  async function decide(id: string, decision: "approve" | "reject") {
    const operationKey = `${id}:${decision}`;
    const operationId = pendingOperations.current.get(operationKey) ?? crypto.randomUUID();
    pendingOperations.current.set(operationKey, operationId);
    operations.setLoading(true);
    try {
      await reviewAdminPrice(id, decision, operationId, 0, note);
      setNote("");
      pendingOperations.current.delete(operationKey);
      operations.setMessage(`Price request ${decision === "approve" ? "approved" : "rejected"}.`);
      await operations.loadCatalogue();
    } catch (error) {
      if (error instanceof DemoError && error.code === "VERSION_CONFLICT") {
        pendingOperations.current.delete(operationKey);
        operations.setMessage(`${error.message} The latest price request has been loaded.`);
        await operations.loadCatalogue();
        return;
      }
      operations.setMessage(error instanceof Error ? error.message : "Price review failed.");
    } finally {
      operations.setLoading(false);
    }
  }
  return (
    <>
      <Title
        eyebrow="Catalogue governance"
        title="Price changes"
        description="Review proposed pricing updates from vendors."
      />
      <div className="review-layout">
        <aside>
          <h2>Pending ({operations.prices.length})</h2>
          {operations.prices.map((item) => (
            <button
              className={`queue-item ${price?.requestId === item.requestId ? "selected" : ""}`}
              key={item.requestId}
              onClick={() => setSelected(item)}
            >
              <strong>{item.productName}</strong>
              <span>{item.vendorName}</span>
            </button>
          ))}
          {!operations.prices.length ? <Empty load={operations.loadCatalogue} /> : null}
        </aside>
        <section className="review-card">
          {price ? (
            <>
              <div className="review-heading">
                <div>
                  <p className="eyebrow">{price.marketName ?? "No market"}</p>
                  <h2>{price.productName}</h2>
                  <p>{price.vendorName}</p>
                </div>
                <strong>
                  UGX {price.currentPriceUgx?.toLocaleString() ?? "—"} → UGX{" "}
                  {price.proposedPriceUgx.toLocaleString()}
                </strong>
              </div>
              <div className="image-row">
                {price.images.map((image) => (
                  <img
                    alt={price.productName}
                    key={image.id}
                    src={image.thumbnailUrl ?? image.url}
                  />
                ))}
              </div>
              {price.largePriceChange ? (
                <p className="review-warning">
                  Large price {Number(price.percentageChange) >= 0 ? "increase" : "decrease"}:{" "}
                  {price.percentageChange}%
                </p>
              ) : null}
              {price.recentUnavailableChanges > 1 ? (
                <p className="review-warning">
                  {price.recentUnavailableChanges} unavailable-status changes in the last 30 days.
                </p>
              ) : null}
              <dl>
                <dt>Package</dt>
                <dd>
                  {price.packageQuantity} {price.packageUnit}
                </dd>
                <dt>Vendor reason</dt>
                <dd>{price.reason || "No reason supplied"}</dd>
                <dt>Submitted</dt>
                <dd>{new Date(price.createdAt).toLocaleString()}</dd>
              </dl>
              <AuditHistory entries={price.auditHistory} />
              <>
                <textarea
                  aria-label="Review note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Review note (required when rejecting)"
                />
                <div className="actions">
                  <button
                    className="approve"
                    disabled={operations.loading || note.trim().length < 5}
                    onClick={() => void decide(price.requestId, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={operations.loading || note.trim().length < 5}
                    onClick={() => void decide(price.requestId, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </>
            </>
          ) : (
            <p>Select a pending price change to review.</p>
          )}
        </section>
      </div>
    </>
  );
}

function ReviewHistory({ listing }: { listing: AdminListingReview }) {
  return (
    <div className="review-history">
      <h3>Price history</h3>
      {listing.priceHistory.map((entry) => (
        <p key={entry.requestId}>
          UGX {entry.previousPriceUgx?.toLocaleString() ?? "—"} → UGX{" "}
          {entry.proposedPriceUgx.toLocaleString()} · {entry.status.replace("_", " ")}
          {entry.reviewNote ? ` · ${entry.reviewNote}` : ""}
        </p>
      ))}
      <AuditHistory entries={listing.auditHistory} />
    </div>
  );
}

function AuditHistory({ entries }: { entries: AdminListingReview["auditHistory"] }) {
  return (
    <div className="review-history">
      <h3>Audit history</h3>
      {entries.length ? (
        entries.map((entry) => (
          <p key={entry.id}>
            {entry.action.replaceAll(".", " ")} · {new Date(entry.createdAt).toLocaleString()}
          </p>
        ))
      ) : (
        <p>No review actions yet.</p>
      )}
    </div>
  );
}
function Title({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Empty({ load }: { load: () => Promise<void> }) {
  return (
    <div className="empty-state">
      <strong>No queue data</strong>
      <p>No pending sample records.</p>
      <button onClick={() => void load()}>Refresh queue</button>
    </div>
  );
}
