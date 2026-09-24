import type { Database } from "@sokoni-digital/database-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ListingHttpError } from "../listings/listings.errors.js";
import { SupabaseCatalogueReviewRepository } from "./listing-approval.repository.js";

vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const auditContext = { requestId: "request-id", ipAddress: "127.0.0.1", userAgent: "test" };

describe("SupabaseCatalogueReviewRepository", () => {
  const rpc = vi.fn();
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://storage.example/listing-images/${path}` },
  }));
  const db = {
    rpc,
    storage: { from: vi.fn(() => ({ getPublicUrl })) },
  } as unknown as SupabaseClient<Database>;
  const repository = new SupabaseCatalogueReviewRepository(db);

  beforeEach(() => vi.clearAllMocks());

  it("hydrates storage metadata in the database-backed listing projection", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "listing-id",
          images: [
            {
              id: "image-id",
              storageBucket: "listing-images",
              storagePath: "vendor/item.jpg",
              thumbnailPath: "vendor/item-thumb.jpg",
              sortOrder: 0,
              isPrimary: true,
            },
          ],
        },
      ],
      error: null,
    });

    const listings = await repository.listPending();

    expect(rpc).toHaveBeenCalledWith("get_admin_listing_review_queue");
    expect(listings[0]?.images[0]).toEqual({
      id: "image-id",
      url: "https://storage.example/listing-images/vendor/item.jpg",
      thumbnailUrl: "https://storage.example/listing-images/vendor/item-thumb.jpg",
      sortOrder: 0,
      isPrimary: true,
    });
  });

  it("forwards every idempotency and concurrency field to listing review RPC", async () => {
    rpc.mockResolvedValue({
      data: {
        operationId: "operation-id",
        listingId: "listing-id",
        requestId: "request-id",
        status: "active",
        version: 2,
        duplicate: false,
      },
      error: null,
    });

    await repository.reviewListing({
      listingId: "listing-id",
      adminId: "admin-id",
      decision: "approved",
      reviewNote: "Verified",
      expectedVersion: 1,
      operationId: "operation-id",
      auditContext,
    });

    expect(rpc).toHaveBeenCalledWith("admin_review_listing_audited", {
      p_listing_id: "listing-id",
      p_admin_id: "admin-id",
      p_decision: "approved",
      p_review_note: "Verified",
      p_expected_version: 1,
      p_operation_id: "operation-id",
      p_audit_context: auditContext,
    });
  });

  it("maps database concurrency failures to an HTTP conflict", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "version conflict" } });

    await expect(
      repository.reviewListing({
        listingId: "listing-id",
        adminId: "admin-id",
        decision: "approved",
        expectedVersion: 1,
        operationId: "operation-id",
        auditContext,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ statusCode: 409 } satisfies Partial<ListingHttpError>),
    );
  });
});
