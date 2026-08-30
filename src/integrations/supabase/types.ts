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
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_debts: {
        Row: {
          created_at: string
          customer_id: string
          customer_name: string
          due_date: string | null
          id: string
          notes: string
          original_amount: number
          paid_amount: number
          remaining_amount: number
          sale_id: string | null
          sale_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_name: string
          due_date?: string | null
          id?: string
          notes?: string
          original_amount: number
          paid_amount?: number
          remaining_amount: number
          sale_id?: string | null
          sale_number?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          notes?: string
          original_amount?: number
          paid_amount?: number
          remaining_amount?: number
          sale_id?: string | null
          sale_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_debts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          customer_name: string
          debt_id: string | null
          id: string
          notes: string
          payment_method: string
          payment_number: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          customer_name: string
          debt_id?: string | null
          id?: string
          notes?: string
          payment_method?: string
          payment_number: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          customer_name?: string
          debt_id?: string | null
          id?: string
          notes?: string
          payment_method?: string
          payment_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "customer_debts"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          created_at: string
          credit_limit: number
          current_debt: number
          email: string
          id: string
          is_active: boolean
          name: string
          notes: string
          phone: string
          total_spent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          credit_limit?: number
          current_debt?: number
          email?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          phone?: string
          total_spent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          credit_limit?: number
          current_debt?: number
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
          phone?: string
          total_spent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debt_reminders: {
        Row: {
          channel: string
          created_at: string
          customer_id: string | null
          customer_name: string
          debt_id: string | null
          error: string
          id: string
          message: string
          phone: string
          provider_message_id: string
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          debt_id?: string | null
          error?: string
          id?: string
          message?: string
          phone?: string
          provider_message_id?: string
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          debt_id?: string | null
          error?: string
          id?: string
          message?: string
          phone?: string
          provider_message_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_reminders_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "customer_debts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          new_stock: number
          notes: string
          previous_stock: number
          product_id: string | null
          product_name: string
          quantity: number
          reason: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_stock?: number
          notes?: string
          previous_stock?: number
          product_id?: string | null
          product_name?: string
          quantity: number
          reason?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_stock?: number
          notes?: string
          previous_stock?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          reason?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          batches: number
          created_at: string
          id: string
          notes: string
          produced_quantity: number
          product_id: string | null
          product_name: string
          recipe_id: string | null
          recipe_name: string
          status: string
          total_cost: number
          unit_cost: number
          user_id: string
        }
        Insert: {
          batches?: number
          created_at?: string
          id?: string
          notes?: string
          produced_quantity?: number
          product_id?: string | null
          product_name?: string
          recipe_id?: string | null
          recipe_name?: string
          status?: string
          total_cost?: number
          unit_cost?: number
          user_id: string
        }
        Update: {
          batches?: number
          created_at?: string
          id?: string
          notes?: string
          produced_quantity?: number
          product_id?: string | null
          product_name?: string
          recipe_id?: string | null
          recipe_name?: string
          status?: string
          total_cost?: number
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost_price: number
          created_at: string
          current_stock: number
          description: string
          id: string
          image_url: string | null
          min_stock: number
          name: string
          product_type: string
          sale_price: number
          sku: string
          status: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          current_stock?: number
          description?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          product_type?: string
          sale_price?: number
          sku?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          current_stock?: number
          description?: string
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          product_type?: string
          sale_price?: number
          sku?: string
          status?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_name: string
          created_at: string
          currency: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          business_name?: string
          created_at?: string
          currency?: string
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          currency?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          recipe_id: string
          unit: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity: number
          recipe_id: string
          unit?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          recipe_id?: string
          unit?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          additional_cost: number
          created_at: string
          description: string
          id: string
          name: string
          product_id: string | null
          product_name: string
          status: string
          updated_at: string
          user_id: string
          yield_quantity: number
          yield_unit: string
        }
        Insert: {
          additional_cost?: number
          created_at?: string
          description?: string
          id?: string
          name: string
          product_id?: string | null
          product_name?: string
          status?: string
          updated_at?: string
          user_id: string
          yield_quantity?: number
          yield_unit?: string
        }
        Update: {
          additional_cost?: number
          created_at?: string
          description?: string
          id?: string
          name?: string
          product_id?: string | null
          product_name?: string
          status?: string
          updated_at?: string
          user_id?: string
          yield_quantity?: number
          yield_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          product_unit: string
          profit: number
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          user_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          product_unit?: string
          profit?: number
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          user_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          product_unit?: string
          profit?: number
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          change_amount: number
          cost_total: number
          created_at: string
          customer_id: string | null
          customer_name: string
          discount_amount: number
          final_total: number
          gross_profit: number
          id: string
          notes: string
          paid_amount: number
          payment_method: string
          payment_status: string
          remaining_debt: number
          sale_number: string
          status: string
          subtotal: number
          total_items: number
          user_id: string
        }
        Insert: {
          change_amount?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          discount_amount?: number
          final_total?: number
          gross_profit?: number
          id?: string
          notes?: string
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          remaining_debt?: number
          sale_number: string
          status?: string
          subtotal?: number
          total_items?: number
          user_id: string
        }
        Update: {
          change_amount?: number
          cost_total?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          discount_amount?: number
          final_total?: number
          gross_profit?: number
          id?: string
          notes?: string
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          remaining_debt?: number
          sale_number?: string
          status?: string
          subtotal?: number
          total_items?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          owner_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      products_secure: {
        Row: {
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          current_stock: number | null
          description: string | null
          id: string | null
          min_stock: number | null
          name: string | null
          product_type: string | null
          sale_price: number | null
          sku: string | null
          status: string | null
          unit: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category_id?: string | null
          cost_price?: never
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string | null
          min_stock?: number | null
          name?: string | null
          product_type?: string | null
          sale_price?: number | null
          sku?: string | null
          status?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category_id?: string | null
          cost_price?: never
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string | null
          min_stock?: number | null
          name?: string | null
          product_type?: string | null
          sale_price?: number | null
          sku?: string | null
          status?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_secure: {
        Row: {
          change_amount: number | null
          cost_total: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          discount_amount: number | null
          final_total: number | null
          gross_profit: number | null
          id: string | null
          notes: string | null
          paid_amount: number | null
          payment_method: string | null
          payment_status: string | null
          remaining_debt: number | null
          sale_number: string | null
          status: string | null
          subtotal: number | null
          total_items: number | null
          user_id: string | null
        }
        Insert: {
          change_amount?: number | null
          cost_total?: never
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          final_total?: number | null
          gross_profit?: never
          id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string | null
          remaining_debt?: number | null
          sale_number?: string | null
          status?: string | null
          subtotal?: number | null
          total_items?: number | null
          user_id?: string | null
        }
        Update: {
          change_amount?: number | null
          cost_total?: never
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number | null
          final_total?: number | null
          gross_profit?: never
          id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string | null
          remaining_debt?: number | null
          sale_number?: string | null
          status?: string | null
          subtotal?: number | null
          total_items?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_type: string
        }
        Returns: undefined
      }
      business_id: { Args: { _user_id: string }; Returns: string }
      create_sale: {
        Args: {
          p_customer_id?: string
          p_discount?: number
          p_items: Json
          p_notes?: string
          p_paid?: number
          p_payment_method?: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_employee: { Args: { p_email: string }; Returns: undefined }
      list_employees: {
        Args: never
        Returns: {
          created_at: string
          email: string
          user_id: string
        }[]
      }
      pay_debt: {
        Args: {
          p_amount: number
          p_debt_id: string
          p_method?: string
          p_notes?: string
        }
        Returns: undefined
      }
      produce_recipe: {
        Args: { p_batches?: number; p_notes?: string; p_recipe_id: string }
        Returns: string
      }
      remove_employee: { Args: { p_user_id: string }; Returns: undefined }
      save_recipe: {
        Args: {
          p_additional_cost: number
          p_ingredients: Json
          p_name: string
          p_product_id: string
          p_recipe_id: string
          p_yield_quantity: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "dono" | "funcionario"
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
      app_role: ["dono", "funcionario"],
    },
  },
} as const
