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

export function fetchOnboarding(options: ApiClientOptions): Promise<OnboardingSnapshot> {
  return requestApi<OnboardingSnapshot>(options, "/v1/me/onboarding");
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
