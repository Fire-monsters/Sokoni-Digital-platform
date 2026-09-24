import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../middleware/error-handler.js";
import type { CatalogueReviewRepository } from "./listing-approval.repository.js";
import { createListingApprovalRouter } from "./listing-approval.routes.js";

vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (
    incoming: express.Request,
    _response: express.Response,
    next: express.NextFunction,
  ) => {
    incoming.requestId = "catalogue-request";
    incoming.auth = {
      userId: "10000000-0000-4000-8000-000000000001",
      roles: ["admin"],
      staff: {
        userId: "10000000-0000-4000-8000-000000000001",
        displayName: "Catalogue reviewer",
        role: "agent",
        status: "active",
        permissions: ["catalogue.read", "catalogue.review"],
      },
    };
    next();
  },
}));
vi.mock("../../middleware/require-permission.js", () => ({
  requirePermission:
    () => (_request: express.Request, _response: express.Response, next: express.NextFunction) => {
      next();
    },
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("listing approval routes", () => {
  const listingId = "20000000-0000-4000-8000-000000000001";
  const priceRequestId = "30000000-0000-4000-8000-000000000001";
  const operationId = "40000000-0000-4000-8000-000000000001";
  const repository = {
    listPending: vi.fn(),
    listPendingPrices: vi.fn(),
    getListing: vi.fn(),
    reviewListing: vi.fn(),
    reviewPrice: vi.fn(),
  } satisfies CatalogueReviewRepository;

  beforeEach(() => vi.clearAllMocks());

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/admin", createListingApprovalRouter(repository));
    server.use(errorHandler);
    return server;
  }

  it("forwards a versioned, idempotent listing approval with staff context", async () => {
    repository.reviewListing.mockResolvedValue({
      listingId,
      requestId: priceRequestId,
      operationId,
      duplicate: false,
      status: "active",
      version: 4,
    });

    const response = await request(app()).post(`/v1/admin/listings/${listingId}/approve`).send({
      reviewNote: "Images and package verified",
      expectedVersion: 3,
      operationId,
    });

    expect(response.status).toBe(200);
    expect(repository.reviewListing).toHaveBeenCalledWith({
      listingId,
      adminId: "10000000-0000-4000-8000-000000000001",
      decision: "approved",
      reviewNote: "Images and package verified",
      expectedVersion: 3,
      operationId,
      auditContext: {
        requestId: "catalogue-request",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    });
  });

  it("requires a meaningful note when requesting listing changes", async () => {
    const response = await request(app())
      .post(`/v1/admin/listings/${listingId}/request-changes`)
      .send({ reviewNote: "", expectedVersion: 3, operationId });

    expect(response.status).toBe(400);
    expect(repository.reviewListing).not.toHaveBeenCalled();
  });

  it("requires a meaningful note when rejecting a price", async () => {
    const response = await request(app())
      .post(`/v1/admin/price-requests/${priceRequestId}/reject`)
      .send({ reviewNote: "", operationId });

    expect(response.status).toBe(400);
    expect(repository.reviewPrice).not.toHaveBeenCalled();
  });

  it("allows an approval note to be omitted", async () => {
    repository.reviewPrice.mockResolvedValue({
      listingId,
      requestId: priceRequestId,
      operationId,
      duplicate: false,
      status: "approved",
      version: 4,
    });

    const response = await request(app())
      .post(`/v1/admin/price-requests/${priceRequestId}/approve`)
      .send({ operationId });

    expect(response.status).toBe(200);
    expect(repository.reviewPrice).toHaveBeenCalledWith({
      requestId: priceRequestId,
      adminId: "10000000-0000-4000-8000-000000000001",
      decision: "approved",
      reviewNote: undefined,
      operationId,
      auditContext: {
        requestId: "catalogue-request",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    });
  });
});
