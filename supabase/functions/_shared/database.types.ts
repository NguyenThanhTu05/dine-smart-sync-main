// Generated from the configured Supabase cloud schema on 2026-10-09.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          at: string
          distance_m: number | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          user_id: string
        }
        Insert: {
          at?: string
          distance_m?: number | null
          id?: string
          kind: string
          latitude?: number | null
          longitude?: number | null
          user_id: string
        }
        Update: {
          at?: string
          distance_m?: number | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          user_id?: string
        }
        Relationships: []
      }
      attendance_settings: {
        Row: {
          id: number
          latitude: number
          longitude: number
          radius_m: number
          updated_at: string
        }
        Insert: {
          id?: never
          latitude: number
          longitude: number
          radius_m?: number
          updated_at?: string
        }
        Update: {
          id?: never
          latitude?: number
          longitude?: number
          radius_m?: number
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          created_at: string
          id: string
          min_stock: number
          name: string
          stock: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          stock?: number
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          stock?: number
          unit?: string
        }
        Relationships: []
      }
      kitchen_tasks: {
        Row: {
          created_at: string | null
          id: string
          menu_item_id: string | null
          order_id: string | null
          order_item_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          menu_item_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          menu_item_id?: string | null
          order_id?: string | null
          order_item_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_tasks_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_available: boolean
          is_default: boolean
          name: string
          no_cook: boolean | null
          price: number
          recipe: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_default?: boolean
          name: string
          no_cook?: boolean | null
          price?: number
          recipe?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_default?: boolean
          name?: string
          no_cook?: boolean | null
          price?: number
          recipe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          menu_item_id: string
          name_snapshot: string
          no_cook: boolean
          notes: string | null
          order_id: string
          price_snapshot: number
          quantity: number
          served_at: string | null
          status: Database["public"]["Enums"]["order_item_status"]
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          menu_item_id: string
          name_snapshot: string
          no_cook?: boolean
          notes?: string | null
          order_id: string
          price_snapshot: number
          quantity?: number
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          menu_item_id?: string
          name_snapshot?: string
          no_cook?: boolean
          notes?: string | null
          order_id?: string
          price_snapshot?: number
          quantity?: number
          served_at?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          discount_percent: number | null
          id: string
          is_paid: boolean
          notes: string | null
          payment_snapshot: Json | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          staff_id: string | null
          table_id: string
          total: number
        }
        Insert: {
          created_at?: string
          discount_percent?: number | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          payment_snapshot?: Json | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          staff_id?: string | null
          table_id: string
          total?: number
        }
        Update: {
          created_at?: string
          discount_percent?: number | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          payment_snapshot?: Json | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          staff_id?: string | null
          table_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_holder: string | null
          account_number: string | null
          address: string | null
          bank_name: string | null
          extra_qr_url: string | null
          footer_note: string | null
          global_discount_percent: number | null
          id: number
          logo_url: string | null
          phone: string | null
          policy_note: string | null
          qr_image_url: string | null
          service_percent: number
          shop_name: string | null
          slogan: string | null
          tax_code: string | null
          updated_at: string
          vat_percent: number
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          extra_qr_url?: string | null
          footer_note?: string | null
          global_discount_percent?: number | null
          id?: never
          logo_url?: string | null
          phone?: string | null
          policy_note?: string | null
          qr_image_url?: string | null
          service_percent?: number
          shop_name?: string | null
          slogan?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_percent?: number
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          address?: string | null
          bank_name?: string | null
          extra_qr_url?: string | null
          footer_note?: string | null
          global_discount_percent?: number | null
          id?: never
          logo_url?: string | null
          phone?: string | null
          policy_note?: string | null
          qr_image_url?: string | null
          service_percent?: number
          shop_name?: string | null
          slogan?: string | null
          tax_code?: string | null
          updated_at?: string
          vat_percent?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          birthday: string | null
          created_at: string
          full_name: string
          hide_personal: boolean
          hire_date: string
          id: string
          phone: string | null
          username: string
          visible_password: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          full_name: string
          hide_personal?: boolean
          hire_date?: string
          id: string
          phone?: string | null
          username: string
          visible_password?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          created_at?: string
          full_name?: string
          hide_personal?: boolean
          hire_date?: string
          id?: string
          phone?: string | null
          username?: string
          visible_password?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          created_at: string | null
          id: string
          ingredient_id: string | null
          menu_item_id: string | null
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_id?: string | null
          menu_item_id?: string | null
          quantity?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_id?: string | null
          menu_item_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          area_id: string | null
          created_at: string
          id: string
          merged_group_id: string | null
          name: string
          position_x: number | null
          position_y: number | null
          seats: number
          sort_order: number
          status: Database["public"]["Enums"]["table_status"]
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          id?: string
          merged_group_id?: string | null
          name: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["table_status"]
        }
        Update: {
          area_id?: string | null
          created_at?: string
          id?: string
          merged_group_id?: string | null
          name?: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["table_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_restaurant_tables_group"
            columns: ["merged_group_id"]
            isOneToOne: false
            referencedRelation: "table_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          ingredient_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          ingredient_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          ingredient_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      table_groups: {
        Row: {
          created_at: string
          display_name: string
          id: string
          primary_table_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          primary_table_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          primary_table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_groups_primary_table_id_fkey"
            columns: ["primary_table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      restaurant_open_order: { Args: { p_table: string }; Returns: Json }
      restaurant_attendance: { Args: { p_kind: string; p_lat: number; p_lon: number; p_request: string }; Returns: Json }
      restaurant_staff: { Args: { p_user: string; p_profile: Json; p_role?: string | null; p_initialize?: boolean }; Returns: undefined }
      restaurant_menu: { Args: { p_id: string | null; p_data: Json; p_expected?: Json | null }; Returns: Json }
      restaurant_recipe: { Args: { p_action: string; p_menu: string; p_rows: Json; p_expected?: Json | null }; Returns: Json }
      restaurant_stock: { Args: { p_action: string; p_id: string | null; p_data: Json; p_request: string }; Returns: Json }
      restaurant_move_table: { Args: { p_source: string; p_target?: string | null; p_area?: string | null }; Returns: undefined }
      // Local contract for pending 20261009020000; regenerate after approved deployment.
      restaurant_edit_table: { Args: { p_table: string; p_patch: Json }; Returns: Json }
      restaurant_quote: { Args: { p_order: string }; Returns: Json }
      restaurant_submit_order: { Args: { p_table: string; p_lines: Json; p_notes: string; p_request: string }; Returns: string }
      restaurant_payment: { Args: { p_order: string; p_action: string; p_fingerprint: string }; Returns: Json }
      restaurant_merge: { Args: { p_source: string; p_target: string }; Returns: string }
      restaurant_release: { Args: { p_table: string; p_cleanup: boolean }; Returns: string[] }
      restaurant_item: { Args: { p_item: string; p_action: string }; Returns: undefined }
      restaurant_adjust: { Args: { p_order: string; p_action: string; p_value: Json; p_reason: string }; Returns: undefined }
      restaurant_directory: { Args: never; Returns: { id: string; full_name: string; username: string; phone: string | null; address: string | null; birthday: string | null; avatar_url: string | null; hide_personal: boolean; hire_date: string | null; role: Database['public']['Enums']['app_role'] | null }[] }

      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_role_by_username: { Args: { p_username: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated: { Args: never; Returns: boolean }
      seed_demo_menu: { Args: never; Returns: undefined }
      seed_demo_tables: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "cashier" | "kitchen" | "staff"
      order_item_status: "pending" | "cooking" | "done" | "served"
      payment_method: "cash" | "qr"
      table_status: "empty" | "serving" | "awaiting_payment" | "needs_cleanup"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "cashier", "kitchen", "staff"],
      order_item_status: ["pending", "cooking", "done", "served"],
      payment_method: ["cash", "qr"],
      table_status: ["empty", "serving", "awaiting_payment", "needs_cleanup"],
    },
  },
} as const
