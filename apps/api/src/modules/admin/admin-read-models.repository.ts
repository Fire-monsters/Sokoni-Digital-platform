import { supabase } from "../../infrastructure/supabase/client.js";
import type {
  AdminOperationalOverview,
  AdminApplicationsQuery,
  AdminApplicationRow,
  AdminOrderInvestigation,
  AdminOrdersQuery,
  AdminOrderRow,
  AdminOverviewQuery,
  AdminPaymentReconciliationQuery,
  AdminPaymentReconciliationRow,
  AdminReadModelReader,
  AdminRefundsQuery,
  AdminRefundRow,
  AdminSettlementsQuery,
  AdminSettlementRow,
  AdminAuditEventsQuery,
  AdminAuditEventRow,
  AdminAuditEventDetail,
} from "./admin-read-models.types.js";
import { createAdminPagination, type AdminPage } from "./admin-query.js";

interface RpcError {
  code?: string;
  message: string;
}

class AdminReadModelNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

interface AdminRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

interface AdminStorageClient {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresIn: number,
    ): Promise<{
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    }>;
  };
}

export class AdminReadModelsRepository implements AdminReadModelReader {
  constructor(
    private readonly db: AdminRpcClient = supabase,
    private readonly storage: AdminStorageClient | undefined = db === supabase
      ? supabase.storage
      : undefined,
  ) {}

  async getOverview(query: AdminOverviewQuery): Promise<AdminOperationalOverview> {
    const { data, error } = await this.db.rpc("admin_get_operational_overview", {
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
    });
    if (error) throw new Error(error.message);
    return data as AdminOperationalOverview;
  }

  async listOrders(query: AdminOrdersQuery): Promise<AdminPage<AdminOrderRow>> {
    const { data, error } = await this.db.rpc("admin_list_orders", {
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.q,
      p_market_id: query.marketId,
      p_vendor_id: query.vendorId,
      p_fulfilment_type: query.fulfilmentType,
      p_payment_status: query.paymentStatus,
      p_seller_order_status: query.sellerOrderStatus,
      p_delivery_status: query.deliveryStatus,
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
      p_delayed_only: query.delayedOnly,
      p_issues_only: query.issuesOnly,
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
    });
    if (error) throw new Error(error.message);
    return data as AdminPage<AdminOrderRow>;
  }

  async getOrder(orderId: string): Promise<AdminOrderInvestigation> {
    const { data, error } = await this.db.rpc("admin_get_order_investigation", {
      p_order_id: orderId,
    });
    if (error?.code === "P0002") {
      throw new AdminReadModelNotFoundError("Order was not found.");
    }
    if (error) throw new Error(error.message);
    return this.signOrderEvidence(data as AdminOrderInvestigation);
  }

  private async signOrderEvidence(
    order: AdminOrderInvestigation,
  ): Promise<AdminOrderInvestigation> {
    const raw = order as unknown as {
      vendors: { evidence: RawOrderEvidence[] }[];
      delivery: ({ evidence: RawOrderEvidence[] } & Record<string, unknown>) | null;
    };
    const evidence = [
      ...raw.vendors.flatMap((vendor) => vendor.evidence),
      ...(raw.delivery?.evidence ?? []),
    ];
    if (evidence.length === 0) return order;
    if (!this.storage) throw new Error("Private order evidence signer is unavailable.");
    const signed = new Map<string, { url: string; thumbnailUrl: string | null }>();
    await Promise.all(
      evidence.map(async (item) => {
        const url = await this.signPrivateObject(item.storageBucket, item.storagePath);
        const thumbnailUrl = item.thumbnailPath
          ? await this.signPrivateObject(item.storageBucket, item.thumbnailPath)
          : null;
        signed.set(item.id, { url, thumbnailUrl });
      }),
    );
    const project = ({
      storageBucket: _bucket,
      storagePath: _path,
      thumbnailPath: _thumbnail,
      ...item
    }: RawOrderEvidence) => {
      const urls = signed.get(item.id);
      if (!urls) throw new Error("Private order evidence could not be loaded.");
      return { ...item, ...urls };
    };
    return {
      ...order,
      vendors: order.vendors.map((vendor, index) => ({
        ...vendor,
        evidence: raw.vendors[index]?.evidence.map(project) ?? [],
      })),
      delivery:
        order.delivery && raw.delivery
          ? { ...order.delivery, evidence: raw.delivery.evidence.map(project) }
          : null,
    };
  }

