import type {
  CatalogueCategory,
  CatalogueProduct,
  CatalogueListingCard,
  CatalogueListingDetails,
  CatalogueQuery,
  CatalogueSort,
} from "@sokoni-digital/domain";

export interface CatalogueCursor {
  sort: CatalogueSort;
  value: string | number;
  id: string;
}

export interface CatalogueRepository {
  listCategories(): Promise<CatalogueCategory[]>;
  listProducts(categoryId?: string): Promise<CatalogueProduct[]>;
  listListings(query: Required<Pick<CatalogueQuery, "limit" | "sort">> & CatalogueQuery): Promise<{
    items: CatalogueListingCard[];
    hasMore: boolean;
  }>;
  getListing(listingId: string): Promise<CatalogueListingDetails | null>;
}
