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
      cart_item_operations: {
        Row: {
          cart_id: string
          created_at: string
          listing_id: string
          operation_id: string
          requested_quantity: number
          resulting_cart_version: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          listing_id: string
          operation_id: string
          requested_quantity: number
          resulting_cart_version: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          listing_id?: string
          operation_id?: string
          requested_quantity?: number
          resulting_cart_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_item_operations_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_item_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_item_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_item_operations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          listing_id: string
          listing_version: number
          price_snapshot_ugx: number
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          listing_id: string
          listing_version: number
          price_snapshot_ugx: number
          quantity: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          listing_version?: number
          price_snapshot_ugx?: number
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          consumer_id: string | null
          converted_checkout_id: string | null
          created_at: string
          currency_code: string
          expires_at: string | null
          guest_token_hash: string | null
          id: string
          installation_id: string | null
          market_id: string
          merged_into_cart_id: string | null
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
          version: number
        }
        Insert: {
          consumer_id?: string | null
          converted_checkout_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          guest_token_hash?: string | null
          id?: string
          installation_id?: string | null
          market_id: string
          merged_into_cart_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          consumer_id?: string | null
          converted_checkout_id?: string | null
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          guest_token_hash?: string | null
          id?: string
          installation_id?: string | null
          market_id?: string
          merged_into_cart_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "carts_converted_checkout_id_fkey"
            columns: ["converted_checkout_id"]
            isOneToOne: false
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "carts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "carts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_merged_into_cart_id_fkey"
            columns: ["merged_into_cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
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
      checkout_fulfilments: {
        Row: {
          address_id: string | null
          address_label: string | null
          address_summary: string | null
          checkout_id: string
          created_at: string
          delivery_zone_id: string | null
          delivery_zone_name: string | null
          phone_number: string
          pickup_code_hash: string | null
          pickup_market_id: string | null
          requested_for: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          type: Database["public"]["Enums"]["fulfilment_type"]
        }
        Insert: {
          address_id?: string | null
          address_label?: string | null
          address_summary?: string | null
          checkout_id: string
          created_at?: string
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          phone_number: string
          pickup_code_hash?: string | null
          pickup_market_id?: string | null
          requested_for?: string | null
          schedule_type: Database["public"]["Enums"]["schedule_type"]
          type: Database["public"]["Enums"]["fulfilment_type"]
        }
        Update: {
          address_id?: string | null
          address_label?: string | null
          address_summary?: string | null
          checkout_id?: string
          created_at?: string
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          phone_number?: string
          pickup_code_hash?: string | null
          pickup_market_id?: string | null
          requested_for?: string | null
          schedule_type?: Database["public"]["Enums"]["schedule_type"]
          type?: Database["public"]["Enums"]["fulfilment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "checkout_fulfilments_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "consumer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_fulfilments_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: true
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_fulfilments_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_fulfilments_pickup_market_id_fkey"
            columns: ["pickup_market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "checkout_fulfilments_pickup_market_id_fkey"
            columns: ["pickup_market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "checkout_fulfilments_pickup_market_id_fkey"
            columns: ["pickup_market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_status_history: {
        Row: {
          checkout_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["checkout_status"] | null
          id: number
          reason: string | null
          to_status: Database["public"]["Enums"]["checkout_status"]
        }
        Insert: {
          checkout_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["checkout_status"] | null
          id?: never
          reason?: string | null
          to_status: Database["public"]["Enums"]["checkout_status"]
        }
        Update: {
          checkout_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["checkout_status"] | null
          id?: never
          reason?: string | null
          to_status?: Database["public"]["Enums"]["checkout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checkout_status_history_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
        ]
      }
      consumer_addresses: {
        Row: {
          consumer_id: string
          created_at: string
          id: string
          label: string
          phone_number: string
          summary: string
          updated_at: string
        }
        Insert: {
          consumer_id: string
          created_at?: string
          id?: string
          label: string
          phone_number: string
          summary: string
          updated_at?: string
        }
        Update: {
          consumer_id?: string
          created_at?: string
          id?: string
          label?: string
          phone_number?: string
          summary?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_checkouts: {
        Row: {
          cart_id: string
          client_reference: string
          consumer_id: string
          created_at: string
          currency_code: string
          delivery_fee_ugx: number
          id: string
          items_subtotal_ugx: number
          market_id: string
          reference: string
          reservation_expires_at: string
          service_fee_ugx: number
          status: Database["public"]["Enums"]["checkout_status"]
          total_ugx: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          client_reference: string
          consumer_id: string
          created_at?: string
          currency_code?: string
          delivery_fee_ugx?: number
          id?: string
          items_subtotal_ugx: number
          market_id: string
          reference: string
          reservation_expires_at: string
          service_fee_ugx?: number
          status?: Database["public"]["Enums"]["checkout_status"]
          total_ugx: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          client_reference?: string
          consumer_id?: string
          created_at?: string
          currency_code?: string
          delivery_fee_ugx?: number
          id?: string
          items_subtotal_ugx?: number
          market_id?: string
          reference?: string
          reservation_expires_at?: string
          service_fee_ugx?: number
          status?: Database["public"]["Enums"]["checkout_status"]
          total_ugx?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_checkouts_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: true
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_checkouts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "customer_checkouts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "customer_checkouts_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          assigned_at: string | null
          assigned_transporter_id: string | null
          completed_at: string | null
          created_at: string
          delivery_group_id: string
          fee_ugx: number
          id: string
          reference: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          version: number
        }
        Insert: {
          assigned_at?: string | null
          assigned_transporter_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_group_id: string
          fee_ugx: number
          id?: string
          reference?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          assigned_at?: string | null
          assigned_transporter_id?: string | null
          completed_at?: string | null
          created_at?: string
          delivery_group_id?: string
          fee_ugx?: number
          id?: string
          reference?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_assigned_transporter_id_fkey"
            columns: ["assigned_transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_delivery_group_id_fkey"
            columns: ["delivery_group_id"]
            isOneToOne: true
            referencedRelation: "delivery_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_audit_events: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id: string | null
          created_at: string
          delivery_id: string
          details: Json
          id: number
          next_status: Database["public"]["Enums"]["delivery_status"] | null
          operation_id: string
          previous_status: Database["public"]["Enums"]["delivery_status"] | null
        }
        Insert: {
          action: string
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id: string
          details?: Json
          id?: never
          next_status?: Database["public"]["Enums"]["delivery_status"] | null
          operation_id: string
          previous_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id?: string
          details?: Json
          id?: never
          next_status?: Database["public"]["Enums"]["delivery_status"] | null
          operation_id?: string
          previous_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_audit_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_audit_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "delivery_operations"
            referencedColumns: ["operation_id"]
          },
        ]
      }
      delivery_confirmations: {
        Row: {
          confirmation_method:
            | Database["public"]["Enums"]["delivery_confirmation_method"]
            | null
          confirmed_at: string | null
          delivery_id: string
          expires_at: string
          failed_attempts: number
          locked_at: string | null
          pin_hash: string
          updated_at: string
        }
        Insert: {
          confirmation_method?:
            | Database["public"]["Enums"]["delivery_confirmation_method"]
            | null
          confirmed_at?: string | null
          delivery_id: string
          expires_at: string
          failed_attempts?: number
          locked_at?: string | null
          pin_hash: string
          updated_at?: string
        }
        Update: {
          confirmation_method?:
            | Database["public"]["Enums"]["delivery_confirmation_method"]
            | null
          confirmed_at?: string | null
          delivery_id?: string
          expires_at?: string
          failed_attempts?: number
          locked_at?: string | null
          pin_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_confirmations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_group_orders: {
        Row: {
          created_at: string
          delivery_group_id: string
          seller_order_id: string
        }
        Insert: {
          created_at?: string
          delivery_group_id: string
          seller_order_id: string
        }
        Update: {
          created_at?: string
          delivery_group_id?: string
          seller_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_group_orders_delivery_group_id_fkey"
            columns: ["delivery_group_id"]
            isOneToOne: false
            referencedRelation: "delivery_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_group_orders_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: true
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_groups: {
        Row: {
          address_label: string
          address_summary: string
          checkout_id: string
          consumer_id: string
          created_at: string
          delivery_address_id: string
          delivery_zone_id: string
          delivery_zone_name: string
          id: string
          market_id: string
          phone_number: string
          scheduled_for: string | null
          updated_at: string
        }
        Insert: {
          address_label: string
          address_summary: string
          checkout_id: string
          consumer_id: string
          created_at?: string
          delivery_address_id: string
          delivery_zone_id: string
          delivery_zone_name: string
          id?: string
          market_id: string
          phone_number: string
          scheduled_for?: string | null
          updated_at?: string
        }
        Update: {
          address_label?: string
          address_summary?: string
          checkout_id?: string
          consumer_id?: string
          created_at?: string
          delivery_address_id?: string
          delivery_zone_id?: string
          delivery_zone_name?: string
          id?: string
          market_id?: string
          phone_number?: string
          scheduled_for?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_groups_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: true
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_groups_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "consumer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_groups_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_groups_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "delivery_groups_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "delivery_groups_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_issue_operations: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          delivery_issue_id: string
          operation_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          delivery_issue_id: string
          operation_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          delivery_issue_id?: string
          operation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_issue_operations_delivery_issue_id_fkey"
            columns: ["delivery_issue_id"]
            isOneToOne: false
            referencedRelation: "delivery_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_issues: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["delivery_issue_reason"]
          reported_by_user_id: string
          reported_delivery_status: Database["public"]["Enums"]["delivery_status"]
          reported_delivery_version: number
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          status: Database["public"]["Enums"]["delivery_issue_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["delivery_issue_reason"]
          reported_by_user_id: string
          reported_delivery_status: Database["public"]["Enums"]["delivery_status"]
          reported_delivery_version: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["delivery_issue_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["delivery_issue_reason"]
          reported_by_user_id?: string
          reported_delivery_status?: Database["public"]["Enums"]["delivery_status"]
          reported_delivery_version?: number
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          status?: Database["public"]["Enums"]["delivery_issue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_issues_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_offer_acceptance_operations: {
        Row: {
          actor_user_id: string
          created_at: string
          delivery_id: string
          expected_delivery_version: number
          offer_id: string
          operation_id: string
          result_delivery_version: number
          transporter_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          delivery_id: string
          expected_delivery_version: number
          offer_id: string
          operation_id: string
          result_delivery_version: number
          transporter_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          delivery_id?: string
          expected_delivery_version?: number
          offer_id?: string
          operation_id?: string
          result_delivery_version?: number
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offer_acceptance_ope_offer_id_delivery_id_transpo_fkey"
            columns: ["offer_id", "delivery_id", "transporter_id"]
            isOneToOne: false
            referencedRelation: "delivery_offers"
            referencedColumns: ["id", "delivery_id", "transporter_id"]
          },
        ]
      }
      delivery_offer_rejection_operations: {
        Row: {
          actor_user_id: string
          created_at: string
          offer_id: string
          operation_id: string
          transporter_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          offer_id: string
          operation_id: string
          transporter_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          offer_id?: string
          operation_id?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offer_rejection_operations_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "delivery_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_offer_rejection_operations_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_offer_waves: {
        Row: {
          completed_at: string | null
          created_at: string
          delivery_id: string
          expires_at: string
          id: string
          max_distance_km: number
          max_offers: number
          offer_ttl_seconds: number
          offered_count: number
          operation_id: string
          started_at: string
          status: Database["public"]["Enums"]["delivery_offer_wave_status"]
          wave_number: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          delivery_id: string
          expires_at: string
          id?: string
          max_distance_km: number
          max_offers: number
          offer_ttl_seconds: number
          offered_count?: number
          operation_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["delivery_offer_wave_status"]
          wave_number: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          delivery_id?: string
          expires_at?: string
          id?: string
          max_distance_km?: number
          max_offers?: number
          offer_ttl_seconds?: number
          offered_count?: number
          operation_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["delivery_offer_wave_status"]
          wave_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offer_waves_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_offers: {
        Row: {
          accepted_at: string | null
          created_at: string
          delivery_id: string
          distance_km: number
          expires_at: string
          id: string
          offered_at: string
          rejected_at: string | null
          status: Database["public"]["Enums"]["delivery_offer_status"]
          transporter_id: string
          wave_id: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          delivery_id: string
          distance_km: number
          expires_at: string
          id?: string
          offered_at?: string
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["delivery_offer_status"]
          transporter_id: string
          wave_id: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          delivery_id?: string
          distance_km?: number
          expires_at?: string
          id?: string
          offered_at?: string
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["delivery_offer_status"]
          transporter_id?: string
          wave_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_offers_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_offers_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_offers_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "delivery_offer_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_operations: {
        Row: {
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id: string | null
          created_at: string
          delivery_id: string
          expected_version: number
          metadata: Json
          operation_id: string
          reason: string | null
          requested_status: Database["public"]["Enums"]["delivery_status"]
          result_status: Database["public"]["Enums"]["delivery_status"]
          result_version: number
        }
        Insert: {
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id: string
          expected_version: number
          metadata?: Json
          operation_id: string
          reason?: string | null
          requested_status: Database["public"]["Enums"]["delivery_status"]
          result_status: Database["public"]["Enums"]["delivery_status"]
          result_version: number
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id?: string
          expected_version?: number
          metadata?: Json
          operation_id?: string
          reason?: string | null
          requested_status?: Database["public"]["Enums"]["delivery_status"]
          result_status?: Database["public"]["Enums"]["delivery_status"]
          result_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_operations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pickup_audit_events: {
        Row: {
          action: string
          actor_type: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id: string
          created_at: string
          id: number
          operation_id: string
          pickup_id: string
        }
        Insert: {
          action: string
          actor_type: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id: string
          created_at?: string
          id?: never
          operation_id: string
          pickup_id: string
        }
        Update: {
          action?: string
          actor_type?: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id?: string
          created_at?: string
          id?: never
          operation_id?: string
          pickup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pickup_audit_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "delivery_pickup_operations"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "delivery_pickup_audit_events_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "delivery_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pickup_operations: {
        Row: {
          actor_type: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id: string
          created_at: string
          operation_id: string
          pickup_id: string
          result_status: Database["public"]["Enums"]["delivery_pickup_status"]
        }
        Insert: {
          actor_type: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id: string
          created_at?: string
          operation_id: string
          pickup_id: string
          result_status: Database["public"]["Enums"]["delivery_pickup_status"]
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["delivery_pickup_actor_type"]
          actor_user_id?: string
          created_at?: string
          operation_id?: string
          pickup_id?: string
          result_status?: Database["public"]["Enums"]["delivery_pickup_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pickup_operations_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: false
            referencedRelation: "delivery_pickups"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pickups: {
        Row: {
          collected_at: string | null
          created_at: string
          delivery_id: string
          id: string
          rider_confirmed_at: string | null
          rider_confirmed_by: string | null
          seller_order_id: string
          status: Database["public"]["Enums"]["delivery_pickup_status"]
          updated_at: string
          vendor_confirmed_at: string | null
          vendor_confirmed_by: string | null
        }
        Insert: {
          collected_at?: string | null
          created_at?: string
          delivery_id: string
          id?: string
          rider_confirmed_at?: string | null
          rider_confirmed_by?: string | null
          seller_order_id: string
          status?: Database["public"]["Enums"]["delivery_pickup_status"]
          updated_at?: string
          vendor_confirmed_at?: string | null
          vendor_confirmed_by?: string | null
        }
        Update: {
          collected_at?: string | null
          created_at?: string
          delivery_id?: string
          id?: string
          rider_confirmed_at?: string | null
          rider_confirmed_by?: string | null
          seller_order_id?: string
          status?: Database["public"]["Enums"]["delivery_pickup_status"]
          updated_at?: string
          vendor_confirmed_at?: string | null
          vendor_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pickups_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_pickups_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_pin_confirmation_operations: {
        Row: {
          actor_user_id: string
          confirmed: boolean
          created_at: string
          delivery_id: string
          operation_id: string
          remaining_attempts: number
        }
        Insert: {
          actor_user_id: string
          confirmed: boolean
          created_at?: string
          delivery_id: string
          operation_id: string
          remaining_attempts: number
        }
        Update: {
          actor_user_id?: string
          confirmed?: boolean
          created_at?: string
          delivery_id?: string
          operation_id?: string
          remaining_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_pin_confirmation_operations_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_proof_images: {
        Row: {
          accuracy_meters: number | null
          byte_size: number
          captured_at: string
          created_at: string
          delivery_id: string
          delivery_proof_id: string
          finalized_at: string | null
          height: number
          id: string
          latitude: number | null
          longitude: number | null
          mime_type: string
          storage_path: string
          thumbnail_path: string
          transporter_id: string
          upload_expires_at: string
          upload_status: Database["public"]["Enums"]["delivery_proof_upload_status"]
          width: number
        }
        Insert: {
          accuracy_meters?: number | null
          byte_size: number
          captured_at: string
          created_at?: string
          delivery_id: string
          delivery_proof_id: string
          finalized_at?: string | null
          height: number
          id: string
          latitude?: number | null
          longitude?: number | null
          mime_type: string
          storage_path: string
          thumbnail_path: string
          transporter_id: string
          upload_expires_at: string
          upload_status?: Database["public"]["Enums"]["delivery_proof_upload_status"]
          width: number
        }
        Update: {
          accuracy_meters?: number | null
          byte_size?: number
          captured_at?: string
          created_at?: string
          delivery_id?: string
          delivery_proof_id?: string
          finalized_at?: string | null
          height?: number
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string
          storage_path?: string
          thumbnail_path?: string
          transporter_id?: string
          upload_expires_at?: string
          upload_status?: Database["public"]["Enums"]["delivery_proof_upload_status"]
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proof_images_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_images_delivery_proof_id_fkey"
            columns: ["delivery_proof_id"]
            isOneToOne: false
            referencedRelation: "delivery_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_images_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_proofs: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          proof_completed_at: string | null
          transporter_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          proof_completed_at?: string | null
          transporter_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          proof_completed_at?: string | null
          transporter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proofs_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proofs_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_status_history: {
        Row: {
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id: string | null
          created_at: string
          delivery_id: string
          from_status: Database["public"]["Enums"]["delivery_status"]
          from_version: number
          id: number
          operation_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["delivery_status"]
          to_version: number
        }
        Insert: {
          actor_type: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id: string
          from_status: Database["public"]["Enums"]["delivery_status"]
          from_version: number
          id?: never
          operation_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["delivery_status"]
          to_version: number
        }
        Update: {
          actor_type?: Database["public"]["Enums"]["delivery_actor_type"]
          actor_user_id?: string | null
          created_at?: string
          delivery_id?: string
          from_status?: Database["public"]["Enums"]["delivery_status"]
          from_version?: number
          id?: never
          operation_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["delivery_status"]
          to_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_status_history_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_status_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "delivery_operations"
            referencedColumns: ["operation_id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          created_at: string
          delivery_fee_ugx: number
          id: string
          is_active: boolean
          market_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_fee_ugx: number
          id?: string
          is_active?: boolean
          market_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_fee_ugx?: number
          id?: string
          is_active?: boolean
          market_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "delivery_zones_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["market_id"]
          },
          {
            foreignKeyName: "delivery_zones_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_records: {
        Row: {
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          locked_until: string | null
          operation: string
          request_hash: string
          response_body: Json | null
          response_status: number | null
          status: Database["public"]["Enums"]["idempotency_status"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          idempotency_key: string
          locked_until?: string | null
          operation: string
          request_hash: string
          response_body?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          locked_until?: string | null
          operation?: string
          request_hash?: string
          response_body?: Json | null
          response_status?: number | null
          status?: Database["public"]["Enums"]["idempotency_status"]
          user_id?: string
        }
        Relationships: []
      }
      inventory_reservations: {
        Row: {
          checkout_id: string
          committed_at: string | null
          created_at: string
          expires_at: string
          id: string
          listing_id: string
          quantity: number
          release_reason: string | null
          released_at: string | null
          seller_order_id: string
          status: Database["public"]["Enums"]["inventory_reservation_status"]
        }
        Insert: {
          checkout_id: string
          committed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          listing_id: string
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          seller_order_id: string
          status?: Database["public"]["Enums"]["inventory_reservation_status"]
        }
        Update: {
          checkout_id?: string
          committed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          listing_id?: string
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          seller_order_id?: string
          status?: Database["public"]["Enums"]["inventory_reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_seller_order_id_fkey"
            columns: ["seller_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
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
          low_stock_threshold: number
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
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
          low_stock_threshold?: number
          package_quantity: number
          package_unit: string
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
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
          low_stock_threshold?: number
          package_quantity?: number
          package_unit?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          stock_available?: number | null
          stock_on_hand?: number
          stock_reserved?: number
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
      market_pickup_payment_records: {
        Row: {
          amount_received_ugx: number
          checkout_id: string
          collection_method: Database["public"]["Enums"]["market_pickup_collection_method"]
          currency_code: string
          id: string
          operation_id: string
          payment_attempt_id: string
          recorded_at: string
          recorded_by: string
        }
        Insert: {
          amount_received_ugx: number
          checkout_id: string
          collection_method: Database["public"]["Enums"]["market_pickup_collection_method"]
          currency_code: string
          id?: string
          operation_id: string
          payment_attempt_id: string
          recorded_at?: string
          recorded_by: string
        }
        Update: {
          amount_received_ugx?: number
          checkout_id?: string
          collection_method?: Database["public"]["Enums"]["market_pickup_collection_method"]
          currency_code?: string
          id?: string
          operation_id?: string
          payment_attempt_id?: string
          recorded_at?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_pickup_payment_records_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: true
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_pickup_payment_records_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: true
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_audit_events: {
        Row: {
          action: string
          created_at: string
          delivery_id: string | null
          details: Json
          id: number
          notification_event_id: string
        }
        Insert: {
          action: string
          created_at?: string
          delivery_id?: string | null
          details?: Json
          id?: never
          notification_event_id: string
        }
        Update: {
          action?: string
          created_at?: string
          delivery_id?: string | null
          details?: Json
          id?: never
          notification_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_audit_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_audit_events_notification_event_id_fkey"
            columns: ["notification_event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          available_at: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivered_at: string | null
          destination: string | null
          event_id: string
          failure_reason: string | null
          id: string
          last_attempted_at: string | null
          locked_at: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          event_id: string
          failure_reason?: string | null
          id?: string
          last_attempted_at?: string | null
          locked_at?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          event_id?: string
          failure_reason?: string | null
          id?: string
          last_attempted_at?: string | null
          locked_at?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_devices: {
        Row: {
          created_at: string
          enabled: boolean
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          payload: Json
          priority: Database["public"]["Enums"]["notification_priority"]
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          payload?: Json
          priority?: Database["public"]["Enums"]["notification_priority"]
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount_ugx: number
          checkout_id: string
          consumer_id: string
          created_at: string
          currency_code: string
          expires_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          initiated_at: string | null
          merchant_reference: string
          next_reconciliation_at: string | null
          payer_phone_e164: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_confirmation_code: string | null
          provider_redirect_url: string | null
          provider_request_reference: string | null
          provider_transaction_id: string | null
          reconciliation_claimed_until: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          version: number
        }
        Insert: {
          amount_ugx: number
          checkout_id: string
          consumer_id: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          initiated_at?: string | null
          merchant_reference: string
          next_reconciliation_at?: string | null
          payer_phone_e164?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_confirmation_code?: string | null
          provider_redirect_url?: string | null
          provider_request_reference?: string | null
          provider_transaction_id?: string | null
          reconciliation_claimed_until?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          amount_ugx?: number
          checkout_id?: string
          consumer_id?: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          initiated_at?: string | null
          merchant_reference?: string
          next_reconciliation_at?: string | null
          payer_phone_e164?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_confirmation_code?: string | null
          provider_redirect_url?: string | null
          provider_request_reference?: string | null
          provider_transaction_id?: string | null
          reconciliation_claimed_until?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempt_checkout_owner_fk"
            columns: ["checkout_id", "consumer_id"]
            isOneToOne: false
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id", "consumer_id"]
          },
        ]
      }
      payment_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: string
          next_status: Database["public"]["Enums"]["payment_status"] | null
          payment_attempt_id: string
          previous_status: Database["public"]["Enums"]["payment_status"] | null
          provider_event_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          next_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_attempt_id: string
          previous_status?: Database["public"]["Enums"]["payment_status"] | null
          provider_event_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          next_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_attempt_id?: string
          previous_status?: Database["public"]["Enums"]["payment_status"] | null
          provider_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_events_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_audit_events_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_events"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_events: {
        Row: {
          authenticity_verified_at: string | null
          headers_redacted: Json | null
          id: string
          merchant_reference: string | null
          payload: Json
          payload_hash: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["payment_event_processing_status"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id: string | null
          provider_transaction_id: string | null
          received_at: string
          rejection_reason: string | null
          request_id: string | null
          signature_verified: boolean
          verification_method: string | null
        }
        Insert: {
          authenticity_verified_at?: string | null
          headers_redacted?: Json | null
          id?: string
          merchant_reference?: string | null
          payload: Json
          payload_hash: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["payment_event_processing_status"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          provider_transaction_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          request_id?: string | null
          signature_verified?: boolean
          verification_method?: string | null
        }
        Update: {
          authenticity_verified_at?: string | null
          headers_redacted?: Json | null
          id?: string
          merchant_reference?: string | null
          payload?: Json
          payload_hash?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["payment_event_processing_status"]
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          provider_transaction_id?: string | null
          received_at?: string
          rejection_reason?: string | null
          request_id?: string | null
          signature_verified?: boolean
          verification_method?: string | null
        }
        Relationships: []
      }
      payment_reconciliation_runs: {
        Row: {
          created_at: string
          id: string
          payment_attempt_id: string
          previous_status: Database["public"]["Enums"]["payment_status"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_amount_ugx: number | null
          provider_currency: string | null
          provider_response: Json | null
          provider_status: string | null
          requested_by: string | null
          result: Database["public"]["Enums"]["reconciliation_result"]
          run_source: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_attempt_id: string
          previous_status: Database["public"]["Enums"]["payment_status"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_amount_ugx?: number | null
          provider_currency?: string | null
          provider_response?: Json | null
          provider_status?: string | null
          requested_by?: string | null
          result: Database["public"]["Enums"]["reconciliation_result"]
          run_source: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_attempt_id?: string
          previous_status?: Database["public"]["Enums"]["payment_status"]
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_amount_ugx?: number | null
          provider_currency?: string | null
          provider_response?: Json | null
          provider_status?: string | null
          requested_by?: string | null
          result?: Database["public"]["Enums"]["reconciliation_result"]
          run_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliation_attempt_provider_fk"
            columns: ["payment_attempt_id", "provider"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id", "provider"]
          },
        ]
      }
      quality_check_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          details: Json
          id: number
          operation_id: string
          quality_check_id: string
          seller_id: string
          vendor_order_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          details?: Json
          id?: never
          operation_id: string
          quality_check_id: string
          seller_id: string
          vendor_order_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          details?: Json
          id?: never
          operation_id?: string
          quality_check_id?: string
          seller_id?: string
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_check_audit_events_quality_check_id_fkey"
            columns: ["quality_check_id"]
            isOneToOne: false
            referencedRelation: "quality_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_check_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "quality_check_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "quality_check_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quality_check_audit_events_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_check_images: {
        Row: {
          byte_size: number
          created_at: string
          height: number
          id: string
          is_packing_proof: boolean
          mime_type: string
          quality_check_id: string
          storage_bucket: string
          storage_path: string
          thumbnail_path: string | null
          upload_expires_at: string | null
          upload_status: Database["public"]["Enums"]["quality_image_upload_status"]
          vendor_order_id: string
          width: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          height: number
          id?: string
          is_packing_proof?: boolean
          mime_type: string
          quality_check_id: string
          storage_bucket?: string
          storage_path: string
          thumbnail_path?: string | null
          upload_expires_at?: string | null
          upload_status?: Database["public"]["Enums"]["quality_image_upload_status"]
          vendor_order_id: string
          width: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          height?: number
          id?: string
          is_packing_proof?: boolean
          mime_type?: string
          quality_check_id?: string
          storage_bucket?: string
          storage_path?: string
          thumbnail_path?: string | null
          upload_expires_at?: string | null
          upload_status?: Database["public"]["Enums"]["quality_image_upload_status"]
          vendor_order_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "quality_check_images_quality_check_id_vendor_order_id_fkey"
            columns: ["quality_check_id", "vendor_order_id"]
            isOneToOne: false
            referencedRelation: "quality_checks"
            referencedColumns: ["id", "vendor_order_id"]
          },
        ]
      }
      quality_checks: {
        Row: {
          checklist: Json
          completion_operation_id: string | null
          created_at: string
          id: string
          notes: string | null
          packed_by_user_id: string | null
          seller_id: string
          status: Database["public"]["Enums"]["quality_check_status"]
          updated_at: string
          vendor_order_id: string
          verified_at: string | null
        }
        Insert: {
          checklist?: Json
          completion_operation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          packed_by_user_id?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["quality_check_status"]
          updated_at?: string
          vendor_order_id: string
          verified_at?: string | null
        }
        Update: {
          checklist?: Json
          completion_operation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          packed_by_user_id?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["quality_check_status"]
          updated_at?: string
          vendor_order_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quality_checks_vendor_order_id_seller_id_fkey"
            columns: ["vendor_order_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id", "seller_id"]
          },
        ]
      }
      permissions: {
        Row: { created_at: string; description: string; key: string }
        Insert: { created_at?: string; description: string; key: string }
        Update: { created_at?: string; description?: string; key?: string }
        Relationships: []
      }
      role_permissions: {
        Row: { created_at: string; permission: string; role: Database["public"]["Enums"]["staff_role"] }
        Insert: { created_at?: string; permission: string; role: Database["public"]["Enums"]["staff_role"] }
        Update: { created_at?: string; permission?: string; role?: Database["public"]["Enums"]["staff_role"] }
        Relationships: [{ foreignKeyName: "role_permissions_permission_fkey"; columns: ["permission"]; isOneToOne: false; referencedRelation: "permissions"; referencedColumns: ["key"] }]
      }
      staff_members: {
        Row: { created_at: string; display_name: string; role: Database["public"]["Enums"]["staff_role"]; status: Database["public"]["Enums"]["staff_status"]; updated_at: string; user_id: string }
        Insert: { created_at?: string; display_name: string; role: Database["public"]["Enums"]["staff_role"]; status?: Database["public"]["Enums"]["staff_status"]; updated_at?: string; user_id: string }
        Update: { created_at?: string; display_name?: string; role?: Database["public"]["Enums"]["staff_role"]; status?: Database["public"]["Enums"]["staff_status"]; updated_at?: string; user_id?: string }
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
      transporter_availability_history: {
        Row: {
          created_at: string
          from_availability: Database["public"]["Enums"]["rider_availability"]
          id: number
          operation_id: string
          to_availability: Database["public"]["Enums"]["rider_availability"]
          transporter_id: string
        }
        Insert: {
          created_at?: string
          from_availability: Database["public"]["Enums"]["rider_availability"]
          id?: never
          operation_id: string
          to_availability: Database["public"]["Enums"]["rider_availability"]
          transporter_id: string
        }
        Update: {
          created_at?: string
          from_availability?: Database["public"]["Enums"]["rider_availability"]
          id?: never
          operation_id?: string
          to_availability?: Database["public"]["Enums"]["rider_availability"]
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_availability_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "transporter_availability_operations"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "transporter_availability_history_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_availability_operations: {
        Row: {
          created_at: string
          operation_id: string
          previous_availability: Database["public"]["Enums"]["rider_availability"]
          requested_availability: Database["public"]["Enums"]["rider_availability"]
          result_availability: Database["public"]["Enums"]["rider_availability"]
          transporter_id: string
        }
        Insert: {
          created_at?: string
          operation_id: string
          previous_availability: Database["public"]["Enums"]["rider_availability"]
          requested_availability: Database["public"]["Enums"]["rider_availability"]
          result_availability: Database["public"]["Enums"]["rider_availability"]
          transporter_id: string
        }
        Update: {
          created_at?: string
          operation_id?: string
          previous_availability?: Database["public"]["Enums"]["rider_availability"]
          requested_availability?: Database["public"]["Enums"]["rider_availability"]
          result_availability?: Database["public"]["Enums"]["rider_availability"]
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_availability_operations_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_location_operations: {
        Row: {
          accuracy_meters: number
          captured_at: string
          latitude: number
          longitude: number
          operation_id: string
          received_at: string
          transporter_id: string
        }
        Insert: {
          accuracy_meters: number
          captured_at: string
          latitude: number
          longitude: number
          operation_id: string
          received_at?: string
          transporter_id: string
        }
        Update: {
          accuracy_meters?: number
          captured_at?: string
          latitude?: number
          longitude?: number
          operation_id?: string
          received_at?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_location_operations_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_locations_current: {
        Row: {
          accuracy_meters: number
          captured_at: string
          latitude: number
          longitude: number
          received_at: string
          transporter_id: string
        }
        Insert: {
          accuracy_meters: number
          captured_at: string
          latitude: number
          longitude: number
          received_at?: string
          transporter_id: string
        }
        Update: {
          accuracy_meters?: number
          captured_at?: string
          latitude?: number
          longitude?: number
          received_at?: string
          transporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_locations_current_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: true
            referencedRelation: "transporter_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_profiles: {
        Row: {
          availability: Database["public"]["Enums"]["rider_availability"]
          availability_updated_at: string
          created_at: string
          display_name: string
          id: string
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["transporter_verification_status"]
        }
        Insert: {
          availability?: Database["public"]["Enums"]["rider_availability"]
          availability_updated_at?: string
          created_at?: string
          display_name: string
          id?: string
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["transporter_verification_status"]
        }
        Update: {
          availability?: Database["public"]["Enums"]["rider_availability"]
          availability_updated_at?: string
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["transporter_verification_status"]
        }
        Relationships: []
      }
      vendor_order_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          details: Json
          id: number
          next_status: Database["public"]["Enums"]["vendor_order_status"] | null
          operation_id: string
          previous_status:
            | Database["public"]["Enums"]["vendor_order_status"]
            | null
          seller_id: string
          vendor_order_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          details?: Json
          id?: never
          next_status?:
            | Database["public"]["Enums"]["vendor_order_status"]
            | null
          operation_id: string
          previous_status?:
            | Database["public"]["Enums"]["vendor_order_status"]
            | null
          seller_id: string
          vendor_order_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          details?: Json
          id?: never
          next_status?:
            | Database["public"]["Enums"]["vendor_order_status"]
            | null
          operation_id?: string
          previous_status?:
            | Database["public"]["Enums"]["vendor_order_status"]
            | null
          seller_id?: string
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_order_audit_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_operations"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "vendor_order_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_audit_events_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_audit_events_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_order_items: {
        Row: {
          created_at: string
          id: string
          line_total_ugx: number
          listing_id: string
          package_quantity: number
          package_unit: string
          product_name: string
          quantity: number
          seller_id: string
          thumbnail_bucket: string | null
          thumbnail_path: string | null
          unit_price_ugx: number
          vendor_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_ugx: number
          listing_id: string
          package_quantity: number
          package_unit: string
          product_name: string
          quantity: number
          seller_id: string
          thumbnail_bucket?: string | null
          thumbnail_path?: string | null
          unit_price_ugx: number
          vendor_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total_ugx?: number
          listing_id?: string
          package_quantity?: number
          package_unit?: string
          product_name?: string
          quantity?: number
          seller_id?: string
          thumbnail_bucket?: string | null
          thumbnail_path?: string | null
          unit_price_ugx?: number
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_items_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_order_operations: {
        Row: {
          actor_user_id: string
          created_at: string
          expected_version: number
          operation_id: string
          requested_status: Database["public"]["Enums"]["vendor_order_status"]
          result_status: Database["public"]["Enums"]["vendor_order_status"]
          result_version: number
          vendor_order_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          expected_version: number
          operation_id: string
          requested_status: Database["public"]["Enums"]["vendor_order_status"]
          result_status: Database["public"]["Enums"]["vendor_order_status"]
          result_version: number
          vendor_order_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          expected_version?: number
          operation_id?: string
          requested_status?: Database["public"]["Enums"]["vendor_order_status"]
          result_status?: Database["public"]["Enums"]["vendor_order_status"]
          result_version?: number
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_order_operations_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_order_status_history: {
        Row: {
          actor_user_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["vendor_order_status"]
          from_version: number
          id: number
          operation_id: string
          seller_id: string
          to_status: Database["public"]["Enums"]["vendor_order_status"]
          to_version: number
          vendor_order_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          from_status: Database["public"]["Enums"]["vendor_order_status"]
          from_version: number
          id?: never
          operation_id: string
          seller_id: string
          to_status: Database["public"]["Enums"]["vendor_order_status"]
          to_version: number
          vendor_order_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["vendor_order_status"]
          from_version?: number
          id?: never
          operation_id?: string
          seller_id?: string
          to_status?: Database["public"]["Enums"]["vendor_order_status"]
          to_version?: number
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_order_status_history_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "vendor_order_operations"
            referencedColumns: ["operation_id"]
          },
          {
            foreignKeyName: "vendor_order_status_history_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_status_history_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_order_status_history_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_order_status_history_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_orders: {
        Row: {
          checkout_id: string
          commission_ugx: number
          created_at: string
          id: string
          reference: string
          seller_id: string
          status: Database["public"]["Enums"]["vendor_order_status"]
          subtotal_ugx: number
          updated_at: string
          version: number
        }
        Insert: {
          checkout_id: string
          commission_ugx?: number
          created_at?: string
          id?: string
          reference: string
          seller_id: string
          status?: Database["public"]["Enums"]["vendor_order_status"]
          subtotal_ugx: number
          updated_at?: string
          version?: number
        }
        Update: {
          checkout_id?: string
          commission_ugx?: number
          created_at?: string
          id?: string
          reference?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["vendor_order_status"]
          subtotal_ugx?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_orders_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "customer_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_cards"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "catalogue_listing_details"
            referencedColumns: ["seller_id"]
          },
          {
            foreignKeyName: "vendor_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
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
      accept_delivery_offer: {
        Args: {
          p_expected_delivery_version: number
          p_offer_id: string
          p_operation_id: string
          p_transporter_user_id: string
        }
        Returns: Json
      }
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
          low_stock_threshold: number
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
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
      cart_owner_matches: {
        Args: {
          requested_cart: Database["public"]["Tables"]["carts"]["Row"]
          requested_consumer_id: string
          requested_guest_token_hash: string
          requested_installation_id: string
        }
        Returns: boolean
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
      claim_idempotency_record: {
        Args: {
          p_idempotency_key: string
          p_lock_seconds?: number
          p_operation: string
          p_request_hash: string
          p_ttl_hours?: number
          p_user_id: string
        }
        Returns: Json
      }
      claim_notification_deliveries: {
        Args: { p_batch_size: number; p_lease_seconds: number }
        Returns: {
          attempt_count: number
          available_at: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivered_at: string | null
          destination: string | null
          event_id: string
          failure_reason: string | null
          id: string
          last_attempted_at: string | null
          locked_at: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_payment_reconciliation_batch: {
        Args: { p_batch_size?: number; p_claim_seconds?: number }
        Returns: Json
      }
      cleanup_idempotency_records: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      clear_cart: {
        Args: {
          requested_cart_id: string
          requested_consumer_id?: string
          requested_guest_token_hash?: string
          requested_installation_id?: string
        }
        Returns: undefined
      }
      complete_delivery: {
        Args: {
          p_delivery_id: string
          p_expected_version: number
          p_operation_id: string
          p_rider_user_id: string
        }
        Returns: Json
      }
      complete_idempotency_record: {
        Args: {
          p_record_id: string
          p_response_body: Json
          p_response_status: number
        }
        Returns: undefined
      }
      complete_notification_delivery: {
        Args: {
          p_delivery_id: string
          p_destination: string
          p_provider_reference: string
        }
        Returns: undefined
      }
      complete_quality_check: {
        Args: {
          p_actor_user_id: string
          p_items_checked: boolean
          p_notes: string
          p_operation_id: string
          p_order_id: string
          p_packaging_secure: boolean
          p_quantities_checked: boolean
        }
        Returns: Json
      }
      confirm_delivery_consumer_pin: {
        Args: {
          p_delivery_id: string
          p_operation_id: string
          p_pin: string
          p_rider_user_id: string
        }
        Returns: Json
      }
      confirm_delivery_pickup: {
        Args: {
          p_actor_type: string
          p_actor_user_id: string
          p_operation_id: string
          p_seller_order_id: string
        }
        Returns: Json
      }
      create_checkout_from_cart: {
        Args: {
          p_address_id?: string
          p_cart_id: string
          p_client_reference?: string
          p_consumer_id: string
          p_delivery_zone_id?: string
          p_fulfilment_type: string
          p_market_id?: string
          p_requested_for?: string
          p_reservation_minutes?: number
          p_schedule_type?: string
        }
        Returns: Json
      }
      create_delivery_proof_image_intent: {
        Args: {
          p_accuracy_meters?: number
          p_byte_size: number
          p_captured_at: string
          p_delivery_id: string
          p_height: number
          p_image_id: string
          p_latitude?: number
          p_longitude?: number
          p_mime_type: string
          p_proof_id: string
          p_rider_user_id: string
          p_storage_path: string
          p_thumbnail_path: string
          p_width: number
        }
        Returns: Json
      }
      create_market_pickup_payment_attempt: {
        Args: { p_checkout_id: string; p_consumer_id: string }
        Returns: Json
      }
      create_pesapal_payment_attempt: {
        Args: {
          p_checkout_id: string
          p_consumer_id: string
          p_max_attempts?: number
          p_payer_phone_e164?: string
          p_pending_minutes?: number
        }
        Returns: Json
      }
      create_quality_image_intent: {
        Args: {
          p_actor_user_id: string
          p_byte_size: number
          p_height: number
          p_image_id: string
          p_mime_type: string
          p_order_id: string
          p_quality_check_id: string
          p_storage_path: string
          p_thumbnail_path: string
          p_width: number
        }
        Returns: Json
      }
      dispatcher_assign_delivery: {
        Args: {
          p_delivery_id: string
          p_dispatcher_user_id: string
          p_expected_version: number
          p_operation_id: string
          p_reason: string
          p_reassign?: boolean
          p_transporter_id: string
        }
        Returns: Json
      }
      dispatcher_delivery_action: {
        Args: {
          p_action: string
          p_delivery_id: string
          p_dispatcher_user_id: string
          p_expected_version: number
          p_operation_id: string
          p_reason: string
        }
        Returns: Json
      }
      ensure_delivery_proof: {
        Args: {
          p_delivery_id: string
          p_rider_user_id: string
          p_suggested_proof_id: string
        }
        Returns: Json
      }
      ensure_quality_check: {
        Args: {
          p_actor_user_id: string
          p_order_id: string
          p_suggested_check_id: string
        }
        Returns: Json
      }
      expire_delivery_offers: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      expire_inventory_reservations: {
        Args: { p_batch_size?: number }
        Returns: number
      }
      fail_idempotency_record: {
        Args: { p_record_id: string }
        Returns: undefined
      }
      fail_notification_delivery: {
        Args: {
          p_delivery_id: string
          p_enable_sms_fallback: boolean
          p_max_attempts: number
          p_reason: string
          p_retry_seconds: number
        }
        Returns: Database["public"]["Enums"]["notification_delivery_status"]
      }
      finalize_delivery_proof_image: {
        Args: {
          p_byte_size: number
          p_delivery_id: string
          p_height: number
          p_image_id: string
          p_mime_type: string
          p_rider_user_id: string
          p_storage_path: string
          p_thumbnail_path: string
          p_width: number
        }
        Returns: Json
      }
      finalize_quality_image: {
        Args: {
          p_actor_user_id: string
          p_byte_size: number
          p_height: number
          p_image_id: string
          p_mime_type: string
          p_order_id: string
          p_storage_path: string
          p_thumbnail_path: string
          p_width: number
        }
        Returns: Json
      }
      find_nearby_transporters: {
        Args: {
          p_delivery_id: string
          p_limit?: number
          p_max_distance_km?: number
        }
        Returns: {
          distance_km: number
          location_received_at: string
          transporter_id: string
        }[]
      }
      get_current_delivery_offer: { Args: { p_user_id: string }; Returns: Json }
      get_current_rider_delivery: { Args: { p_user_id: string }; Returns: Json }
      get_dispatcher_delivery_board: { Args: never; Returns: Json }
      get_dispatcher_nearby_riders: {
        Args: { p_delivery_id: string; p_radius_km?: number }
        Returns: Json
      }
      get_dispatcher_riders: { Args: never; Returns: Json }
      get_or_create_cart: {
        Args: {
          requested_consumer_id?: string
          requested_guest_token_hash?: string
          requested_installation_id?: string
          requested_market_id: string
        }
        Returns: string
      }
      get_transporter_operational_state: {
        Args: { p_user_id: string }
        Returns: Json
      }
      haversine_distance_km: {
        Args: {
          p_latitude_a: number
          p_latitude_b: number
          p_longitude_a: number
          p_longitude_b: number
        }
        Returns: number
      }
      listing_price_request_seller_matches: {
        Args: { requested_listing_id: string; requested_seller_id: string }
        Returns: boolean
      }
      mark_payment_attempt_pending: {
        Args: {
          p_payment_attempt_id: string
          p_provider_redirect_url: string
          p_provider_request_reference: string
          p_provider_transaction_id: string
        }
        Returns: undefined
      }
      mark_payment_attempt_uncertain: {
        Args: {
          p_failure_code: string
          p_failure_message: string
          p_payment_attempt_id: string
        }
        Returns: undefined
      }
      mark_payment_initiation_failed: {
        Args: {
          p_failure_code: string
          p_failure_message: string
          p_payment_attempt_id: string
        }
        Returns: undefined
      }
      merge_guest_cart: {
        Args: {
          requested_consumer_id: string
          requested_guest_cart_id: string
          requested_guest_token_hash: string
          requested_installation_id: string
        }
        Returns: Json
      }
      mutate_cart_item: {
        Args: {
          expected_cart_version?: number
          requested_cart_id: string
          requested_consumer_id?: string
          requested_guest_token_hash?: string
          requested_installation_id?: string
          requested_listing_id: string
          requested_operation_id?: string
          requested_quantity: number
        }
        Returns: string
      }
      offer_delivery_to_nearby_transporters: {
        Args: {
          p_delivery_id: string
          p_max_distance_km?: number
          p_max_offers?: number
          p_offer_ttl_seconds?: number
          p_operation_id: string
        }
        Returns: Json
      }
      owns_seller: { Args: { requested_seller_id: string }; Returns: boolean }
      process_payment_result: {
        Args: {
          p_amount_ugx: number
          p_confirmation_code?: string
          p_currency: string
          p_merchant_reference: string
          p_normalized_status: string
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_provider: Database["public"]["Enums"]["payment_provider"]
          p_provider_event_id?: string
          p_provider_message?: string
          p_provider_reason_code?: string
          p_provider_transaction_id: string
        }
        Returns: Json
      }
      record_market_pickup_payment: {
        Args: {
          p_actor_id: string
          p_actor_is_operations: boolean
          p_amount_received_ugx: number
          p_checkout_id: string
          p_collection_method: Database["public"]["Enums"]["market_pickup_collection_method"]
          p_currency: string
          p_operation_id: string
          p_pickup_code: string
        }
        Returns: Json
      }
      reject_delivery_offer: {
        Args: {
          p_offer_id: string
          p_operation_id: string
          p_transporter_user_id: string
        }
        Returns: Json
      }
      release_payment_reconciliation_claim: {
        Args: { p_next_seconds?: number; p_payment_attempt_id: string }
        Returns: undefined
      }
      report_delivery_issue: {
        Args: {
          p_delivery_id: string
          p_expected_version: number
          p_note: string
          p_operation_id: string
          p_reason: string
          p_rider_user_id: string
        }
        Returns: Json
      }
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
          low_stock_threshold: number
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
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
      resolve_delivery_issue: {
        Args: {
          p_dispatcher_user_id: string
          p_issue_id: string
          p_operation_id: string
          p_resolution_code: string
          p_resolution_note: string
        }
        Returns: Json
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
      rotate_delivery_pin: {
        Args: { p_consumer_user_id: string; p_delivery_id: string }
        Returns: Json
      }
      set_transporter_availability: {
        Args: {
          p_availability: string
          p_operation_id: string
          p_user_id: string
        }
        Returns: Json
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
          low_stock_threshold: number
          package_quantity: number
          package_unit: string
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          stock_available: number | null
          stock_on_hand: number
          stock_reserved: number
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
      transition_delivery: {
        Args: {
          p_actor_type: string
          p_actor_user_id: string
          p_delivery_id: string
          p_expected_version: number
          p_metadata?: Json
          p_operation_id: string
          p_reason?: string
          p_to_status: string
        }
        Returns: Json
      }
      transition_vendor_order: {
        Args: {
          p_actor_user_id: string
          p_expected_version: number
          p_operation_id: string
          p_order_id: string
          p_to_status: string
        }
        Returns: Json
      }
      update_transporter_location: {
        Args: {
          p_accuracy_meters: number
          p_captured_at: string
          p_latitude: number
          p_longitude: number
          p_operation_id: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      cart_status: "active" | "merged" | "converted" | "abandoned" | "expired"
      checkout_status:
        | "awaiting_payment"
        | "payment_failed"
        | "paid"
        | "confirmed_unpaid"
        | "expired"
        | "cancelled"
      delivery_actor_type: "system" | "rider" | "dispatcher"
      delivery_confirmation_method: "pin"
      delivery_issue_reason:
        | "CUSTOMER_UNAVAILABLE"
        | "CUSTOMER_REJECTED_ORDER"
        | "INCORRECT_ADDRESS"
        | "PRODUCT_DAMAGED"
        | "VEHICLE_PROBLEM"
        | "SELLER_ORDER_MISSING"
        | "UNSAFE_DELIVERY_LOCATION"
        | "OTHER"
      delivery_issue_status: "open" | "resolved"
      delivery_offer_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "expired"
        | "withdrawn"
      delivery_offer_wave_status: "open" | "accepted" | "expired" | "exhausted"
      delivery_pickup_actor_type: "vendor" | "rider"
      delivery_pickup_status: "pending" | "collected"
      delivery_proof_upload_status: "pending" | "ready" | "invalidated"
      delivery_status:
        | "unassigned"
        | "offering"
        | "assigned"
        | "arrived_at_market"
        | "picked_up"
        | "in_transit"
        | "arrived_at_customer"
        | "delivered"
        | "assignment_cancelled"
        | "pickup_failed"
        | "delivery_failed"
        | "customer_unavailable"
        | "issue_reported"
        | "returned"
      fulfilment_type: "delivery" | "market_pickup"
      idempotency_status: "processing" | "completed" | "failed"
      inventory_reservation_status:
        | "active"
        | "committed"
        | "released"
        | "expired"
      listing_availability: "available" | "low_stock" | "unavailable"
      listing_status:
        | "draft"
        | "pending_approval"
        | "changes_requested"
        | "active"
        | "paused"
        | "archived"
      market_pickup_collection_method:
        | "cash"
        | "mobile_money"
        | "card"
        | "other"
      notification_channel: "push" | "sms"
      notification_delivery_status:
        | "pending"
        | "processing"
        | "failed"
        | "delivered"
        | "dead_letter"
      notification_priority: "normal" | "critical"
      payment_event_processing_status:
        | "received"
        | "verified"
        | "processed"
        | "duplicate"
        | "rejected"
        | "failed"
      payment_method:
        | "mtn_momo"
        | "airtel_money"
        | "visa"
        | "mastercard"
        | "card"
        | "bank"
        | "market_pickup"
        | "unknown"
      payment_provider: "pesapal" | "market_pickup"
      payment_status:
        | "created"
        | "initiating"
        | "pending"
        | "successful"
        | "failed"
        | "cancelled"
        | "expired"
        | "requires_reconciliation"
      price_review_status: "pending" | "approved" | "rejected" | "cancelled"
      quality_check_status: "draft" | "completed" | "invalidated"
      quality_image_upload_status: "pending" | "ready" | "invalidated"
      reconciliation_result:
        | "matched"
        | "status_updated"
        | "amount_mismatch"
        | "reference_mismatch"
        | "provider_not_found"
        | "manual_review_required"
        | "no_change"
      rider_availability:
        | "offline"
        | "available"
        | "offer_pending"
        | "assigned"
        | "busy"
      schedule_type: "immediate" | "scheduled"
      seller_verification_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
      staff_role: "admin" | "agent" | "dispatcher" | "finance" | "viewer"
      staff_status: "active" | "suspended" | "disabled"
      transporter_verification_status:
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
      vendor_order_status:
        | "awaiting_payment"
        | "confirmed"
        | "awaiting_vendor_acceptance"
        | "accepted"
        | "preparing"
        | "quality_verified"
        | "ready_for_pickup"
        | "issue_reported"
        | "expired"
        | "cancelled"
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
      cart_status: ["active", "merged", "converted", "abandoned", "expired"],
      checkout_status: [
        "awaiting_payment",
        "payment_failed",
        "paid",
        "confirmed_unpaid",
        "expired",
        "cancelled",
      ],
      delivery_actor_type: ["system", "rider", "dispatcher"],
      delivery_confirmation_method: ["pin"],
      delivery_issue_reason: [
        "CUSTOMER_UNAVAILABLE",
        "CUSTOMER_REJECTED_ORDER",
        "INCORRECT_ADDRESS",
        "PRODUCT_DAMAGED",
        "VEHICLE_PROBLEM",
        "SELLER_ORDER_MISSING",
        "UNSAFE_DELIVERY_LOCATION",
        "OTHER",
      ],
      delivery_issue_status: ["open", "resolved"],
      delivery_offer_status: [
        "pending",
        "accepted",
        "rejected",
        "expired",
        "withdrawn",
      ],
      delivery_offer_wave_status: ["open", "accepted", "expired", "exhausted"],
      delivery_pickup_actor_type: ["vendor", "rider"],
      delivery_pickup_status: ["pending", "collected"],
      delivery_proof_upload_status: ["pending", "ready", "invalidated"],
      delivery_status: [
        "unassigned",
        "offering",
        "assigned",
        "arrived_at_market",
        "picked_up",
        "in_transit",
        "arrived_at_customer",
        "delivered",
        "assignment_cancelled",
        "pickup_failed",
        "delivery_failed",
        "customer_unavailable",
        "issue_reported",
        "returned",
      ],
      fulfilment_type: ["delivery", "market_pickup"],
      idempotency_status: ["processing", "completed", "failed"],
      inventory_reservation_status: [
        "active",
        "committed",
        "released",
        "expired",
      ],
      listing_availability: ["available", "low_stock", "unavailable"],
      listing_status: [
        "draft",
        "pending_approval",
        "changes_requested",
        "active",
        "paused",
        "archived",
      ],
      market_pickup_collection_method: [
        "cash",
        "mobile_money",
        "card",
        "other",
      ],
      notification_channel: ["push", "sms"],
      notification_delivery_status: [
        "pending",
        "processing",
        "failed",
        "delivered",
        "dead_letter",
      ],
      notification_priority: ["normal", "critical"],
      payment_event_processing_status: [
        "received",
        "verified",
        "processed",
        "duplicate",
        "rejected",
        "failed",
      ],
      payment_method: [
        "mtn_momo",
        "airtel_money",
        "visa",
        "mastercard",
        "card",
        "bank",
        "market_pickup",
        "unknown",
      ],
      payment_provider: ["pesapal", "market_pickup"],
      payment_status: [
        "created",
        "initiating",
        "pending",
        "successful",
        "failed",
        "cancelled",
        "expired",
        "requires_reconciliation",
      ],
      price_review_status: ["pending", "approved", "rejected", "cancelled"],
      quality_check_status: ["draft", "completed", "invalidated"],
      quality_image_upload_status: ["pending", "ready", "invalidated"],
      reconciliation_result: [
        "matched",
        "status_updated",
        "amount_mismatch",
        "reference_mismatch",
        "provider_not_found",
        "manual_review_required",
        "no_change",
      ],
      rider_availability: [
        "offline",
        "available",
        "offer_pending",
        "assigned",
        "busy",
      ],
      schedule_type: ["immediate", "scheduled"],
      seller_verification_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
      staff_role: ["admin", "agent", "dispatcher", "finance", "viewer"],
      staff_status: ["active", "suspended", "disabled"],
      transporter_verification_status: [
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
      vendor_order_status: [
        "awaiting_payment",
        "confirmed",
        "awaiting_vendor_acceptance",
        "accepted",
        "preparing",
        "quality_verified",
        "ready_for_pickup",
        "issue_reported",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