  private async signPrivateObject(bucket: string, path: string) {
    if (!this.storage) throw new Error("Private order evidence signer is unavailable.");
    const result = await this.storage.from(bucket).createSignedUrl(path, 300);
    if (result.error || !result.data)
      throw new Error("Private order evidence could not be loaded.");
    return result.data.signedUrl;
  }

  async listApplications(query: AdminApplicationsQuery): Promise<AdminPage<AdminApplicationRow>> {
    const { data, error } = await this.db.rpc("admin_list_applications", {
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.q,
      p_type: query.type,
      p_status: query.status,
      p_market_id: query.marketId,
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
    });
    if (error) throw new Error(error.message);
    return data as AdminPage<AdminApplicationRow>;
  }

  async listPaymentReconciliation(
    query: AdminPaymentReconciliationQuery,
  ): Promise<AdminPage<AdminPaymentReconciliationRow>> {
    const { data, error } = await this.db.rpc("admin_list_payment_reconciliation", {
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.q,
      p_provider: query.provider,
      p_payment_method: query.paymentMethod,
      p_status: query.status,
      p_reconciliation_status: query.reconciliationStatus,
      p_callback_status: query.callbackStatus,
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
    });
    if (error) throw new Error(error.message);
    return data as AdminPage<AdminPaymentReconciliationRow>;
  }

  async listRefunds(query: AdminRefundsQuery): Promise<AdminPage<AdminRefundRow>> {
    const { data, error } = await this.db.rpc("admin_list_refunds", {
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.q,
      p_status: query.status,
      p_reason: query.reason,
      p_approval_state: query.approvalState,
      p_min_amount: query.minAmount,
      p_max_amount: query.maxAmount,
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
    });
    if (error) throw new Error(error.message);
    return data as AdminPage<AdminRefundRow>;
  }

  async listSettlements(query: AdminSettlementsQuery): Promise<AdminPage<AdminSettlementRow>> {
    return Promise.resolve({
      data: [],
      pagination: createAdminPagination(query.page, query.pageSize, 0),
    });
  }

  async listAuditEvents(query: AdminAuditEventsQuery): Promise<AdminPage<AdminAuditEventRow>> {
    const { data, error } = await this.db.rpc("admin_list_audit_events", {
      p_page: query.page,
      p_page_size: query.pageSize,
      p_query: query.q,
      p_staff_user_id: query.staffUserId,
      p_action: query.action,
      p_entity_type: query.entityType,
      p_entity_id: query.entityId,
      p_from: query.from?.toISOString(),
      p_to: query.to?.toISOString(),
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
    });
    if (error) throw new Error(error.message);
    return data as AdminPage<AdminAuditEventRow>;
  }

  async getAuditEvent(eventId: string): Promise<AdminAuditEventDetail> {
    const { data, error } = await this.db.rpc("admin_get_audit_event", { p_event_id: eventId });
    if (error?.code === "P0002") {
      throw new AdminReadModelNotFoundError("Audit event was not found.");
    }
    if (error) throw new Error(error.message);
    return data as AdminAuditEventDetail;
  }
}

interface RawOrderEvidence {
  id: string;
  storageBucket: string;
  storagePath: string;
  thumbnailPath: string | null;
  capturedAt: string;
  isPackingProof?: boolean;
  mimeType?: string;
}
