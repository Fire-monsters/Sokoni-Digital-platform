import type { AgriculturalProduct, BusinessAccount, ProductCategory } from "@sokoni-digital/domain";
import type { Json } from "@sokoni-digital/database-types";
import { supabase } from "../../infrastructure/supabase/client.js";

export function businessDatabaseError(error: { code: string }): Error {
  const errors: Record<string, [number, string, string]> = {
    "42501": [403, "FORBIDDEN", "You cannot access or change this business."],
    "40001": [409, "VERSION_CONFLICT", "The business changed. Reload and retry."],
    "23505": [409, "CONFLICT", "The operation ID has already been used for another request."],
    "23514": [
      409,
      "INVALID_STATE_TRANSITION",
      "This business action is not valid in its current state.",
    ],
    "22023": [400, "VALIDATION_ERROR", "Invalid business details or crop selections."],
    "22P02": [400, "VALIDATION_ERROR", "Invalid business input."],
    P0002: [404, "NOT_FOUND", "Business not found."],
  };
  const [statusCode, code, message] = errors[error.code] ?? [
    503,
    "INTERNAL_ERROR",
    "Business storage is unavailable.",
  ];
  return Object.assign(new Error(message), { statusCode, code });
}
export interface BusinessRepository {
  categories(): Promise<ProductCategory[]>;
  products(category?: string): Promise<AgriculturalProduct[]>;
  read(
    actor: string,
    id?: string,
    admin?: boolean,
    limit?: number,
    offset?: number,
  ): Promise<BusinessAccount | BusinessAccount[]>;
  command(
    actor: string,
    action: string,
    operation: string,
    input: Record<string, Json | undefined>,
    id?: string,
  ): Promise<BusinessAccount>;
}
export class SupabaseBusinessRepository implements BusinessRepository {
  async categories(): Promise<ProductCategory[]> {
    const { data, error } = await supabase.rpc("list_product_categories");
    if (error) throw businessDatabaseError(error);
    return data as unknown as ProductCategory[];
  }
  async products(category?: string): Promise<AgriculturalProduct[]> {
    const { data, error } = await supabase.rpc("list_agricultural_products", {
      ...(category ? { p_category: category } : {}),
    });
    if (error) throw businessDatabaseError(error);
    return data as unknown as AgriculturalProduct[];
  }
  async read(
    actor: string,
    id?: string,
    admin = false,
    limit = 50,
    offset = 0,
  ): Promise<BusinessAccount | BusinessAccount[]> {
    const { data, error } = await supabase.rpc("read_business_accounts", {
      p_actor: actor,
      ...(id ? { p_id: id } : {}),
      p_admin: admin,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw businessDatabaseError(error);
    return data as unknown as BusinessAccount | BusinessAccount[];
  }
  async command(
    actor: string,
    action: string,
    operation: string,
    input: Record<string, Json | undefined>,
    id?: string,
  ): Promise<BusinessAccount> {
    const { data, error } = await supabase.rpc("command_business_account", {
      p_actor: actor,
      p_action: action,
      p_operation: operation,
      p_input: input,
      ...(id ? { p_id: id } : {}),
    });
    if (error) throw businessDatabaseError(error);
    return data as unknown as BusinessAccount;
  }
}
