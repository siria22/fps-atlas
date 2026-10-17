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
      edit_suggestions: {
        Row: {
          admin1_code: string | null
          code: string | null
          country: string | null
          country_code: string | null
          created_at: string
          fields: Database["public"]["Enums"]["suggestion_field"][]
          id: number
          location_precision:
            | Database["public"]["Enums"]["location_precision"]
            | null
          map_place_id: string
          proposal: string
          reason: string
          reference_url: string | null
          region: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["submission_status"]
          user_id: string
        }
        Insert: {
          admin1_code?: string | null
          code?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          fields: Database["public"]["Enums"]["suggestion_field"][]
          id?: never
          location_precision?:
            | Database["public"]["Enums"]["location_precision"]
            | null
          map_place_id: string
          proposal: string
          reason: string
          reference_url?: string | null
          region?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
        }
        Update: {
          admin1_code?: string | null
          code?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          fields?: Database["public"]["Enums"]["suggestion_field"][]
          id?: never
          location_precision?:
            | Database["public"]["Enums"]["location_precision"]
            | null
          map_place_id?: string
          proposal?: string
          reason?: string
          reference_url?: string | null
          region?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_suggestions_map_place_id_fkey"
            columns: ["map_place_id"]
            isOneToOne: false
            referencedRelation: "map_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          era: Database["public"]["Enums"]["era"]
          id: string
          name: string
          wikipedia_title_en: string | null
          wikipedia_title_ko: string | null
        }
        Insert: {
          created_at?: string
          era?: Database["public"]["Enums"]["era"]
          id?: string
          name: string
          wikipedia_title_en?: string | null
          wikipedia_title_ko?: string | null
        }
        Update: {
          created_at?: string
          era?: Database["public"]["Enums"]["era"]
          id?: string
          name?: string
          wikipedia_title_en?: string | null
          wikipedia_title_ko?: string | null
        }
        Relationships: []
      }
      game_aliases: {
        Row: {
          alias: string
          created_at: string
          game_id: string
          lang: string
        }
        Insert: {
          alias: string
          created_at?: string
          game_id: string
          lang: string
        }
        Update: {
          alias?: string
          created_at?: string
          game_id?: string
          lang?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_aliases_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          id: string
          name: string
          release_year: number | null
          series: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          release_year?: number | null
          series?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          release_year?: number | null
          series?: string | null
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          body: string
          category: string
          created_at: string
          id: number
          locale: string
          notified: boolean
          notify_attempts: number
          notify_error: string | null
          page_url: string | null
          reply_to: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: never
          locale: string
          notified?: boolean
          notify_attempts?: number
          notify_error?: string | null
          page_url?: string | null
          reply_to: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: never
          locale?: string
          notified?: boolean
          notify_attempts?: number
          notify_error?: string | null
          page_url?: string | null
          reply_to?: string
          subject?: string
          user_id?: string
        }
        Relationships: []
      }
      map_aliases: {
        Row: {
          alias: string
          created_at: string
          lang: string
          map_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          lang: string
          map_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          lang?: string
          map_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_aliases_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      map_place_sources: {
        Row: {
          created_at: string
          id: number
          map_place_id: string
          submission_id: number | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: never
          map_place_id: string
          submission_id?: number | null
          url: string
        }
        Update: {
          created_at?: string
          id?: never
          map_place_id?: string
          submission_id?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_place_sources_map_place_id_fkey"
            columns: ["map_place_id"]
            isOneToOne: false
            referencedRelation: "map_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_place_sources_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      map_places: {
        Row: {
          created_at: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id: string
          map_id: string
          note: string | null
          place_id: string
          screenshot_credit: string | null
          screenshot_path: string | null
          screenshot_thumb_path: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          id?: string
          map_id: string
          note?: string | null
          place_id: string
          screenshot_credit?: string | null
          screenshot_path?: string | null
          screenshot_thumb_path?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          id?: string
          map_id?: string
          note?: string | null
          place_id?: string
          screenshot_credit?: string | null
          screenshot_path?: string | null
          screenshot_thumb_path?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "map_places_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          created_at: string
          era: Database["public"]["Enums"]["era"]
          game_id: string
          id: string
          name: string
          verified: boolean
          wiki_url: string | null
        }
        Insert: {
          created_at?: string
          era?: Database["public"]["Enums"]["era"]
          game_id: string
          id?: string
          name: string
          verified?: boolean
          wiki_url?: string | null
        }
        Update: {
          created_at?: string
          era?: Database["public"]["Enums"]["era"]
          game_id?: string
          id?: string
          name?: string
          verified?: boolean
          wiki_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maps_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      place_events: {
        Row: {
          event_id: string
          place_id: string
        }
        Insert: {
          event_id: string
          place_id: string
        }
        Update: {
          event_id?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          admin1_code: string | null
          commons_author: string | null
          commons_file: string | null
          commons_license: string | null
          country: string
          country_code: string | null
          created_at: string
          id: string
          lat: number
          lng: number
          location_precision: Database["public"]["Enums"]["location_precision"]
          name: string
          name_en: string | null
          photo_credit: string | null
          photo_path: string | null
          photo_thumb_path: string | null
          region: string | null
          verified: boolean
          wikipedia_title_en: string | null
          wikipedia_title_ko: string | null
        }
        Insert: {
          admin1_code?: string | null
          commons_author?: string | null
          commons_file?: string | null
          commons_license?: string | null
          country: string
          country_code?: string | null
          created_at?: string
          id?: string
          lat: number
          lng: number
          location_precision?: Database["public"]["Enums"]["location_precision"]
          name: string
          name_en?: string | null
          photo_credit?: string | null
          photo_path?: string | null
          photo_thumb_path?: string | null
          region?: string | null
          verified?: boolean
          wikipedia_title_en?: string | null
          wikipedia_title_ko?: string | null
        }
        Update: {
          admin1_code?: string | null
          commons_author?: string | null
          commons_file?: string | null
          commons_license?: string | null
          country?: string
          country_code?: string | null
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          location_precision?: Database["public"]["Enums"]["location_precision"]
          name?: string
          name_en?: string | null
          photo_credit?: string | null
          photo_path?: string | null
          photo_thumb_path?: string | null
          region?: string | null
          verified?: boolean
          wikipedia_title_en?: string | null
          wikipedia_title_ko?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          nickname: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          nickname?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          nickname?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      submissions: {
        Row: {
          admin1_code: string | null
          code: string | null
          confirmed_admin1_code: string | null
          confirmed_country_code: string | null
          confirmed_era: Database["public"]["Enums"]["era"] | null
          confirmed_evidence_level:
            | Database["public"]["Enums"]["evidence_level"]
            | null
          confirmed_lat: number | null
          confirmed_lng: number | null
          confirmed_location_precision:
            | Database["public"]["Enums"]["location_precision"]
            | null
          confirmed_region: string | null
          country: string
          country_code: string
          created_at: string
          description: string | null
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          game_id: string | null
          game_name: string
          id: number
          image_rights_confirmed: boolean | null
          lat: number | null
          lng: number | null
          location_precision: Database["public"]["Enums"]["location_precision"]
          map_id: string | null
          map_name: string
          map_place_id: string | null
          place_photo_path: string | null
          place_photo_thumb_path: string | null
          region: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_path: string | null
          screenshot_thumb_path: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["submission_status"]
          user_id: string
          wiki_url: string | null
        }
        Insert: {
          admin1_code?: string | null
          code?: string | null
          confirmed_admin1_code?: string | null
          confirmed_country_code?: string | null
          confirmed_era?: Database["public"]["Enums"]["era"] | null
          confirmed_evidence_level?:
            | Database["public"]["Enums"]["evidence_level"]
            | null
          confirmed_lat?: number | null
          confirmed_lng?: number | null
          confirmed_location_precision?:
            | Database["public"]["Enums"]["location_precision"]
            | null
          confirmed_region?: string | null
          country: string
          country_code: string
          created_at?: string
          description?: string | null
          evidence_level: Database["public"]["Enums"]["evidence_level"]
          game_id?: string | null
          game_name: string
          id?: never
          image_rights_confirmed?: boolean | null
          lat?: number | null
          lng?: number | null
          location_precision: Database["public"]["Enums"]["location_precision"]
          map_id?: string | null
          map_name: string
          map_place_id?: string | null
          place_photo_path?: string | null
          place_photo_thumb_path?: string | null
          region?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          screenshot_thumb_path?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
          wiki_url?: string | null
        }
        Update: {
          admin1_code?: string | null
          code?: string | null
          confirmed_admin1_code?: string | null
          confirmed_country_code?: string | null
          confirmed_era?: Database["public"]["Enums"]["era"] | null
          confirmed_evidence_level?:
            | Database["public"]["Enums"]["evidence_level"]
            | null
          confirmed_lat?: number | null
          confirmed_lng?: number | null
          confirmed_location_precision?:
            | Database["public"]["Enums"]["location_precision"]
            | null
          confirmed_region?: string | null
          country?: string
          country_code?: string
          created_at?: string
          description?: string | null
          evidence_level?: Database["public"]["Enums"]["evidence_level"]
          game_id?: string | null
          game_name?: string
          id?: never
          image_rights_confirmed?: boolean | null
          lat?: number | null
          lng?: number | null
          location_precision?: Database["public"]["Enums"]["location_precision"]
          map_id?: string | null
          map_name?: string
          map_place_id?: string | null
          place_photo_path?: string | null
          place_photo_thumb_path?: string | null
          region?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_path?: string | null
          screenshot_thumb_path?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          user_id?: string
          wiki_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_map_place_id_fkey"
            columns: ["map_place_id"]
            isOneToOne: false
            referencedRelation: "map_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_user_id_fkey"
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
      admin_link_map_place: {
        Args: {
          p_evidence: Database["public"]["Enums"]["evidence_level"]
          p_map_id: string
          p_note: string
          p_place_id: string
          p_screenshot_credit: string
          p_screenshot_path: string
          p_screenshot_thumb_path: string
          p_source_url: string
          p_submission_id: number
        }
        Returns: string
      }
      admin_register: {
        Args: {
          p_admin1_code: string
          p_commons_author?: string
          p_commons_file?: string
          p_commons_license?: string
          p_country: string
          p_country_code: string
          p_era: Database["public"]["Enums"]["era"]
          p_evidence: Database["public"]["Enums"]["evidence_level"]
          p_game_id: string
          p_game_name: string
          p_lat: number
          p_lng: number
          p_map_id: string
          p_map_name: string
          p_note: string
          p_place_id: string
          p_place_name: string
          p_place_photo_path?: string
          p_place_photo_thumb_path?: string
          p_region: string
          p_screenshot_path?: string
          p_screenshot_thumb_path?: string
          p_source_url: string
          p_wiki_url: string
        }
        Returns: string
      }
      admin_resolve_map: {
        Args: {
          p_era: Database["public"]["Enums"]["era"]
          p_game_id: string
          p_game_name: string
          p_map_id: string
          p_map_name: string
          p_wiki_url: string
        }
        Returns: string
      }
      admin_resolve_place: {
        Args: {
          p_admin1_code: string
          p_country: string
          p_country_code: string
          p_lat: number
          p_lng: number
          p_name: string
          p_place_id: string
          p_region: string
        }
        Returns: string
      }
      admin_set_place_photo: {
        Args: {
          p_commons_author: string
          p_commons_file: string
          p_commons_license: string
          p_photo_credit: string
          p_photo_path: string
          p_photo_thumb_path: string
          p_place_id: string
        }
        Returns: undefined
      }
      anonymize_user_credits: { Args: { p_user: string }; Returns: number }
      apply_edit_suggestion: {
        Args: {
          p_admin1_code?: string
          p_country?: string
          p_country_code?: string
          p_evidence?: Database["public"]["Enums"]["evidence_level"]
          p_lat?: number
          p_lng?: number
          p_region?: string
          p_source_url?: string
          p_suggestion_id: number
          p_wiki_url?: string
        }
        Returns: undefined
      }
      approve_submission: {
        Args: {
          p_admin1_code: string
          p_country: string
          p_country_code: string
          p_era: Database["public"]["Enums"]["era"]
          p_evidence: Database["public"]["Enums"]["evidence_level"]
          p_lat: number
          p_lng: number
          p_map_id: string
          p_place_id: string
          p_place_name: string
          p_place_photo_path?: string
          p_place_photo_thumb_path?: string
          p_region: string
          p_screenshot_path?: string
          p_screenshot_thumb_path?: string
          p_submission_id: number
        }
        Returns: string
      }
      assert_admin: { Args: never; Returns: undefined }
      clear_rejected_submission_images: {
        Args: { p_submission_ids: number[] }
        Returns: number
      }
      image_cleanup_candidates: {
        Args: { p_orphan_age?: string; p_rejected_age?: string }
        Returns: {
          kind: string
          path: string
          submission_id: number
        }[]
      }
      inquiries_table_id: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      my_account_summary: {
        Args: never
        Returns: {
          is_admin: boolean
          pending: number
          published_images: number
          rejected: number
          suggestions: number
        }[]
      }
      user_credit_targets: {
        Args: { p_user: string }
        Returns: {
          kind: string
          target_id: string
        }[]
      }
    }
    Enums: {
      era: "WWI" | "WWII" | "냉전" | "현대" | "근미래" | "기타"
      evidence_level: "공식" | "커뮤니티 추정" | "기타"
      location_precision: "주·도" | "국가"
      submission_status: "검토 대기" | "승인" | "반려"
      suggestion_field:
        | "위치"
        | "근거 수준"
        | "근거 출처"
        | "팬덤 위키"
        | "기타"
      user_role: "user" | "admin"
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
      era: ["WWI", "WWII", "냉전", "현대", "근미래", "기타"],
      evidence_level: ["공식", "커뮤니티 추정", "기타"],
      location_precision: ["주·도", "국가"],
      submission_status: ["검토 대기", "승인", "반려"],
      suggestion_field: ["위치", "근거 수준", "근거 출처", "팬덤 위키", "기타"],
      user_role: ["user", "admin"],
    },
  },
} as const
