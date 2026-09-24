import type { AdminWorkflowCommand } from "../admin/workflows/index.js";
import type { CatalogueReviewRepository } from "./listing-approval.repository.js";

interface ListingParams {
  listingId: string;
}

interface PriceRequestParams {
  requestId: string;
}

interface OptionalReviewNote {
  reviewNote?: string | undefined;
  expectedVersion: number;
  operationId: string;
}

interface RequiredReviewNote {
  reviewNote: string;
  expectedVersion: number;
  operationId: string;
}

interface PriceReviewInput {
  reviewNote?: string | undefined;
  operationId: string;
}

/** Coordinates catalogue review use-cases without exposing persistence details to HTTP routes. */
export class ListingApprovalService {
  constructor(private readonly repository: CatalogueReviewRepository) {}

  approveListing(command: AdminWorkflowCommand<ListingParams, OptionalReviewNote>) {
    return this.repository.reviewListing({
      listingId: command.params.listingId,
      adminId: command.actor.userId,
      decision: "approved",
      reviewNote: command.input.reviewNote,
      expectedVersion: command.input.expectedVersion,
      operationId: command.input.operationId,
      auditContext: command.auditContext,
    });
  }

  requestChanges(command: AdminWorkflowCommand<ListingParams, RequiredReviewNote>) {
    return this.repository.reviewListing({
      listingId: command.params.listingId,
      adminId: command.actor.userId,
      decision: "changes_requested",
      reviewNote: command.input.reviewNote,
      expectedVersion: command.input.expectedVersion,
      operationId: command.input.operationId,
      auditContext: command.auditContext,
    });
  }

  reviewPrice(
    decision: "approved" | "rejected",
    command: AdminWorkflowCommand<PriceRequestParams, PriceReviewInput>,
  ) {
    return this.repository.reviewPrice({
      requestId: command.params.requestId,
      adminId: command.actor.userId,
      decision,
      reviewNote: command.input.reviewNote,
      operationId: command.input.operationId,
      auditContext: command.auditContext,
    });
  }
}
