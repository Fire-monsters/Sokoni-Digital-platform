import type {
  CatalogueHome,
  CatalogueListingDetails,
  CataloguePage,
  CatalogueQuery,
} from "@sokoni-digital/domain";

import { encodeCatalogueCursor } from "./catalogue.cursor.js";
import type { CatalogueRepository } from "./catalogue.types.js";

export class CatalogueNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND" as const;

  constructor() {
    super("Catalogue listing not found.");
    this.name = "CatalogueNotFoundError";
  }
}

export class CatalogueService {
  constructor(private readonly repository: CatalogueRepository) {}

  listCategories() {
    return this.repository.listCategories();
  }

  listProducts(categoryId?: string) {
    return this.repository.listProducts(categoryId);
  }

  async listListings(query: CatalogueQuery): Promise<CataloguePage> {
    const normalizedQuery = {
      ...query,
      limit: query.limit ?? 20,
      sort: query.sort ?? "latest",
    };
    const result = await this.repository.listListings(normalizedQuery);
    const lastItem = result.items.at(-1);
    let nextCursor: string | null = null;

    if (result.hasMore && lastItem) {
      nextCursor = encodeCatalogueCursor({
        sort: normalizedQuery.sort,
        value: normalizedQuery.sort === "latest" ? lastItem.updatedAt : lastItem.approvedPriceUgx,
        id: lastItem.id,
      });
    }

    return { items: result.items, nextCursor };
  }

  async getListing(listingId: string): Promise<CatalogueListingDetails> {
    const listing = await this.repository.getListing(listingId);

    if (!listing) {
      throw new CatalogueNotFoundError();
    }

    return listing;
  }

  async getHome(marketId?: string): Promise<CatalogueHome> {
    const [categories, page] = await Promise.all([
      this.repository.listCategories(),
      this.listListings({
        ...(marketId ? { marketId } : {}),
        limit: 24,
        sort: "latest",
        reducedData: true,
      }),
    ]);
    const sections = categories
      .map((category) => ({
        id: category.id,
        title: category.name,
        items: page.items.filter((item) => item.category.id === category.id).slice(0, 6),
      }))
      .filter((section) => section.items.length > 0)
      .slice(0, 4);
    const newestTimestamp = page.items.at(0)?.updatedAt ?? "empty";

    return {
      categories,
      featured: page.items.at(0) ?? null,
      sections,
      cacheVersion: newestTimestamp,
    };
  }
}
