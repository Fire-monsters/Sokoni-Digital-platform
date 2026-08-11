import type {
  CatalogueCategory,
  CatalogueProduct,
  CatalogueListingCard,
  CatalogueListingDetails,
  CatalogueListingImage,
  CatalogueQuery,
  ListingAvailability,
} from "@sokoni-digital/domain";

import { supabase } from "../../infrastructure/supabase/client.js";
import { decodeCatalogueCursor } from "./catalogue.cursor.js";
import type { CatalogueRepository } from "./catalogue.types.js";

interface CatalogueCardRow {
  id: string;
  product_slug: string;
  product_name: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  seller_id: string;
  vendor_name: string;
  market_id: string | null;
  market_name: string | null;
  package_quantity: number | string;
  package_unit: string;
  approved_price_ugx: number;
  availability: ListingAvailability;
  primary_image_bucket: string | null;
  primary_image_path: string | null;
  thumbnail_path: string | null;
  blur_hash: string | null;
  updated_at: string;
}

interface CatalogueImageRow {
  id: string;
  bucket: string;
  path: string;
  thumbnailPath: string | null;
  blurHash: string | null;
  isPrimary: boolean;
}

interface CatalogueDetailsRow extends CatalogueCardRow {
  description: string | null;
  images: CatalogueImageRow[];
}

function publicStorageUrl(bucket: string | null, path: string | null): string | null {
  if (!bucket || !path) {
    return null;
  }

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function mapCard(row: CatalogueCardRow): CatalogueListingCard {
  return {
    id: row.id,
    productName: row.product_name,
    productSlug: row.product_slug,
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
    },
    sellerId: row.seller_id,
    vendorName: row.vendor_name,
    market: row.market_id && row.market_name ? { id: row.market_id, name: row.market_name } : null,
    packageQuantity: Number(row.package_quantity),
    packageUnit: row.package_unit,
    approvedPriceUgx: row.approved_price_ugx,
    availability: row.availability,
    thumbnailUrl: publicStorageUrl(
      row.primary_image_bucket,
      row.thumbnail_path ?? row.primary_image_path,
    ),
    blurHash: row.blur_hash,
    updatedAt: row.updated_at,
  };
}

function mapImage(row: CatalogueImageRow): CatalogueListingImage {
  return {
    id: row.id,
    url: publicStorageUrl(row.bucket, row.path) ?? "",
    thumbnailUrl: publicStorageUrl(row.bucket, row.thumbnailPath),
    blurHash: row.blurHash,
    isPrimary: row.isPrimary,
  };
}

export class SupabaseCatalogueRepository implements CatalogueRepository {
  async listCategories(): Promise<CatalogueCategory[]> {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return data;
  }

  async listProducts(categoryId?: string): Promise<CatalogueProduct[]> {
    let request = supabase
      .from("catalog_products")
      .select("id,category_id,name,slug,categories!inner(name)")
      .eq("is_active", true)
      .order("name");
    if (categoryId) request = request.eq("category_id", categoryId);
    const { data, error } = await request;
    if (error) throw error;
    return data.map((product) => ({
      id: product.id,
      categoryId: product.category_id,
      categoryName: product.categories.name,
      name: product.name,
      slug: product.slug,
    }));
  }

  async listListings(
    query: Required<Pick<CatalogueQuery, "limit" | "sort">> & CatalogueQuery,
  ): Promise<{ items: CatalogueListingCard[]; hasMore: boolean }> {
    let request = supabase.from("catalogue_listing_cards").select("*");

    if (query.marketId) {
      request = request.eq("market_id", query.marketId);
    }

    if (query.categoryId) {
      request = request.eq("category_id", query.categoryId);
    }

    if (query.availability) {
      request = request.eq("availability", query.availability);
    }

    if (query.search) {
      const safeSearch = query.search.replace(/[%_,()]/g, " ").trim();
      request = request.or(
        `product_name.ilike.%${safeSearch}%,category_name.ilike.%${safeSearch}%`,
      );
    }

    if (query.cursor) {
      const cursor = decodeCatalogueCursor(query.cursor, query.sort);

      if (query.sort === "latest") {
        const cursorValue = String(cursor.value);
        request = request.or(
          `updated_at.lt.${cursorValue},and(updated_at.eq.${cursorValue},id.lt.${cursor.id})`,
        );
      } else {
        const comparator = query.sort === "price_asc" ? "gt" : "lt";
        const cursorValue = String(cursor.value);
        request = request.or(
          `approved_price_ugx.${comparator}.${cursorValue},and(approved_price_ugx.eq.${cursorValue},id.${comparator}.${cursor.id})`,
        );
      }
    }

    if (query.sort === "price_asc") {
      request = request
        .order("approved_price_ugx", { ascending: true })
        .order("id", { ascending: true });
    } else if (query.sort === "price_desc") {
      request = request
        .order("approved_price_ugx", { ascending: false })
        .order("id", { ascending: false });
    } else {
      request = request.order("updated_at", { ascending: false }).order("id", { ascending: false });
    }

    const { data, error } = await request.limit(query.limit + 1);

    if (error) {
      throw error;
    }

    const rows = data as CatalogueCardRow[];

    return {
      items: rows.slice(0, query.limit).map(mapCard),
      hasMore: rows.length > query.limit,
    };
  }

  async getListing(listingId: string): Promise<CatalogueListingDetails | null> {
    const { data, error } = await supabase
      .from("catalogue_listing_details")
      .select("*")
      .eq("id", listingId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    const row = data as unknown as CatalogueDetailsRow;

    return {
      ...mapCard(row),
      description: row.description,
      images: row.images.map(mapImage),
    };
  }
}
