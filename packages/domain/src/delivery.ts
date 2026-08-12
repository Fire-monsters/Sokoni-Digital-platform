export const deliveryStatuses = [
  "unassigned",
  "offering",
  "assigned",
  "arrived_at_market",
  "picked_up",
  "in_transit",
  "arrived_at_customer",
  "delivered",
  "assignment_cancelled",
  "pickup_failed",
  "delivery_failed",
  "customer_unavailable",
  "issue_reported",
  "returned",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

export const deliveryTransitions: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  unassigned: ["offering"],
  offering: ["assigned", "unassigned"],
  assigned: ["arrived_at_market", "assignment_cancelled", "issue_reported"],
  arrived_at_market: ["picked_up", "pickup_failed", "issue_reported"],
  picked_up: ["in_transit", "issue_reported"],
  in_transit: ["arrived_at_customer", "customer_unavailable", "delivery_failed", "issue_reported"],
  arrived_at_customer: ["delivered", "customer_unavailable", "issue_reported"],
  delivered: [],
  assignment_cancelled: [],
  pickup_failed: [],
  delivery_failed: [],
  customer_unavailable: [],
  issue_reported: [],
  returned: [],
};

export const riderAvailabilities = [
  "offline",
  "available",
  "offer_pending",
  "assigned",
  "busy",
] as const;

export type RiderAvailability = (typeof riderAvailabilities)[number];
export type RiderSelectedAvailability = Extract<RiderAvailability, "offline" | "available">;
export type TransporterVerificationStatus = "pending" | "approved" | "rejected" | "suspended";

export interface RiderLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  receivedAt: string;
}

export interface RiderOperationalState {
  transporterId: string;
  displayName: string;
  verificationStatus: TransporterVerificationStatus;
  availability: RiderAvailability;
  availabilityUpdatedAt: string;
  locationIsFresh: boolean;
  eligibleForOffers: boolean;
  lastLocation: RiderLocation | null;
}

export interface RiderAvailabilityResult extends RiderOperationalState {
  operationId: string;
  duplicate: boolean;
}

export interface RiderLocationUpdateResult {
  transporterId: string;
  receivedAt: string;
  locationIsFresh: boolean;
  operationId: string;
  duplicate: boolean;
}

export interface DeliveryTransitionResult {
  deliveryId: string;
  status: DeliveryStatus;
  version: number;
  operationId: string;
  duplicate: boolean;
}

export interface DeliveryOfferAcceptanceResult {
  offerId: string;
  deliveryId: string;
  transporterId: string;
  status: "assigned";
  version: number;
  operationId: string;
  duplicate: boolean;
}

export interface RiderDeliveryOffer {
  id: string;
  deliveryId: string;
  deliveryReference: string;
  deliveryVersion: number;
  distanceKm: number;
  feeUgx: number;
  offeredAt: string;
  expiresAt: string;
  market: { id: string; name: string };
  zoneName: string;
  sellerCount: number;
  packageCount: number;
}

export interface DeliveryOfferRejectionResult {
  offerId: string;
  status: "rejected";
  operationId: string;
  duplicate: boolean;
}

export interface DeliveryPickup {
  id: string;
  sellerOrderId: string;
  sellerOrderReference: string;
  sellerName: string;
  itemCount: number;
  status: "pending" | "collected";
  vendorConfirmed: boolean;
  riderConfirmed: boolean;
  collectedAt: string | null;
}

export interface RiderCurrentDelivery {
  id: string;
  reference: string;
  status: DeliveryStatus;
  version: number;
  feeUgx: number;
  assignedAt: string;
  market: { id: string; name: string };
  destination: { label: string; summary: string; zoneName: string; phoneNumber: string };
  pickups: DeliveryPickup[];
  completion: {
    consumerConfirmed: boolean;
    readyProofImageCount: number;
  };
}

export interface DeliveryPickupConfirmationResult {
  pickupId: string;
  deliveryId: string;
  sellerOrderId: string;
  status: "pending" | "collected";
  vendorConfirmed: boolean;
  riderConfirmed: boolean;
  operationId: string;
  duplicate: boolean;
}

export const deliveryProofImageContract = {
  mimeType: "image/jpeg",
  maximumBytes: 500_000,
  maximumLongEdgePixels: 1280,
  thumbnailLongEdgePixels: 320,
} as const;

export interface DeliveryPin {
  deliveryId: string;
  pin: string;
  expiresAt: string;
}

export interface DeliveryPinConfirmationResult {
  deliveryId: string;
  confirmed: boolean;
  confirmedAt: string | null;
  remainingAttempts: number;
  locked: boolean;
  operationId: string;
  duplicate: boolean;
}

export interface DeliveryProofUploadIntent {
  proofId: string;
  imageId: string;
  original: { path: string; token: string };
  thumbnail: { path: string; token: string };
  expiresAt: string;
}

