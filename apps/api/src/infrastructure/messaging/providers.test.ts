import { describe, expect, it, vi } from "vitest";
import { YoolaSmsAdapter } from "./providers.js";

const message = {
  title: "Order update",
  body: "Your order is ready.",
  data: {},
};

describe("YoolaSmsAdapter", () => {
  it("sends JSON to Yoola and returns its message id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "success", message_id: "YL-123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const receipt = await new YoolaSmsAdapter("secret", fetcher).send("+256704487563", message);

    expect(receipt).toEqual({ providerReference: "YL-123" });
    expect(fetcher).toHaveBeenCalledWith("https://yoolasms.com/api/v1/send_sms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: "secret",
        phone: "256704487563",
        message: "Your order is ready.",
      }),
    });
  });

  it("fails before making a request when the API key is missing", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      new YoolaSmsAdapter(undefined, fetcher).send("+256704487563", message),
    ).rejects.toThrow("Yoola notification SMS is not configured.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces a Yoola API error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "error", message: "Invalid API key" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      new YoolaSmsAdapter("bad-key", fetcher).send("256704487563", message),
    ).rejects.toThrow("Invalid API key");
  });
});
