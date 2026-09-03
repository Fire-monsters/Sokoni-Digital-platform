import type { Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function captureSignedWebhookRawBody(
  request: Request,
  _response: Response,
  body: Buffer,
): void {
  const path = request.originalUrl.split("?", 1)[0];
  if (path === "/v1/payments/callbacks/pesapal" || path === "/v1/auth/hooks/send-sms") {
    request.rawBody = Buffer.from(body);
  }
}