export interface DeliveryProofUploadResult {
  proofId: string;
  imageId: string;
  status: "ready";
  duplicate: boolean;
  thumbnailUrl: string;
}

export interface DeliveryEvidenceImage {
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  capturedAt: string;
  byteSize: number;
  width: number;
  height: number;
  location: { latitude: number; longitude: number; accuracyMeters: number } | null;
}

export interface DeliveryEvidence {
  deliveryId: string;
  reference: string;
  completedAt: string | null;
  consumerConfirmedAt: string | null;
  images: DeliveryEvidenceImage[];
}

export const deliveryIssueReasons = [
  "CUSTOMER_UNAVAILABLE",
  "CUSTOMER_REJECTED_ORDER",
  "INCORRECT_ADDRESS",
  "PRODUCT_DAMAGED",
  "VEHICLE_PROBLEM",
  "SELLER_ORDER_MISSING",
  "UNSAFE_DELIVERY_LOCATION",
  "OTHER",
] as const;

export type DeliveryIssueReason = (typeof deliveryIssueReasons)[number];

export const deliveryIssueResolutionCodes = [
  "RESUME_DELIVERY",
  "CUSTOMER_CONTACTED",
  "RIDER_REASSIGNED",
  "RETURN_AUTHORIZED",
  "CLOSED_NO_ACTION",
] as const;

export type DeliveryIssueResolutionCode = (typeof deliveryIssueResolutionCodes)[number];

export interface DeliveryIssueResult {
  issueId: string;
  deliveryId: string;
  status: "open" | "resolved";
  duplicate: boolean;
}

export interface DispatcherDelivery {
  id: string;
  reference: string;
  status: DeliveryStatus;
  version: number;
  feeUgx: number;
  updatedAt: string;
  assignedAt: string | null;
  marketName: string;
  zoneName: string;
  destinationSummary: string;
  consumerPhoneNumber: string;
  transporter: {
    id: string;
    displayName: string;
    availability: RiderAvailability;
    phoneNumber: string | null;
  } | null;
  openIssueCount: number;
}

export interface DispatcherDeliveryIssue {
  id: string;
  deliveryId: string;
  deliveryReference: string;
  reason: DeliveryIssueReason;
  note: string | null;
  reportedStatus: DeliveryStatus;
  reportedVersion: number;
  createdAt: string;
}

export interface DispatcherRider {
  id: string;
  displayName: string;
  availability: RiderAvailability;
  locationIsFresh: boolean;
  locationReceivedAt: string | null;
  phoneNumber?: string | null;
  distanceKm?: number;
}

export const dispatcherDeliveryActions = [
  "CANCEL_ASSIGNMENT",
  "MARK_CUSTOMER_UNAVAILABLE",
  "RETURN_TO_MARKET",
  "CONTACT_RIDER",
  "CONTACT_CONSUMER",
] as const;
export type DispatcherDeliveryAction = (typeof dispatcherDeliveryActions)[number];

export interface DispatcherDeliveryActionResult {
  deliveryId: string;
  action: DispatcherDeliveryAction;
  status: DeliveryStatus;
  version: number;
  operationId: string;
  contactPhoneNumber: string | null;
  duplicate: boolean;
}

export interface DispatcherDeliveryBoard {
  deliveries: DispatcherDelivery[];
  issues: DispatcherDeliveryIssue[];
}

export interface DispatcherAssignmentResult {
  deliveryId: string;
  transporterId: string;
  previousTransporterId: string | null;
  status: "assigned";
  version: number;
  operationId: string;
  duplicate: boolean;
}

export const assignmentCacheMaximumAgeMs = 24 * 60 * 60 * 1000;
export const queueableDeliveryStatuses = ["arrived_at_market", "in_transit"] as const;

export function isAssignmentCacheFresh(
  savedAt: string,
  nowMs = Date.now(),
  maximumAgeMs = assignmentCacheMaximumAgeMs,
): boolean {
  const savedAtMs = Date.parse(savedAt);
  return Number.isFinite(savedAtMs) && nowMs - savedAtMs >= 0 && nowMs - savedAtMs <= maximumAgeMs;
}

export function shouldQueueDeliveryTransition(status: DeliveryStatus): boolean {
  return queueableDeliveryStatuses.some((queueableStatus) => queueableStatus === status);
}

export function isLocationSnapshotUsable(
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
  } | null,
): boolean {
  return Boolean(
    location &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    Number.isFinite(location.accuracyMeters) &&
    location.accuracyMeters > 0 &&
    location.accuracyMeters <= 500,
  );
}

export function shouldPersistProofUploadFailure(
  failure: "network" | "timeout" | "server_rejected",
): boolean {
  return failure === "network" || failure === "timeout";
}
