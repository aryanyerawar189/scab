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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      airports: {
        Row: {
          active: boolean
          city: string | null
          created_at: string
          iata: string
          icao: string | null
          id: string
          location: unknown
          name: string
          region_id: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          created_at?: string
          iata: string
          icao?: string | null
          id?: string
          location: unknown
          name: string
          region_id: string
        }
        Update: {
          active?: boolean
          city?: string | null
          created_at?: string
          iata?: string
          icao?: string | null
          id?: string
          location?: unknown
          name?: string
          region_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "airports_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      match_members: {
        Row: {
          accepted: boolean | null
          estimated_share: number | null
          id: string
          match_id: string
          paid_at: string | null
          payment_disputed: boolean
          share_amount: number | null
          solo_estimate: number | null
          trip_id: string
          user_id: string
        }
        Insert: {
          accepted?: boolean | null
          estimated_share?: number | null
          id?: string
          match_id: string
          paid_at?: string | null
          payment_disputed?: boolean
          share_amount?: number | null
          solo_estimate?: number | null
          trip_id: string
          user_id: string
        }
        Update: {
          accepted?: boolean | null
          estimated_share?: number | null
          id?: string
          match_id?: string
          paid_at?: string | null
          payment_disputed?: boolean
          share_amount?: number | null
          solo_estimate?: number | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_members_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_requests: {
        Row: {
          created_at: string
          detour_km: number | null
          drop_gap_km: number | null
          expires_at: string
          from_trip_id: string
          from_user_id: string
          id: string
          responded_at: string | null
          saving_percent: number | null
          status: string
          to_trip_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          detour_km?: number | null
          drop_gap_km?: number | null
          expires_at: string
          from_trip_id: string
          from_user_id: string
          id?: string
          responded_at?: string | null
          saving_percent?: number | null
          status?: string
          to_trip_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          detour_km?: number | null
          drop_gap_km?: number | null
          expires_at?: string
          from_trip_id?: string
          from_user_id?: string
          id?: string
          responded_at?: string | null
          saving_percent?: number | null
          status?: string
          to_trip_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_requests_from_trip_id_fkey"
            columns: ["from_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_to_trip_id_fkey"
            columns: ["to_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          accept_deadline: string
          booked_at: string | null
          booker_id: string | null
          cancel_reason: string | null
          cancelled_after_booking: boolean
          cancelled_by: string | null
          created_at: string
          currency: string
          estimated_fare: number | null
          extra_minutes: number | null
          fare: number | null
          fare_status: string | null
          id: string
          meeting_point: string | null
          receipt_url: string | null
          saving_percent: number | null
          status: string
          swap_requested_by: string | null
          walk_m: number | null
          walker_id: string | null
        }
        Insert: {
          accept_deadline?: string
          booked_at?: string | null
          booker_id?: string | null
          cancel_reason?: string | null
          cancelled_after_booking?: boolean
          cancelled_by?: string | null
          created_at?: string
          currency: string
          estimated_fare?: number | null
          extra_minutes?: number | null
          fare?: number | null
          fare_status?: string | null
          id?: string
          meeting_point?: string | null
          receipt_url?: string | null
          saving_percent?: number | null
          status?: string
          swap_requested_by?: string | null
          walk_m?: number | null
          walker_id?: string | null
        }
        Update: {
          accept_deadline?: string
          booked_at?: string | null
          booker_id?: string | null
          cancel_reason?: string | null
          cancelled_after_booking?: boolean
          cancelled_by?: string | null
          created_at?: string
          currency?: string
          estimated_fare?: number | null
          extra_minutes?: number | null
          fare?: number | null
          fare_status?: string | null
          id?: string
          meeting_point?: string | null
          receipt_url?: string | null
          saving_percent?: number | null
          status?: string
          swap_requested_by?: string | null
          walk_m?: number | null
          walker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_booker_id_fkey"
            columns: ["booker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_swap_requested_by_fkey"
            columns: ["swap_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_walker_id_fkey"
            columns: ["walker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_settings: {
        Row: {
          accept_minutes: number
          city_speed_kmph: number
          exit_minutes_cabin: number
          exit_minutes_checked: number
          exit_minutes_international_extra: number
          id: number
          max_detour_km: number
          max_extra_minutes: number
          max_pickup_walk_m: number
          min_overlap_minutes: number
          min_saving_percent: number
          near_miss_max_minutes: number
          request_minutes_live: number
          request_minutes_scheduled: number
          road_factor: number
          stop_minutes: number
          walk_speed_kmph: number
        }
        Insert: {
          accept_minutes?: number
          city_speed_kmph?: number
          exit_minutes_cabin?: number
          exit_minutes_checked?: number
          exit_minutes_international_extra?: number
          id?: number
          max_detour_km?: number
          max_extra_minutes?: number
          max_pickup_walk_m?: number
          min_overlap_minutes?: number
          min_saving_percent?: number
          near_miss_max_minutes?: number
          request_minutes_live?: number
          request_minutes_scheduled?: number
          road_factor?: number
          stop_minutes?: number
          walk_speed_kmph?: number
        }
        Update: {
          accept_minutes?: number
          city_speed_kmph?: number
          exit_minutes_cabin?: number
          exit_minutes_checked?: number
          exit_minutes_international_extra?: number
          id?: number
          max_detour_km?: number
          max_extra_minutes?: number
          max_pickup_walk_m?: number
          min_overlap_minutes?: number
          min_saving_percent?: number
          near_miss_max_minutes?: number
          request_minutes_live?: number
          request_minutes_scheduled?: number
          road_factor?: number
          stop_minutes?: number
          walk_speed_kmph?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          match_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          match_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          match_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          id: string
          phone: string | null
          upi_id: string | null
        }
        Insert: {
          id: string
          phone?: string | null
          upi_id?: string | null
        }
        Update: {
          id?: string
          phone?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          gender: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          gender?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          gender?: string | null
          id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          created_at: string
          id: string
          match_id: string
          ratee_id: string
          rater_id: string
          thumbs_up: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          ratee_id: string
          rater_id: string
          thumbs_up: boolean
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          ratee_id?: string
          rater_id?: string
          thumbs_up?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ratings_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          active: boolean
          area: unknown
          code: string
          country_code: string
          created_at: string
          currency: string
          fare_base: number
          fare_per_km: number
          id: string
          min_saving_amount: number
          name: string
          timezone: string
        }
        Insert: {
          active?: boolean
          area: unknown
          code: string
          country_code: string
          created_at?: string
          currency: string
          fare_base: number
          fare_per_km: number
          id?: string
          min_saving_amount: number
          name: string
          timezone: string
        }
        Update: {
          active?: boolean
          area?: unknown
          code?: string
          country_code?: string
          created_at?: string
          currency?: string
          fare_base?: number
          fare_per_km?: number
          id?: string
          min_saving_amount?: number
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      server_secrets: {
        Row: {
          name: string
          sha256: string
        }
        Insert: {
          name: string
          sha256: string
        }
        Update: {
          name?: string
          sha256?: string
        }
        Relationships: []
      }
      terminals: {
        Row: {
          active: boolean
          airport_id: string
          code: string
          id: string
          location: unknown
          meeting_point: string
          name: string
          sort: number
        }
        Insert: {
          active?: boolean
          airport_id: string
          code: string
          id?: string
          location: unknown
          meeting_point: string
          name: string
          sort?: number
        }
        Update: {
          active?: boolean
          airport_id?: string
          code?: string
          id?: string
          location?: unknown
          meeting_point?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "terminals_airport_id_fkey"
            columns: ["airport_id"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          auto_accept: boolean | null
          checked_bags: boolean
          checked_in_at: string | null
          created_at: string
          depart_at: string | null
          distance_km: number | null
          drop_label: string
          drop_lat: number | null
          drop_lng: number | null
          drop_location: unknown
          drop_place_id: string | null
          hidden_at: string | null
          id: string
          is_international: boolean
          landing_at: string | null
          max_walk_m: number
          mode: string
          pickup_label: string
          pickup_location: unknown
          pickup_place_id: string | null
          place_provider: string
          ready_from: string | null
          ready_until: string | null
          region_id: string
          stage: string
          status: string
          terminal: string | null
          terminal_id: string | null
          user_id: string
          wait_minutes: number
          women_only: boolean
        }
        Insert: {
          auto_accept?: boolean | null
          checked_bags?: boolean
          checked_in_at?: string | null
          created_at?: string
          depart_at?: string | null
          distance_km?: number | null
          drop_label: string
          drop_lat?: number | null
          drop_lng?: number | null
          drop_location: unknown
          drop_place_id?: string | null
          hidden_at?: string | null
          id?: string
          is_international?: boolean
          landing_at?: string | null
          max_walk_m?: number
          mode?: string
          pickup_label: string
          pickup_location: unknown
          pickup_place_id?: string | null
          place_provider?: string
          ready_from?: string | null
          ready_until?: string | null
          region_id: string
          stage?: string
          status?: string
          terminal?: string | null
          terminal_id?: string | null
          user_id: string
          wait_minutes?: number
          women_only?: boolean
        }
        Update: {
          auto_accept?: boolean | null
          checked_bags?: boolean
          checked_in_at?: string | null
          created_at?: string
          depart_at?: string | null
          distance_km?: number | null
          drop_label?: string
          drop_lat?: number | null
          drop_lng?: number | null
          drop_location?: unknown
          drop_place_id?: string | null
          hidden_at?: string | null
          id?: string
          is_international?: boolean
          landing_at?: string | null
          max_walk_m?: number
          mode?: string
          pickup_label?: string
          pickup_location?: unknown
          pickup_place_id?: string | null
          place_provider?: string
          ready_from?: string | null
          ready_until?: string | null
          region_id?: string
          stage?: string
          status?: string
          terminal?: string | null
          terminal_id?: string | null
          user_id?: string
          wait_minutes?: number
          women_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "trips_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_user_id_fkey"
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
      accept_request: { Args: { p_request_id: string }; Returns: string }
      airport_at: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          airport_id: string
          airport_name: string
          city: string
          distance_m: number
          iata: string
          terminal_code: string
          terminal_id: string
          terminal_name: string
        }[]
      }
      cancel_match: { Args: { p_match_id: string }; Returns: undefined }
      check_in: { Args: { p_trip_id: string }; Returns: string }
      create_match: {
        Args: { p_drop_gap_km?: number; p_trip_a: string; p_trip_b: string }
        Returns: string
      }
      delete_trip: { Args: { p_trip_id: string }; Returns: undefined }
      end_match: {
        Args: { p_by?: string; p_match_id: string; p_reason: string }
        Returns: undefined
      }
      extend_wait: {
        Args: { p_extra_minutes: number; p_trip_id: string }
        Returns: string
      }
      find_another_rider: { Args: { p_match_id: string }; Returns: undefined }
      is_confirmed_corider: { Args: { p_user_id: string }; Returns: boolean }
      is_match_member: { Args: { p_match_id: string }; Returns: boolean }
      is_trip_in_my_match: { Args: { p_trip_id: string }; Returns: boolean }
      mark_booked: {
        Args: { p_fare: number; p_match_id: string }
        Returns: undefined
      }
      mark_landed: { Args: { p_trip_id: string }; Returns: undefined }
      mark_paid: { Args: { p_match_id: string }; Returns: undefined }
      match_candidates: {
        Args: {
          p_detour_slack?: number
          p_gaps?: Json
          p_me: Database["public"]["Tables"]["trips"]["Row"]
          p_near_miss?: boolean
        }
        Returns: {
          detour_km: number
          drop_gap_km: number
          needed_wait: number
          ready_from: string
          ready_until: string
          saving_percent: number
          trip_id: string
          walk_m: number
          walker_trip_id: string
        }[]
      }
      match_options: {
        Args: { p_gaps?: Json; p_prefilter?: boolean; p_trip_id: string }
        Returns: {
          detour_km: number
          drop_gap_km: number
          i_walk: boolean
          ready_from: string
          received_expires_at: string
          received_request_id: string
          saving_percent: number
          sent_expires_at: string
          sent_request_id: string
          trip_id: string
          walk_m: number
        }[]
      }
      my_active_trip: {
        Args: { p_trip_id: string }
        Returns: {
          auto_accept: boolean | null
          checked_bags: boolean
          checked_in_at: string | null
          created_at: string
          depart_at: string | null
          distance_km: number | null
          drop_label: string
          drop_lat: number | null
          drop_lng: number | null
          drop_location: unknown
          drop_place_id: string | null
          hidden_at: string | null
          id: string
          is_international: boolean
          landing_at: string | null
          max_walk_m: number
          mode: string
          pickup_label: string
          pickup_location: unknown
          pickup_place_id: string | null
          place_provider: string
          ready_from: string | null
          ready_until: string | null
          region_id: string
          stage: string
          status: string
          terminal: string | null
          terminal_id: string | null
          user_id: string
          wait_minutes: number
          women_only: boolean
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      near_miss: {
        Args: { p_trip_id: string }
        Returns: {
          drop_gap_km: number
          extra_wait_minutes: number
          other_ready_at: string
          saving_percent: number
        }[]
      }
      pair_blocked: {
        Args: { p_user_1: string; p_user_2: string }
        Returns: boolean
      }
      pair_drop_points: {
        Args: {
          p_other_trip_ids: string[]
          p_secret: string
          p_trip_id: string
        }
        Returns: {
          lat: number
          lng: number
          trip_id: string
        }[]
      }
      pair_estimate: {
        Args: {
          p_a: Database["public"]["Tables"]["trips"]["Row"]
          p_b: Database["public"]["Tables"]["trips"]["Row"]
          p_drop_gap_km?: number
        }
        Returns: {
          detour_km: number
          drop_gap_km: number
          extra_minutes: number
          saving_percent: number
          shared_fare: number
          solo_a: number
          solo_b: number
          walk_m: number
          walker_trip_id: string
        }[]
      }
      pickups_compatible: {
        Args: {
          p_a: Database["public"]["Tables"]["trips"]["Row"]
          p_b: Database["public"]["Tables"]["trips"]["Row"]
        }
        Returns: boolean
      }
      recalculate_shares: { Args: { p_match_id: string }; Returns: undefined }
      recheck_trip: { Args: { p_trip_id: string }; Returns: undefined }
      report_delay: {
        Args: { p_new_landing_at: string; p_trip_id: string }
        Returns: string
      }
      report_not_received: {
        Args: { p_match_id: string; p_rider_id: string }
        Returns: undefined
      }
      request_booker_swap: { Args: { p_match_id: string }; Returns: undefined }
      request_match: {
        Args: {
          p_drop_gap_km?: number
          p_other_trip_id: string
          p_trip_id: string
        }
        Returns: string
      }
      respond_booker_swap: {
        Args: { p_allow: boolean; p_match_id: string }
        Returns: undefined
      }
      respond_to_fare: {
        Args: { p_match_id: string; p_ok: boolean }
        Returns: undefined
      }
      respond_to_match: {
        Args: { p_accept: boolean; p_match_id: string }
        Returns: string
      }
      respond_to_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: string
      }
      rider_stats: {
        Args: { p_user_id: string }
        Returns: {
          late_cancellations: number
          thumbs_up: number
          total_ratings: number
        }[]
      }
      scab_housekeeping: { Args: never; Returns: undefined }
      update_fare: {
        Args: { p_fare: number; p_match_id: string; p_receipt_url?: string }
        Returns: undefined
      }
      withdraw_request: { Args: { p_request_id: string }; Returns: undefined }
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
    Enums: {},
  },
} as const
