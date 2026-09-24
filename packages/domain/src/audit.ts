export interface AuditActor {
  staffId: string;
  name: string;
  role: string;
}

export interface AuditEntity {
  type: string;
  id: string;
  reference: string | null;
}

export interface AuditRequestContext {
  ip: string | null;
  device: string | null;
  userAgent: string | null;
}

export interface AuditEventRow {
  id: string;
  actor: AuditActor | null;
  action: string;
  entity: AuditEntity;
  reason: string;
  operationId: string | null;
  requestId: string | null;
  context: AuditRequestContext;
  occurredAt: string;
}

export interface AuditEventDetail extends AuditEventRow {
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  details: Record<string, unknown>;
}

export interface AuditEventPage {
  data: AuditEventRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AuditEventQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  staffUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  sortBy?: "occurredAt" | "action" | "entityType";
  sortOrder?: "asc" | "desc";
}
