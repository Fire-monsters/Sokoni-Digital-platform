import {
  approveAdminListing,
  fetchAdminListingQueue,
  fetchAdminPriceQueue,
  requestAdminListingChanges,
  reviewAdminPrice,
} from "@sokoni-digital/api-client";
import type { AdminListingReview, AdminPriceReview } from "@sokoni-digital/domain";
import { useCallback, useState } from "react";
import "./App.css";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem("operations-token") ?? "");
  const [listings, setListings] = useState<AdminListingReview[]>([]);
  const [selected, setSelected] = useState<AdminListingReview>();
  const [prices, setPrices] = useState<AdminPriceReview[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      sessionStorage.setItem("operations-token", token);
      const [result, priceResult] = await Promise.all([
        fetchAdminListingQueue({ baseUrl, accessToken: token }),
        fetchAdminPriceQueue({ baseUrl, accessToken: token }),
      ]);
      setListings(result.listings);
      setPrices(priceResult.requests);
      setSelected(
        (current) => result.listings.find((item) => item.id === current?.id) ?? result.listings[0],
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load review queue.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const decide = async (decision: "approve" | "changes") => {
    if (!selected) return;
    setLoading(true);
    try {
      if (decision === "approve") {
        await approveAdminListing({ baseUrl, accessToken: token }, selected.id, note || undefined);
      } else {
        await requestAdminListingChanges({ baseUrl, accessToken: token }, selected.id, note);
      }
      setNote("");
      setMessage(
        decision === "approve" ? "Listing and price approved." : "Changes requested from vendor.",
      );
      await loadQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setLoading(false);
    }
  };

  const decidePrice = async (requestId: string, decision: "approve" | "reject") => {
    setLoading(true);
    try {
      await reviewAdminPrice(
        { baseUrl, accessToken: token },
        requestId,
        decision,
        note || undefined,
      );
      setMessage(`Price request ${decision === "approve" ? "approved" : "rejected"}.`);
      setNote("");
      await loadQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Price review failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="operations-shell">
      <header>
        <p className="eyebrow">Sokoni operations</p>
        <h1>Listing approval queue</h1>
        <div className="token-row">
          <input
            aria-label="Administrator access token"
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste administrator bearer token"
            type="password"
            value={token}
          />
          <button disabled={!token || loading} onClick={() => void loadQueue()}>
            Refresh
          </button>
        </div>
      </header>

      {message ? <p className="message">{message}</p> : null}
      <div className="review-layout">
        <aside>
          <h2>Pending ({listings.length})</h2>
          {listings.map((listing) => (
            <button
              className={selected?.id === listing.id ? "queue-item selected" : "queue-item"}
              key={listing.id}
              onClick={() => setSelected(listing)}
            >
              <strong>{listing.productName}</strong>
              <span>{listing.vendorName}</span>
            </button>
          ))}
          {!loading && listings.length === 0 ? <p>The queue is clear.</p> : null}
        </aside>

        <section className="review-card">
          {selected ? (
            <>
              <div className="review-heading">
                <div>
                  <p className="eyebrow">{selected.categoryName}</p>
                  <h2>{selected.productName}</h2>
                  <p>
                    {selected.vendorName} · {selected.marketName ?? "No market"}
                  </p>
                </div>
                <strong>
                  UGX {selected.latestPriceRequest?.proposedPriceUgx.toLocaleString() ?? "—"}
                </strong>
              </div>
              <div className="image-row">
                {selected.images.map((image) => (
                  <img
                    alt={selected.productName}
                    key={image.id}
                    src={image.thumbnailUrl ?? image.url}
                  />
                ))}
              </div>
              <dl>
                <dt>Package</dt>
                <dd>
                  {selected.packageQuantity} {selected.packageUnit}
                </dd>
                <dt>Availability</dt>
                <dd>{selected.availability.replace("_", " ")}</dd>
                <dt>Description</dt>
                <dd>{selected.description || "No description"}</dd>
              </dl>
              <textarea
                aria-label="Review note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Review note or required changes"
                value={note}
              />
              <div className="actions">
                <button
                  className="approve"
                  disabled={loading}
                  onClick={() => void decide("approve")}
                >
                  Approve listing and price
                </button>
                <button
                  disabled={loading || note.trim().length < 3}
                  onClick={() => void decide("changes")}
                >
                  Request changes
                </button>
              </div>
            </>
          ) : (
            <p>Select a pending listing to review.</p>
          )}
        </section>
      </div>

      <section className="price-queue">
        <h2>Pending price changes ({prices.length})</h2>
        {prices.map((price) => (
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
            <div className="actions">
              <button
                className="approve"
                disabled={loading}
                onClick={() => void decidePrice(price.requestId, "approve")}
              >
                Approve price
              </button>
              <button
                disabled={loading}
                onClick={() => void decidePrice(price.requestId, "reject")}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export default App;
