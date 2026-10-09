import { Link } from "react-router-dom";
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page">
      <p className="eyebrow">Sokoni operations</p>
      <h1>{title}</h1>
      <p>This workspace is ready for its feature slice.</p>
      {title === "Orders" && (
        <p>
          <Link to="/dashboard/orders/demo-order-0">Inspect demo unpaid order</Link>
          {" · "}
          <Link to="/dashboard/orders/demo-order-1">Inspect demo paid order</Link>
        </p>
      )}
      <div className="placeholder-card">
        <span>Coming in a later slice</span>
        <h2>{title} workspace</h2>
        <p>
          The route and responsive application shell are in place. Operational data, filters and
          actions will be added without changing the navigation structure.
        </p>
      </div>
    </section>
  );
}
export function NotFoundPage() {
  return (
    <main className="not-found">
      <span>404</span>
      <h1>That page could not be found</h1>
      <p>The address may be incorrect or the page may have moved.</p>
      <Link className="button-link" to="/dashboard/overview">
        Return to overview
      </Link>
    </main>
  );
}
