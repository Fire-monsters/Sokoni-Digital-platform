import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthenticatedProfile,
  CatalogueCategory,
  CatalogueHome,
  CatalogueListingDetails,
  CataloguePage,
  CatalogueProduct,
  CatalogueQuery,
  AdminListingReview,
  AdminPriceReview,
  AvailabilityResult,
  ListingAvailability,
  ListingUploadIntent,
  OnboardingSnapshot,
  VendorListing,
  VendorListingImage,
  VendorFulfilmentStatus,
  VendorOrderDetails,
  VendorOrderPage,
  VendorOrderTransitionResult,
  VendorOrderTransitionTarget,
  QualityCheckCompletionResult,
  QualityImageUploadIntent,
  QualityImageUploadResult,
  ConsumerCheckoutProgress,
  ConsumerQualityProof,
  RiderAvailabilityResult,
  RiderLocationUpdateResult,
  RiderOperationalState,
  RiderSelectedAvailability,
  DeliveryOfferAcceptanceResult,
  DeliveryOfferRejectionResult,
  DeliveryPickupConfirmationResult,
  DeliveryTransitionResult,
  RiderCurrentDelivery,
  RiderDeliveryOffer,
  DeliveryPin,
  DeliveryPinConfirmationResult,
  DeliveryProofUploadIntent,
  DeliveryProofUploadResult,
  DeliveryEvidence,
  DeliveryIssueReason,
  DeliveryIssueResult,
  DispatcherDeliveryBoard,
  DispatcherRider,
  DispatcherAssignmentResult,
  DeliveryIssueResolutionCode,
  DispatcherDeliveryAction,
  DispatcherDeliveryActionResult,
  StaffSession,
} from "@sokoni-digital/domain";

export const apiQueryKeys = {
  catalogue: ["catalogue"] as const,
  catalogueHome: (marketId?: string, reducedData = false) =>
    ["catalogue", "home", marketId ?? "all", reducedData] as const,
  catalogueListing: (listingId: string) => ["catalogue", "listing", listingId] as const,
  catalogueListings: (query: Record<string, unknown>) => ["catalogue", "listings", query] as const,
  categories: ["catalogue", "categories"] as const,
  catalogueProducts: ["catalogue", "products"] as const,
  vendorListings: ["vendor", "listings"] as const,
  vendorListing: (listingId: string) => ["vendor", "listings", listingId] as const,
  vendorOrders: (statuses: readonly VendorFulfilmentStatus[] = []) =>
    ["vendor", "orders", ...statuses] as const,
  vendorOrder: (orderId: string) => ["vendor", "orders", orderId] as const,
  checkoutProgress: (checkoutId: string) => ["checkout", checkoutId, "progress"] as const,
  qualityProof: (orderId: string) => ["orders", orderId, "quality-proof"] as const,
  adminListingQueue: ["admin", "listing-queue"] as const,
  me: ["me"] as const,
  onboarding: ["me", "onboarding"] as const,
  riderStatus: ["rider", "status"] as const,
  riderOffer: ["rider", "offer"] as const,
  riderDelivery: ["rider", "delivery"] as const,
  dispatcherDeliveries: ["admin", "deliveries"] as const,
  dispatcherRiders: ["admin", "delivery-riders"] as const,
  deliveryEvidence: (deliveryId: string) => ["delivery", deliveryId, "evidence"] as const,
};

export interface ApiClientOptions {
  baseUrl: string;
  accessToken?: string;
}

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorResponse["error"]["details"];

  constructor(statusCode: number, error: ApiErrorResponse["error"]) {
    super(error.message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = error.code;
    this.details = error.details;
  }
}

