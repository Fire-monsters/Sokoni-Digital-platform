import type {
  CatalogueCategory,
  CatalogueListingCard,
  CatalogueListingDetails,
  CatalogueQuery,
} from "@sokoni-digital/domain";
import { describe, expect, it } from "vitest";

import { decodeCatalogueCursor } from "./catalogue.cursor.js";
import { CatalogueNotFoundError, CatalogueService } from "./catalogue.service.js";
import type { CatalogueRepository } from "./catalogue.types.js";

const category: CatalogueCategory = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Vegetables",
  slug: "vegetables",
};

function card(id: string, updatedAt: string, price = 5000): CatalogueListingCard {
  return {
    id,
    productName: "Tomatoes",
    productSlug: "tomatoes",
    category,
    vendorName: "Approved Stall",
    market: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Kitooro Market",
    },
    packageQuantity: 1,
    packageUnit: "kg",
    approvedPriceUgx: price,
    availability: "available",
    thumbnailUrl: null,
    blurHash: null,
    updatedAt,
  };
}

class FakeCatalogueRepository implements CatalogueRepository {
  lastQuery: CatalogueQuery | null = null;

  constructor(
    private readonly cards: CatalogueListingCard[],
    private readonly details: CatalogueListingDetails | null = null,
  ) {}

  listCategories() {
    return Promise.resolve([category]);
  }

  listProducts() {
    return Promise.resolve([]);
  }

  listListings(query: Required<Pick<CatalogueQuery, "limit" | "sort">> & CatalogueQuery) {
    this.lastQuery = query;
    return Promise.resolve({ items: this.cards, hasMore: true });
  }

  getListing() {
    return Promise.resolve(this.details);
  }
}

describe("CatalogueService", () => {
  it("builds a stable latest cursor from the last item", async () => {
    const repository = new FakeCatalogueRepository([
      card("50000000-0000-4000-8000-000000000002", "2026-08-06T11:00:00.000Z"),
      card("50000000-0000-4000-8000-000000000001", "2026-08-06T10:00:00.000Z"),
    ]);
    const service = new CatalogueService(repository);

    const page = await service.listListings({ limit: 2 });

    if (!page.nextCursor) {
      throw new Error("Expected a next cursor.");
    }

    expect(decodeCatalogueCursor(page.nextCursor, "latest")).toEqual({
      sort: "latest",
      value: "2026-08-06T10:00:00.000Z",
      id: "50000000-0000-4000-8000-000000000001",
    });
  });

  it("uses the approved price for price-sorted cursors", async () => {
    const repository = new FakeCatalogueRepository([
      card("50000000-0000-4000-8000-000000000001", "2026-08-06T10:00:00.000Z", 6500),
    ]);
    const service = new CatalogueService(repository);

    const page = await service.listListings({ limit: 1, sort: "price_desc" });

    if (!page.nextCursor) {
      throw new Error("Expected a next cursor.");
    }

    expect(decodeCatalogueCursor(page.nextCursor, "price_desc").value).toBe(6500);
  });

  it("forwards public search and category filters to the repository", async () => {
    const repository = new FakeCatalogueRepository([]);
    const service = new CatalogueService(repository);

    await service.listListings({
      categoryId: category.id,
      search: "tomatoes",
      limit: 12,
    });

    expect(repository.lastQuery).toMatchObject({
      categoryId: category.id,
      search: "tomatoes",
      limit: 12,
      sort: "latest",
    });
  });

  it("returns only populated category sections in the compact home model", async () => {
    const repository = new FakeCatalogueRepository([
      card("50000000-0000-4000-8000-000000000001", "2026-08-06T10:00:00.000Z"),
    ]);
    const service = new CatalogueService(repository);

    const home = await service.getHome();

    expect(home.categories).toEqual([category]);
    expect(home.featured?.productName).toBe("Tomatoes");
    expect(home.sections).toHaveLength(1);
    expect(home.sections[0]?.items).toHaveLength(1);
  });

  it("does not turn a missing or hidden listing into an empty detail DTO", async () => {
    const service = new CatalogueService(new FakeCatalogueRepository([]));

    await expect(service.getListing("50000000-0000-4000-8000-000000000099")).rejects.toBeInstanceOf(
      CatalogueNotFoundError,
    );
  });
});
