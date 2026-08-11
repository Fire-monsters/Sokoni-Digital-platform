import {
  submitOrderResponseSchema,
  tokenResponseSchema,
  transactionStatusResponseSchema,
} from "./pesapal.schemas.js";
import { PesapalRequestError } from "./pesapal.errors.js";

export interface PesapalClientOptions {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  notificationId: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface PesapalSubmitOrderInput {
  id: string;
  amount: number;
  currency: "UGX";
  description: string;
  callbackUrl: string;
  cancellationUrl: string;
  phoneNumber?: string;
  emailAddress?: string;
  firstName?: string;
  lastName?: string;
}

export class PesapalClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private tokenCache: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly options: PesapalClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async submitOrder(input: PesapalSubmitOrderInput) {
    return submitOrderResponseSchema.parse(
      await this.request(
        "/api/Transactions/SubmitOrderRequest",
        {
          method: "POST",
          body: JSON.stringify({
            id: input.id,
            currency: input.currency,
            amount: input.amount,
            description: input.description.slice(0, 100),
            callback_url: input.callbackUrl,
            cancellation_url: input.cancellationUrl,
            redirect_mode: "TOP_WINDOW",
            notification_id: this.options.notificationId,
            billing_address: {
              phone_number: input.phoneNumber ?? "",
              email_address: input.emailAddress ?? "",
              country_code: "UG",
              first_name: input.firstName ?? "",
              last_name: input.lastName ?? "",
            },
          }),
        },
        true,
      ),
    );
  }

  async getTransactionStatus(orderTrackingId: string) {
    const query = new URLSearchParams({ orderTrackingId });
    return transactionStatusResponseSchema.parse(
      await this.request(`/api/Transactions/GetTransactionStatus?${query.toString()}`, {
        method: "GET",
      }),
    );
  }

  private async request(path: string, init: RequestInit, ambiguousOnTransportFailure = false) {
    const token = await this.getToken();
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...Object.fromEntries(new Headers(init.headers).entries()),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new PesapalRequestError(
        cause instanceof Error ? cause.message : "Pesapal could not be reached.",
        ambiguousOnTransportFailure,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        extractPesapalMessage(payload) ?? `Pesapal returned HTTP ${String(response.status)}.`;
      throw new PesapalRequestError(
        message,
        ambiguousOnTransportFailure && response.status >= 500,
        response.status,
      );
    }
    return payload;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 15_000) {
      return this.tokenCache.value;
    }
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async requestToken(): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.options.baseUrl}/api/Auth/RequestToken`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          consumer_key: this.options.consumerKey,
          consumer_secret: this.options.consumerSecret,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new PesapalRequestError(
        cause instanceof Error ? cause.message : "Pesapal authentication failed.",
        false,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PesapalRequestError(
        extractPesapalMessage(payload) ?? "Pesapal authentication was rejected.",
        false,
        response.status,
      );
    }
    const parsed = tokenResponseSchema.parse(payload);
    const parsedExpiry = new Date(parsed.expiryDate).getTime();
    this.tokenCache = {
      value: parsed.token,
      expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : Date.now() + 4 * 60_000,
    };
    return parsed.token;
  }
}

function extractPesapalMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.message === "string" && record.message) return record.message;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  return undefined;
}
