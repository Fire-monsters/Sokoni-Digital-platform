import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createRateLimit } from "./rate-limit.js";

describe("createRateLimit", () => {
  it("returns retry metadata after the configured request budget", async () => {
    const app = express();
    app.use((incoming, _response, next) => {
      incoming.requestId = "rate-limit-test";
      next();
    });
    app.get(
      "/limited",
      createRateLimit({ namespace: "test", windowMs: 60_000, maxRequests: 2 }),
      (_incoming, response) => response.status(204).end(),
    );

    expect((await request(app).get("/limited")).status).toBe(204);
    expect((await request(app).get("/limited")).status).toBe(204);
    const blocked = await request(app).get("/limited");

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("60");
    expect(blocked.body).toMatchObject({
      success: false,
      error: { code: "RATE_LIMITED", requestId: "rate-limit-test" },
    });
  });

  it("opens a new budget after the window expires", async () => {
    let timestamp = 1_000;
    const app = express();
    app.use((incoming, _response, next) => {
      incoming.requestId = "rate-limit-reset-test";
      next();
    });
    app.get(
      "/limited",
      createRateLimit({
        namespace: "test-reset",
        windowMs: 1_000,
        maxRequests: 1,
        now: () => timestamp,
      }),
      (_incoming, response) => response.status(204).end(),
    );

    expect((await request(app).get("/limited")).status).toBe(204);
    expect((await request(app).get("/limited")).status).toBe(429);
    timestamp += 1_000;
    expect((await request(app).get("/limited")).status).toBe(204);
  });
});
