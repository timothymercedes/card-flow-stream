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
      account_audit_log: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          dispute_id: string | null
          event_type: Database["public"]["Enums"]["audit_event_type"]
          evidence_id: string | null
          id: string
          occurred_at: string
          order_id: string | null
          payment_intent_id: string | null
          payout_id: string | null
          report_id: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
          stream_id: string | null
          subject_user_id: string
          summary: string
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          dispute_id?: string | null
          event_type: Database["public"]["Enums"]["audit_event_type"]
          evidence_id?: string | null
          id?: string
          occurred_at?: string
          order_id?: string | null
          payment_intent_id?: string | null
          payout_id?: string | null
          report_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          stream_id?: string | null
          subject_user_id: string
          summary: string
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          dispute_id?: string | null
          event_type?: Database["public"]["Enums"]["audit_event_type"]
          evidence_id?: string | null
          id?: string
          occurred_at?: string
          order_id?: string | null
          payment_intent_id?: string | null
          payout_id?: string | null
          report_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          stream_id?: string | null
          subject_user_id?: string
          summary?: string
        }
        Relationships: []
      }
      account_holds: {
        Row: {
          balance_owed_cents: number
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          reason: string | null
          source: Database["public"]["Enums"]["hold_source"]
          status: Database["public"]["Enums"]["hold_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_owed_cents?: number
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          reason?: string | null
          source?: Database["public"]["Enums"]["hold_source"]
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_owed_cents?: number
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          reason?: string | null
          source?: Database["public"]["Enums"]["hold_source"]
          status?: Database["public"]["Enums"]["hold_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      achievements: {
        Row: {
          category: string
          created_at: string
          description: string
          icon: string
          id: string
          is_secret: boolean
          slug: string
          sort_order: number
          threshold: number | null
          title: string
          xp_reward: number
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          icon?: string
          id?: string
          is_secret?: boolean
          slug: string
          sort_order?: number
          threshold?: number | null
          title: string
          xp_reward?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_secret?: boolean
          slug?: string
          sort_order?: number
          threshold?: number | null
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      admin_action_log: {
        Row: {
          action: string
          admin_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          reason: string | null
          subject_user_id: string | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          admin_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_user_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          subject_user_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      ai_hype_posts: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          source: string
          title: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          source?: string
          title: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          source?: string
          title?: string
        }
        Relationships: []
      }
      arena_battles: {
        Row: {
          challenger_companion_id: string
          challenger_id: string
          created_at: string
          id: string
          log: Json
          opponent_companion_id: string
          opponent_id: string
          season_id: string | null
          status: string
          winner_companion_id: string | null
        }
        Insert: {
          challenger_companion_id: string
          challenger_id: string
          created_at?: string
          id?: string
          log?: Json
          opponent_companion_id: string
          opponent_id: string
          season_id?: string | null
          status?: string
          winner_companion_id?: string | null
        }
        Update: {
          challenger_companion_id?: string
          challenger_id?: string
          created_at?: string
          id?: string
          log?: Json
          opponent_companion_id?: string
          opponent_id?: string
          season_id?: string | null
          status?: string
          winner_companion_id?: string | null
        }
        Relationships: []
      }
      arena_companions: {
        Row: {
          arena_rank: number
          attack: number
          category: string | null
          community: string
          cosmetics: Json
          created_at: string
          defense: number
          hidden_traits: Json
          id: string
          image_url: string | null
          level: number
          longest_win_streak: number
          losses: number
          name: string
          season_wins: number
          speed: number
          title: Database["public"]["Enums"]["arena_title"]
          trophies: number
          updated_at: string
          user_id: string
          vault_card_id: string
          win_streak: number
          wins: number
          xp: number
        }
        Insert: {
          arena_rank?: number
          attack?: number
          category?: string | null
          community?: string
          cosmetics?: Json
          created_at?: string
          defense?: number
          hidden_traits?: Json
          id?: string
          image_url?: string | null
          level?: number
          longest_win_streak?: number
          losses?: number
          name: string
          season_wins?: number
          speed?: number
          title?: Database["public"]["Enums"]["arena_title"]
          trophies?: number
          updated_at?: string
          user_id: string
          vault_card_id: string
          win_streak?: number
          wins?: number
          xp?: number
        }
        Update: {
          arena_rank?: number
          attack?: number
          category?: string | null
          community?: string
          cosmetics?: Json
          created_at?: string
          defense?: number
          hidden_traits?: Json
          id?: string
          image_url?: string | null
          level?: number
          longest_win_streak?: number
          losses?: number
          name?: string
          season_wins?: number
          speed?: number
          title?: Database["public"]["Enums"]["arena_title"]
          trophies?: number
          updated_at?: string
          user_id?: string
          vault_card_id?: string
          win_streak?: number
          wins?: number
          xp?: number
        }
        Relationships: []
      }
      arena_seasons: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          id: string
          name: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          starts_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      auction_queue: {
        Row: {
          buy_now_price: number | null
          created_at: string
          description: string | null
          duration_seconds: number
          finished_at: string | null
          host_id: string
          id: string
          image_url: string | null
          min_offer: number | null
          order_id: string | null
          position: number
          prebid_enabled: boolean
          quantity: number
          reveal_mode: string | null
          sale_type: string
          scheduled_show_id: string | null
          snipe_price: number | null
          sold_at: string | null
          sold_to: string | null
          started_at: string | null
          starting_bid: number
          status: string
          stream_id: string
          title: string
          trigger_word: string | null
          vault_card_id: string | null
          voice_trigger: string | null
          winner_id: string | null
          winning_bid: number | null
        }
        Insert: {
          buy_now_price?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          finished_at?: string | null
          host_id: string
          id?: string
          image_url?: string | null
          min_offer?: number | null
          order_id?: string | null
          position?: number
          prebid_enabled?: boolean
          quantity?: number
          reveal_mode?: string | null
          sale_type?: string
          scheduled_show_id?: string | null
          snipe_price?: number | null
          sold_at?: string | null
          sold_to?: string | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          stream_id: string
          title: string
          trigger_word?: string | null
          vault_card_id?: string | null
          voice_trigger?: string | null
          winner_id?: string | null
          winning_bid?: number | null
        }
        Update: {
          buy_now_price?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number
          finished_at?: string | null
          host_id?: string
          id?: string
          image_url?: string | null
          min_offer?: number | null
          order_id?: string | null
          position?: number
          prebid_enabled?: boolean
          quantity?: number
          reveal_mode?: string | null
          sale_type?: string
          scheduled_show_id?: string | null
          snipe_price?: number | null
          sold_at?: string | null
          sold_to?: string | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          stream_id?: string
          title?: string
          trigger_word?: string | null
          vault_card_id?: string | null
          voice_trigger?: string | null
          winner_id?: string | null
          winning_bid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_queue_scheduled_show_id_fkey"
            columns: ["scheduled_show_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_queue_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_queue_vault_card_id_fkey"
            columns: ["vault_card_id"]
            isOneToOne: false
            referencedRelation: "vault_cards"
            referencedColumns: ["id"]
          },
        ]
      }
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_username: string | null
          created_at: string
          id: string
          ip_hash: string | null
          meta: Json
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_username?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          meta?: Json
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      balance_audit_log: {
        Row: {
          actor_id: string | null
          balance_after: number | null
          balance_before: number | null
          created_at: string
          delta_cents: number
          event_type: string
          id: number
          metadata: Json
          reference_id: string | null
          reference_table: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta_cents: number
          event_type: string
          id?: number
          metadata?: Json
          reference_id?: string | null
          reference_table?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta_cents?: number
          event_type?: string
          id?: number
          metadata?: Json
          reference_id?: string | null
          reference_table?: string | null
          user_id?: string
        }
        Relationships: []
      }
      beta_access_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string | null
          name: string | null
          role: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string | null
          role?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          category: string
          created_at: string
          id: string
          message: string
          page_path: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          message: string
          page_path?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          message?: string
          page_path?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      beta_invites: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_used_at: string | null
          max_uses: number
          updated_at: string
          use_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          max_uses?: number
          updated_at?: string
          use_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          max_uses?: number
          updated_at?: string
          use_count?: number
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
      buyer_payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string | null
          stripe_customer_id: string
          stripe_payment_method_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          stripe_customer_id: string
          stripe_payment_method_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string | null
          stripe_customer_id?: string
          stripe_payment_method_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_restrictions: {
        Row: {
          active: boolean
          cents_limit: number | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          reason: string
          user_id: string
        }
        Insert: {
          active?: boolean
          cents_limit?: number | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          reason: string
          user_id: string
        }
        Update: {
          active?: boolean
          cents_limit?: number | null
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      buyer_review_queue: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          unpaid_strikes: number
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          unpaid_strikes?: number
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          unpaid_strikes?: number
        }
        Relationships: []
      }
      buyer_risk_signals: {
        Row: {
          created_at: string
          id: string
          kind: string
          metadata: Json
          ref_id: string | null
          ref_table: string | null
          seller_id: string | null
          severity_weight: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          ref_id?: string | null
          ref_table?: string | null
          seller_id?: string | null
          severity_weight?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          ref_id?: string | null
          ref_table?: string | null
          seller_id?: string | null
          severity_weight?: number
          user_id?: string
        }
        Relationships: []
      }
      card_identities: {
        Row: {
          ai_reference_image_url: string | null
          category: string
          confidence_score: number | null
          created_at: string
          external_ids: Json
          fingerprint: string
          grade: string | null
          grading_company: string | null
          id: string
          image_source: string | null
          image_url: string | null
          is_rookie: boolean
          language: string | null
          last_price_sync: string | null
          manufacturer: string | null
          market_value_cents: number | null
          name: string
          number: string | null
          owner_count: number
          player: string | null
          price_currency: string
          price_source: string | null
          provider_keys: string[]
          rarity: string | null
          set_code: string | null
          set_name: string | null
          team: string | null
          updated_at: string
          variant: string | null
          verification_status: string
          year: number | null
        }
        Insert: {
          ai_reference_image_url?: string | null
          category: string
          confidence_score?: number | null
          created_at?: string
          external_ids?: Json
          fingerprint: string
          grade?: string | null
          grading_company?: string | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          is_rookie?: boolean
          language?: string | null
          last_price_sync?: string | null
          manufacturer?: string | null
          market_value_cents?: number | null
          name: string
          number?: string | null
          owner_count?: number
          player?: string | null
          price_currency?: string
          price_source?: string | null
          provider_keys?: string[]
          rarity?: string | null
          set_code?: string | null
          set_name?: string | null
          team?: string | null
          updated_at?: string
          variant?: string | null
          verification_status?: string
          year?: number | null
        }
        Update: {
          ai_reference_image_url?: string | null
          category?: string
          confidence_score?: number | null
          created_at?: string
          external_ids?: Json
          fingerprint?: string
          grade?: string | null
          grading_company?: string | null
          id?: string
          image_source?: string | null
          image_url?: string | null
          is_rookie?: boolean
          language?: string | null
          last_price_sync?: string | null
          manufacturer?: string | null
          market_value_cents?: number | null
          name?: string
          number?: string | null
          owner_count?: number
          player?: string | null
          price_currency?: string
          price_source?: string | null
          provider_keys?: string[]
          rarity?: string | null
          set_code?: string | null
          set_name?: string | null
          team?: string | null
          updated_at?: string
          variant?: string | null
          verification_status?: string
          year?: number | null
        }
        Relationships: []
      }
      card_images: {
        Row: {
          created_at: string
          id: string
          identity_id: string
          is_primary: boolean
          quality_score: number | null
          source: string
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          identity_id: string
          is_primary?: boolean
          quality_score?: number | null
          source: string
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          identity_id?: string
          is_primary?: boolean
          quality_score?: number | null
          source?: string
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_images_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "card_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      card_price_cache: {
        Row: {
          card_key: string
          expires_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          card_key: string
          expires_at: string
          payload: Json
          updated_at?: string
        }
        Update: {
          card_key?: string
          expires_at?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      card_price_history: {
        Row: {
          captured_at: string
          card_key: string
          currency: string
          id: string
          last_sold_price: number | null
          market_price: number | null
          mid: number | null
          name: string
          payload: Json
          price_high: number | null
          price_low: number | null
          source: string | null
          tcg_number: string | null
          tcg_set: string | null
        }
        Insert: {
          captured_at?: string
          card_key: string
          currency?: string
          id?: string
          last_sold_price?: number | null
          market_price?: number | null
          mid?: number | null
          name: string
          payload?: Json
          price_high?: number | null
          price_low?: number | null
          source?: string | null
          tcg_number?: string | null
          tcg_set?: string | null
        }
        Update: {
          captured_at?: string
          card_key?: string
          currency?: string
          id?: string
          last_sold_price?: number | null
          market_price?: number | null
          mid?: number | null
          name?: string
          payload?: Json
          price_high?: number | null
          price_low?: number | null
          source?: string | null
          tcg_number?: string | null
          tcg_set?: string | null
        }
        Relationships: []
      }
      card_scans: {
        Row: {
          cards_detected: number
          chosen_source: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          language: string | null
          match_candidates: Json | null
          multi: boolean
          price_sources: Json | null
          source: string | null
          status: string
          top_name: string | null
          top_set: string | null
          top_value: number | null
          user_id: string
        }
        Insert: {
          cards_detected?: number
          chosen_source?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          match_candidates?: Json | null
          multi?: boolean
          price_sources?: Json | null
          source?: string | null
          status?: string
          top_name?: string | null
          top_set?: string | null
          top_value?: number | null
          user_id: string
        }
        Update: {
          cards_detected?: number
          chosen_source?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          match_candidates?: Json | null
          multi?: boolean
          price_sources?: Json | null
          source?: string | null
          status?: string
          top_name?: string | null
          top_set?: string | null
          top_value?: number | null
          user_id?: string
        }
        Relationships: []
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
          audience: string
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
          audience?: string
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
          audience?: string
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
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
        ]
      }
      creator_stream_tiers: {
        Row: {
          created_at: string
          enhanced_obs_features: boolean
          flex_extension_minutes: number
          flex_soft_limit_minutes: number
          guest_limit: number
          inactive_auto_end_minutes: number
          inactive_warning_minutes: number
          label: string
          priority_stream_quality: boolean
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enhanced_obs_features?: boolean
          flex_extension_minutes?: number
          flex_soft_limit_minutes?: number
          guest_limit?: number
          inactive_auto_end_minutes?: number
          inactive_warning_minutes?: number
          label: string
          priority_stream_quality?: boolean
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enhanced_obs_features?: boolean
          flex_extension_minutes?: number
          flex_soft_limit_minutes?: number
          guest_limit?: number
          inactive_auto_end_minutes?: number
          inactive_warning_minutes?: number
          label?: string
          priority_stream_quality?: boolean
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_quests: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          kind: string
          slug: string
          sort_order: number
          target: number
          title: string
          xp_reward: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          kind?: string
          slug: string
          sort_order?: number
          target?: number
          title: string
          xp_reward?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          kind?: string
          slug?: string
          sort_order?: number
          target?: number
          title?: string
          xp_reward?: number
        }
        Relationships: []
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
          amount_cents: number | null
          created_at: string
          description: string
          escalated_at: string | null
          escalated_by: string | null
          evidence_urls: string[] | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["dispute_lifecycle"]
          messages: Json
          order_id: string | null
          original_payout_id: string | null
          reason: string
          rebook_order_id: string | null
          reconciled_at: string | null
          reconciliation_notes: string | null
          refund_payment_intent_id: string | null
          reported_user_id: string | null
          reporter_id: string
          reporter_username: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          stream_id: string | null
          stripe_charge_id: string | null
          stripe_dispute_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          description: string
          escalated_at?: string | null
          escalated_by?: string | null
          evidence_urls?: string[] | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["dispute_lifecycle"]
          messages?: Json
          order_id?: string | null
          original_payout_id?: string | null
          reason: string
          rebook_order_id?: string | null
          reconciled_at?: string | null
          reconciliation_notes?: string | null
          refund_payment_intent_id?: string | null
          reported_user_id?: string | null
          reporter_id: string
          reporter_username: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stream_id?: string | null
          stripe_charge_id?: string | null
          stripe_dispute_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          description?: string
          escalated_at?: string | null
          escalated_by?: string | null
          evidence_urls?: string[] | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["dispute_lifecycle"]
          messages?: Json
          order_id?: string | null
          original_payout_id?: string | null
          reason?: string
          rebook_order_id?: string | null
          reconciled_at?: string | null
          reconciliation_notes?: string | null
          refund_payment_intent_id?: string | null
          reported_user_id?: string | null
          reporter_id?: string
          reporter_username?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          stream_id?: string | null
          stripe_charge_id?: string | null
          stripe_dispute_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_rebook_order_id_fkey"
            columns: ["rebook_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          id: number
          message: string
          metadata: Json
          route: string | null
          severity: string
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          message: string
          metadata?: Json
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          message?: string
          metadata?: Json
          route?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      evidence_review_log: {
        Row: {
          created_at: string
          evidence_id: string
          from_status: Database["public"]["Enums"]["evidence_status"] | null
          id: string
          notes: string | null
          reviewer_id: string
          to_status: Database["public"]["Enums"]["evidence_status"]
        }
        Insert: {
          created_at?: string
          evidence_id: string
          from_status?: Database["public"]["Enums"]["evidence_status"] | null
          id?: string
          notes?: string | null
          reviewer_id: string
          to_status: Database["public"]["Enums"]["evidence_status"]
        }
        Update: {
          created_at?: string
          evidence_id?: string
          from_status?: Database["public"]["Enums"]["evidence_status"] | null
          id?: string
          notes?: string | null
          reviewer_id?: string
          to_status?: Database["public"]["Enums"]["evidence_status"]
        }
        Relationships: [
          {
            foreignKeyName: "evidence_review_log_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "moderation_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_integrity_alerts: {
        Row: {
          amount_cents: number | null
          created_at: string
          details: Json
          id: string
          kind: string
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          notify_auction_start: boolean
          notify_new_listing: boolean
          notify_on_live: boolean
          notify_promotions: boolean
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          notify_auction_start?: boolean
          notify_new_listing?: boolean
          notify_on_live?: boolean
          notify_promotions?: boolean
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          notify_auction_start?: boolean
          notify_new_listing?: boolean
          notify_on_live?: boolean
          notify_promotions?: boolean
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          auto_action: string | null
          created_at: string
          details: Json
          flag_type: string
          id: string
          resolved_at: string | null
          severity: string
          user_id: string
        }
        Insert: {
          auto_action?: string | null
          created_at?: string
          details?: Json
          flag_type: string
          id?: string
          resolved_at?: string | null
          severity?: string
          user_id: string
        }
        Update: {
          auto_action?: string | null
          created_at?: string
          details?: Json
          flag_type?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          user_id?: string
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
      graded_cards: {
        Row: {
          cert_number: string
          created_at: string
          grade: string | null
          grader: string
          id: string
          pop_data: Json
          raw: Json
          slab_image_url: string | null
          updated_at: string
          user_id: string
          vault_card_id: string
          verified_at: string | null
        }
        Insert: {
          cert_number: string
          created_at?: string
          grade?: string | null
          grader: string
          id?: string
          pop_data?: Json
          raw?: Json
          slab_image_url?: string | null
          updated_at?: string
          user_id: string
          vault_card_id: string
          verified_at?: string | null
        }
        Update: {
          cert_number?: string
          created_at?: string
          grade?: string | null
          grader?: string
          id?: string
          pop_data?: Json
          raw?: Json
          slab_image_url?: string | null
          updated_at?: string
          user_id?: string
          vault_card_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "graded_cards_vault_card_id_fkey"
            columns: ["vault_card_id"]
            isOneToOne: false
            referencedRelation: "vault_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      hold_recoveries: {
        Row: {
          created_at: string
          deducted_cents: number
          gross_cents: number
          hold_id: string | null
          id: string
          net_released_cents: number
          notes: string | null
          reference_id: string | null
          remaining_owed_cents: number
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deducted_cents: number
          gross_cents: number
          hold_id?: string | null
          id?: string
          net_released_cents: number
          notes?: string | null
          reference_id?: string | null
          remaining_owed_cents: number
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deducted_cents?: number
          gross_cents?: number
          hold_id?: string | null
          id?: string
          net_released_cents?: number
          notes?: string | null
          reference_id?: string | null
          remaining_owed_cents?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hold_recoveries_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "account_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hold_recoveries_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["hold_id"]
          },
        ]
      }
      insurance_claim_evidence: {
        Row: {
          claim_id: string
          created_at: string
          file_path: string
          id: string
          kind: string
          notes: string | null
          uploaded_by: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          file_path: string
          id?: string
          kind?: string
          notes?: string | null
          uploaded_by: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
          notes?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claim_evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "insurance_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_claims: {
        Row: {
          admin_notes: string | null
          claim_amount_cents: number
          claimant_user_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string | null
          id: string
          order_id: string
          provider_claim_ref: string | null
          provider_code: string | null
          reason: Database["public"]["Enums"]["insurance_claim_reason"]
          reimbursed_at: string | null
          reimbursed_cents: number
          status: Database["public"]["Enums"]["insurance_claim_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          claim_amount_cents: number
          claimant_user_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          id?: string
          order_id: string
          provider_claim_ref?: string | null
          provider_code?: string | null
          reason: Database["public"]["Enums"]["insurance_claim_reason"]
          reimbursed_at?: string | null
          reimbursed_cents?: number
          status?: Database["public"]["Enums"]["insurance_claim_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          claim_amount_cents?: number
          claimant_user_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string | null
          id?: string
          order_id?: string
          provider_claim_ref?: string | null
          provider_code?: string | null
          reason?: Database["public"]["Enums"]["insurance_claim_reason"]
          reimbursed_at?: string | null
          reimbursed_cents?: number
          status?: Database["public"]["Enums"]["insurance_claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_claims_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_providers: {
        Row: {
          code: string
          created_at: string
          display_name: string
          est_resolution_days: number
          flat_cents: number
          id: string
          is_active: boolean
          max_cents: number
          min_cents: number
          rate_bps: number
          supports_damaged: boolean
          supports_lost: boolean
          supports_stolen: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          est_resolution_days?: number
          flat_cents?: number
          id?: string
          is_active?: boolean
          max_cents?: number
          min_cents?: number
          rate_bps?: number
          supports_damaged?: boolean
          supports_lost?: boolean
          supports_stolen?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          est_resolution_days?: number
          flat_cents?: number
          id?: string
          is_active?: boolean
          max_cents?: number
          min_cents?: number
          rate_bps?: number
          supports_damaged?: boolean
          supports_lost?: boolean
          supports_stolen?: boolean
        }
        Relationships: []
      }
      ko_requests: {
        Row: {
          created_at: string
          from_avatar_url: string | null
          from_seller_id: string
          from_stream_id: string
          from_username: string
          from_viewer_count: number
          id: string
          status: string
          to_seller_id: string
          to_stream_id: string
        }
        Insert: {
          created_at?: string
          from_avatar_url?: string | null
          from_seller_id: string
          from_stream_id: string
          from_username: string
          from_viewer_count?: number
          id?: string
          status?: string
          to_seller_id: string
          to_stream_id: string
        }
        Update: {
          created_at?: string
          from_avatar_url?: string | null
          from_seller_id?: string
          from_stream_id?: string
          from_username?: string
          from_viewer_count?: number
          id?: string
          status?: string
          to_seller_id?: string
          to_stream_id?: string
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
          {
            foreignKeyName: "listing_bids_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
        ]
      }
      listings: {
        Row: {
          accepts_offers: boolean
          auction_ends_at: string | null
          auction_status: string
          back_image_url: string | null
          blocked_countries: string[]
          buy_now_price: number | null
          category: string | null
          condition: Database["public"]["Enums"]["card_condition"] | null
          created_at: string
          current_bid: number | null
          custom_price: number | null
          custom_price_source: string | null
          description: string | null
          expires_at: string
          height_in: number | null
          id: string
          image_url: string | null
          insurance_auto_add_by_seller: boolean
          insurance_default: Database["public"]["Enums"]["insurance_default_mode"]
          insurance_paid_by: Database["public"]["Enums"]["insurance_payer"]
          is_auction: boolean
          is_demo: boolean
          last_sold_price: number | null
          length_in: number | null
          listing_type: string
          market_price: number | null
          price: number | null
          price_high: number | null
          price_locked: boolean
          price_low: number | null
          price_source: string | null
          price_source_url: string | null
          price_updated_at: string | null
          pricing_details: Json
          quantity: number
          recent_sales_avg: number | null
          reserve_price: number | null
          seller_id: string
          shipping_preset: string | null
          shipping_price: number | null
          ships_internationally: boolean
          sold_count: number
          starting_bid: number | null
          tcg_number: string | null
          tcg_set: string | null
          tcg_year: string | null
          title: string
          top_bidder_id: string | null
          vault_card_id: string | null
          weight_oz: number | null
          width_in: number | null
        }
        Insert: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          auction_status?: string
          back_image_url?: string | null
          blocked_countries?: string[]
          buy_now_price?: number | null
          category?: string | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          current_bid?: number | null
          custom_price?: number | null
          custom_price_source?: string | null
          description?: string | null
          expires_at?: string
          height_in?: number | null
          id?: string
          image_url?: string | null
          insurance_auto_add_by_seller?: boolean
          insurance_default?: Database["public"]["Enums"]["insurance_default_mode"]
          insurance_paid_by?: Database["public"]["Enums"]["insurance_payer"]
          is_auction?: boolean
          is_demo?: boolean
          last_sold_price?: number | null
          length_in?: number | null
          listing_type?: string
          market_price?: number | null
          price?: number | null
          price_high?: number | null
          price_locked?: boolean
          price_low?: number | null
          price_source?: string | null
          price_source_url?: string | null
          price_updated_at?: string | null
          pricing_details?: Json
          quantity?: number
          recent_sales_avg?: number | null
          reserve_price?: number | null
          seller_id: string
          shipping_preset?: string | null
          shipping_price?: number | null
          ships_internationally?: boolean
          sold_count?: number
          starting_bid?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          title: string
          top_bidder_id?: string | null
          vault_card_id?: string | null
          weight_oz?: number | null
          width_in?: number | null
        }
        Update: {
          accepts_offers?: boolean
          auction_ends_at?: string | null
          auction_status?: string
          back_image_url?: string | null
          blocked_countries?: string[]
          buy_now_price?: number | null
          category?: string | null
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          current_bid?: number | null
          custom_price?: number | null
          custom_price_source?: string | null
          description?: string | null
          expires_at?: string
          height_in?: number | null
          id?: string
          image_url?: string | null
          insurance_auto_add_by_seller?: boolean
          insurance_default?: Database["public"]["Enums"]["insurance_default_mode"]
          insurance_paid_by?: Database["public"]["Enums"]["insurance_payer"]
          is_auction?: boolean
          is_demo?: boolean
          last_sold_price?: number | null
          length_in?: number | null
          listing_type?: string
          market_price?: number | null
          price?: number | null
          price_high?: number | null
          price_locked?: boolean
          price_low?: number | null
          price_source?: string | null
          price_source_url?: string | null
          price_updated_at?: string | null
          pricing_details?: Json
          quantity?: number
          recent_sales_avg?: number | null
          reserve_price?: number | null
          seller_id?: string
          shipping_preset?: string | null
          shipping_price?: number | null
          ships_internationally?: boolean
          sold_count?: number
          starting_bid?: number | null
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          title?: string
          top_bidder_id?: string | null
          vault_card_id?: string | null
          weight_oz?: number | null
          width_in?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "listings_vault_card_id_fkey"
            columns: ["vault_card_id"]
            isOneToOne: false
            referencedRelation: "vault_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      live_bid_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          reason: string | null
          stream_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          stream_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          stream_id?: string
          user_id?: string
        }
        Relationships: []
      }
      live_bids: {
        Row: {
          amount: number
          bidder_id: string
          bidder_username: string | null
          created_at: string
          id: string
          round_number: number | null
          stream_id: string
          was_anti_snipe: boolean
          was_sudden_death: boolean
        }
        Insert: {
          amount: number
          bidder_id: string
          bidder_username?: string | null
          created_at?: string
          id?: string
          round_number?: number | null
          stream_id: string
          was_anti_snipe?: boolean
          was_sudden_death?: boolean
        }
        Update: {
          amount?: number
          bidder_id?: string
          bidder_username?: string | null
          created_at?: string
          id?: string
          round_number?: number | null
          stream_id?: string
          was_anti_snipe?: boolean
          was_sudden_death?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "live_bids_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stage_layouts: {
        Row: {
          h: number
          hidden: boolean
          label: string | null
          object_fit: string
          source_key: string
          source_type: string
          stream_id: string
          tile_user_id: string
          updated_at: string
          updated_by: string | null
          w: number
          x: number
          y: number
          z: number
          zoom: number
        }
        Insert: {
          h?: number
          hidden?: boolean
          label?: string | null
          object_fit?: string
          source_key: string
          source_type?: string
          stream_id: string
          tile_user_id: string
          updated_at?: string
          updated_by?: string | null
          w?: number
          x?: number
          y?: number
          z?: number
          zoom?: number
        }
        Update: {
          h?: number
          hidden?: boolean
          label?: string | null
          object_fit?: string
          source_key?: string
          source_type?: string
          stream_id?: string
          tile_user_id?: string
          updated_at?: string
          updated_by?: string | null
          w?: number
          x?: number
          y?: number
          z?: number
          zoom?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_stage_layouts_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      live_stream_credentials: {
        Row: {
          cf_live_input_id: string | null
          cf_rtmps_url: string | null
          cf_stream_key: string | null
          created_at: string
          stream_id: string
          updated_at: string
        }
        Insert: {
          cf_live_input_id?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          created_at?: string
          stream_id: string
          updated_at?: string
        }
        Update: {
          cf_live_input_id?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          created_at?: string
          stream_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_stream_credentials_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: true
            referencedRelation: "live_streams"
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
          allow_collab_requests: boolean
          auction_reveal_mode: string
          auto_end_reason: string | null
          blocked_countries: string[]
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
          category: string | null
          cf_live_input_id: string | null
          cf_playback_hls: string | null
          cf_rtmps_url: string | null
          cf_stream_key: string | null
          cf_video_uid: string | null
          cf_whip_url: string | null
          chat_slow_mode_sec: number
          created_at: string
          creator_tier: string
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
          flex_extended_until: string | null
          id: string
          inactivity_auto_end_after: string | null
          inactivity_warning_at: string | null
          is_active: boolean
          is_demo: boolean
          is_private: boolean
          item_description: string | null
          item_image_url: string | null
          ko_accepts_requests: boolean
          ko_active: boolean
          ko_destinations: Json
          ko_message: string | null
          ko_started_at: string | null
          last_activity_at: string
          last_activity_type: string
          last_host_confirmed_at: string | null
          last_promoted_at: string | null
          listing_type: string
          max_collab_count: number
          min_bid_increment: number
          mode: string
          pause_message: string | null
          pause_started_at: string | null
          pause_until: string | null
          pinned_card: Json | null
          promotion_active_until: string | null
          promotion_min_amount: number
          promotion_score: number
          promotions_enabled: boolean
          quantity: number
          quantity_remaining: number | null
          quick_start_enabled: boolean
          quick_start_quantity: number
          quick_start_remaining: number | null
          recurrence: string
          recurrence_parent_id: string | null
          recurrence_until: string | null
          round_number: number
          scheduled_for: string | null
          seller_id: string
          shipping_method: string | null
          shipping_price: number | null
          shipping_service_tier: string | null
          ships_internationally: boolean
          snipe_extends: number
          snipe_price: number | null
          started_at: string | null
          starting_bid: number
          status: string
          stream_soft_reminder_at: string | null
          stream_type: string
          sudden_death_active: boolean
          sudden_death_enabled: boolean
          sudden_death_max_triggers: number
          sudden_death_seconds_added: number
          sudden_death_triggers_used: number
          tcg_tags: string[]
          thumbnail_url: string | null
          title: string
          total_promoted_amount: number
          video_filter: string
          voice_trigger_enabled: boolean
          voice_trigger_phrase: string | null
          winner_id: string | null
          winner_username: string | null
          winning_bid: number | null
        }
        Insert: {
          allow_collab_requests?: boolean
          auction_reveal_mode?: string
          auto_end_reason?: string | null
          blocked_countries?: string[]
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
          category?: string | null
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_video_uid?: string | null
          cf_whip_url?: string | null
          chat_slow_mode_sec?: number
          created_at?: string
          creator_tier?: string
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
          flex_extended_until?: string | null
          id?: string
          inactivity_auto_end_after?: string | null
          inactivity_warning_at?: string | null
          is_active?: boolean
          is_demo?: boolean
          is_private?: boolean
          item_description?: string | null
          item_image_url?: string | null
          ko_accepts_requests?: boolean
          ko_active?: boolean
          ko_destinations?: Json
          ko_message?: string | null
          ko_started_at?: string | null
          last_activity_at?: string
          last_activity_type?: string
          last_host_confirmed_at?: string | null
          last_promoted_at?: string | null
          listing_type?: string
          max_collab_count?: number
          min_bid_increment?: number
          mode?: string
          pause_message?: string | null
          pause_started_at?: string | null
          pause_until?: string | null
          pinned_card?: Json | null
          promotion_active_until?: string | null
          promotion_min_amount?: number
          promotion_score?: number
          promotions_enabled?: boolean
          quantity?: number
          quantity_remaining?: number | null
          quick_start_enabled?: boolean
          quick_start_quantity?: number
          quick_start_remaining?: number | null
          recurrence?: string
          recurrence_parent_id?: string | null
          recurrence_until?: string | null
          round_number?: number
          scheduled_for?: string | null
          seller_id: string
          shipping_method?: string | null
          shipping_price?: number | null
          shipping_service_tier?: string | null
          ships_internationally?: boolean
          snipe_extends?: number
          snipe_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          stream_soft_reminder_at?: string | null
          stream_type?: string
          sudden_death_active?: boolean
          sudden_death_enabled?: boolean
          sudden_death_max_triggers?: number
          sudden_death_seconds_added?: number
          sudden_death_triggers_used?: number
          tcg_tags?: string[]
          thumbnail_url?: string | null
          title: string
          total_promoted_amount?: number
          video_filter?: string
          voice_trigger_enabled?: boolean
          voice_trigger_phrase?: string | null
          winner_id?: string | null
          winner_username?: string | null
          winning_bid?: number | null
        }
        Update: {
          allow_collab_requests?: boolean
          auction_reveal_mode?: string
          auto_end_reason?: string | null
          blocked_countries?: string[]
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
          category?: string | null
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_video_uid?: string | null
          cf_whip_url?: string | null
          chat_slow_mode_sec?: number
          created_at?: string
          creator_tier?: string
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
          flex_extended_until?: string | null
          id?: string
          inactivity_auto_end_after?: string | null
          inactivity_warning_at?: string | null
          is_active?: boolean
          is_demo?: boolean
          is_private?: boolean
          item_description?: string | null
          item_image_url?: string | null
          ko_accepts_requests?: boolean
          ko_active?: boolean
          ko_destinations?: Json
          ko_message?: string | null
          ko_started_at?: string | null
          last_activity_at?: string
          last_activity_type?: string
          last_host_confirmed_at?: string | null
          last_promoted_at?: string | null
          listing_type?: string
          max_collab_count?: number
          min_bid_increment?: number
          mode?: string
          pause_message?: string | null
          pause_started_at?: string | null
          pause_until?: string | null
          pinned_card?: Json | null
          promotion_active_until?: string | null
          promotion_min_amount?: number
          promotion_score?: number
          promotions_enabled?: boolean
          quantity?: number
          quantity_remaining?: number | null
          quick_start_enabled?: boolean
          quick_start_quantity?: number
          quick_start_remaining?: number | null
          recurrence?: string
          recurrence_parent_id?: string | null
          recurrence_until?: string | null
          round_number?: number
          scheduled_for?: string | null
          seller_id?: string
          shipping_method?: string | null
          shipping_price?: number | null
          shipping_service_tier?: string | null
          ships_internationally?: boolean
          snipe_extends?: number
          snipe_price?: number | null
          started_at?: string | null
          starting_bid?: number
          status?: string
          stream_soft_reminder_at?: string | null
          stream_type?: string
          sudden_death_active?: boolean
          sudden_death_enabled?: boolean
          sudden_death_max_triggers?: number
          sudden_death_seconds_added?: number
          sudden_death_triggers_used?: number
          tcg_tags?: string[]
          thumbnail_url?: string | null
          title?: string
          total_promoted_amount?: number
          video_filter?: string
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
            foreignKeyName: "live_streams_current_bidder_id_fkey"
            columns: ["current_bidder_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "live_streams_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
        ]
      }
      message_requests: {
        Row: {
          created_at: string
          id: string
          last_request_at: string
          recipient_id: string
          request_message: string | null
          sender_id: string
          sender_username: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_request_at?: string
          recipient_id: string
          request_message?: string | null
          sender_id: string
          sender_username: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_request_at?: string
          recipient_id?: string
          request_message?: string | null
          sender_id?: string
          sender_username?: string
          status?: string
        }
        Relationships: []
      }
      moderation_evidence: {
        Row: {
          audit_log_id: string | null
          caption: string | null
          created_at: string
          dispute_id: string | null
          file_size: number | null
          file_url: string
          id: string
          locked: boolean
          mime_type: string | null
          report_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["evidence_status"]
          storage_path: string | null
          uploaded_by: string
        }
        Insert: {
          audit_log_id?: string | null
          caption?: string | null
          created_at?: string
          dispute_id?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          locked?: boolean
          mime_type?: string | null
          report_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["evidence_status"]
          storage_path?: string | null
          uploaded_by: string
        }
        Update: {
          audit_log_id?: string | null
          caption?: string | null
          created_at?: string
          dispute_id?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          locked?: boolean
          mime_type?: string | null
          report_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["evidence_status"]
          storage_path?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_evidence_audit_log_id_fkey"
            columns: ["audit_log_id"]
            isOneToOne: false
            referencedRelation: "account_audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "moderation_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          assigned_admin_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
          status: Database["public"]["Enums"]["report_status"]
          subject_ref_id: string | null
          subject_type: Database["public"]["Enums"]["report_subject_type"]
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          reporter_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          subject_ref_id?: string | null
          subject_type: Database["public"]["Enums"]["report_subject_type"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          reporter_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
          status?: Database["public"]["Enums"]["report_status"]
          subject_ref_id?: string | null
          subject_type?: Database["public"]["Enums"]["report_subject_type"]
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          cat_bids: boolean
          cat_live: boolean
          cat_orders: boolean
          cat_seller: boolean
          cat_social: boolean
          cat_system: boolean
          created_at: string
          email_enabled: boolean
          inapp_enabled: boolean
          push_enabled: boolean
          quiet_end: string | null
          quiet_start: string | null
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cat_bids?: boolean
          cat_live?: boolean
          cat_orders?: boolean
          cat_seller?: boolean
          cat_social?: boolean
          cat_system?: boolean
          created_at?: string
          email_enabled?: boolean
          inapp_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cat_bids?: boolean
          cat_live?: boolean
          cat_orders?: boolean
          cat_seller?: boolean
          cat_social?: boolean
          cat_system?: boolean
          created_at?: string
          email_enabled?: boolean
          inapp_enabled?: boolean
          push_enabled?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
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
      obs_profiles: {
        Row: {
          cf_live_input_id: string | null
          cf_playback_hls: string | null
          cf_rtmps_url: string | null
          cf_stream_key: string | null
          cf_whip_url: string | null
          created_at: string
          default_category: string | null
          default_stream_type: string
          default_tcg_tags: string[]
          default_title: string | null
          last_status: string | null
          last_status_at: string | null
          preferred_method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_whip_url?: string | null
          created_at?: string
          default_category?: string | null
          default_stream_type?: string
          default_tcg_tags?: string[]
          default_title?: string | null
          last_status?: string | null
          last_status_at?: string | null
          preferred_method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cf_live_input_id?: string | null
          cf_playback_hls?: string | null
          cf_rtmps_url?: string | null
          cf_stream_key?: string | null
          cf_whip_url?: string | null
          created_at?: string
          default_category?: string | null
          default_stream_type?: string
          default_tcg_tags?: string[]
          default_title?: string | null
          last_status?: string | null
          last_status_at?: string | null
          preferred_method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      offer_abuse_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          offer_id: string | null
          queue_item_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          queue_item_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          queue_item_id?: string | null
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
      order_cancellations: {
        Row: {
          admin_id: string | null
          admin_note: string | null
          admin_requested: boolean
          created_at: string
          id: string
          messages: Json
          order_id: string
          reason: string
          requested_by: string
          requested_by_role: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          admin_note?: string | null
          admin_requested?: boolean
          created_at?: string
          id?: string
          messages?: Json
          order_id: string
          reason: string
          requested_by: string
          requested_by_role: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          admin_note?: string | null
          admin_requested?: boolean
          created_at?: string
          id?: string
          messages?: Json
          order_id?: string
          reason?: string
          requested_by?: string
          requested_by_role?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          auction_number: number | null
          buyer_id: string
          buyer_processing_fee_cents: number | null
          carrier: string | null
          commission_amount: number | null
          commission_rate: number
          condition: Database["public"]["Enums"]["card_condition"] | null
          created_at: string
          delivered_at: string | null
          description: string | null
          dropoff_scanned_at: string | null
          fee_absorbed_by: string | null
          fee_index: number | null
          fee_split_mode: string | null
          final_charged_total_cents: number
          first_scan_at: string | null
          id: string
          idempotency_key: string | null
          insurance_added_post_purchase: boolean
          insurance_coverage_cents: number
          insurance_fee_cents: number
          insurance_paid_by:
            | Database["public"]["Enums"]["insurance_payer"]
            | null
          insurance_provider: string | null
          insurance_provider_ref: string | null
          insurance_purchased_at: string | null
          insurance_status: Database["public"]["Enums"]["insurance_status"]
          is_giveaway: boolean
          is_late_shipment: boolean
          item_image_url: string | null
          label_cost_cents: number | null
          label_purchased_at: string | null
          label_url: string | null
          last_ship_reminder_at: string | null
          listing_id: string | null
          lost_marked_at: string | null
          order_group_id: string | null
          order_number: string | null
          packed_at: string | null
          paid_at: string | null
          payment_failed_at: string | null
          payment_failure_count: number
          payment_retry_deadline: string | null
          payment_status: string
          payout_eligible_at: string | null
          payout_held: boolean
          payout_paid_amount_cents: number | null
          payout_paid_at: string | null
          platform_fee_cents: number | null
          prep_status: string
          processing_fee_cents: number | null
          quantity: number
          ready_at: string | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_tax_cents: number
          seller_id: string
          seller_payout_amount: number | null
          seller_processing_fee_cents: number | null
          seller_stripe_account_id: string | null
          ship_address: string
          ship_city: string
          ship_country: string
          ship_name: string
          ship_reminder_count: number
          ship_state: string | null
          ship_zip: string
          shipment_verification_code: string | null
          shipment_verified_at: string | null
          shipped_at: string | null
          shipping_amount: number
          shipping_due_at: string | null
          shipping_margin_cents: number | null
          shipping_status: Database["public"]["Enums"]["shipping_status"]
          status: string
          stream_id: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          tax_cents: number
          tax_country: string | null
          tax_jurisdiction: string | null
          tax_provider: string | null
          tax_rate_bps: number
          tax_reconciliation_details: Json
          tax_reconciliation_status: string
          tax_state: string | null
          taxable_subtotal_cents: number
          title: string
          tracking_number: string | null
          tracking_url: string | null
        }
        Insert: {
          amount: number
          auction_number?: number | null
          buyer_id: string
          buyer_processing_fee_cents?: number | null
          carrier?: string | null
          commission_amount?: number | null
          commission_rate?: number
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          dropoff_scanned_at?: string | null
          fee_absorbed_by?: string | null
          fee_index?: number | null
          fee_split_mode?: string | null
          final_charged_total_cents?: number
          first_scan_at?: string | null
          id?: string
          idempotency_key?: string | null
          insurance_added_post_purchase?: boolean
          insurance_coverage_cents?: number
          insurance_fee_cents?: number
          insurance_paid_by?:
            | Database["public"]["Enums"]["insurance_payer"]
            | null
          insurance_provider?: string | null
          insurance_provider_ref?: string | null
          insurance_purchased_at?: string | null
          insurance_status?: Database["public"]["Enums"]["insurance_status"]
          is_giveaway?: boolean
          is_late_shipment?: boolean
          item_image_url?: string | null
          label_cost_cents?: number | null
          label_purchased_at?: string | null
          label_url?: string | null
          last_ship_reminder_at?: string | null
          listing_id?: string | null
          lost_marked_at?: string | null
          order_group_id?: string | null
          order_number?: string | null
          packed_at?: string | null
          paid_at?: string | null
          payment_failed_at?: string | null
          payment_failure_count?: number
          payment_retry_deadline?: string | null
          payment_status?: string
          payout_eligible_at?: string | null
          payout_held?: boolean
          payout_paid_amount_cents?: number | null
          payout_paid_at?: string | null
          platform_fee_cents?: number | null
          prep_status?: string
          processing_fee_cents?: number | null
          quantity?: number
          ready_at?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_tax_cents?: number
          seller_id: string
          seller_payout_amount?: number | null
          seller_processing_fee_cents?: number | null
          seller_stripe_account_id?: string | null
          ship_address: string
          ship_city: string
          ship_country?: string
          ship_name: string
          ship_reminder_count?: number
          ship_state?: string | null
          ship_zip: string
          shipment_verification_code?: string | null
          shipment_verified_at?: string | null
          shipped_at?: string | null
          shipping_amount?: number
          shipping_due_at?: string | null
          shipping_margin_cents?: number | null
          shipping_status?: Database["public"]["Enums"]["shipping_status"]
          status?: string
          stream_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          tax_country?: string | null
          tax_jurisdiction?: string | null
          tax_provider?: string | null
          tax_rate_bps?: number
          tax_reconciliation_details?: Json
          tax_reconciliation_status?: string
          tax_state?: string | null
          taxable_subtotal_cents?: number
          title: string
          tracking_number?: string | null
          tracking_url?: string | null
        }
        Update: {
          amount?: number
          auction_number?: number | null
          buyer_id?: string
          buyer_processing_fee_cents?: number | null
          carrier?: string | null
          commission_amount?: number | null
          commission_rate?: number
          condition?: Database["public"]["Enums"]["card_condition"] | null
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          dropoff_scanned_at?: string | null
          fee_absorbed_by?: string | null
          fee_index?: number | null
          fee_split_mode?: string | null
          final_charged_total_cents?: number
          first_scan_at?: string | null
          id?: string
          idempotency_key?: string | null
          insurance_added_post_purchase?: boolean
          insurance_coverage_cents?: number
          insurance_fee_cents?: number
          insurance_paid_by?:
            | Database["public"]["Enums"]["insurance_payer"]
            | null
          insurance_provider?: string | null
          insurance_provider_ref?: string | null
          insurance_purchased_at?: string | null
          insurance_status?: Database["public"]["Enums"]["insurance_status"]
          is_giveaway?: boolean
          is_late_shipment?: boolean
          item_image_url?: string | null
          label_cost_cents?: number | null
          label_purchased_at?: string | null
          label_url?: string | null
          last_ship_reminder_at?: string | null
          listing_id?: string | null
          lost_marked_at?: string | null
          order_group_id?: string | null
          order_number?: string | null
          packed_at?: string | null
          paid_at?: string | null
          payment_failed_at?: string | null
          payment_failure_count?: number
          payment_retry_deadline?: string | null
          payment_status?: string
          payout_eligible_at?: string | null
          payout_held?: boolean
          payout_paid_amount_cents?: number | null
          payout_paid_at?: string | null
          platform_fee_cents?: number | null
          prep_status?: string
          processing_fee_cents?: number | null
          quantity?: number
          ready_at?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_tax_cents?: number
          seller_id?: string
          seller_payout_amount?: number | null
          seller_processing_fee_cents?: number | null
          seller_stripe_account_id?: string | null
          ship_address?: string
          ship_city?: string
          ship_country?: string
          ship_name?: string
          ship_reminder_count?: number
          ship_state?: string | null
          ship_zip?: string
          shipment_verification_code?: string | null
          shipment_verified_at?: string | null
          shipped_at?: string | null
          shipping_amount?: number
          shipping_due_at?: string | null
          shipping_margin_cents?: number | null
          shipping_status?: Database["public"]["Enums"]["shipping_status"]
          status?: string
          stream_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tax_cents?: number
          tax_country?: string | null
          tax_jurisdiction?: string | null
          tax_provider?: string | null
          tax_rate_bps?: number
          tax_reconciliation_details?: Json
          tax_reconciliation_status?: string
          tax_state?: string | null
          taxable_subtotal_cents?: number
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
      payout_adjustments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["payout_adjustment_kind"]
          notes: string | null
          order_id: string | null
          seller_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["payout_adjustment_kind"]
          notes?: string | null
          order_id?: string | null
          seller_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["payout_adjustment_kind"]
          notes?: string | null
          order_id?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_locks: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string
          released_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          reason: string
          released_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          reason?: string
          released_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payout_requests: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      perf_alert_events: {
        Row: {
          alert_id: string | null
          alert_name: string
          created_at: string
          details: Json
          id: number
          kind: string
          measured_value: number | null
          threshold: number | null
        }
        Insert: {
          alert_id?: string | null
          alert_name: string
          created_at?: string
          details?: Json
          id?: number
          kind: string
          measured_value?: number | null
          threshold?: number | null
        }
        Update: {
          alert_id?: string | null
          alert_name?: string
          created_at?: string
          details?: Json
          id?: number
          kind?: string
          measured_value?: number | null
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "perf_alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "perf_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      perf_alerts: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          name: string
          notes: string | null
          threshold_count: number | null
          threshold_ms: number | null
          threshold_pct: number | null
          updated_at: string
          window_minutes: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
          notes?: string | null
          threshold_count?: number | null
          threshold_ms?: number | null
          threshold_pct?: number | null
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          threshold_count?: number | null
          threshold_ms?: number | null
          threshold_pct?: number | null
          updated_at?: string
          window_minutes?: number
        }
        Relationships: []
      }
      perf_metrics: {
        Row: {
          created_at: string
          duration_ms: number
          id: number
          kind: string
          metadata: Json
          method: string
          route: string
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: number
          kind?: string
          metadata?: Json
          method?: string
          route: string
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: number
          kind?: string
          metadata?: Json
          method?: string
          route?: string
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      platform_payouts: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          currency: string
          destination: string
          failure_reason: string | null
          id: string
          notes: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          destination: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          destination?: string
          failure_reason?: string | null
          id?: string
          notes?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_revenue: {
        Row: {
          amount_cents: number
          buyer_id: string | null
          created_at: string
          currency: string
          id: string
          kind: Database["public"]["Enums"]["platform_revenue_kind"]
          meta: Json
          notes: string | null
          order_id: string | null
          seller_id: string | null
          stripe_charge_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind: Database["public"]["Enums"]["platform_revenue_kind"]
          meta?: Json
          notes?: string | null
          order_id?: string | null
          seller_id?: string | null
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          buyer_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          kind?: Database["public"]["Enums"]["platform_revenue_kind"]
          meta?: Json
          notes?: string | null
          order_id?: string | null
          seller_id?: string | null
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: []
      }
      pokemon_cards: {
        Row: {
          created_at: string
          id: string
          image_large: string | null
          image_small: string | null
          is_holo: boolean | null
          is_reverse_holo: boolean | null
          last_seen_at: string | null
          last_sold_price: number | null
          name: string
          number: string | null
          prices_updated_at: string | null
          rarity: string | null
          raw: Json | null
          set_code: string | null
          set_name: string | null
          source: string | null
          source_ids: Json
          subtypes: string[] | null
          tcgplayer_price: number | null
          trend: string | null
          updated_at: string
          year: string | null
        }
        Insert: {
          created_at?: string
          id: string
          image_large?: string | null
          image_small?: string | null
          is_holo?: boolean | null
          is_reverse_holo?: boolean | null
          last_seen_at?: string | null
          last_sold_price?: number | null
          name: string
          number?: string | null
          prices_updated_at?: string | null
          rarity?: string | null
          raw?: Json | null
          set_code?: string | null
          set_name?: string | null
          source?: string | null
          source_ids?: Json
          subtypes?: string[] | null
          tcgplayer_price?: number | null
          trend?: string | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_large?: string | null
          image_small?: string | null
          is_holo?: boolean | null
          is_reverse_holo?: boolean | null
          last_seen_at?: string | null
          last_sold_price?: number | null
          name?: string
          number?: string | null
          prices_updated_at?: string | null
          rarity?: string | null
          raw?: Json | null
          set_code?: string | null
          set_name?: string | null
          source?: string | null
          source_ids?: Json
          subtypes?: string[] | null
          tcgplayer_price?: number | null
          trend?: string | null
          updated_at?: string
          year?: string | null
        }
        Relationships: []
      }
      policy_acceptances: {
        Row: {
          acceptance_context: string
          accepted_at: string
          id: string
          ip_address: string | null
          listing_id: string | null
          metadata: Json
          order_id: string | null
          policy_type: string
          policy_version: string
          stream_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acceptance_context: string
          accepted_at?: string
          id?: string
          ip_address?: string | null
          listing_id?: string | null
          metadata?: Json
          order_id?: string | null
          policy_type: string
          policy_version: string
          stream_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acceptance_context?: string
          accepted_at?: string
          id?: string
          ip_address?: string | null
          listing_id?: string | null
          metadata?: Json
          order_id?: string | null
          policy_type?: string
          policy_version?: string
          stream_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acceptances_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
          },
        ]
      }
      prebids: {
        Row: {
          amount: number
          bidder_id: string
          bidder_username: string | null
          created_at: string
          id: string
          queue_item_id: string
        }
        Insert: {
          amount: number
          bidder_id: string
          bidder_username?: string | null
          created_at?: string
          id?: string
          queue_item_id: string
        }
        Update: {
          amount?: number
          bidder_id?: string
          bidder_username?: string | null
          created_at?: string
          id?: string
          queue_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prebids_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "auction_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      price_observations: {
        Row: {
          currency: string
          id: string
          identity_id: string
          observed_at: string
          price_cents: number
          raw_payload: Json | null
          sample_size: number | null
          source: string
        }
        Insert: {
          currency?: string
          id?: string
          identity_id: string
          observed_at?: string
          price_cents: number
          raw_payload?: Json | null
          sample_size?: number | null
          source: string
        }
        Update: {
          currency?: string
          id?: string
          identity_id?: string
          observed_at?: string
          price_cents?: number
          raw_payload?: Json | null
          sample_size?: number | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_observations_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "card_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      price_reports: {
        Row: {
          card_name: string
          category: string | null
          created_at: string
          id: string
          price_source: string | null
          reason: string | null
          shown_value: number | null
          status: string
          suggested_value: number | null
          user_id: string
          vault_card_id: string
        }
        Insert: {
          card_name: string
          category?: string | null
          created_at?: string
          id?: string
          price_source?: string | null
          reason?: string | null
          shown_value?: number | null
          status?: string
          suggested_value?: number | null
          user_id: string
          vault_card_id: string
        }
        Update: {
          card_name?: string
          category?: string | null
          created_at?: string
          id?: string
          price_source?: string | null
          reason?: string | null
          shown_value?: number | null
          status?: string
          suggested_value?: number | null
          user_id?: string
          vault_card_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_reports_vault_card_id_fkey"
            columns: ["vault_card_id"]
            isOneToOne: false
            referencedRelation: "vault_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          event_id: string
          event_type: string | null
          processed_at: string
          provider: string
        }
        Insert: {
          event_id: string
          event_type?: string | null
          processed_at?: string
          provider: string
        }
        Update: {
          event_id?: string
          event_type?: string | null
          processed_at?: string
          provider?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          a11y_settings: Json
          accent_color: string | null
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_state: string | null
          address_zip: string | null
          age_verified: boolean
          age_verified_at: string | null
          agreements_completed_at: string | null
          agreements_review_required: boolean
          agreements_version: string
          avatar_url: string | null
          avg_response_minutes: number | null
          balance_cents: number
          banner_url: string | null
          bid_restricted_reason: string | null
          bid_restricted_until: string | null
          bio: string | null
          buyer_verified: boolean
          created_at: string
          creator_tier: string
          current_streak: number
          featured_listing_ids: string[]
          full_name: string | null
          guidelines_accepted: boolean
          guidelines_accepted_at: string | null
          id: string
          id_document_url: string | null
          id_status: string
          interests: string[]
          is_demo: boolean
          is_seller: boolean
          last_login_date: string | null
          late_shipment_count: number
          live_verified: boolean
          longest_streak: number
          notify_quiet_end: number | null
          notify_quiet_start: number | null
          onboarding_completed: boolean
          payout_hold: boolean
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          preferred_currency: string | null
          preferred_language: string
          public_id: string | null
          pwe_enabled: boolean
          pwe_max_order_value: number
          pwe_price_usd: number
          pwe_stamp_price_usd: number
          report_count: number
          risk_flag: boolean
          seller_agreement_accepted_at: string | null
          seller_agreement_review_required: boolean
          seller_agreement_version: string | null
          seller_status: string
          selling_restricted_until: string | null
          shipping_cap: number | null
          shop_name: string | null
          shop_name_changes: number
          social_links: Json
          streaming_badge: string
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_onboarding_status: string
          stripe_payouts_enabled: boolean
          timezone: string | null
          tos_accepted: boolean
          tos_accepted_at: string | null
          total_stream_minutes: number
          unpaid_strikes: number
          username: string
          verification_history: Json
          verification_reason: string | null
          verification_requested_at: string | null
          verification_status: string
          verified_at: string | null
          visibility_penalty_until: string | null
        }
        Insert: {
          a11y_settings?: Json
          accent_color?: string | null
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          age_verified?: boolean
          age_verified_at?: string | null
          agreements_completed_at?: string | null
          agreements_review_required?: boolean
          agreements_version?: string
          avatar_url?: string | null
          avg_response_minutes?: number | null
          balance_cents?: number
          banner_url?: string | null
          bid_restricted_reason?: string | null
          bid_restricted_until?: string | null
          bio?: string | null
          buyer_verified?: boolean
          created_at?: string
          creator_tier?: string
          current_streak?: number
          featured_listing_ids?: string[]
          full_name?: string | null
          guidelines_accepted?: boolean
          guidelines_accepted_at?: string | null
          id: string
          id_document_url?: string | null
          id_status?: string
          interests?: string[]
          is_demo?: boolean
          is_seller?: boolean
          last_login_date?: string | null
          late_shipment_count?: number
          live_verified?: boolean
          longest_streak?: number
          notify_quiet_end?: number | null
          notify_quiet_start?: number | null
          onboarding_completed?: boolean
          payout_hold?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_currency?: string | null
          preferred_language?: string
          public_id?: string | null
          pwe_enabled?: boolean
          pwe_max_order_value?: number
          pwe_price_usd?: number
          pwe_stamp_price_usd?: number
          report_count?: number
          risk_flag?: boolean
          seller_agreement_accepted_at?: string | null
          seller_agreement_review_required?: boolean
          seller_agreement_version?: string | null
          seller_status?: string
          selling_restricted_until?: string | null
          shipping_cap?: number | null
          shop_name?: string | null
          shop_name_changes?: number
          social_links?: Json
          streaming_badge?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_onboarding_status?: string
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          tos_accepted?: boolean
          tos_accepted_at?: string | null
          total_stream_minutes?: number
          unpaid_strikes?: number
          username: string
          verification_history?: Json
          verification_reason?: string | null
          verification_requested_at?: string | null
          verification_status?: string
          verified_at?: string | null
          visibility_penalty_until?: string | null
        }
        Update: {
          a11y_settings?: Json
          accent_color?: string | null
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_state?: string | null
          address_zip?: string | null
          age_verified?: boolean
          age_verified_at?: string | null
          agreements_completed_at?: string | null
          agreements_review_required?: boolean
          agreements_version?: string
          avatar_url?: string | null
          avg_response_minutes?: number | null
          balance_cents?: number
          banner_url?: string | null
          bid_restricted_reason?: string | null
          bid_restricted_until?: string | null
          bio?: string | null
          buyer_verified?: boolean
          created_at?: string
          creator_tier?: string
          current_streak?: number
          featured_listing_ids?: string[]
          full_name?: string | null
          guidelines_accepted?: boolean
          guidelines_accepted_at?: string | null
          id?: string
          id_document_url?: string | null
          id_status?: string
          interests?: string[]
          is_demo?: boolean
          is_seller?: boolean
          last_login_date?: string | null
          late_shipment_count?: number
          live_verified?: boolean
          longest_streak?: number
          notify_quiet_end?: number | null
          notify_quiet_start?: number | null
          onboarding_completed?: boolean
          payout_hold?: boolean
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          preferred_currency?: string | null
          preferred_language?: string
          public_id?: string | null
          pwe_enabled?: boolean
          pwe_max_order_value?: number
          pwe_price_usd?: number
          pwe_stamp_price_usd?: number
          report_count?: number
          risk_flag?: boolean
          seller_agreement_accepted_at?: string | null
          seller_agreement_review_required?: boolean
          seller_agreement_version?: string | null
          seller_status?: string
          selling_restricted_until?: string | null
          shipping_cap?: number | null
          shop_name?: string | null
          shop_name_changes?: number
          social_links?: Json
          streaming_badge?: string
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_onboarding_status?: string
          stripe_payouts_enabled?: boolean
          timezone?: string | null
          tos_accepted?: boolean
          tos_accepted_at?: string | null
          total_stream_minutes?: number
          unpaid_strikes?: number
          username?: string
          verification_history?: Json
          verification_reason?: string | null
          verification_requested_at?: string | null
          verification_status?: string
          verified_at?: string | null
          visibility_penalty_until?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_status: string | null
          last_success_at: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_status?: string | null
          last_success_at?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_status?: string | null
          last_success_at?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      queue_offers: {
        Row: {
          accepted_at: string | null
          amount: number
          auth_amount_cents: number | null
          buyer_id: string
          buyer_username: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          captured_at: string | null
          counter_amount: number | null
          created_at: string
          environment: string
          expires_at: string
          id: string
          last_action_at: string
          last_action_by: string
          order_id: string | null
          payment_intent_id: string | null
          payment_status: string
          queue_item_id: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          turn: string
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount: number
          auth_amount_cents?: number | null
          buyer_id: string
          buyer_username?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          captured_at?: string | null
          counter_amount?: number | null
          created_at?: string
          environment?: string
          expires_at?: string
          id?: string
          last_action_at?: string
          last_action_by?: string
          order_id?: string | null
          payment_intent_id?: string | null
          payment_status?: string
          queue_item_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          turn?: string
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount?: number
          auth_amount_cents?: number | null
          buyer_id?: string
          buyer_username?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          captured_at?: string | null
          counter_amount?: number | null
          created_at?: string
          environment?: string
          expires_at?: string
          id?: string
          last_action_at?: string
          last_action_by?: string
          order_id?: string | null
          payment_intent_id?: string | null
          payment_status?: string
          queue_item_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          turn?: string
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queue_offers_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "auction_queue"
            referencedColumns: ["id"]
          },
        ]
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
      review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          review_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "seller_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          author_id: string
          author_role: string
          body: string
          created_at: string
          id: string
          review_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          created_at?: string
          id?: string
          review_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          created_at?: string
          id?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "seller_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_history: {
        Row: {
          alternatives: Json | null
          created_at: string
          duplicate_of: string | null
          id: string
          image_url: string | null
          overall_confidence: number | null
          picked_card_id: string | null
          raw: Json | null
          source: string | null
          top_name: string | null
          top_number: string | null
          top_rarity: string | null
          top_set: string | null
          top_value: number | null
          top_variant: string | null
          user_id: string
          was_corrected: boolean | null
        }
        Insert: {
          alternatives?: Json | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          image_url?: string | null
          overall_confidence?: number | null
          picked_card_id?: string | null
          raw?: Json | null
          source?: string | null
          top_name?: string | null
          top_number?: string | null
          top_rarity?: string | null
          top_set?: string | null
          top_value?: number | null
          top_variant?: string | null
          user_id: string
          was_corrected?: boolean | null
        }
        Update: {
          alternatives?: Json | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          image_url?: string | null
          overall_confidence?: number | null
          picked_card_id?: string | null
          raw?: Json | null
          source?: string | null
          top_name?: string | null
          top_number?: string | null
          top_rarity?: string | null
          top_set?: string | null
          top_value?: number | null
          top_variant?: string | null
          user_id?: string
          was_corrected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_history_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "scan_history"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_shows: {
        Row: {
          banner_url: string | null
          categories: string[]
          category: string | null
          created_at: string
          description: string | null
          id: string
          scheduled_for: string
          seller_id: string
          seller_username: string
          stream_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          categories?: string[]
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scheduled_for: string
          seller_id: string
          seller_username: string
          stream_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          categories?: string[]
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scheduled_for?: string
          seller_id?: string
          seller_username?: string
          stream_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_shows_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_reviews: {
        Row: {
          accuracy_rating: number | null
          buyer_id: string
          buyer_username: string
          comment: string | null
          communication_rating: number | null
          created_at: string
          id: string
          order_id: string
          photo_urls: string[]
          rating: number
          seller_id: string
          shipping_rating: number
          stream_id: string | null
          verified_live_auction: boolean
          verified_purchase: boolean
        }
        Insert: {
          accuracy_rating?: number | null
          buyer_id: string
          buyer_username: string
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          id?: string
          order_id: string
          photo_urls?: string[]
          rating: number
          seller_id: string
          shipping_rating: number
          stream_id?: string | null
          verified_live_auction?: boolean
          verified_purchase?: boolean
        }
        Update: {
          accuracy_rating?: number | null
          buyer_id?: string
          buyer_username?: string
          comment?: string | null
          communication_rating?: number | null
          created_at?: string
          id?: string
          order_id?: string
          photo_urls?: string[]
          rating?: number
          seller_id?: string
          shipping_rating?: number
          stream_id?: string | null
          verified_live_auction?: boolean
          verified_purchase?: boolean
        }
        Relationships: []
      }
      seller_trust: {
        Row: {
          chargeback_rate_30d: number
          completed_deliveries: number
          dispute_rate_30d: number
          frozen: boolean
          instant_release_pct: number
          manual_override_pct: number | null
          pending_release_pct: number
          risk_flags: Json
          tier: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          chargeback_rate_30d?: number
          completed_deliveries?: number
          dispute_rate_30d?: number
          frozen?: boolean
          instant_release_pct?: number
          manual_override_pct?: number | null
          pending_release_pct?: number
          risk_flags?: Json
          tier?: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          chargeback_rate_30d?: number
          completed_deliveries?: number
          dispute_rate_30d?: number
          frozen?: boolean
          instant_release_pct?: number
          manual_override_pct?: number | null
          pending_release_pct?: number
          risk_flags?: Json
          tier?: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipment_events: {
        Row: {
          created_at: string
          id: string
          location: string | null
          message: string | null
          occurred_at: string
          order_id: string
          raw: Json | null
          shipping_status: Database["public"]["Enums"]["shipping_status"] | null
          source: string
          tracking_status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          message?: string | null
          occurred_at?: string
          order_id: string
          raw?: Json | null
          shipping_status?:
            | Database["public"]["Enums"]["shipping_status"]
            | null
          source?: string
          tracking_status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          message?: string | null
          occurred_at?: string
          order_id?: string
          raw?: Json | null
          shipping_status?:
            | Database["public"]["Enums"]["shipping_status"]
            | null
          source?: string
          tracking_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_adjustments: {
        Row: {
          adjustment_type: string
          cost_cents: number
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          user_id: string
          was_charged: boolean
        }
        Insert: {
          adjustment_type: string
          cost_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          user_id: string
          was_charged?: boolean
        }
        Update: {
          adjustment_type?: string
          cost_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          user_id?: string
          was_charged?: boolean
        }
        Relationships: []
      }
      shipping_scans: {
        Row: {
          ai_confidence: number | null
          ai_metadata: Json | null
          carrier: string | null
          code: string
          created_at: string
          id: string
          kind: string
          metadata: Json | null
          new_status: string | null
          order_id: string | null
          prev_status: string | null
          result: string
          scanned_by: string
          suggested_status: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_metadata?: Json | null
          carrier?: string | null
          code: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          new_status?: string | null
          order_id?: string | null
          prev_status?: string | null
          result?: string
          scanned_by: string
          suggested_status?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_metadata?: Json | null
          carrier?: string | null
          code?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json | null
          new_status?: string | null
          order_id?: string | null
          prev_status?: string | null
          result?: string
          scanned_by?: string
          suggested_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_scans_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_name_history: {
        Row: {
          changed_at: string
          id: string
          new_name: string
          old_name: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_name: string
          old_name?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_name?: string
          old_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      show_bookmarks: {
        Row: {
          created_at: string
          id: string
          notify_email: boolean
          notify_inapp: boolean
          notify_push: boolean
          reminder_1h_sent_at: string | null
          reminder_24h_sent_at: string | null
          reminder_live_sent_at: string | null
          show_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_inapp?: boolean
          notify_push?: boolean
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_live_sent_at?: string | null
          show_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_inapp?: boolean
          notify_push?: boolean
          reminder_1h_sent_at?: string | null
          reminder_24h_sent_at?: string | null
          reminder_live_sent_at?: string | null
          show_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_bookmarks_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      sold_comps: {
        Row: {
          buyer_user_id: string | null
          channel: string | null
          created_at: string
          currency: string
          external_url: string | null
          id: string
          identity_id: string
          meta: Json
          sale_price_cents: number
          seller_user_id: string | null
          sold_at: string
          source: string
        }
        Insert: {
          buyer_user_id?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          external_url?: string | null
          id?: string
          identity_id: string
          meta?: Json
          sale_price_cents: number
          seller_user_id?: string | null
          sold_at: string
          source: string
        }
        Update: {
          buyer_user_id?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          external_url?: string | null
          id?: string
          identity_id?: string
          meta?: Json
          sale_price_cents?: number
          seller_user_id?: string | null
          sold_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "sold_comps_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "card_identities"
            referencedColumns: ["id"]
          },
        ]
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
      store_name_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_name: string | null
          old_name: string | null
          seller_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_name?: string | null
          old_name?: string | null
          seller_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_name?: string | null
          old_name?: string | null
          seller_id?: string
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
          moderation_category: string | null
          moderation_reason: string | null
          moderation_status: string
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
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_status?: string
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
          moderation_category?: string | null
          moderation_reason?: string | null
          moderation_status?: string
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
      story_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_reactions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
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
      stream_cohost_tracks: {
        Row: {
          audio_track_name: string | null
          avatar_url: string | null
          created_at: string
          id: string
          is_audio_enabled: boolean
          is_video_enabled: boolean
          session_id: string
          stream_id: string
          updated_at: string
          user_id: string
          username: string
          video_track_name: string | null
        }
        Insert: {
          audio_track_name?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_audio_enabled?: boolean
          is_video_enabled?: boolean
          session_id: string
          stream_id: string
          updated_at?: string
          user_id: string
          username: string
          video_track_name?: string | null
        }
        Update: {
          audio_track_name?: string | null
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_audio_enabled?: boolean
          is_video_enabled?: boolean
          session_id?: string
          stream_id?: string
          updated_at?: string
          user_id?: string
          username?: string
          video_track_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_cohost_tracks_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_collab_invites: {
        Row: {
          created_at: string
          host_id: string
          host_username: string
          id: string
          invitee_id: string
          invitee_username: string
          responded_at: string | null
          status: string
          stream_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          host_username: string
          id?: string
          invitee_id: string
          invitee_username: string
          responded_at?: string | null
          status?: string
          stream_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          host_username?: string
          id?: string
          invitee_id?: string
          invitee_username?: string
          responded_at?: string | null
          status?: string
          stream_id?: string
        }
        Relationships: []
      }
      stream_collab_join_requests: {
        Row: {
          created_at: string
          host_id: string
          id: string
          requester_avatar_url: string | null
          requester_id: string
          requester_username: string
          responded_at: string | null
          status: string
          stream_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          id?: string
          requester_avatar_url?: string | null
          requester_id: string
          requester_username: string
          responded_at?: string | null
          status?: string
          stream_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          id?: string
          requester_avatar_url?: string | null
          requester_id?: string
          requester_username?: string
          responded_at?: string | null
          status?: string
          stream_id?: string
        }
        Relationships: []
      }
      stream_collab_participants: {
        Row: {
          avatar_url: string | null
          id: string
          is_muted: boolean
          joined_at: string
          stream_id: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          id?: string
          is_muted?: boolean
          joined_at?: string
          stream_id: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          id?: string
          is_muted?: boolean
          joined_at?: string
          stream_id?: string
          user_id?: string
          username?: string
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
      stream_payment_events: {
        Row: {
          amount: number | null
          buyer_id: string | null
          buyer_username: string | null
          created_at: string
          event_type: string
          id: string
          item_label: string | null
          message: string | null
          order_id: string | null
          seller_id: string
          stream_id: string
        }
        Insert: {
          amount?: number | null
          buyer_id?: string | null
          buyer_username?: string | null
          created_at?: string
          event_type: string
          id?: string
          item_label?: string | null
          message?: string | null
          order_id?: string | null
          seller_id: string
          stream_id: string
        }
        Update: {
          amount?: number | null
          buyer_id?: string | null
          buyer_username?: string | null
          created_at?: string
          event_type?: string
          id?: string
          item_label?: string | null
          message?: string | null
          order_id?: string | null
          seller_id?: string
          stream_id?: string
        }
        Relationships: []
      }
      stream_promotions: {
        Row: {
          amount: number
          created_at: string
          duration_seconds: number
          id: string
          message: string | null
          paid_at: string | null
          promoter_id: string
          promoter_username: string
          promotion_ends_at: string | null
          status: string
          stream_id: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          duration_seconds?: number
          id?: string
          message?: string | null
          paid_at?: string | null
          promoter_id: string
          promoter_username: string
          promotion_ends_at?: string | null
          status?: string
          stream_id: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          duration_seconds?: number
          id?: string
          message?: string | null
          paid_at?: string | null
          promoter_id?: string
          promoter_username?: string
          promotion_ends_at?: string | null
          status?: string
          stream_id?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_promotions_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          stream_id: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          stream_id: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          stream_id?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_reactions_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
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
      stream_tips: {
        Row: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at: string
          id: string
          message: string | null
          paid_at: string | null
          platform_fee: number
          seller_id: string
          status: string
          stream_id: string
          streamer_payout: number
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount: number
          buyer_id: string
          buyer_username: string
          created_at?: string
          id?: string
          message?: string | null
          paid_at?: string | null
          platform_fee?: number
          seller_id: string
          status?: string
          stream_id: string
          streamer_payout?: number
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string
          buyer_username?: string
          created_at?: string
          id?: string
          message?: string | null
          paid_at?: string | null
          platform_fee?: number
          seller_id?: string
          status?: string
          stream_id?: string
          streamer_payout?: number
          stripe_payment_intent_id?: string | null
        }
        Relationships: []
      }
      stream_user_bans: {
        Row: {
          banned_by: string
          banned_user_id: string
          created_at: string
          id: string
          reason: string | null
          stream_id: string
        }
        Insert: {
          banned_by: string
          banned_user_id: string
          created_at?: string
          id?: string
          reason?: string | null
          stream_id: string
        }
        Update: {
          banned_by?: string
          banned_user_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          stream_id?: string
        }
        Relationships: []
      }
      stripe_accounts: {
        Row: {
          charges_enabled: boolean
          country: string | null
          created_at: string
          default_currency: string | null
          deliveries_count: number
          details_submitted: boolean
          id: string
          payouts_enabled: boolean
          seller_id: string
          stripe_account_id: string
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          deliveries_count?: number
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          seller_id: string
          stripe_account_id: string
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          deliveries_count?: number
          details_submitted?: boolean
          id?: string
          payouts_enabled?: boolean
          seller_id?: string
          stripe_account_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_staff: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_staff?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_staff?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          ai_conversation: Json | null
          attachments: string[] | null
          category: string
          created_at: string
          id: string
          order_id: string | null
          priority: string
          reported_user_id: string | null
          status: string
          stream_id: string | null
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_conversation?: Json | null
          attachments?: string[] | null
          category: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: string
          reported_user_id?: string | null
          status?: string
          stream_id?: string | null
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_conversation?: Json | null
          attachments?: string[] | null
          category?: string
          created_at?: string
          id?: string
          order_id?: string | null
          priority?: string
          reported_user_id?: string | null
          status?: string
          stream_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tcg_prices: {
        Row: {
          clean_name: string
          game: string
          high_price: number | null
          id: number
          image_url: string | null
          low_price: number | null
          market_price: number | null
          mid_price: number | null
          name: string
          number: string | null
          rarity: string | null
          set_name: string | null
          tcgplayer_product_id: number
          updated_at: string
        }
        Insert: {
          clean_name: string
          game: string
          high_price?: number | null
          id?: number
          image_url?: string | null
          low_price?: number | null
          market_price?: number | null
          mid_price?: number | null
          name: string
          number?: string | null
          rarity?: string | null
          set_name?: string | null
          tcgplayer_product_id: number
          updated_at?: string
        }
        Update: {
          clean_name?: string
          game?: string
          high_price?: number | null
          id?: number
          image_url?: string | null
          low_price?: number | null
          market_price?: number | null
          mid_price?: number | null
          name?: string
          number?: string | null
          rarity?: string | null
          set_name?: string | null
          tcgplayer_product_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      trade_items: {
        Row: {
          card_image_url: string | null
          card_name: string
          card_value: number
          created_at: string
          id: string
          owner_id: string
          owner_side: string
          trade_id: string
          vault_card_id: string | null
        }
        Insert: {
          card_image_url?: string | null
          card_name: string
          card_value?: number
          created_at?: string
          id?: string
          owner_id: string
          owner_side: string
          trade_id: string
          vault_card_id?: string | null
        }
        Update: {
          card_image_url?: string | null
          card_name?: string
          card_value?: number
          created_at?: string
          id?: string
          owner_id?: string
          owner_side?: string
          trade_id?: string
          vault_card_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_items_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          ratee_id: string
          rater_id: string
          stars: number
          trade_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id: string
          rater_id: string
          stars: number
          trade_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          ratee_id?: string
          rater_id?: string
          stars?: number
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_ratings_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          cash_amount: number
          cash_direction: string
          completed_at: string | null
          created_at: string
          from_user: string
          id: string
          message: string | null
          parent_trade_id: string | null
          status: string
          to_user: string
          updated_at: string
        }
        Insert: {
          cash_amount?: number
          cash_direction?: string
          completed_at?: string | null
          created_at?: string
          from_user: string
          id?: string
          message?: string | null
          parent_trade_id?: string | null
          status?: string
          to_user: string
          updated_at?: string
        }
        Update: {
          cash_amount?: number
          cash_direction?: string
          completed_at?: string | null
          created_at?: string
          from_user?: string
          id?: string
          message?: string | null
          parent_trade_id?: string | null
          status?: string
          to_user?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_parent_trade_id_fkey"
            columns: ["parent_trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_progress: {
        Row: {
          completed_at: string | null
          id: string
          tutorial_id: string
          updated_at: string
          user_id: string
          watched_seconds: number
        }
        Insert: {
          completed_at?: string | null
          id?: string
          tutorial_id: string
          updated_at?: string
          user_id: string
          watched_seconds?: number
        }
        Update: {
          completed_at?: string | null
          id?: string
          tutorial_id?: string
          updated_at?: string
          user_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_progress_tutorial_id_fkey"
            columns: ["tutorial_id"]
            isOneToOne: false
            referencedRelation: "tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorials: {
        Row: {
          audience: Database["public"]["Enums"]["tutorial_audience"]
          captions_url: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_published: boolean
          order_index: number
          route_path: string | null
          steps: Json
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
          voice_id: string | null
        }
        Insert: {
          audience?: Database["public"]["Enums"]["tutorial_audience"]
          captions_url?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_published?: boolean
          order_index?: number
          route_path?: string | null
          steps?: Json
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          voice_id?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["tutorial_audience"]
          captions_url?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_published?: boolean
          order_index?: number
          route_path?: string | null
          steps?: Json
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          voice_id?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_combo_streaks: {
        Row: {
          best_combo: number
          combo_count: number
          last_bid_at: string
          stream_id: string
          user_id: string
        }
        Insert: {
          best_combo?: number
          combo_count?: number
          last_bid_at?: string
          stream_id: string
          user_id: string
        }
        Update: {
          best_combo?: number
          combo_count?: number
          last_bid_at?: string
          stream_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_progression: {
        Row: {
          created_at: string
          last_login_date: string | null
          last_watch_date: string | null
          level: number
          lifetime_xp: number
          login_streak: number
          longest_login_streak: number
          total_bids: number
          total_sales: number
          total_wins: number
          updated_at: string
          user_id: string
          watch_streak: number
          xp: number
        }
        Insert: {
          created_at?: string
          last_login_date?: string | null
          last_watch_date?: string | null
          level?: number
          lifetime_xp?: number
          login_streak?: number
          longest_login_streak?: number
          total_bids?: number
          total_sales?: number
          total_wins?: number
          updated_at?: string
          user_id: string
          watch_streak?: number
          xp?: number
        }
        Update: {
          created_at?: string
          last_login_date?: string | null
          last_watch_date?: string | null
          level?: number
          lifetime_xp?: number
          login_streak?: number
          longest_login_streak?: number
          total_bids?: number
          total_sales?: number
          total_wins?: number
          updated_at?: string
          user_id?: string
          watch_streak?: number
          xp?: number
        }
        Relationships: []
      }
      user_quest_progress: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          id: string
          period_key: string
          progress: number
          quest_slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          id?: string
          period_key: string
          progress?: number
          quest_slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          id?: string
          period_key?: string
          progress?: number
          quest_slug?: string
          updated_at?: string
          user_id?: string
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
      user_ui_prefs: {
        Row: {
          haptics: boolean
          reduce_motion: boolean
          sfx_muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          haptics?: boolean
          reduce_motion?: boolean
          sfx_muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          haptics?: boolean
          reduce_motion?: boolean
          sfx_muted?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      username_history: {
        Row: {
          changed_at: string
          id: string
          new_username: string | null
          old_username: string | null
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_username?: string | null
          old_username?: string | null
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_username?: string | null
          old_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vault_cards: {
        Row: {
          accept_offers: boolean
          accept_trades: boolean
          ai_image_url: string | null
          ai_suggested_at: string | null
          ai_suggestion: Json | null
          back_image_url: string | null
          card_identity_id: string | null
          category: string | null
          collection_only: boolean
          condition: Database["public"]["Enums"]["card_condition"] | null
          condition_prices: Json | null
          confidence_score: number | null
          confirmed_by: string | null
          created_at: string
          custom_price: number | null
          custom_price_source: string | null
          description: string | null
          enrichment_status: string
          estimated_value: number | null
          grade: string | null
          grade_values: Json
          graded_price: number | null
          grader: string | null
          grading_cert: string | null
          id: string
          identification_details: Json
          image_gallery: Json
          image_source: string | null
          image_url: string | null
          incorrect_price_reported: boolean
          incorrect_price_reported_at: string | null
          is_demo: boolean
          is_graded: boolean
          is_sealed: boolean
          is_sold: boolean
          language: string | null
          last_rescan_at: string | null
          last_sold_price: number | null
          last_valued_at: string | null
          listed_listing_id: string | null
          market_price: number | null
          master_identity_id: string | null
          match_history: Json
          match_score: number | null
          name: string
          needs_review: boolean
          original_image_url: string | null
          price: number | null
          price_confidence: string | null
          price_high: number | null
          price_is_ai: boolean
          price_locked: boolean
          price_low: number | null
          price_range_high: number | null
          price_range_low: number | null
          price_source: string | null
          price_source_url: string | null
          price_tier: string | null
          price_updated_at: string | null
          pricing_details: Json
          purchase_date: string | null
          purchase_price: number | null
          purchased_from: string | null
          rarity: string | null
          recent_sales_avg: number | null
          review_reason: string | null
          sold_at: string | null
          sold_stream_id: string | null
          status: string
          tcg_number: string | null
          tcg_set: string | null
          tcg_year: string | null
          trade_plus_cash: boolean
          user_id: string
          variant: string | null
          visibility: string
          wrong_match_reported_at: string | null
        }
        Insert: {
          accept_offers?: boolean
          accept_trades?: boolean
          ai_image_url?: string | null
          ai_suggested_at?: string | null
          ai_suggestion?: Json | null
          back_image_url?: string | null
          card_identity_id?: string | null
          category?: string | null
          collection_only?: boolean
          condition?: Database["public"]["Enums"]["card_condition"] | null
          condition_prices?: Json | null
          confidence_score?: number | null
          confirmed_by?: string | null
          created_at?: string
          custom_price?: number | null
          custom_price_source?: string | null
          description?: string | null
          enrichment_status?: string
          estimated_value?: number | null
          grade?: string | null
          grade_values?: Json
          graded_price?: number | null
          grader?: string | null
          grading_cert?: string | null
          id?: string
          identification_details?: Json
          image_gallery?: Json
          image_source?: string | null
          image_url?: string | null
          incorrect_price_reported?: boolean
          incorrect_price_reported_at?: string | null
          is_demo?: boolean
          is_graded?: boolean
          is_sealed?: boolean
          is_sold?: boolean
          language?: string | null
          last_rescan_at?: string | null
          last_sold_price?: number | null
          last_valued_at?: string | null
          listed_listing_id?: string | null
          market_price?: number | null
          master_identity_id?: string | null
          match_history?: Json
          match_score?: number | null
          name: string
          needs_review?: boolean
          original_image_url?: string | null
          price?: number | null
          price_confidence?: string | null
          price_high?: number | null
          price_is_ai?: boolean
          price_locked?: boolean
          price_low?: number | null
          price_range_high?: number | null
          price_range_low?: number | null
          price_source?: string | null
          price_source_url?: string | null
          price_tier?: string | null
          price_updated_at?: string | null
          pricing_details?: Json
          purchase_date?: string | null
          purchase_price?: number | null
          purchased_from?: string | null
          rarity?: string | null
          recent_sales_avg?: number | null
          review_reason?: string | null
          sold_at?: string | null
          sold_stream_id?: string | null
          status?: string
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          trade_plus_cash?: boolean
          user_id: string
          variant?: string | null
          visibility?: string
          wrong_match_reported_at?: string | null
        }
        Update: {
          accept_offers?: boolean
          accept_trades?: boolean
          ai_image_url?: string | null
          ai_suggested_at?: string | null
          ai_suggestion?: Json | null
          back_image_url?: string | null
          card_identity_id?: string | null
          category?: string | null
          collection_only?: boolean
          condition?: Database["public"]["Enums"]["card_condition"] | null
          condition_prices?: Json | null
          confidence_score?: number | null
          confirmed_by?: string | null
          created_at?: string
          custom_price?: number | null
          custom_price_source?: string | null
          description?: string | null
          enrichment_status?: string
          estimated_value?: number | null
          grade?: string | null
          grade_values?: Json
          graded_price?: number | null
          grader?: string | null
          grading_cert?: string | null
          id?: string
          identification_details?: Json
          image_gallery?: Json
          image_source?: string | null
          image_url?: string | null
          incorrect_price_reported?: boolean
          incorrect_price_reported_at?: string | null
          is_demo?: boolean
          is_graded?: boolean
          is_sealed?: boolean
          is_sold?: boolean
          language?: string | null
          last_rescan_at?: string | null
          last_sold_price?: number | null
          last_valued_at?: string | null
          listed_listing_id?: string | null
          market_price?: number | null
          master_identity_id?: string | null
          match_history?: Json
          match_score?: number | null
          name?: string
          needs_review?: boolean
          original_image_url?: string | null
          price?: number | null
          price_confidence?: string | null
          price_high?: number | null
          price_is_ai?: boolean
          price_locked?: boolean
          price_low?: number | null
          price_range_high?: number | null
          price_range_low?: number | null
          price_source?: string | null
          price_source_url?: string | null
          price_tier?: string | null
          price_updated_at?: string | null
          pricing_details?: Json
          purchase_date?: string | null
          purchase_price?: number | null
          purchased_from?: string | null
          rarity?: string | null
          recent_sales_avg?: number | null
          review_reason?: string | null
          sold_at?: string | null
          sold_stream_id?: string | null
          status?: string
          tcg_number?: string | null
          tcg_set?: string | null
          tcg_year?: string | null
          trade_plus_cash?: boolean
          user_id?: string
          variant?: string | null
          visibility?: string
          wrong_match_reported_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_cards_master_identity_id_fkey"
            columns: ["master_identity_id"]
            isOneToOne: false
            referencedRelation: "card_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_hold_status"
            referencedColumns: ["user_id"]
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
      vault_value_snapshots: {
        Row: {
          card_count: number
          created_at: string
          id: string
          snapshot_date: string
          total_cost: number
          total_value: number
          user_id: string
        }
        Insert: {
          card_count?: number
          created_at?: string
          id?: string
          snapshot_date?: string
          total_cost?: number
          total_value?: number
          user_id: string
        }
        Update: {
          card_count?: number
          created_at?: string
          id?: string
          snapshot_date?: string
          total_cost?: number
          total_value?: number
          user_id?: string
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
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_seller_shipping_analytics: {
        Row: {
          avg_hours_label_to_scan: number | null
          avg_hours_paid_to_label: number | null
          avg_hours_scan_to_delivered: number | null
          delivered_count: number | null
          delivery_success_pct: number | null
          late_count: number | null
          late_pct: number | null
          lost_count: number | null
          lost_pct: number | null
          refreshed_at: string | null
          returned_count: number | null
          seller_id: string | null
          total_orders: number | null
        }
        Relationships: []
      }
      seller_offer_risk: {
        Row: {
          auth_failed_30d: number | null
          cancels_30d: number | null
          capture_failed_30d: number | null
          last_event_at: string | null
          spam_30d: number | null
          total_30d: number | null
          user_id: string | null
        }
        Relationships: []
      }
      stream_supporters: {
        Row: {
          buyer_id: string | null
          buyer_username: string | null
          last_tip_at: string | null
          seller_id: string | null
          stream_id: string | null
          tip_count: number | null
          total_tipped: number | null
        }
        Relationships: []
      }
      v_seller_available_balance: {
        Row: {
          available_cents: number | null
          eligible_orders: number | null
          seller_id: string | null
        }
        Relationships: []
      }
      v_user_hold_status: {
        Row: {
          balance_cents: number | null
          balance_owed_cents: number | null
          hold_id: string | null
          opened_at: string | null
          reason: string | null
          risk_flag: boolean | null
          source: Database["public"]["Enums"]["hold_source"] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_owner: { Args: never; Returns: undefined }
      _buyer_signal_weight: { Args: { _kind: string }; Returns: number }
      accept_legal_document: {
        Args: {
          _document_type: string
          _user_agent?: string
          _version?: string
        }
        Returns: undefined
      }
      accept_required_legal_documents: {
        Args: { _user_agent?: string; _version?: string }
        Returns: Json
      }
      accept_seller_agreement: {
        Args: { _user_agent?: string; _version?: string }
        Returns: Json
      }
      add_business_days: {
        Args: { _days: number; _from: string }
        Returns: string
      }
      add_stream_minutes: {
        Args: { _minutes: number; _user_id: string }
        Returns: undefined
      }
      admin_apply_buyer_restriction: {
        Args: {
          _cents_limit?: number
          _expires_at?: string
          _kind: string
          _reason: string
          _user_id: string
        }
        Returns: string
      }
      admin_assign_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      admin_ban_buyer: {
        Args: { _buyer: string; _notes?: string }
        Returns: undefined
      }
      admin_clear_buyer_restriction: {
        Args: { _restriction_id: string }
        Returns: undefined
      }
      admin_extend_buyer_restriction: {
        Args: { _buyer: string; _days: number; _notes?: string }
        Returns: undefined
      }
      admin_force_rearm: { Args: { _stream_id: string }; Returns: Json }
      admin_force_seller_reaccept: {
        Args: { _reason?: string; _target_user: string }
        Returns: undefined
      }
      admin_get_signup_stats: {
        Args: never
        Returns: {
          last_24h: number
          last_7d: number
          total: number
        }[]
      }
      admin_identity_health: { Args: never; Returns: Json }
      admin_list_audit_logs: {
        Args: { _action_filter?: string; _limit?: number }
        Returns: {
          action: string
          actor_id: string
          actor_username: string
          created_at: string
          id: string
          meta: Json
          target_id: string
          target_type: string
        }[]
      }
      admin_list_integrity_alerts: {
        Args: { _limit?: number; _only_unresolved?: boolean }
        Returns: {
          amount_cents: number | null
          created_at: string
          details: Json
          id: string
          kind: string
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }[]
        SetofOptions: {
          from: "*"
          to: "financial_integrity_alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_platform_revenue: {
        Args: {
          _kind?: Database["public"]["Enums"]["platform_revenue_kind"]
          _limit?: number
          _offset?: number
        }
        Returns: {
          amount_cents: number
          buyer_id: string | null
          created_at: string
          currency: string
          id: string
          kind: Database["public"]["Enums"]["platform_revenue_kind"]
          meta: Json
          notes: string | null
          order_id: string | null
          seller_id: string | null
          stripe_charge_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_revenue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_recent_signups: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          created_at: string
          id: string
          is_seller: boolean
          seller_status: string
          username: string
        }[]
      }
      admin_list_verification_requests: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          created_at: string
          id: string
          live_verified: boolean
          report_count: number
          seller_status: string
          username: string
          verification_reason: string
          verification_requested_at: string
          verification_status: string
          verified_at: string
        }[]
      }
      admin_override_trust: {
        Args: {
          _frozen: boolean
          _instant_pct: number
          _reason: string
          _user_id: string
        }
        Returns: {
          chargeback_rate_30d: number
          completed_deliveries: number
          dispute_rate_30d: number
          frozen: boolean
          instant_release_pct: number
          manual_override_pct: number | null
          pending_release_pct: number
          risk_flags: Json
          tier: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_trust"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_personal_sales_summary: {
        Args: { _since?: string; _until?: string }
        Returns: {
          commission_paid_cents: number
          gross_sales_cents: number
          net_payout_cents: number
          order_count: number
          refunded_cents: number
        }[]
      }
      admin_remove_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: undefined
      }
      admin_replay_finalize: { Args: { _stream_id: string }; Returns: Json }
      admin_reset_seller_trust: {
        Args: { _reason: string; _user_id: string }
        Returns: {
          chargeback_rate_30d: number
          completed_deliveries: number
          dispute_rate_30d: number
          frozen: boolean
          instant_release_pct: number
          manual_override_pct: number | null
          pending_release_pct: number
          risk_flags: Json
          tier: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_trust"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_resolve_integrity_alert: {
        Args: { _alert_id: string }
        Returns: undefined
      }
      admin_revenue_by_period: {
        Args: { _bucket: string; _since?: string; _until?: string }
        Returns: {
          bucket_start: string
          gross_cents: number
          losses_cents: number
          net_cents: number
        }[]
      }
      admin_revenue_by_seller: {
        Args: { _limit?: number; _since?: string; _until?: string }
        Returns: {
          commission_cents: number
          gross_sales_cents: number
          order_count: number
          seller_id: string
          seller_payout_cents: number
          username: string
        }[]
      }
      admin_revenue_by_stream: {
        Args: { _limit?: number; _since?: string; _until?: string }
        Returns: {
          commission_cents: number
          gross_sales_cents: number
          order_count: number
          shipping_cents: number
          stream_id: string
          stream_title: string
        }[]
      }
      admin_revenue_summary: {
        Args: { _since?: string }
        Returns: {
          count: number
          kind: Database["public"]["Enums"]["platform_revenue_kind"]
          total_cents: number
        }[]
      }
      admin_run_financial_reconciliation: {
        Args: { _since?: string }
        Returns: {
          missing_commission: number
          missing_shipping_margin: number
          new_alerts: number
          payout_drift: number
          scanned_orders: number
        }[]
      }
      admin_set_verification_status: {
        Args: { _reason?: string; _status: string; _target_user: string }
        Returns: undefined
      }
      admin_shipping_margin: {
        Args: { _since?: string; _until?: string }
        Returns: {
          adjustment_fees_cents: number
          adjustment_losses_cents: number
          label_cost_cents: number
          net_shipping_margin_cents: number
          shipping_charged_cents: number
          shipping_gross_margin_cents: number
        }[]
      }
      admin_waive_buyer_restriction: {
        Args: { _buyer: string; _notes?: string }
        Returns: undefined
      }
      allocate_payout_to_orders: {
        Args: {
          _amount_cents: number
          _completed_at?: string
          _user_id: string
        }
        Returns: undefined
      }
      append_dispute_message: {
        Args: { _body: string; _dispute_id: string; _username: string }
        Returns: undefined
      }
      apply_ai_shipment_scan: {
        Args: {
          _carrier?: string
          _code: string
          _confidence?: number
          _kind?: string
          _metadata?: Json
          _suggested_status?: string
        }
        Returns: {
          new_status: string
          order_id: string
          prev_status: string
          result: string
        }[]
      }
      apply_hold_recovery: {
        Args: {
          _gross_cents: number
          _reference_id?: string
          _source?: string
          _user_id: string
        }
        Returns: {
          created_at: string
          deducted_cents: number
          gross_cents: number
          hold_id: string | null
          id: string
          net_released_cents: number
          notes: string | null
          reference_id: string | null
          remaining_owed_cents: number
          source: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "hold_recoveries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_live_stream_safety: {
        Args: { _stream_id?: string }
        Returns: number
      }
      award_xp: {
        Args: { _amount: number; _reason: string; _ref_id?: string }
        Returns: {
          leveled_up: boolean
          new_level: number
          new_xp: number
        }[]
      }
      bump_combo_streak: {
        Args: { _stream_id: string }
        Returns: {
          best_combo: number
          combo_count: number
        }[]
      }
      bump_login_streak: {
        Args: never
        Returns: {
          current_streak: number
          last_login_date: string
          longest_streak: number
        }[]
      }
      bump_quest_progress: {
        Args: { _delta?: number; _slug: string }
        Returns: {
          completed: boolean
          progress: number
          target: number
          xp_awarded: number
        }[]
      }
      buyer_active_restrictions: {
        Args: { _user_id: string }
        Returns: {
          active: boolean
          cents_limit: number | null
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          reason: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "buyer_restrictions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buyer_can_purchase: {
        Args: { _amount_cents?: number; _user_id: string }
        Returns: boolean
      }
      can_see_mod_chat: { Args: { _stream_id: string }; Returns: boolean }
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
      change_shop_name: { Args: { _new_name: string }; Returns: Json }
      claim_break_slots: {
        Args: { _slot_numbers: number[]; _stream_id: string }
        Returns: {
          claimed_count: number
          order_id: string
          total_amount: number
        }[]
      }
      claim_daily_login: {
        Args: never
        Returns: {
          already_claimed: boolean
          streak: number
          xp_awarded: number
        }[]
      }
      clear_hold_admin: {
        Args: { _hold_id: string; _notes?: string; _override?: boolean }
        Returns: {
          balance_owed_cents: number
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          reason: string | null
          source: Database["public"]["Enums"]["hold_source"]
          status: Database["public"]["Enums"]["hold_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_payout: {
        Args: { _id: string; _transfer_id: string }
        Returns: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_buyer_fee_cents: {
        Args: {
          _buyer_id: string
          _default_cents?: number
          _stream_id: string
          _threshold?: number
        }
        Returns: number
      }
      compute_card_key: {
        Args: { _name: string; _number: string; _set: string }
        Returns: string
      }
      compute_platform_available: {
        Args: never
        Returns: {
          available_cents: number
          net_earnings_cents: number
          payouts_completed_cents: number
          payouts_pending_cents: number
        }[]
      }
      compute_seller_payable: {
        Args: { _user_id: string }
        Returns: {
          available_cents: number
          frozen: boolean
          in_flight_cents: number
          instant_pct: number
          locked_cents: number
          owed_cents: number
          payable_cents: number
          pending_cents: number
          tier: Database["public"]["Enums"]["seller_trust_tier"]
        }[]
      }
      confirm_live_stream_active: {
        Args: { _stream_id: string }
        Returns: undefined
      }
      create_giveaway_order: { Args: { _giveaway_id: string }; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enforce_late_shipments: { Args: never; Returns: Json }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      extend_flex_live_session: {
        Args: { _stream_id: string }
        Returns: string
      }
      fail_payout: {
        Args: { _id: string; _reason: string }
        Returns: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_auction_round: { Args: { _stream_id: string }; Returns: Json }
      generate_public_id: { Args: never; Returns: string }
      get_buyer_completed_count: { Args: { _user: string }; Returns: number }
      get_buyer_private_insights: { Args: { _user_id: string }; Returns: Json }
      get_buyer_public_badges: {
        Args: { _user_id: string }
        Returns: {
          badge: string
          label: string
          tier: string
        }[]
      }
      get_buyer_reputation: {
        Args: { _user_id: string }
        Returns: {
          account_age_days: number
          avg_payment_minutes: number
          bid_restricted_until: string
          cancellation_rate: number
          chargeback_count: number
          completed_purchases: number
          last_active_at: string
          paid_orders: number
          payment_success_rate: number
          refund_rate: number
          unpaid_strikes: number
          unpaid_wins: number
          unresolved_payments: number
        }[]
      }
      get_notify_targets: {
        Args: { _category: string; _user_ids: string[] }
        Returns: {
          allow_push: boolean
          user_id: string
        }[]
      }
      get_seller_badges: {
        Args: { _seller_id: string }
        Returns: {
          badge: string
          label: string
          tier: string
        }[]
      }
      get_seller_completed_count: { Args: { _user: string }; Returns: number }
      get_seller_recent_reviews: {
        Args: { _limit?: number; _seller_id: string }
        Returns: {
          accuracy_rating: number
          buyer_id: string
          buyer_response: Json
          buyer_username: string
          comment: string
          communication_rating: number
          created_at: string
          id: string
          photo_urls: string[]
          rating: number
          seller_response: Json
          shipping_rating: number
          verified_live_auction: boolean
          verified_purchase: boolean
        }[]
      }
      get_seller_response_badges: {
        Args: { _seller_id: string }
        Returns: {
          badge: string
          label: string
          tier: string
        }[]
      }
      get_seller_shipping_cap: { Args: { _user: string }; Returns: number }
      get_seller_stats: {
        Args: { _seller_id: string }
        Returns: {
          avg_accuracy_rating: number
          avg_communication_rating: number
          avg_rating: number
          avg_response_minutes: number
          avg_shipping_days: number
          avg_shipping_rating: number
          cancel_rate: number
          completed_sales: number
          late_rate: number
          on_time_rate: number
          refund_rate: number
          response_rate: number
          review_count: number
          success_rate: number
          total_sales: number
        }[]
      }
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
      grant_user_xp: {
        Args: {
          _amount: number
          _reason: string
          _ref_id?: string
          _user_id: string
        }
        Returns: undefined
      }
      has_active_hold: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_bid_blocked: {
        Args: { _stream_id: string; _user_id: string }
        Returns: boolean
      }
      is_bid_restricted: { Args: { _user: string }; Returns: boolean }
      is_in_quiet_hours: { Args: { _user_id: string }; Returns: boolean }
      is_seller_verified: { Args: { _user_id: string }; Returns: boolean }
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
      lock_order_funds: {
        Args: { _notes?: string; _order_id: string; _reason: string }
        Returns: {
          amount_cents: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string
          released_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_locks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_account_event: {
        Args: {
          _actor_user_id?: string
          _details?: Json
          _dispute_id?: string
          _event_type: Database["public"]["Enums"]["audit_event_type"]
          _evidence_id?: string
          _order_id?: string
          _payment_intent_id?: string
          _payout_id?: string
          _report_id?: string
          _severity?: Database["public"]["Enums"]["audit_severity"]
          _stream_id?: string
          _subject_user_id: string
          _summary: string
        }
        Returns: string
      }
      log_admin_action: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _reason?: string
          _subject_user_id?: string
          _target_id?: string
          _target_table?: string
        }
        Returns: string
      }
      log_audit_event: {
        Args: {
          _action: string
          _ip_hash?: string
          _meta?: Json
          _target_id?: string
          _target_type?: string
          _user_agent?: string
        }
        Returns: string
      }
      log_platform_revenue: {
        Args: {
          _amount_cents: number
          _buyer_id?: string
          _kind: Database["public"]["Enums"]["platform_revenue_kind"]
          _meta?: Json
          _notes?: string
          _order_id?: string
          _seller_id?: string
          _stripe_charge?: string
          _stripe_event?: string
          _stripe_pi?: string
        }
        Returns: string
      }
      mark_order_packed: {
        Args: { _order_id: string }
        Returns: {
          new_status: string
          prev_status: string
        }[]
      }
      mark_order_ready: {
        Args: { _order_id: string }
        Returns: {
          new_status: string
          prev_status: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notify_user: {
        Args: {
          _body: string
          _category: string
          _link: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      perf_slow_routes: {
        Args: { _limit?: number; _minutes?: number }
        Returns: {
          avg_ms: number
          hits: number
          kind: string
          max_ms: number
          p95_ms: number
          route: string
        }[]
      }
      perf_summary: {
        Args: { _minutes?: number }
        Returns: {
          avg_ms: number
          error_count: number
          kind: string
          max_ms: number
          p50_ms: number
          p95_ms: number
          p99_ms: number
          request_count: number
        }[]
      }
      place_listing_bid: {
        Args: { _amount: number; _listing_id: string }
        Returns: Json
      }
      place_live_bid: {
        Args: { _amount: number; _stream_id: string }
        Returns: Json
      }
      public_profile_by_username: {
        Args: { _username: string }
        Returns: {
          accent_color: string
          avatar_url: string
          banner_url: string
          bio: string
          buyer_verified: boolean
          created_at: string
          featured_listing_ids: string[]
          id: string
          is_seller: boolean
          phone_verified: boolean
          public_id: string
          seller_status: string
          shop_name: string
          social_links: Json
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
      purge_old_notifications: { Args: never; Returns: number }
      purge_old_perf_data: { Args: never; Returns: number }
      rate_limit_card_scan: { Args: { _user_id: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      rearm_next_round: { Args: { _stream_id: string }; Returns: Json }
      recalc_seller_trust: {
        Args: { _user_id: string }
        Returns: {
          chargeback_rate_30d: number
          completed_deliveries: number
          dispute_rate_30d: number
          frozen: boolean
          instant_release_pct: number
          manual_override_pct: number | null
          pending_release_pct: number
          risk_flags: Json
          tier: Database["public"]["Enums"]["seller_trust_tier"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "seller_trust"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reconcile_auction_states: { Args: never; Returns: number }
      reconcile_sold_items: { Args: never; Returns: number }
      reconcile_stale_payments: { Args: never; Returns: number }
      record_buyer_risk_signal: {
        Args: {
          _kind: string
          _metadata?: Json
          _ref_id?: string
          _ref_table?: string
          _seller_id?: string
          _user_id: string
        }
        Returns: number
      }
      record_shipping_adjustment: {
        Args: {
          _cost_cents: number
          _notes?: string
          _order_id: string
          _type: string
        }
        Returns: {
          adjustment_type: string
          cost_cents: number
          created_at: string
          id: string
          notes: string | null
          order_id: string | null
          user_id: string
          was_charged: boolean
        }
        SetofOptions: {
          from: "*"
          to: "shipping_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_unpaid_auction_win: { Args: { _buyer_id: string }; Returns: Json }
      refresh_seller_shipping_analytics: { Args: never; Returns: undefined }
      register_shipping_scan: {
        Args: { _code: string; _kind?: string }
        Returns: {
          new_status: string
          order_id: string
          prev_status: string
          result: string
        }[]
      }
      release_order_funds: {
        Args: { _order_id: string; _reason?: string }
        Returns: number
      }
      request_payout: {
        Args: { _amount_cents: number }
        Returns: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          requested_at: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "payout_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_platform_payout: {
        Args: { _amount_cents: number; _destination: string; _notes?: string }
        Returns: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          currency: string
          destination: string
          failure_reason: string | null
          id: string
          notes: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["payout_status"]
          stripe_payout_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_verification: {
        Args: { _kind?: string; _note?: string }
        Returns: Json
      }
      run_financial_reconciliation: {
        Args: { _since?: string }
        Returns: {
          missing_commission: number
          missing_shipping_margin: number
          new_alerts: number
          payout_drift: number
          scanned_orders: number
        }[]
      }
      run_platform_reconciliation: { Args: never; Returns: Json }
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
      search_users: {
        Args: { _limit?: number; _query: string }
        Returns: {
          avatar_url: string
          follower_count: number
          full_name: string
          id: string
          is_seller: boolean
          live_verified: boolean
          seller_status: string
          shop_name: string
          username: string
        }[]
      }
      seller_country: { Args: { _seller_id: string }; Returns: string }
      set_order_shipping_status: {
        Args: {
          _location?: string
          _message?: string
          _order_id: string
          _raw?: Json
          _source?: string
          _status: Database["public"]["Enums"]["shipping_status"]
          _tracking_status?: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      suggested_users: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          id: string
          live_verified: boolean
          mutual_count: number
          seller_status: string
          shop_name: string
          username: string
        }[]
      }
      sweep_inactive_streams: {
        Args: never
        Returns: {
          ended_stream_id: string
          reason: string
        }[]
      }
      sweep_stuck_auctions: { Args: never; Returns: Json }
      touch_live_stream_activity: {
        Args: { _activity_type?: string; _stream_id: string }
        Returns: undefined
      }
      trending_sellers: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          follower_count: number
          id: string
          live_verified: boolean
          recent_sales: number
          seller_status: string
          shop_name: string
          username: string
        }[]
      }
      tutorials_for_route: {
        Args: { _path: string }
        Returns: {
          audience: Database["public"]["Enums"]["tutorial_audience"]
          captions_url: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          is_published: boolean
          order_index: number
          route_path: string | null
          steps: Json
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
          voice_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tutorials"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      unlock_achievement: {
        Args: { _slug: string; _user_id: string }
        Returns: undefined
      }
      xp_to_level: { Args: { _xp: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "owner" | "support"
      arena_title: "rookie" | "veteran" | "elite" | "champion" | "legend"
      audit_event_type:
        | "payment_failed"
        | "payment_declined"
        | "chargeback"
        | "refund_requested"
        | "refund_issued"
        | "order_cancelled"
        | "not_delivered_claim"
        | "report_filed"
        | "suspicious_activity"
        | "bidding_abuse"
        | "warning_issued"
        | "restriction_applied"
        | "restriction_cleared"
        | "ban_applied"
        | "shipping_issue"
        | "policy_violation"
        | "store_name_changed"
        | "username_changed"
        | "verification_status_changed"
        | "payout_issue"
        | "admin_note"
        | "admin_action"
        | "dispute_opened"
        | "dispute_status_changed"
        | "dispute_escalated"
        | "dispute_resolved"
        | "evidence_uploaded"
        | "evidence_reviewed"
      audit_severity: "info" | "low" | "medium" | "high" | "critical"
      card_condition: "NM" | "LP" | "MP" | "Damaged"
      dispute_lifecycle:
        | "opened"
        | "evidence_pending"
        | "under_review"
        | "escalated"
        | "resolved_refund"
        | "resolved_rebook"
        | "resolved_partial"
        | "rejected"
        | "closed"
      evidence_status:
        | "pending"
        | "approved"
        | "rejected"
        | "flagged"
        | "locked"
      hold_source:
        | "refund"
        | "chargeback"
        | "failed_label"
        | "fee"
        | "manual"
        | "other"
      hold_status: "active" | "cleared" | "admin_override"
      insurance_claim_reason: "lost" | "damaged" | "stolen"
      insurance_claim_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "denied"
        | "paid"
      insurance_default_mode: "off" | "optional" | "required"
      insurance_payer: "buyer" | "seller"
      insurance_status:
        | "none"
        | "requested"
        | "active"
        | "claim_pending"
        | "claim_approved"
        | "claim_denied"
        | "reimbursed"
      payout_adjustment_kind:
        | "insurance_fee"
        | "insurance_reimbursement"
        | "refund"
        | "manual"
      payout_status:
        | "requested"
        | "processing"
        | "completed"
        | "failed"
        | "canceled"
      platform_revenue_kind:
        | "marketplace_commission"
        | "intl_processing_fee"
        | "tip_fee"
        | "promotion"
        | "shipping_adjustment_fee"
        | "refund_loss"
        | "dispute_loss"
        | "stripe_processing_fee"
        | "adjustment"
        | "sales_tax_collected"
        | "sales_tax_refund"
      report_status:
        | "open"
        | "investigating"
        | "resolved"
        | "dismissed"
        | "escalated"
      report_subject_type:
        | "user"
        | "store"
        | "listing"
        | "stream"
        | "order"
        | "message"
      seller_trust_tier:
        | "new"
        | "bronze"
        | "silver"
        | "gold"
        | "platinum"
        | "diamond"
      shipping_status:
        | "pending_shipment"
        | "label_created"
        | "shipped"
        | "in_transit"
        | "delivered"
        | "delivery_failed"
        | "returned"
        | "lost_package"
      tutorial_audience:
        | "buyer"
        | "seller"
        | "host"
        | "flex"
        | "auction"
        | "general"
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
      arena_title: ["rookie", "veteran", "elite", "champion", "legend"],
      audit_event_type: [
        "payment_failed",
        "payment_declined",
        "chargeback",
        "refund_requested",
        "refund_issued",
        "order_cancelled",
        "not_delivered_claim",
        "report_filed",
        "suspicious_activity",
        "bidding_abuse",
        "warning_issued",
        "restriction_applied",
        "restriction_cleared",
        "ban_applied",
        "shipping_issue",
        "policy_violation",
        "store_name_changed",
        "username_changed",
        "verification_status_changed",
        "payout_issue",
        "admin_note",
        "admin_action",
        "dispute_opened",
        "dispute_status_changed",
        "dispute_escalated",
        "dispute_resolved",
        "evidence_uploaded",
        "evidence_reviewed",
      ],
      audit_severity: ["info", "low", "medium", "high", "critical"],
      card_condition: ["NM", "LP", "MP", "Damaged"],
      dispute_lifecycle: [
        "opened",
        "evidence_pending",
        "under_review",
        "escalated",
        "resolved_refund",
        "resolved_rebook",
        "resolved_partial",
        "rejected",
        "closed",
      ],
      evidence_status: ["pending", "approved", "rejected", "flagged", "locked"],
      hold_source: [
        "refund",
        "chargeback",
        "failed_label",
        "fee",
        "manual",
        "other",
      ],
      hold_status: ["active", "cleared", "admin_override"],
      insurance_claim_reason: ["lost", "damaged", "stolen"],
      insurance_claim_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "denied",
        "paid",
      ],
      insurance_default_mode: ["off", "optional", "required"],
      insurance_payer: ["buyer", "seller"],
      insurance_status: [
        "none",
        "requested",
        "active",
        "claim_pending",
        "claim_approved",
        "claim_denied",
        "reimbursed",
      ],
      payout_adjustment_kind: [
        "insurance_fee",
        "insurance_reimbursement",
        "refund",
        "manual",
      ],
      payout_status: [
        "requested",
        "processing",
        "completed",
        "failed",
        "canceled",
      ],
      platform_revenue_kind: [
        "marketplace_commission",
        "intl_processing_fee",
        "tip_fee",
        "promotion",
        "shipping_adjustment_fee",
        "refund_loss",
        "dispute_loss",
        "stripe_processing_fee",
        "adjustment",
        "sales_tax_collected",
        "sales_tax_refund",
      ],
      report_status: [
        "open",
        "investigating",
        "resolved",
        "dismissed",
        "escalated",
      ],
      report_subject_type: [
        "user",
        "store",
        "listing",
        "stream",
        "order",
        "message",
      ],
      seller_trust_tier: [
        "new",
        "bronze",
        "silver",
        "gold",
        "platinum",
        "diamond",
      ],
      shipping_status: [
        "pending_shipment",
        "label_created",
        "shipped",
        "in_transit",
        "delivered",
        "delivery_failed",
        "returned",
        "lost_package",
      ],
      tutorial_audience: [
        "buyer",
        "seller",
        "host",
        "flex",
        "auction",
        "general",
      ],
    },
  },
} as const
