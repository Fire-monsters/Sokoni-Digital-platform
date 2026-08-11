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

export class TwilioSmsAdapter implements SmsAdapter {
  constructor(
    private readonly accountSid?: string,
    private readonly authToken?: string,
    private readonly messagingServiceSid?: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(destination: string, message: NotificationMessage): Promise<DeliveryReceipt> {
    if (!this.accountSid || !this.authToken || !this.messagingServiceSid) {
      throw new Error("Twilio notification SMS is not configured.");
    }
    const body = new URLSearchParams({
      To: destination,
      MessagingServiceSid: this.messagingServiceSid,
      Body: message.body,
    });
    const response = await this.fetcher(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const payload = (await response.json()) as { sid?: string; message?: string };
    if (!response.ok || !payload.sid) {
      throw new Error(payload.message ?? `Twilio SMS failed with HTTP ${String(response.status)}.`);
    }
    return { providerReference: payload.sid };
  }
}
