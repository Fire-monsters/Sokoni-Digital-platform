import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@sokoni-digital/database-types";

import { supabase } from "../../infrastructure/supabase/client.js";

export interface ClaimedNotificationDelivery {
  id: string;
  eventId: string;
  channel: "push" | "sms";
  attemptCount: number;
}

export interface NotificationEventRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  priority: "normal" | "critical";
  payload: Record<string, unknown>;
}

export interface NotificationRepository {
  claim(batchSize: number, leaseSeconds: number): Promise<ClaimedNotificationDelivery[]>;
  getEvent(eventId: string): Promise<NotificationEventRecord>;
  resolveDestination(userId: string, channel: "push" | "sms"): Promise<string | null>;
  complete(deliveryId: string, destination: string, providerReference: string): Promise<void>;
  fail(
    deliveryId: string,
    reason: string,
    retrySeconds: number,
    maxAttempts: number,
    smsFallback: boolean,
  ): Promise<void>;
}

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}

  async claim(batchSize: number, leaseSeconds: number): Promise<ClaimedNotificationDelivery[]> {
    const { data, error } = await this.db.rpc("claim_notification_deliveries", {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(error.message);
    return data.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      channel: row.channel,
      attemptCount: row.attempt_count,
    }));
  }

  async getEvent(eventId: string): Promise<NotificationEventRecord> {
    const { data, error } = await this.db
      .from("notification_events")
      .select("id,user_id,title,body,priority,payload")
      .eq("id", eventId)
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      body: data.body,
      priority: data.priority,
      payload: data.payload as Record<string, unknown>,
    };
  }

  async resolveDestination(userId: string, channel: "push" | "sms"): Promise<string | null> {
    if (channel === "push") {
      const { data, error } = await this.db
        .from("notification_devices")
        .select("expo_push_token")
        .eq("user_id", userId)
        .eq("enabled", true)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.expo_push_token ?? null;
    }
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw new Error(error.message);
    return data.user.phone ?? null;
  }

  async complete(
    deliveryId: string,
    destination: string,
    providerReference: string,
  ): Promise<void> {
    const { error } = await this.db.rpc("complete_notification_delivery", {
      p_delivery_id: deliveryId,
      p_destination: destination,
      p_provider_reference: providerReference,
    });
    if (error) throw new Error(error.message);
  }

  async fail(
    deliveryId: string,
    reason: string,
    retrySeconds: number,
    maxAttempts: number,
    smsFallback: boolean,
  ): Promise<void> {
    const { error } = await this.db.rpc("fail_notification_delivery", {
      p_delivery_id: deliveryId,
      p_reason: reason,
      p_retry_seconds: retrySeconds,
      p_max_attempts: maxAttempts,
      p_enable_sms_fallback: smsFallback,
    });
    if (error) throw new Error(error.message);
  }
}
