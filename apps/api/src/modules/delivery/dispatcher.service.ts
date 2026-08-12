import type {
  DispatcherAssignmentResult,
  DispatcherDeliveryBoard,
  DispatcherRider,
  DispatcherDeliveryAction,
  DispatcherDeliveryActionResult,
  DeliveryIssueResult,
} from "@sokoni-digital/domain";
import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../../infrastructure/supabase/client.js";
import { mapRiderOperationsDatabaseError } from "./delivery.errors.js";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Dispatcher operation returned invalid data.");
  return value as Record<string, unknown>;
}

export class DispatcherService {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async getBoard(): Promise<DispatcherDeliveryBoard> {
    const { data, error } = await this.db.rpc("get_dispatcher_delivery_board");
    if (error) throw mapRiderOperationsDatabaseError(error);
    return data as unknown as DispatcherDeliveryBoard;
  }

  async getRiders(): Promise<DispatcherRider[]> {
    const { data, error } = await this.db.rpc("get_dispatcher_riders");
    if (error) throw mapRiderOperationsDatabaseError(error);
    return data as unknown as DispatcherRider[];
  }

  async getNearbyRiders(deliveryId: string, radiusKm: number): Promise<DispatcherRider[]> {
    const { data, error } = await this.db.rpc("get_dispatcher_nearby_riders", {
      p_delivery_id: deliveryId,
      p_radius_km: radiusKm,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    return data as unknown as DispatcherRider[];
  }

  async assign(
    dispatcherUserId: string,
    deliveryId: string,
    reassign: boolean,
    input: { transporterId: string; reason: string; expectedVersion: number; operationId: string },
  ): Promise<DispatcherAssignmentResult> {
    const { data, error } = await this.db.rpc("dispatcher_assign_delivery", {
      p_delivery_id: deliveryId,
      p_transporter_id: input.transporterId,
      p_dispatcher_user_id: dispatcherUserId,
      p_reason: input.reason,
      p_expected_version: input.expectedVersion,
      p_operation_id: input.operationId,
      p_reassign: reassign,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = object(data);
    return {
      deliveryId: String(value.deliveryId),
      transporterId: String(value.transporterId),
      previousTransporterId:
        typeof value.previousTransporterId === "string" ? value.previousTransporterId : null,
      status: "assigned",
      version: Number(value.version),
      operationId: String(value.operationId),
      duplicate: Boolean(value.duplicate),
    };
  }

  async resolveIssue(
    dispatcherUserId: string,
    issueId: string,
    input: { resolutionCode: string; resolutionNote: string; operationId: string },
  ): Promise<DeliveryIssueResult> {
    const { data, error } = await this.db.rpc("resolve_delivery_issue", {
      p_issue_id: issueId,
      p_dispatcher_user_id: dispatcherUserId,
      p_resolution_code: input.resolutionCode,
      p_resolution_note: input.resolutionNote,
      p_operation_id: input.operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = object(data);
    return {
      issueId: String(value.issueId),
      deliveryId: typeof value.deliveryId === "string" ? value.deliveryId : "",
      status: "resolved",
      duplicate: Boolean(value.duplicate),
    };
  }

  async performAction(
    dispatcherUserId: string,
    deliveryId: string,
    input: {
      action: DispatcherDeliveryAction;
      reason: string;
      expectedVersion: number;
      operationId: string;
    },
  ): Promise<DispatcherDeliveryActionResult> {
    const { data, error } = await this.db.rpc("dispatcher_delivery_action", {
      p_delivery_id: deliveryId,
      p_dispatcher_user_id: dispatcherUserId,
      p_action: input.action,
      p_reason: input.reason,
      p_expected_version: input.expectedVersion,
      p_operation_id: input.operationId,
    });
    if (error) throw mapRiderOperationsDatabaseError(error);
    const value = object(data);
    return {
      deliveryId: String(value.deliveryId),
      action: String(value.action) as DispatcherDeliveryAction,
      status: String(value.status) as DispatcherDeliveryActionResult["status"],
      version: Number(value.version),
      operationId: String(value.operationId),
      contactPhoneNumber:
        typeof value.contactPhoneNumber === "string" ? value.contactPhoneNumber : null,
      duplicate: Boolean(value.duplicate),
    };
  }
}
