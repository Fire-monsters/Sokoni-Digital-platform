/* eslint-disable */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      catalog_products: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          next_state: Json | null
          previous_state: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          next_state?: Json | null
          previous_state?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          next_state?: Json | null
          previous_state?: Json | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      listing_availability_operations: {
        Row: {
          availability: Database["public"]["Enums"]["listing_availability"]
          created_at: string
          listing_id: string
          operation_id: string
          seller_id: string
          version: number
        }
        Insert: {
          availability: Database["public"]["Enums"]["listing_availability"]
          created_at?: string
          listing_id: string
          operation_id: string
          seller_id: string
          version: number
        }
        Update: {
          availability?: Database["public"]["Enums"]["listing_availability"]
          created_at?: string
          listing_id?: string
          operation_id?: string
          seller_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_availability_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_availability_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_availability_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_availability_operations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listing_availability_operations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listing_availability_operations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          blur_hash: string | null
          byte_size: number | null
          created_at: string
          height: number | null
          id: string
          is_primary: boolean
          listing_id: string
          mime_type: string | null
          sort_order: number
          storage_bucket: string
          storage_path: string
          thumbnail_path: string | null
          upload_status: string
          width: number | null
        }
        Insert: {
          blur_hash?: string | null
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          listing_id: string
          mime_type?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path: string
          thumbnail_path?: string | null
          upload_status?: string
          width?: number | null
        }
        Update: {
          blur_hash?: string | null
          byte_size?: number | null
          created_at?: string
          height?: number | null
          id?: string
          is_primary?: boolean
          listing_id?: string
          mime_type?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          thumbnail_path?: string | null
          upload_status?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_price_requests: {
        Row: {
          created_at: string
          current_price_ugx: number | null
          id: string
          listing_id: string
          proposed_price_ugx: number
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: Database["public"]["Enums"]["price_review_status"]
        }
        Insert: {
          created_at?: string
          current_price_ugx?: number | null
          id?: string
          listing_id: string
          proposed_price_ugx: number
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["price_review_status"]
        }
        Update: {
          created_at?: string
          current_price_ugx?: number | null
          id?: string
          listing_id?: string
          proposed_price_ugx?: number
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["price_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_price_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listing_price_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listing_price_requests_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          approved_price_ugx: number | null
          availability: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id: string
          created_at: string
          description: string | null
          id: string
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          version: number
        }
        Insert: {
          approved_price_ugx?: number | null
          availability?: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id: string
          created_at?: string
          description?: string | null
          id?: string
          package_quantity: number
          package_unit: string
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          approved_price_ugx?: number | null
          availability?: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id?: string
          created_at?: string
          description?: string | null
          id?: string
          package_quantity?: number
          package_unit?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_accounts: {
        Row: {
          created_at: string
          seller_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          seller_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          seller_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "seller_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "seller_accounts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          business_name: string
          created_at: string
          id: string
          market_id: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["seller_verification_status"]
        }
        Insert: {
          business_name: string
          created_at?: string
          id?: string
          market_id?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["seller_verification_status"]
        }
        Update: {
          business_name?: string
          created_at?: string
          id?: string
          market_id?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["seller_verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sellers_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "sellers_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "sellers_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalogue_listing_cards: {
        Row: {
          approved_price_ugx: number | null
          availability:
            | Database["public"]["Enums"]["listing_availability"]
            | null
          blur_hash: string | null
          catalog_product_id: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          id: string | null
          market_id: string | null
          market_name: string | null
          package_quantity: number | null
          package_unit: string | null
          primary_image_bucket: string | null
          primary_image_path: string | null
          product_name: string | null
          product_slug: string | null
          seller_id: string | null
          thumbnail_path: string | null
          updated_at: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_listing_details: {
        Row: {
          approved_price_ugx: number | null
          availability:
            | Database["public"]["Enums"]["listing_availability"]
            | null
          blur_hash: string | null
          catalog_product_id: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          description: string | null
          id: string | null
          images: Json | null
          market_id: string | null
          market_name: string | null
          package_quantity: number | null
          package_unit: string | null
          primary_image_bucket: string | null
          primary_image_path: string | null
          product_name: string | null
          product_slug: string | null
          seller_id: string | null
          thumbnail_path: string | null
          updated_at: string | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_catalog_product_id_fkey"
            columns: ["catalog_product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_listing_and_price: {
        Args: {
          requested_admin_id: string
          requested_listing_id: string
          requested_review_note?: string
        }
        Returns: {
          approved_price_ugx: number | null
          availability: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id: string
          created_at: string
          description: string | null
          id: string
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_listing_availability: {
        Args: {
          expected_version: number
          requested_availability: Database["public"]["Enums"]["listing_availability"]
          requested_listing_id: string
          requested_operation_id: string
          requested_user_id: string
        }
        Returns: {
          availability: Database["public"]["Enums"]["listing_availability"]
          created_at: string
          listing_id: string
          operation_id: string
          seller_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "listing_availability_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      listing_price_request_seller_matches: {
        Args: { requested_listing_id: string; requested_seller_id: string }
        Returns: boolean
      }
      owns_seller: { Args: { requested_seller_id: string }; Returns: boolean }
      request_listing_changes: {
        Args: {
          requested_admin_id: string
          requested_listing_id: string
          requested_note: string
        }
        Returns: {
          approved_price_ugx: number | null
          availability: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id: string
          created_at: string
          description: string | null
          id: string
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_price_request: {
        Args: {
          requested_admin_id: string
          requested_decision: Database["public"]["Enums"]["price_review_status"]
          requested_note?: string
          requested_request_id: string
        }
        Returns: {
          created_at: string
          current_price_ugx: number | null
          id: string
          listing_id: string
          proposed_price_ugx: number
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: Database["public"]["Enums"]["price_review_status"]
        }
        SetofOptions: {
          from: "*"
          to: "listing_price_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_listing_for_approval: {
        Args: { requested_listing_id: string; requested_user_id: string }
        Returns: {
          approved_price_ugx: number | null
          availability: Database["public"]["Enums"]["listing_availability"]
          catalog_product_id: string
          created_at: string
          description: string | null
          id: string
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      listing_availability: "available" | "low_stock" | "unavailable"
      listing_status:
        | "draft"
        | "pending_approval"
        | "changes_requested"
        | "active"
        | "paused"
        | "archived"
      price_review_status: "pending" | "approved" | "rejected" | "cancelled"
      seller_verification_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      listing_availability: ["available", "low_stock", "unavailable"],
      listing_status: [
        "draft",
        "pending_approval",
        "changes_requested",
        "active",
        "paused",
        "archived",
      ],
      price_review_status: ["pending", "approved", "rejected", "cancelled"],
      seller_verification_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
    },
  },
} as const
