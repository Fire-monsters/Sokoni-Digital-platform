import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@sokoni-digital/database-types";
import { describe, expect, it, vi } from "vitest";
import { SupabaseApplicationRepository } from "./applications.repository.js";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("application review privacy", () => {
  it("replaces private storage paths with short-lived signed URLs", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.test/private?token=temporary" },
      error: null,
    });
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: "application",
          documents: [
            {
              id: "document",
              type: "national_id",
              contentType: "image/jpeg",
              storagePath: "owner/application/document",
            },
          ],
        },
        error: null,
      }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    };
    const detail = await new SupabaseApplicationRepository(
      db as unknown as SupabaseClient<Database>,
    ).get("application");
    expect(db.storage.from).toHaveBeenCalledWith("verification-documents");
    expect(createSignedUrl).toHaveBeenCalledWith("owner/application/document", 300);
    expect(detail.documents[0]).not.toHaveProperty("storagePath");
    expect(detail.documents[0]?.url).toBe("https://example.test/private?token=temporary");
  });
  it("restricts applicant reads to owned records and excludes private review columns", async () => {
    const query = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    query.eq.mockReturnValue(query);
    const select = vi.fn().mockReturnValue(query);
    const db = { from: vi.fn().mockReturnValue({ select }) };
    await new SupabaseApplicationRepository(db as unknown as SupabaseClient<Database>).own(
      "owner",
      "vendor",
    );
    expect(select).toHaveBeenCalledWith("id,type,status,details,reason,issues,version");
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.eq).toHaveBeenCalledWith("type", "vendor");
  });
  it("does not leak database diagnostics on unexpected failures", async () => {
    const db = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "XX000", message: "sensitive database diagnostic" },
      }),
    };
    await expect(
      new SupabaseApplicationRepository(db as unknown as SupabaseClient<Database>).get(
        "application",
      ),
    ).rejects.toMatchObject({ statusCode: 500, message: "Application operation failed." });
  });
});
