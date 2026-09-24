export type OrderContactTarget = "consumer" | "rider";
export type OrderInvestigationAction =
  "notes" | "reveal-contact" | "resend-notification" | "escalate-dispatch" | "cancel";

export interface OrderInvestigationCommandResult {
  orderId: string;
  id?: string;
  deliveryId?: string;
  issueId?: string;
  phoneNumber?: string;
  status: string;
  duplicate: boolean;
}

export interface OrderEvidence {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  isPackingProof?: boolean;
  mimeType?: string;
  capturedAt: string;
}

export interface OrderInvestigation {
  order: {
    id: string;
    reference: string;
    status: string;
    fulfilmentType: string;
    market: { id: string; name: string };
    pricing: {
      itemsSubtotal: number;
      deliveryFee: number;
      serviceFee: number;
      total: number;
      currency: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  consumer: { id: string; name: string; phoneMasked: string };
  deliveryAddress: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  vendors: {
    vendor: { id: string; name: string; market: { id: string; name: string } };
    sellerOrder: Record<string, unknown> & { id: string; reference: string; status: string };
    items: (Record<string, unknown> & { id: string; productName: string; quantity: number })[];
    evidence: OrderEvidence[];
  }[];
  delivery:
    | (Record<string, unknown> & {
        id: string;
        reference: string;
        status: string;
        version: number;
        rider: { id: string; name: string; phoneMasked: string | null } | null;
        issues: Record<string, unknown>[];
        evidence: OrderEvidence[];
      })
    | null;
  timeline: {
    type: string;
    entityId: string;
    fromStatus: string | null;
    toStatus: string | null;
    actorId: string | null;
    details: Record<string, unknown>;
    occurredAt: string;
  }[];
  notifications: {
    id: string;
    type: string;
    entityType: string;
    title: string;
    body: string;
    priority: string;
    createdAt: string;
    deliveries: { channel: string; status: string; attemptCount: number }[];
  }[];
  refunds: {
    id: string;
    requestedAmount: number;
    currency: string;
    reason: string;
    status: string;
    approvalState: string;
    createdAt: string;
  }[];
  supportNotes: {
    id: string;
    note: string;
    createdAt: string;
    author: { id: string; name: string };
  }[];
}
