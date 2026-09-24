import type { Database, Json } from "@sokoni-digital/database-types";
import type {
  ApplicationAction,
  ApplicationReview,
  ApplicationReviewResult,
  ApplicationType,
} from "@sokoni-digital/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { supabase } from "../../infrastructure/supabase/client.js";
import type { reviewInput, uploadInput } from "./applications.schemas.js";
import type { AuditWriteContext } from "../admin/workflows/index.js";

export function applicationError(error: { code?: string; message: string }): Error {
  const statusCode =
    error.code === "P0002"
      ? 404
      : error.code === "42501"
        ? 403
        : error.code === "22023"
          ? 400
          : ["23514", "23505", "40001", "23503"].includes(error.code ?? "")
            ? 409
            : 500;
  return Object.assign(
    new Error(statusCode === 500 ? "Application operation failed." : error.message),
    {
      statusCode,
      code:
        statusCode === 404
          ? "NOT_FOUND"
          : statusCode === 403
            ? "FORBIDDEN"
            : statusCode === 400
              ? "BAD_REQUEST"
              : statusCode === 409
                ? "CONFLICT"
                : "INTERNAL_ERROR",
    },
  );
}
type StoredReview = Omit<ApplicationReview, "documents"> & {
  documents: { id: string; type: string; contentType: string; storagePath: string }[];
};
export interface ApplicationReviewRepository {
  get(id: string): Promise<ApplicationReview>;
  review(
    id: string,
    actor: string,
    action: ApplicationAction,
    input: z.output<typeof reviewInput>,
    auditContext: AuditWriteContext,
  ): Promise<ApplicationReviewResult>;
}
export class SupabaseApplicationRepository implements ApplicationReviewRepository {
  constructor(private readonly db: SupabaseClient<Database> = supabase) {}
  async get(id: string): Promise<ApplicationReview> {
    const { data, error } = await this.db.rpc("get_application_review", { p_id: id });
    if (error) throw applicationError(error);
    if (!data) throw applicationError({ code: "P0002", message: "Application not found." });
    const review = data as unknown as StoredReview;
    const documents = await Promise.all(
      review.documents.map(async ({ storagePath, ...document }) => {
        const signed = await this.db.storage
          .from("verification-documents")
          .createSignedUrl(storagePath, 300);
        if (signed.error) throw applicationError(signed.error);
        return { ...document, url: signed.data.signedUrl };
      }),
    );
    return { ...review, documents };
  }
  async review(
    id: string,
    actor: string,
    action: ApplicationAction,
    input: z.output<typeof reviewInput>,
    auditContext: AuditWriteContext,
  ): Promise<ApplicationReviewResult> {
    const { data, error } = await this.db.rpc("review_account_application_audited", {
      p_id: id,
      p_actor: actor,
      p_action: action,
      p_version: input.expectedVersion,
      p_operation_id: input.operationId,
      p_reason: input.reason ?? "",
      p_notes: input.internalNotes ?? "",
      p_issues: input.issues ?? [],
      p_audit_context: auditContext as unknown as Json,
    });
    if (error) throw applicationError(error);
    return data as unknown as ApplicationReviewResult;
  }
  async save(userId: string, type: ApplicationType, details: Json) {
    const { data, error } = await this.db.rpc("save_account_application", {
      p_user: userId,
      p_type: type,
      p_details: details,
    });
    if (error) throw applicationError(error);
    return data;
  }
  async submit(userId: string, type: ApplicationType, operationId: string) {
    const { data, error } = await this.db.rpc("submit_account_application", {
      p_user: userId,
      p_type: type,
      p_operation_id: operationId,
    });
    if (error) throw applicationError(error);
    return data;
  }
  async own(userId: string, type: ApplicationType) {
    // Explicit allowlist: staff identities and private notes never cross the applicant boundary.
    const { data, error } = await this.db
      .from("account_applications")
      .select("id,type,status,details,reason,issues,version")
      .eq("user_id", userId)
      .eq("type", type)
      .maybeSingle();
    if (error) throw applicationError(error);
    return data;
  }
  async upload(userId: string, input: z.output<typeof uploadInput>) {
    const { data, error } = await this.db.rpc("register_application_document", {
      p_user: userId,
      p_type: input.applicationType,
      p_document_type: input.documentType,
      p_content_type: input.contentType,
      p_byte_size: input.byteSize,
    });
    if (error) throw applicationError(error);
    const document = data as { id: string; storage_path: string };
    const signed = await this.db.storage
      .from("verification-documents")
      .createSignedUploadUrl(document.storage_path);
    if (signed.error) throw applicationError(signed.error);
    return {
      documentId: document.id,
      storagePath: document.storage_path,
      uploadUrl: signed.data.signedUrl,
      token: signed.data.token,
    };
  }
  async complete(userId: string, documentId: string) {
    const { data, error } = await this.db.rpc("complete_application_document", {
      p_user: userId,
      p_document_id: documentId,
    });
    if (error) throw applicationError(error);
    return data;
  }
}
