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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_system: boolean
          stream_id: string
          user_id: string | null
          username: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_system?: boolean
          stream_id: string
          user_id?: string | null
          username: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_system?: boolean
          stream_id?: string
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read: boolean
          recipient_id: string
          sender_id: string
          sender_username: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id: string
          sender_id: string
          sender_username: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read?: boolean
          recipient_id?: string
          sender_id?: string
          sender_username?: string
        }
        Relationships: []
      }
      listing_bids: {
        Row: {
          amount: number
          created_at: string
          id: string
          listing_id: string
          user_id: string
          username: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
          username: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_bids_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_bids_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          accepts_offers: boolean
          auction_ends_at: string | null
          created_at: string
          current_bid: number | null
          description: string | null
          id: string
          image_url: string | null
          is_auction: boolean
          listing_type: string
          price: number | null
          seller_id: string
          starting_bid: number | null
          title: string
        }
        Insert: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          created_at?: string
          current_bid?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_auction?: boolean
          listing_type?: string
          price?: number | null
          seller_id: string
          starting_bid?: number | null
          title: string
        }
        Update: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          created_at?: string
          current_bid?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_auction?: boolean
          listing_type?: string
          price?: number | null
          seller_id?: string
          starting_bid?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      live_streams: {
        Row: {
          created_at: string
          current_bid: number
          current_bidder_id: string | null
          current_item: string | null
          ended_at: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          item_description: string | null
          item_image_url: string | null
          listing_type: string
          min_bid_increment: number
          seller_id: string
          shipping_method: string | null
          shipping_price: number | null
          started_at: string | null
          starting_bid: number
          status: string
          thumbnail_url: string | null
          title: string
          winner_id: string | null
          winner_username: string | null
          winning_bid: number | null
        }
        Insert: {
          created_at?: string
          current_bid?: number
          current_bidder_id?: string | null
          current_item?: string | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          item_description?: string | null
          item_image_url?: string | null
          listing_type?: string
          min_bid_increment?: number
          seller_id: string
          shipping_method?: string | null
          shipping_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          thumbnail_url?: string | null
          title: string
          winner_id?: string | null
          winner_username?: string | null
          winning_bid?: number | null
        }
        Update: {
          created_at?: string
          current_bid?: number
          current_bidder_id?: string | null
          current_item?: string | null
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          item_description?: string | null
          item_image_url?: string | null
          listing_type?: string
          min_bid_increment?: number
          seller_id?: string
          shipping_method?: string | null
          shipping_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          thumbnail_url?: string | null
          title?: string
          winner_id?: string | null
          winner_username?: string | null
          winning_bid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_requests: {
        Row: {
          created_at: string
          id: string
          last_request_at: string
          recipient_id: string
          sender_id: string
          sender_username: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_request_at?: string
          recipient_id: string
          sender_id: string
          sender_username: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_request_at?: string
          recipient_id?: string
          sender_id?: string
          sender_username?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          link: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at: string
          id: string
          listing_id: string
          seller_id: string
          status: string
        }
        Insert: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at?: string
          id?: string
          listing_id: string
          seller_id: string
          status?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          buyer_username?: string
          created_at?: string
          id?: string
          listing_id?: string
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          buyer_id: string
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          listing_id: string | null
          seller_id: string
          ship_address: string
          ship_city: string
          ship_country: string
          ship_name: string
          ship_state: string | null
          ship_zip: string
          shipped_at: string | null
          status: string
          title: string
          tracking_number: string | null
        }
        Insert: {
          amount: number
          buyer_id: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          listing_id?: string | null
          seller_id: string
          ship_address: string
          ship_city: string
          ship_country?: string
          ship_name: string
          ship_state?: string | null
          ship_zip: string
          shipped_at?: string | null
          status?: string
          title: string
          tracking_number?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          listing_id?: string | null
          seller_id?: string
          ship_address?: string
          ship_city?: string
          ship_country?: string
          ship_name?: string
          ship_state?: string | null
          ship_zip?: string
          shipped_at?: string | null
          status?: string
          title?: string
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      post_edits: {
        Row: {
          action: string
          edited_at: string
          id: string
          post_id: string
          prev_caption: string | null
          prev_image_url: string | null
          user_id: string
        }
        Insert: {
          action?: string
          edited_at?: string
          id?: string
          post_id: string
          prev_caption?: string | null
          prev_image_url?: string | null
          user_id: string
        }
        Update: {
          action?: string
          edited_at?: string
          id?: string
          post_id?: string
          prev_caption?: string | null
          prev_image_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string
          created_at: string
          id: string
          image_url: string | null
          user_id: string
          username: string
        }
        Insert: {
          caption: string
          created_at?: string
          id?: string
          image_url?: string | null
          user_id: string
          username: string
        }
        Update: {
          caption?: string
          created_at?: string
          id?: string
          image_url?: string | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_seller: boolean
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_seller?: boolean
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_seller?: boolean
          username?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          id: string
          item_image_url: string | null
          item_name: string
          listing_id: string | null
          seller_id: string
          stream_id: string | null
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string
          id?: string
          item_image_url?: string | null
          item_name: string
          listing_id?: string | null
          seller_id: string
          stream_id?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          id?: string
          item_image_url?: string | null
          item_name?: string
          listing_id?: string | null
          seller_id?: string
          stream_id?: string | null
        }
        Relationships: []
      }
      vault_cards: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          estimated_value: number | null
          id: string
          image_url: string | null
          last_valued_at: string | null
          name: string
          price: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          image_url?: string | null
          last_valued_at?: string | null
          name: string
          price?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          image_url?: string | null
          last_valued_at?: string | null
          name?: string
          price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
