import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyStandardWebhook } from "./standard-webhook.js";

const secretBytes = Buffer.from("a sufficiently long local hook secret", "utf8");
const secret = `v1,whsec_${secretBytes.toString("base64")}`;
const payload = Buffer.from('{"hello":"world"}', "utf8");
const timestamp = "1720000000";
const id = "msg_test";

function signature(body = payload): string {
  return `v1,${createHmac("sha256", secretBytes)
    .update(Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]))
    .digest("base64")}`;
}

describe("verifyStandardWebhook", () => {
  it("accepts an authentic Standard Webhooks signature", () => {
    expect(
      verifyStandardWebhook(
        payload,
        { id, timestamp, signature: signature() },
        secret,
        Number(timestamp),
      ),
    ).toBe(true);
  });

  it("rejects a modified payload", () => {
    expect(
      verifyStandardWebhook(
        Buffer.from('{"hello":"modified"}'),
        { id, timestamp, signature: signature() },
        secret,
        Number(timestamp),
      ),
    ).toBe(false);
  });

  it("rejects stale requests", () => {
    expect(
      verifyStandardWebhook(
        payload,
        { id, timestamp, signature: signature() },
        secret,
        Number(timestamp) + 301,
      ),
    ).toBe(false);
  });
});
