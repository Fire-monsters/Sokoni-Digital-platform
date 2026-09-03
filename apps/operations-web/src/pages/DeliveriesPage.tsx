import { useEffect } from "react";
import { DeliveryBoard } from "../DeliveryBoard";
import { useOperations } from "../operations/OperationsContext";
import { useAuth } from "../auth/AuthContext";
import { ErrorPage, LoadingPage } from "./PageStates";
export function DeliveriesPage() {
  const o = useOperations();
  const { loadDeliveries, token } = o;
  const { can } = useAuth();
  useEffect(() => {
    if (token) void loadDeliveries();
  }, [token, loadDeliveries]);
  if (o.loading && o.deliveryBoard.deliveries.length === 0)
    return <LoadingPage title="Loading delivery control room…" />;
  if (o.message && o.deliveryBoard.deliveries.length === 0)
    return <ErrorPage description={o.message} onRetry={() => void o.loadDeliveries()} />;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">Dispatch centre</p>
          <h1>Deliveries</h1>
          <p>Coordinate assignments and resolve delivery exceptions.</p>
        </div>
      </div>
      {o.message ? (
        <p className="message" role="status">
          {o.message}
        </p>
      ) : null}
      <DeliveryBoard
        token={o.token}
        board={o.deliveryBoard}
        riders={o.riders}
        busy={o.loading}
        onBusy={o.setLoading}
        onMessage={o.setMessage}
        onReload={o.loadDeliveries}
        canManage={can("deliveries.manage")}
      />
    </>
  );
}
