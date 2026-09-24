export type ApplicationType = "vendor" | "rider";
export type ApplicationStatus =
  | "draft"
  | "pending_review"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "suspended";
export type ApplicationAction =
  "start-review" | "approve" | "request-changes" | "reject" | "suspend" | "notes";
export interface ApplicationReview {
  id: string;
  type: ApplicationType;
  status: ApplicationStatus;
  version: number;
  userId: string | null;
  applicantName: string;
  phone: string | null;
  phoneVerified: boolean;
  details: Record<string, Record<string, string | boolean | string[]>>;
  market: { id: string; name: string } | null;
  submittedAt: string;
  reviewStartedAt: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reason: string | null;
  issues: string[];
  missingRequirements: string[];
  documents: { id: string; type: string; contentType: string; url: string }[];
  timeline: {
    id: string;
    action: string;
    actorUserId: string;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    issues: string[];
    internalNotes: string | null;
    createdAt: string;
  }[];
}
export interface ApplicationReviewInput {
  operationId: string;
  expectedVersion: number;
  reason?: string;
  internalNotes?: string;
  issues?: string[];
}
export interface ApplicationReviewResult {
  applicationId: string;
  status: ApplicationStatus;
  version: number;
  operationId: string;
  duplicate: boolean;
}
export interface ApplicationQueue {
  data: {
    id: string;
    type: ApplicationType;
    status: ApplicationStatus;
    applicant: { name: string; phoneMasked: string };
    market: { id: string; name: string } | null;
    reviewer: { id: string; name: string } | null;
    submittedAt: string;
    reviewStartedAt: string | null;
  }[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