export async function requestApi<T>(
  options: ApiClientOptions,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  if (options.accessToken) {
    headers.set("authorization", `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${options.baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!payload.success) {
    throw new ApiClientError(response.status, payload.error);
  }

  return payload.data;
}

function catalogueSearchParams(query: CatalogueQuery): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

export function fetchCatalogueCategories(options: ApiClientOptions): Promise<CatalogueCategory[]> {
  return requestApi<CatalogueCategory[]>(options, "/v1/catalogue/categories");
}

export function fetchCatalogueProducts(options: ApiClientOptions): Promise<CatalogueProduct[]> {
  return requestApi<CatalogueProduct[]>(options, "/v1/catalogue/products");
}

export function fetchCatalogueHome(
  options: ApiClientOptions,
  query: Pick<CatalogueQuery, "marketId" | "reducedData"> = {},
): Promise<CatalogueHome> {
  return requestApi<CatalogueHome>(options, `/v1/catalogue/home${catalogueSearchParams(query)}`);
}

export function fetchCatalogueListings(
  options: ApiClientOptions,
  query: CatalogueQuery = {},
): Promise<CataloguePage> {
  return requestApi<CataloguePage>(
    options,
    `/v1/catalogue/listings${catalogueSearchParams(query)}`,
  );
}

export function fetchCatalogueListing(
  options: ApiClientOptions,
  listingId: string,
): Promise<CatalogueListingDetails> {
  return requestApi<CatalogueListingDetails>(
    options,
    `/v1/catalogue/listings/${encodeURIComponent(listingId)}`,
  );
}

export function fetchMe(options: ApiClientOptions): Promise<AuthenticatedProfile> {
  return requestApi<AuthenticatedProfile>(options, "/v1/me");
}

export function fetchStaffSession(options: ApiClientOptions): Promise<StaffSession> {
  return requestApi<StaffSession>(options, "/v1/admin/session");
}

export function fetchOnboarding(options: ApiClientOptions): Promise<OnboardingSnapshot> {
  return requestApi<OnboardingSnapshot>(options, "/v1/me/onboarding");
}

export function fetchRiderStatus(options: ApiClientOptions): Promise<RiderOperationalState> {
  return requestApi<RiderOperationalState>(options, "/v1/rider/status");
}

export function changeRiderAvailability(
  options: ApiClientOptions,
  input: { availability: RiderSelectedAvailability; operationId: string },
): Promise<RiderAvailabilityResult> {
  return requestApi<RiderAvailabilityResult>(options, "/v1/rider/availability", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateRiderLocation(
  options: ApiClientOptions,
  input: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: string;
    operationId: string;
  },
): Promise<RiderLocationUpdateResult> {
  return requestApi<RiderLocationUpdateResult>(options, "/v1/rider/location", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function acceptDeliveryOffer(
  options: ApiClientOptions,
  offerId: string,
  input: { expectedDeliveryVersion: number; operationId: string },
): Promise<DeliveryOfferAcceptanceResult> {
  return requestApi<DeliveryOfferAcceptanceResult>(
    options,
    `/v1/rider/offers/${encodeURIComponent(offerId)}/accept`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function fetchCurrentDeliveryOffer(
  options: ApiClientOptions,
): Promise<RiderDeliveryOffer | null> {
  return requestApi<RiderDeliveryOffer | null>(options, "/v1/rider/offers/current");
}

export function rejectDeliveryOffer(
  options: ApiClientOptions,
  offerId: string,
  input: { operationId: string },
): Promise<DeliveryOfferRejectionResult> {
  return requestApi<DeliveryOfferRejectionResult>(
    options,
    `/v1/rider/offers/${encodeURIComponent(offerId)}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchCurrentRiderDelivery(
  options: ApiClientOptions,
): Promise<RiderCurrentDelivery | null> {
  return requestApi<RiderCurrentDelivery | null>(options, "/v1/rider/deliveries/current");
}

export function confirmRiderDeliveryPickup(
  options: ApiClientOptions,
  deliveryId: string,
  sellerOrderId: string,
  input: { operationId: string },
): Promise<DeliveryPickupConfirmationResult> {
  return requestApi<DeliveryPickupConfirmationResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/pickups/${encodeURIComponent(sellerOrderId)}/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function transitionRiderDelivery(
  options: ApiClientOptions,
  deliveryId: string,
  input: {
    toStatus: "arrived_at_market" | "picked_up" | "in_transit" | "arrived_at_customer";
    expectedVersion: number;
    operationId: string;
  },
): Promise<DeliveryTransitionResult> {
  return requestApi<DeliveryTransitionResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/transitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function rotateConsumerDeliveryPin(
  options: ApiClientOptions,
  deliveryId: string,
): Promise<DeliveryPin> {
  return requestApi<DeliveryPin>(
    options,
    `/v1/orders/deliveries/${encodeURIComponent(deliveryId)}/pin`,
    { method: "POST" },
  );
}

export function confirmConsumerDeliveryPin(
  options: ApiClientOptions,
  deliveryId: string,
  input: { pin: string; operationId: string },
): Promise<DeliveryPinConfirmationResult> {
  return requestApi<DeliveryPinConfirmationResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/confirm-consumer`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createDeliveryProofUploadIntent(
  options: ApiClientOptions,
  deliveryId: string,
  input: {
    operationId: string;
    mimeType: "image/jpeg";
    byteSize: number;
    width: number;
    height: number;
    capturedAt: string;
    location?: { latitude: number; longitude: number; accuracyMeters: number } | null;
  },
): Promise<DeliveryProofUploadIntent> {
  return requestApi<DeliveryProofUploadIntent>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/proof/images/upload-intent`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function completeDeliveryProofUpload(
  options: ApiClientOptions,
  deliveryId: string,
  imageId: string,
  input: { mimeType: "image/jpeg"; byteSize: number; width: number; height: number },
): Promise<DeliveryProofUploadResult> {
  return requestApi<DeliveryProofUploadResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/proof/images/${encodeURIComponent(imageId)}/complete`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function completeRiderDelivery(
  options: ApiClientOptions,
  deliveryId: string,
  input: { expectedVersion: number; operationId: string },
): Promise<DeliveryTransitionResult> {
  return requestApi<DeliveryTransitionResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/complete`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reportRiderDeliveryIssue(
  options: ApiClientOptions,
  deliveryId: string,
  input: {
    reason: DeliveryIssueReason;
    note: string;
    expectedVersion: number;
    operationId: string;
  },
): Promise<DeliveryIssueResult> {
  return requestApi<DeliveryIssueResult>(
    options,
    `/v1/rider/deliveries/${encodeURIComponent(deliveryId)}/issues`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchConsumerDeliveryEvidence(
  options: ApiClientOptions,
  deliveryId: string,
): Promise<DeliveryEvidence> {
  return requestApi<DeliveryEvidence>(
    options,
    `/v1/orders/deliveries/${encodeURIComponent(deliveryId)}/evidence`,
  );
}

export function fetchDispatcherDeliveryBoard(
  options: ApiClientOptions,
): Promise<DispatcherDeliveryBoard> {
  return requestApi<DispatcherDeliveryBoard>(options, "/v1/admin/deliveries");
}

export function fetchDispatcherRiders(options: ApiClientOptions): Promise<DispatcherRider[]> {
  return requestApi<DispatcherRider[]>(options, "/v1/admin/delivery-riders");
}

export function fetchDispatcherNearbyRiders(
  options: ApiClientOptions,
  deliveryId: string,
  radiusKm = 10,
): Promise<DispatcherRider[]> {
  return requestApi<DispatcherRider[]>(
    options,
    `/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/nearby-riders?radiusKm=${encodeURIComponent(String(radiusKm))}`,
  );
}

export function assignDispatcherDelivery(
  options: ApiClientOptions,
  deliveryId: string,
  reassign: boolean,
  input: { transporterId: string; reason: string; expectedVersion: number; operationId: string },
): Promise<DispatcherAssignmentResult> {
  return requestApi<DispatcherAssignmentResult>(
    options,
    `/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/${reassign ? "reassign" : "assign"}`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function resolveDispatcherDeliveryIssue(
  options: ApiClientOptions,
  issueId: string,
  input: {
    resolutionCode: DeliveryIssueResolutionCode;
    resolutionNote: string;
    operationId: string;
  },
): Promise<DeliveryIssueResult> {
  return requestApi<DeliveryIssueResult>(
    options,
    `/v1/admin/delivery-issues/${encodeURIComponent(issueId)}/resolve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchDispatcherDeliveryEvidence(
  options: ApiClientOptions,
  deliveryId: string,
): Promise<DeliveryEvidence> {
  return requestApi<DeliveryEvidence>(
    options,
    `/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/evidence`,
  );
}

export function performDispatcherDeliveryAction(
  options: ApiClientOptions,
  deliveryId: string,
  input: {
    action: DispatcherDeliveryAction;
    reason: string;
    expectedVersion: number;
    operationId: string;
  },
): Promise<DispatcherDeliveryActionResult> {
  return requestApi<DispatcherDeliveryActionResult>(
    options,
    `/v1/admin/deliveries/${encodeURIComponent(deliveryId)}/actions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export interface CreateVendorListingInput {
  catalogProductId: string;
  packageQuantity: number;
  packageUnit: string;
  description?: string;
  availability?: ListingAvailability;
  proposedPriceUgx: number;
}

export function fetchVendorListings(options: ApiClientOptions): Promise<VendorListing[]> {
  return requestApi<VendorListing[]>(options, "/v1/vendor/listings");
}

export function fetchVendorListing(
  options: ApiClientOptions,
  listingId: string,
): Promise<VendorListing> {
  return requestApi<VendorListing>(options, `/v1/vendor/listings/${listingId}`);
}

export function createVendorListing(
  options: ApiClientOptions,
  input: CreateVendorListingInput,
): Promise<VendorListing> {
  return requestApi<VendorListing>(options, "/v1/vendor/listings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateVendorListing(
  options: ApiClientOptions,
  listingId: string,
  input: Partial<Omit<CreateVendorListingInput, "proposedPriceUgx">>,
): Promise<VendorListing> {
  return requestApi<VendorListing>(options, `/v1/vendor/listings/${listingId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveVendorListing(
  options: ApiClientOptions,
  listingId: string,
): Promise<undefined> {
  return requestApi<undefined>(options, `/v1/vendor/listings/${listingId}`, { method: "DELETE" });
}

export function submitVendorListing(
  options: ApiClientOptions,
  listingId: string,
): Promise<VendorListing> {
  return requestApi<VendorListing>(options, `/v1/vendor/listings/${listingId}/submit`, {
    method: "POST",
  });
}

export function createListingPriceRequest(
  options: ApiClientOptions,
  listingId: string,
  input: { proposedPriceUgx: number; reason?: string },
): Promise<VendorListing> {
  return requestApi<VendorListing>(options, `/v1/vendor/listings/${listingId}/price-requests`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function changeVendorListingAvailability(
  options: ApiClientOptions,
  listingId: string,
  input: { availability: ListingAvailability; expectedVersion: number; operationId: string },
): Promise<AvailabilityResult> {
  return requestApi<AvailabilityResult>(options, `/v1/vendor/listings/${listingId}/availability`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createListingUploadIntent(
  options: ApiClientOptions,
  listingId: string,
  input: { mimeType: "image/jpeg" | "image/webp"; byteSize: number; width: number; height: number },
): Promise<ListingUploadIntent> {
  return requestApi<ListingUploadIntent>(
    options,
    `/v1/vendor/listings/${listingId}/images/upload-intent`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function completeListingUpload(
  options: ApiClientOptions,
  listingId: string,
  imageId: string,
  input: unknown,
): Promise<VendorListingImage> {
  return requestApi<VendorListingImage>(
    options,
    `/v1/vendor/listings/${listingId}/images/${imageId}/complete`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export interface VendorOrdersQuery {
  status?: VendorFulfilmentStatus[];
  cursor?: string;
  limit?: number;
}

export function fetchVendorOrders(
  options: ApiClientOptions,
  query: VendorOrdersQuery = {},
): Promise<VendorOrderPage> {
  const params = new URLSearchParams();
  if (query.status && query.status.length > 0) params.set("status", query.status.join(","));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const search = params.toString();
  return requestApi<VendorOrderPage>(options, `/v1/vendor/orders${search ? `?${search}` : ""}`);
}

export function fetchVendorOrder(
  options: ApiClientOptions,
  orderId: string,
): Promise<VendorOrderDetails> {
  return requestApi<VendorOrderDetails>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}`,
  );
}

export function transitionVendorOrder(
  options: ApiClientOptions,
  orderId: string,
  input: {
    toStatus: VendorOrderTransitionTarget;
    expectedVersion: number;
    operationId: string;
  },
): Promise<VendorOrderTransitionResult> {
  return requestApi<VendorOrderTransitionResult>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}/transitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function confirmVendorDeliveryPickup(
  options: ApiClientOptions,
  orderId: string,
  input: { operationId: string },
): Promise<DeliveryPickupConfirmationResult> {
  return requestApi<DeliveryPickupConfirmationResult>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}/pickup/confirm`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createQualityImageUploadIntent(
  options: ApiClientOptions,
  orderId: string,
  input: {
    operationId: string;
    mimeType: "image/jpeg";
    byteSize: number;
    width: number;
    height: number;
  },
): Promise<QualityImageUploadIntent> {
  return requestApi<QualityImageUploadIntent>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}/quality-check/images/upload-intent`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchCheckoutProgress(
  options: ApiClientOptions,
  checkoutId: string,
): Promise<ConsumerCheckoutProgress> {
  return requestApi<ConsumerCheckoutProgress>(
    options,
    `/v1/checkouts/${encodeURIComponent(checkoutId)}/progress`,
  );
}

export function fetchConsumerQualityProof(
  options: ApiClientOptions,
  orderId: string,
): Promise<ConsumerQualityProof> {
  return requestApi<ConsumerQualityProof>(
    options,
    `/v1/orders/${encodeURIComponent(orderId)}/quality-proof`,
  );
}

export function completeQualityImageUpload(
  options: ApiClientOptions,
  orderId: string,
  imageId: string,
  input: unknown,
): Promise<QualityImageUploadResult> {
  return requestApi<QualityImageUploadResult>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}/quality-check/images/${encodeURIComponent(imageId)}/complete`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function completeQualityCheck(
  options: ApiClientOptions,
  orderId: string,
  input: {
    checklist: {
      itemsChecked: true;
      quantitiesChecked: true;
      packagingSecure: true;
    };
    notes?: string | null;
    operationId: string;
  },
): Promise<QualityCheckCompletionResult> {
  return requestApi<QualityCheckCompletionResult>(
    options,
    `/v1/vendor/orders/${encodeURIComponent(orderId)}/quality-check/complete`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchAdminListingQueue(
  options: ApiClientOptions,
): Promise<{ listings: AdminListingReview[] }> {
  return requestApi<{ listings: AdminListingReview[] }>(options, "/v1/admin/listings");
}

export function approveAdminListing(
  options: ApiClientOptions,
  listingId: string,
  reviewNote?: string,
): Promise<AdminListingReview> {
  return requestApi<AdminListingReview>(options, `/v1/admin/listings/${listingId}/approve`, {
    method: "POST",
    body: JSON.stringify({ reviewNote }),
  });
}

export function requestAdminListingChanges(
  options: ApiClientOptions,
  listingId: string,
  reviewNote: string,
): Promise<AdminListingReview> {
  return requestApi<AdminListingReview>(
    options,
    `/v1/admin/listings/${listingId}/request-changes`,
    {
      method: "POST",
      body: JSON.stringify({ reviewNote }),
    },
  );
}

export function fetchAdminPriceQueue(
  options: ApiClientOptions,
): Promise<{ requests: AdminPriceReview[] }> {
  return requestApi<{ requests: AdminPriceReview[] }>(options, "/v1/admin/price-requests");
}

export function reviewAdminPrice(
  options: ApiClientOptions,
  requestId: string,
  decision: "approve" | "reject",
  reviewNote?: string,
) {
  return requestApi<{
    requestId: string;
    listingId: string;
    status: string;
    proposedPriceUgx: number;
  }>(options, `/v1/admin/price-requests/${requestId}/${decision}`, {
    method: "POST",
    body: JSON.stringify({ reviewNote }),
  });
}
