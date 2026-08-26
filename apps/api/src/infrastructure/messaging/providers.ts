export interface NotificationMessage {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface DeliveryReceipt {
  providerReference: string;
}

export interface PushAdapter {
  send(destination: string, message: NotificationMessage): Promise<DeliveryReceipt>;
}

export interface SmsAdapter {
  send(destination: string, message: NotificationMessage): Promise<DeliveryReceipt>;
}

export class ExpoPushAdapter implements PushAdapter {
  constructor(
    private readonly accessToken?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(destination: string, message: NotificationMessage): Promise<DeliveryReceipt> {
    const headers = new Headers({ "content-type": "application/json", accept: "application/json" });
    if (this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    const response = await this.fetcher("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: destination,
        title: message.title,
        body: message.body,
        data: message.data,
      }),
    });
    const payload = (await response.json()) as {
      data?: { id?: string; status?: string; message?: string };
    };
    if (!response.ok || payload.data?.status === "error") {
      throw new Error(
        payload.data?.message ?? `Expo push failed with HTTP ${String(response.status)}.`,
      );
    }
    if (!payload.data?.id) throw new Error("Expo push did not return a ticket id.");
    return { providerReference: payload.data.id };
  }
}

export class YoolaSmsAdapter implements SmsAdapter {
  constructor(
    private readonly apiKey?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(destination: string, message: NotificationMessage): Promise<DeliveryReceipt> {
    if (!this.apiKey) {
      throw new Error("Yoola notification SMS is not configured.");
    }

    const response = await this.fetcher("https://yoolasms.com/api/v1/send_sms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        phone: destination.replace(/^\+/, ""),
        message: message.body,
      }),
    });
    const payload = (await response.json()) as {
      status?: string;
      message_id?: string;
      message?: string;
      error?: string;
    };
    if (!response.ok || payload.status !== "success" || !payload.message_id) {
      throw new Error(
        payload.error ??
          payload.message ??
          `Yoola SMS failed with HTTP ${String(response.status)}.`,
      );
    }
    return { providerReference: payload.message_id };
  }
}
