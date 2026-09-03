import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "v1,whsec_";
const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export interface StandardWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

export function verifyStandardWebhook(
  payload: Buffer,
  headers: StandardWebhookHeaders,
  configuredSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  if (!configuredSecret.startsWith(SECRET_PREFIX)) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const encodedSecret = configuredSecret.slice(SECRET_PREFIX.length);
  let secret: Buffer;
  try {
    secret = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }
  if (
    secret.length === 0 ||
    secret.toString("base64").replace(/=+$/, "") !== encodedSecret.replace(/=+$/, "")
  ) {
    return false;
  }

  const signedContent = Buffer.concat([
    Buffer.from(`${headers.id}.${headers.timestamp}.`, "utf8"),
    payload,
  ]);
  const expected = createHmac("sha256", secret).update(signedContent).digest();

  return headers.signature.split(" ").some((candidate) => {
    const [version, encodedSignature] = candidate.split(",", 2);
    if (version !== "v1" || !encodedSignature) return false;
    let actual: Buffer;
    try {
      actual = Buffer.from(encodedSignature, "base64");
    } catch {
      return false;
    }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
