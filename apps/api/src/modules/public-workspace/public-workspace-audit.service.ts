import { randomUUID } from "node:crypto";
import type { PublicWorkspaceAuditRecord } from "@sokoni-digital/domain";
import type { Json } from "@sokoni-digital/database-types";
import { supabase } from "../../infrastructure/supabase/client.js";

export interface PublicWorkspaceAuditRecorder {
  record(event: PublicWorkspaceAuditRecord): Promise<void>;
  getRecordedEvents?(): PublicWorkspaceAuditRecord[];
}

export class InMemoryPublicWorkspaceAuditRecorder implements PublicWorkspaceAuditRecorder {
  private events: PublicWorkspaceAuditRecord[] = [];

  async record(event: PublicWorkspaceAuditRecord): Promise<void> {
    this.events.push(event);
  }

  getRecordedEvents(): PublicWorkspaceAuditRecord[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

export class SupabasePublicWorkspaceAuditRecorder implements PublicWorkspaceAuditRecorder {
  async record(event: PublicWorkspaceAuditRecord): Promise<void> {
    try {
      // Record into wholesale_audit_events if warehouse, or generic audit events
      await supabase.from("wholesale_audit_events").insert({
        id: randomUUID(),
        actor_id: event.actorId,
        action: event.action,
        entity_type: event.resourceType,
        entity_id: event.resourceId,
        operation_id: randomUUID(),
        details: {
          actorType: event.actorType,
          workspace: event.workspace,
          warehouseId: event.warehouseId ?? null,
          correlationId: event.correlationId,
          reason: event.reason ?? null,
          before: (event.before ?? null) as Json,
          after: (event.after ?? null) as Json,
        },
        created_at: event.timestamp,
      });
    } catch (error) {
      // In audit recording, avoid masking operation failures if db is unavailable
      console.warn("Public workspace audit record persistence failed:", error);
    }
  }
}

export class PublicWorkspaceAuditService {
  constructor(private readonly recorder: PublicWorkspaceAuditRecorder) {}

  async recordMutation(record: Omit<PublicWorkspaceAuditRecord, "actorType" | "timestamp"> & { timestamp?: string }): Promise<PublicWorkspaceAuditRecord> {
    const fullRecord: PublicWorkspaceAuditRecord = {
      ...record,
      actorType: "public-workspace",
      timestamp: record.timestamp ?? new Date().toISOString(),
    };

    await this.recorder.record(fullRecord);
    return fullRecord;
  }
}

export const defaultAuditRecorder = new SupabasePublicWorkspaceAuditRecorder();
export const defaultAuditService = new PublicWorkspaceAuditService(defaultAuditRecorder);
