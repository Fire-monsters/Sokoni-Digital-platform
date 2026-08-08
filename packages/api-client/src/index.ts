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

export function archiveVendorListing(options: ApiClientOptions, listingId: string): Promise<void> {
  return requestApi<void>(options, `/v1/vendor/listings/${listingId}`, { method: "DELETE" });
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
