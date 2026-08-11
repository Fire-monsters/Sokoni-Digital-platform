export const listingStatuses = [
  "draft",
  "pending_approval",
  "changes_requested",
  "active",
  "paused",
  "archived",
] as const;

export type ListingStatus = (typeof listingStatuses)[number];

export const listingAvailabilities = ["available", "low_stock", "unavailable"] as const;

export type ListingAvailability = (typeof listingAvailabilities)[number];

export type CatalogueSort = "latest" | "price_asc" | "price_desc";

export interface CatalogueCategory {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogueProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
}

export interface CatalogueListingCard {
  id: string;
  productName: string;
  productSlug: string;
  category: CatalogueCategory;
  sellerId: string;
  vendorName: string;
  market: { id: string; name: string } | null;
  packageQuantity: number;
  packageUnit: string;
  approvedPriceUgx: number;
  availability: ListingAvailability;
  thumbnailUrl: string | null;
  blurHash: string | null;
  updatedAt: string;
}

export interface CatalogueListingImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  blurHash: string | null;
  isPrimary: boolean;
}

export interface CatalogueListingDetails extends CatalogueListingCard {
  description: string | null;
  images: CatalogueListingImage[];
}

export interface CataloguePage {
  items: CatalogueListingCard[];
  nextCursor: string | null;
}

export interface CatalogueQuery {
  marketId?: string;
  categoryId?: string;
  search?: string;
  availability?: ListingAvailability;
  cursor?: string;
  limit?: number;
  sort?: CatalogueSort;
  reducedData?: boolean;
}

export interface CatalogueHome {
  categories: CatalogueCategory[];
  featured: CatalogueListingCard | null;
  sections: {
    id: string;
    title: string;
    items: CatalogueListingCard[];
  }[];
  cacheVersion: string;
}
