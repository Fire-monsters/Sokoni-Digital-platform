import {
  approveAdminListing,
  requestAdminListingChanges,
  reviewAdminPrice,
} from "@sokoni-digital/api-client";
import type { AdminListingReview } from "@sokoni-digital/domain";
import { useEffect, useState } from "react";
import { useOperations } from "../operations/OperationsContext";
import { useAuth } from "../auth/AuthContext";
const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function CatalogueListingsPage() {
  const operations = useOperations();
  const { loadCatalogue, token } = operations;
  const { can } = useAuth();
  const [selected, setSelected] = useState<AdminListingReview>();
  const [note, setNote] = useState("");
  const listing =
    operations.listings.find((item) => item.id === selected?.id) ?? operations.listings[0];
  useEffect(() => {
    if (token) void loadCatalogue();
  }, [token, loadCatalogue]);
  async function decide(decision: "approve" | "changes") {
    if (!listing) return;
    operations.setLoading(true);
    try {
      if (decision === "approve")
        await approveAdminListing(
          { baseUrl, accessToken: operations.token },
          listing.id,
          note || undefined,
        );
      else
        await requestAdminListingChanges(
          { baseUrl, accessToken: operations.token },
          listing.id,
          note,
        );
      setNote("");
      operations.setMessage(decision === "approve" ? "Listing approved." : "Changes requested.");
      await operations.loadCatalogue();
    } catch (error) {
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
          {!operations.listings.length ? (
            <Empty token={operations.token} load={operations.loadCatalogue} />
          ) : null}
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
              </dl>
              {can("catalogue.review") ? (
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
                      disabled={operations.loading}
                      onClick={() => void decide("approve")}
                    >
                      Approve listing
                    </button>
                    <button
                      disabled={operations.loading || note.trim().length < 3}
                      onClick={() => void decide("changes")}
                    >
                      Request changes
                    </button>
                  </div>
                </>
              ) : (
                <p className="read-only-notice">You have read-only access to catalogue reviews.</p>
              )}
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
  const { loadCatalogue, token } = operations;
  const { can } = useAuth();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (token) void loadCatalogue();
  }, [token, loadCatalogue]);
  async function decide(id: string, decision: "approve" | "reject") {
    operations.setLoading(true);
    try {
      await reviewAdminPrice(
        { baseUrl, accessToken: operations.token },
        id,
        decision,
        note || undefined,
      );
      setNote("");
      operations.setMessage(`Price request ${decision === "approve" ? "approved" : "rejected"}.`);
      await operations.loadCatalogue();
    } catch (error) {
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
      <section className="price-queue">
        {can("catalogue.review") ? (
          <textarea
            aria-label="Review note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional review note"
          />
        ) : (
          <p className="read-only-notice">You have read-only access to price changes.</p>
        )}
        {operations.prices.map((price) => (
          <div className="price-request" key={price.requestId}>
            <div>
              <strong>
                {price.productName} · {price.vendorName}
              </strong>
              <p>
                UGX {price.currentPriceUgx?.toLocaleString() ?? "—"} → UGX{" "}
                {price.proposedPriceUgx.toLocaleString()}
              </p>
            </div>
            {can("catalogue.review") ? (
              <div className="actions">
                <button
                  className="approve"
                  disabled={operations.loading}
                  onClick={() => void decide(price.requestId, "approve")}
                >
                  Approve
                </button>
                <button
                  disabled={operations.loading}
                  onClick={() => void decide(price.requestId, "reject")}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {!operations.prices.length ? (
          <Empty token={operations.token} load={operations.loadCatalogue} />
        ) : null}
      </section>
    </>
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
function Empty({ token, load }: { token: string; load: () => Promise<void> }) {
  return (
    <div className="empty-state">
      <strong>No queue data</strong>
      <p>
        {token
          ? "Refresh to check for pending work."
          : "Sign in again to reconnect to the operations API."}
      </p>
      {token ? <button onClick={() => void load()}>Refresh queue</button> : null}
    </div>
  );
}
