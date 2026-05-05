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
      audit_log: {
        Row: {
          actor_id: string | null
          actor_username: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          stream_id: string | null
          target_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          stream_id?: string | null
          target_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          stream_id?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      break_slots: {
        Row: {
          amount: number
          assigned_at: string | null
          buyer_id: string
          buyer_username: string
          character_label: string | null
          created_at: string
          id: string
          order_id: string | null
          slot_number: number | null
          stream_id: string
          team_label: string | null
        }
        Insert: {
          amount: number
          assigned_at?: string | null
          buyer_id: string
          buyer_username: string
          character_label?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          slot_number?: number | null
          stream_id: string
          team_label?: string | null
        }
        Update: {
          amount?: number
          assigned_at?: string | null
          buyer_id?: string
          buyer_username?: string
          character_label?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          slot_number?: number | null
          stream_id?: string
          team_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "break_slots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_announcement: boolean
          is_hype: boolean
          is_system: boolean
          stream_id: string
          user_id: string | null
          username: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          is_hype?: boolean
          is_system?: boolean
          stream_id: string
          user_id?: string | null
          username: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          is_hype?: boolean
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
      disputes: {
        Row: {
          created_at: string
          description: string
          evidence_urls: string[] | null
          id: string
          order_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          reporter_username: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          evidence_urls?: string[] | null
          id?: string
          order_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          reporter_username: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          evidence_urls?: string[] | null
          id?: string
          order_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          reporter_username?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      giveaway_entries: {
        Row: {
          created_at: string
          giveaway_id: string
          id: string
          reaction_ms: number | null
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          giveaway_id: string
          id?: string
          reaction_ms?: number | null
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          giveaway_id?: string
          id?: string
          reaction_ms?: number | null
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_entries_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaways: {
        Row: {
          closed_at: string | null
          code: string
          created_at: string
          drawn_at: string | null
          duration_sec: number
          eligibility: string
          ends_at: string | null
          id: string
          opened_at: string
          prize_label: string
          quantity: number
          seller_id: string
          shipping_covered: boolean
          status: string
          stream_id: string
          title: string
          updated_at: string
          winner_id: string | null
          winner_username: string | null
        }
        Insert: {
          closed_at?: string | null
          code: string
          created_at?: string
          drawn_at?: string | null
          duration_sec?: number
          eligibility?: string
          ends_at?: string | null
          id?: string
          opened_at?: string
          prize_label: string
          quantity?: number
          seller_id: string
          shipping_covered?: boolean
          status?: string
          stream_id: string
          title?: string
          updated_at?: string
          winner_id?: string | null
          winner_username?: string | null
        }
        Update: {
          closed_at?: string | null
          code?: string
          created_at?: string
          drawn_at?: string | null
          duration_sec?: number
          eligibility?: string
          ends_at?: string | null
          id?: string
          opened_at?: string
          prize_label?: string
          quantity?: number
          seller_id?: string
          shipping_covered?: boolean
          status?: string
          stream_id?: string
          title?: string
          updated_at?: string
          winner_id?: string | null
          winner_username?: string | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          version?: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
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
          auction_status: string
          back_image_url: string | null
          buy_now_price: number | null
          condition: Database["public"]["Enums"]["card_condition"] | null
          created_at: string
          current_bid: number | null
          description: string | null
          expires_at: string
          id: string
          image_url: string | null
          is_auction: boolean
          listing_type: string
          price: number | null
          reserve_price: number | null
          seller_id: string
          shipping_price: number | null
          starting_bid: number | null
          tcg_number: string | null
          tcg_set: string | null
          tcg_year: string | null
          title: string
          top_bidder_id: string | null
        }
        Insert: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          auction_status?: string
          back_image_url?: string | null
          buy_now_price?: number | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          current_bid?: number | null
          description?: string | null
          expires_at?: string
          id?: string
          image_url?: string | null
          is_auction?: boolean
          listing_type?: string
          price?: number | null
          reserve_price?: number | null
          seller_id: string
          shipping_price?: number | null
          starting_bid?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          title: string
          top_bidder_id?: string | null
        }
        Update: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          auction_status?: string
          back_image_url?: string | null
          buy_now_price?: number | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          current_bid?: number | null
          description?: string | null
          expires_at?: string
          id?: string
          image_url?: string | null
          is_auction?: boolean
          listing_type?: string
          price?: number | null
          reserve_price?: number | null
          seller_id?: string
          shipping_price?: number | null
          starting_bid?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          title?: string
          top_bidder_id?: string | null
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
      live_stream_presence: {
        Row: {
          avatar_url: string | null
          last_seen_at: string
          stream_id: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          last_seen_at?: string
          stream_id: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          last_seen_at?: string
          stream_id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      live_streams: {
        Row: {
          break_characters: Json | null
          break_force_visible: boolean
          break_mode: string | null
          break_slot_count: number | null
          break_slot_prefix: string | null
          break_slot_price: number
          break_teams: Json | null
          break_wheel_ends_at: string | null
          break_wheel_last_winner_label: string | null
          break_wheel_last_winner_username: string | null
          break_wheel_spinning: boolean
          break_wheel_started_at: string | null
          break_wheel_target_slot: number | null
          cf_live_input_id: string | null
          cf_playback_hls: string | null
          cf_rtmps_url: string | null
          cf_stream_key: string | null
          cf_video_uid: string | null
          chat_slow_mode_sec: number
          created_at: string
          current_bid: number
          current_bidder_id: string | null
          current_condition:
            | Database["public"]["Enums"]["card_condition"]
            | null
          current_item: string | null
          current_tcg_number: string | null
          current_tcg_set: string | null
          default_condition:
            | Database["public"]["Enums"]["card_condition"]
            | null
          default_starting_bid: number
          default_timer_sec: number
          ended_at: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          item_description: string | null
          item_image_url: string | null
          listing_type: string
          min_bid_increment: number
          quantity: number
          quantity_remaining: number | null
          quick_start_enabled: boolean
          quick_start_quantity: number
          quick_start_remaining: number | null
          round_number: number
          seller_id: string
          shipping_method: string | null
          shipping_price: number | null
          snipe_extends: number
          snipe_price: number | null
          started_at: string | null
          starting_bid: number
          status: string
          sudden_death_active: boolean
          sudden_death_enabled: boolean
          sudden_death_max_triggers: number
          sudden_death_seconds_added: number
          sudden_death_triggers_used: number
          thumbnail_url: string | null
          title: string
          voice_trigger_enabled: boolean
          voice_trigger_phrase: string | null
          winner_id: string | null
          winner_username: string | null
          winning_bid: number | null
        }
        Insert: {
          break_characters?: Json | null
          break_force_visible?: boolean
          break_mode?: string | null
          break_slot_count?: number | null
          break_slot_prefix?: string | null
          break_slot_price?: number
          break_teams?: Json | null
          break_wheel_ends_at?: string | null
          break_wheel_last_winner_label?: string | null
          break_wheel_last_winner_username?: string | null
          break_wheel_spinning?: boolean
          break_wheel_started_at?: string | null
          break_wheel_target_slot?: number | null
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_video_uid?: string | null
          chat_slow_mode_sec?: number
          created_at?: string
          current_bid?: number
          current_bidder_id?: string | null
          current_condition?:
            | Database["public"]["Enums"]["card_condition"]
            | null
          current_item?: string | null
          current_tcg_number?: string | null
          current_tcg_set?: string | null
          default_condition?:
            | Database["public"]["Enums"]["card_condition"]
            | null
          default_starting_bid?: number
          default_timer_sec?: number
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          item_description?: string | null
          item_image_url?: string | null
          listing_type?: string
          min_bid_increment?: number
          quantity?: number
          quantity_remaining?: number | null
          quick_start_enabled?: boolean
          quick_start_quantity?: number
          quick_start_remaining?: number | null
          round_number?: number
          seller_id: string
          shipping_method?: string | null
          shipping_price?: number | null
          snipe_extends?: number
          snipe_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          sudden_death_active?: boolean
          sudden_death_enabled?: boolean
          sudden_death_max_triggers?: number
          sudden_death_seconds_added?: number
          sudden_death_triggers_used?: number
          thumbnail_url?: string | null
          title: string
          voice_trigger_enabled?: boolean
          voice_trigger_phrase?: string | null
          winner_id?: string | null
          winner_username?: string | null
          winning_bid?: number | null
        }
        Update: {
          break_characters?: Json | null
          break_force_visible?: boolean
          break_mode?: string | null
          break_slot_count?: number | null
          break_slot_prefix?: string | null
          break_slot_price?: number
          break_teams?: Json | null
          break_wheel_ends_at?: string | null
          break_wheel_last_winner_label?: string | null
          break_wheel_last_winner_username?: string | null
          break_wheel_spinning?: boolean
          break_wheel_started_at?: string | null
          break_wheel_target_slot?: number | null
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_video_uid?: string | null
          chat_slow_mode_sec?: number
          created_at?: string
          current_bid?: number
          current_bidder_id?: string | null
          current_condition?:
            | Database["public"]["Enums"]["card_condition"]
            | null
          current_item?: string | null
          current_tcg_number?: string | null
          current_tcg_set?: string | null
          default_condition?:
            | Database["public"]["Enums"]["card_condition"]
            | null
          default_starting_bid?: number
          default_timer_sec?: number
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          item_description?: string | null
          item_image_url?: string | null
          listing_type?: string
          min_bid_increment?: number
          quantity?: number
          quantity_remaining?: number | null
          quick_start_enabled?: boolean
          quick_start_quantity?: number
          quick_start_remaining?: number | null
          round_number?: number
          seller_id?: string
          shipping_method?: string | null
          shipping_price?: number | null
          snipe_extends?: number
          snipe_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          sudden_death_active?: boolean
          sudden_death_enabled?: boolean
          sudden_death_max_triggers?: number
          sudden_death_seconds_added?: number
          sudden_death_triggers_used?: number
          thumbnail_url?: string | null
          title?: string
          voice_trigger_enabled?: boolean
          voice_trigger_phrase?: string | null
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
          sender_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          sender_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          sender_id?: string | null
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
          expires_at: string
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
          expires_at?: string
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
          expires_at?: string
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
          commission_amount: number | null
          commission_rate: number
          condition: Database["public"]["Enums"]["card_condition"] | null
          created_at: string
          delivered_at: string | null
          description: string | null
          id: string
          item_image_url: string | null
          listing_id: string | null
          order_group_id: string | null
          paid_at: string | null
          payment_status: string
          seller_id: string
          seller_payout_amount: number | null
          seller_stripe_account_id: string | null
          ship_address: string
          ship_city: string
          ship_country: string
          ship_name: string
          ship_state: string | null
          ship_zip: string
          shipped_at: string | null
          status: string
          stream_id: string | null
          title: string
          tracking_number: string | null
          tracking_url: string | null
        }
        Insert: {
          amount: number
          buyer_id: string
          carrier?: string | null
          commission_amount?: number | null
          commission_rate?: number
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          item_image_url?: string | null
          listing_id?: string | null
          order_group_id?: string | null
          paid_at?: string | null
          payment_status?: string
          seller_id: string
          seller_payout_amount?: number | null
          seller_stripe_account_id?: string | null
          ship_address: string
          ship_city: string
          ship_country?: string
          ship_name: string
          ship_state?: string | null
          ship_zip: string
          shipped_at?: string | null
          status?: string
          stream_id?: string | null
          title: string
          tracking_number?: string | null
          tracking_url?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string
          carrier?: string | null
          commission_amount?: number | null
          commission_rate?: number
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          id?: string
          item_image_url?: string | null
          listing_id?: string | null
          order_group_id?: string | null
          paid_at?: string | null
          payment_status?: string
          seller_id?: string
          seller_payout_amount?: number | null
          seller_stripe_account_id?: string | null
          ship_address?: string
          ship_city?: string
          ship_country?: string
          ship_name?: string
          ship_state?: string | null
          ship_zip?: string
          shipped_at?: string | null
          status?: string
          stream_id?: string | null
          title?: string
          tracking_number?: string | null
          tracking_url?: string | null
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
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
          username: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
          username: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
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
          allow_comments: boolean
          caption: string
          created_at: string
          id: string
          image_url: string | null
          moderation_reason: string | null
          moderation_status: string
          user_id: string
          username: string
          visibility: string
        }
        Insert: {
          allow_comments?: boolean
          caption: string
          created_at?: string
          id?: string
          image_url?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          user_id: string
          username: string
          visibility?: string
        }
        Update: {
          allow_comments?: boolean
          caption?: string
          created_at?: string
          id?: string
          image_url?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          user_id?: string
          username?: string
          visibility?: string
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
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_state: string | null
          address_zip: string | null
          avatar_url: string | null
          buyer_verified: boolean
          created_at: string
          full_name: string | null
          id: string
          id_document_url: string | null
          id_status: string
          is_seller: boolean
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          preferred_currency: string | null
          public_id: string | null
          seller_status: string
          shipping_cap: number | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_onboarding_status: string
          stripe_payouts_enabled: boolean
          username: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          buyer_verified?: boolean
          created_at?: string
          full_name?: string | null
          id: string
          id_document_url?: string | null
          id_status?: string
          is_seller?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_currency?: string | null
          public_id?: string | null
          seller_status?: string
          shipping_cap?: number | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_onboarding_status?: string
          stripe_payouts_enabled?: boolean
          username: string
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          buyer_verified?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          id_document_url?: string | null
          id_status?: string
          is_seller?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_currency?: string | null
          public_id?: string | null
          seller_status?: string
          shipping_cap?: number | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_onboarding_status?: string
          stripe_payouts_enabled?: boolean
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
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
      scheduled_shows: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          scheduled_for: string
          seller_id: string
          seller_username: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scheduled_for: string
          seller_id: string
          seller_username: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scheduled_for?: string
          seller_id?: string
          seller_username?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      seller_reviews: {
        Row: {
          buyer_id: string
          buyer_username: string
          comment: string | null
          created_at: string
          id: string
          order_id: string
          rating: number
          seller_id: string
          shipping_rating: number
        }
        Insert: {
          buyer_id: string
          buyer_username: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          rating: number
          seller_id: string
          shipping_rating: number
        }
        Update: {
          buyer_id?: string
          buyer_username?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          seller_id?: string
          shipping_rating?: number
        }
        Relationships: []
      }
      spin_wheels: {
        Row: {
          created_at: string
          id: string
          is_locked: boolean
          is_open: boolean
          is_spinning: boolean
          last_winner_at: string | null
          last_winner_slot_label: string | null
          last_winner_username: string | null
          mode: string
          pending_decision_slot_id: string | null
          pending_decision_slot_label: string | null
          seller_id: string
          spin_ends_at: string | null
          spin_seed: number | null
          spin_speed: string
          spin_started_at: string | null
          spin_target_slot_id: string | null
          stream_id: string
          title: string
          updated_at: string
          viewer_can_spin: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_locked?: boolean
          is_open?: boolean
          is_spinning?: boolean
          last_winner_at?: string | null
          last_winner_slot_label?: string | null
          last_winner_username?: string | null
          mode?: string
          pending_decision_slot_id?: string | null
          pending_decision_slot_label?: string | null
          seller_id: string
          spin_ends_at?: string | null
          spin_seed?: number | null
          spin_speed?: string
          spin_started_at?: string | null
          spin_target_slot_id?: string | null
          stream_id: string
          title?: string
          updated_at?: string
          viewer_can_spin?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_locked?: boolean
          is_open?: boolean
          is_spinning?: boolean
          last_winner_at?: string | null
          last_winner_slot_label?: string | null
          last_winner_username?: string | null
          mode?: string
          pending_decision_slot_id?: string | null
          pending_decision_slot_label?: string | null
          seller_id?: string
          spin_ends_at?: string | null
          spin_seed?: number | null
          spin_speed?: string
          spin_started_at?: string | null
          spin_target_slot_id?: string | null
          stream_id?: string
          title?: string
          updated_at?: string
          viewer_can_spin?: boolean
        }
        Relationships: []
      }
      stories: {
        Row: {
          avatar_url: string | null
          caption: string | null
          created_at: string
          expires_at: string
          id: string
          image_url: string
          user_id: string
          username: string
          visibility: string
        }
        Insert: {
          avatar_url?: string | null
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_url: string
          user_id: string
          username: string
          visibility?: string
        }
        Update: {
          avatar_url?: string | null
          caption?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_url?: string
          user_id?: string
          username?: string
          visibility?: string
        }
        Relationships: []
      }
      story_close_friends: {
        Row: {
          created_at: string
          friend_id: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          owner_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          owner_id?: string
        }
        Relationships: []
      }
      story_views: {
        Row: {
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      stream_chat_actions: {
        Row: {
          action: string
          by_user_id: string
          created_at: string
          expires_at: string | null
          id: string
          stream_id: string
          target_user_id: string
          target_username: string
        }
        Insert: {
          action: string
          by_user_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          stream_id: string
          target_user_id: string
          target_username: string
        }
        Update: {
          action?: string
          by_user_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          stream_id?: string
          target_user_id?: string
          target_username?: string
        }
        Relationships: []
      }
      stream_mod_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          stream_id: string
          user_id: string
          username: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          stream_id: string
          user_id: string
          username: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          stream_id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      stream_moderators: {
        Row: {
          created_at: string
          host_id: string
          id: string
          mod_user_id: string
          mod_username: string
          stream_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          mod_user_id: string
          mod_username: string
          stream_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          mod_user_id?: string
          mod_username?: string
          stream_id?: string
        }
        Relationships: []
      }
      stream_shoutouts: {
        Row: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at: string
          id: string
          message: string
          paid_at: string | null
          seller_id: string
          status: string
          stream_id: string
        }
        Insert: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at?: string
          id?: string
          message: string
          paid_at?: string | null
          seller_id: string
          status?: string
          stream_id: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          buyer_username?: string
          created_at?: string
          id?: string
          message?: string
          paid_at?: string | null
          seller_id?: string
          status?: string
          stream_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          category: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
          reporter_username: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string | null
          target_label: string | null
          target_type: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          reporter_username: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_type: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          reporter_username?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          active: boolean
          by_admin_id: string
          created_at: string
          expires_at: string | null
          id: string
          reason: string
          type: string
          user_id: string
          username: string
        }
        Insert: {
          active?: boolean
          by_admin_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          reason: string
          type?: string
          user_id: string
          username: string
        }
        Update: {
          active?: boolean
          by_admin_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string
          type?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      vault_cards: {
        Row: {
          back_image_url: string | null
          category: string | null
          condition: Database["public"]["Enums"]["card_condition"] | null
          condition_prices: Json | null
          created_at: string
          description: string | null
          estimated_value: number | null
          id: string
          image_url: string | null
          language: string | null
          last_valued_at: string | null
          name: string
          price: number | null
          tcg_number: string | null
          tcg_set: string | null
          tcg_year: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          back_image_url?: string | null
          category?: string | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          condition_prices?: Json | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          image_url?: string | null
          language?: string | null
          last_valued_at?: string | null
          name: string
          price?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          back_image_url?: string | null
          category?: string | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          condition_prices?: Json | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          image_url?: string | null
          language?: string | null
          last_valued_at?: string | null
          name?: string
          price?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          user_id?: string
          visibility?: string
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
      vault_settings: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          id: string
          label: string | null
          last_used_at: string | null
          public_key: string
          transports: string | null
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_key: string
          transports?: string | null
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          id?: string
          label?: string | null
          last_used_at?: string | null
          public_key?: string
          transports?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wheel_slots: {
        Row: {
          color: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          label: string
          position: number
          weight: number
          wheel_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          label: string
          position?: number
          weight?: number
          wheel_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          label?: string
          position?: number
          weight?: number
          wheel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wheel_slots_wheel_id_fkey"
            columns: ["wheel_id"]
            isOneToOne: false
            referencedRelation: "spin_wheels"
            referencedColumns: ["id"]
          },
        ]
      }
      wheel_spins: {
        Row: {
          created_at: string
          id: string
          slot_id: string | null
          slot_label: string
          stream_id: string
          triggered_by_id: string
          triggered_by_username: string
          wheel_id: string
          winner_id: string | null
          winner_username: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_id?: string | null
          slot_label: string
          stream_id: string
          triggered_by_id: string
          triggered_by_username: string
          wheel_id: string
          winner_id?: string | null
          winner_username: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_id?: string | null
          slot_label?: string
          stream_id?: string
          triggered_by_id?: string
          triggered_by_username?: string
          wheel_id?: string
          winner_id?: string | null
          winner_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "wheel_spins_wheel_id_fkey"
            columns: ["wheel_id"]
            isOneToOne: false
            referencedRelation: "spin_wheels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_legal_document: {
        Args: {
          _document_type: string
          _user_agent?: string
          _version?: string
        }
        Returns: undefined
      }
      admin_assign_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      can_view_story: {
        Args: { _story_owner: string; _viewer: string; _visibility: string }
        Returns: boolean
      }
      can_view_vault: {
        Args: { _owner: string; _viewer: string; _visibility: string }
        Returns: boolean
      }
      can_view_vault_owner: {
        Args: { _owner: string; _viewer: string }
        Returns: boolean
      }
      claim_break_slots: {
        Args: { _slot_numbers: number[]; _stream_id: string }
        Returns: {
          claimed_count: number
          order_id: string
          total_amount: number
        }[]
      }
      generate_public_id: { Args: never; Returns: string }
      get_buyer_completed_count: { Args: { _user: string }; Returns: number }
      get_seller_completed_count: { Args: { _user: string }; Returns: number }
      get_seller_shipping_cap: { Args: { _user: string }; Returns: number }
      get_winner_shipping: {
        Args: { p_stream_id: string; p_winner_id: string }
        Returns: {
          address_city: string
          address_country: string
          address_line1: string
          address_state: string
          address_zip: string
          full_name: string
          phone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_stream_staff: {
        Args: { _stream_id: string; _user: string }
        Returns: boolean
      }
      is_user_suspended: { Args: { _user_id: string }; Returns: boolean }
      list_followers: {
        Args: { _user: string }
        Returns: {
          avatar_url: string
          id: string
          seller_status: string
          username: string
        }[]
      }
      list_following: {
        Args: { _user: string }
        Returns: {
          avatar_url: string
          id: string
          seller_status: string
          username: string
        }[]
      }
      public_profile_by_username: {
        Args: { _username: string }
        Returns: {
          avatar_url: string
          buyer_verified: boolean
          created_at: string
          id: string
          is_seller: boolean
          phone_verified: boolean
          public_id: string
          seller_status: string
          username: string
        }[]
      }
      public_profiles_by_ids: {
        Args: { _ids: string[] }
        Returns: {
          avatar_url: string
          buyer_verified: boolean
          id: string
          is_seller: boolean
          phone_verified: boolean
          public_id: string
          seller_status: string
          username: string
        }[]
      }
      search_public_profiles: {
        Args: { _limit?: number; _query: string }
        Returns: {
          avatar_url: string
          id: string
          is_seller: boolean
          seller_status: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "owner" | "support"
      card_condition: "NM" | "LP" | "MP" | "Damaged"
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
      app_role: ["admin", "moderator", "user", "owner", "support"],
      card_condition: ["NM", "LP", "MP", "Damaged"],
    },
  },
} as const
