import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Database types (will be generated from Supabase)
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          settings: Record<string, unknown> | null;
          timezone: string | null;
          expo_push_token: string | null;
          expo_push_token_updated_at: string | null;
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider: 'revenuecat' | 'apple' | null;
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
          subscription_updated_at: string | null;
          revenuecat_app_user_id: string | null;
          revenuecat_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          settings?: Record<string, unknown> | null;
          timezone?: string | null;
          expo_push_token?: string | null;
          expo_push_token_updated_at?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          subscription_status?: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider?: 'revenuecat' | 'apple' | null;
          subscription_product_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_updated_at?: string | null;
          revenuecat_app_user_id?: string | null;
          revenuecat_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          settings?: Record<string, unknown> | null;
          timezone?: string | null;
          expo_push_token?: string | null;
          expo_push_token_updated_at?: string | null;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          subscription_status?: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider?: 'revenuecat' | 'apple' | null;
          subscription_product_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_updated_at?: string | null;
          revenuecat_app_user_id?: string | null;
          revenuecat_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      babies: {
        Row: {
          id: string;
          name: string;
          birth_date: string;
          family_id: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          birth_date: string;
          family_id: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          birth_date?: string;
          family_id?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      families: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider: 'revenuecat' | 'apple' | null;
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
          subscription_updated_at: string | null;
          revenuecat_app_user_id: string | null;
          revenuecat_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by: string;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          subscription_status?: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider?: 'revenuecat' | 'apple' | null;
          subscription_product_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_updated_at?: string | null;
          revenuecat_app_user_id?: string | null;
          revenuecat_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string;
          trial_started_at?: string | null;
          trial_ends_at?: string | null;
          subscription_status?: 'inactive' | 'active' | 'canceled' | 'past_due' | 'expired';
          subscription_provider?: 'revenuecat' | 'apple' | null;
          subscription_product_id?: string | null;
          subscription_expires_at?: string | null;
          subscription_updated_at?: string | null;
          revenuecat_app_user_id?: string | null;
          revenuecat_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          id: string;
          family_id: string;
          user_id: string;
          role: 'admin' | 'member';
          status: 'pending' | 'accepted' | 'declined';
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          user_id: string;
          role?: 'admin' | 'member';
          status?: 'pending' | 'accepted' | 'declined';
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          user_id?: string;
          role?: 'admin' | 'member';
          status?: 'pending' | 'accepted' | 'declined';
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_invitations: {
        Row: {
          id: string;
          family_id: string;
          email: string;
          invited_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          email: string;
          invited_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          email?: string;
          invited_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      baby_parents: {
        Row: {
          id: string;
          baby_id: string;
          parent_id: string;
          role: 'owner' | 'member';
          status: 'pending' | 'accepted' | 'declined';
          invited_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          parent_id: string;
          role?: 'owner' | 'member';
          status?: 'pending' | 'accepted' | 'declined';
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          parent_id?: string;
          role?: 'owner' | 'member';
          status?: 'pending' | 'accepted' | 'declined';
          invited_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sleep_sessions: {
        Row: {
          id: string;
          baby_id: string;
          logged_by: string;
          type: 'nap' | 'night';
          start_time: string;
          end_time: string | null;
          duration_minutes: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          logged_by: string;
          type: 'nap' | 'night';
          start_time: string;
          end_time?: string | null;
          duration_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          logged_by?: string;
          type?: 'nap' | 'night';
          start_time?: string;
          end_time?: string | null;
          duration_minutes?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      night_sleep_scores: {
        Row: {
          id: string;
          baby_id: string;
          date_key: string;
          score: number;
          total_sleep_minutes: number;
          wakeup_count: number;
          total_awake_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          date_key: string;
          score: number;
          total_sleep_minutes: number;
          wakeup_count: number;
          total_awake_minutes: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          date_key?: string;
          score?: number;
          total_sleep_minutes?: number;
          wakeup_count?: number;
          total_awake_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      recommendations: {
        Row: {
          id: string;
          baby_id: string;
          requested_by: string;
          recommendation_text: string;
          context_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          requested_by: string;
          recommendation_text: string;
          context_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          requested_by?: string;
          recommendation_text?: string;
          context_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      coach_conversations: {
        Row: {
          id: string;
          baby_id: string;
          created_at: string;
          title: string | null;
        };
        Insert: {
          id?: string;
          baby_id: string;
          created_at?: string;
          title?: string | null;
        };
        Update: {
          id?: string;
          baby_id?: string;
          created_at?: string;
          title?: string | null;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          baby_id: string;
          user_id: string;
          conversation_id: string | null;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          user_id: string;
          conversation_id?: string | null;
          role: 'user' | 'assistant';
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          user_id?: string;
          conversation_id?: string | null;
          role?: 'user' | 'assistant';
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      coach_memories: {
        Row: {
          id: string;
          baby_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      stored_nap_targets: {
        Row: {
          id: string;
          baby_id: string;
          recommendation_type: 'next_nap' | 'bedtime';
          start_window_begin: string;
          start_window_end: string;
          recommended_cap_minutes: number;
          expected_bedtime: string;
          recommended_wake_window_minutes: number | null;
          session_data_key: string | null;
          rest_of_day_schedule: unknown;
          explanation: string | null;
          reasoning: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          recommendation_type: 'next_nap' | 'bedtime';
          start_window_begin: string;
          start_window_end: string;
          recommended_cap_minutes: number;
          expected_bedtime: string;
          recommended_wake_window_minutes?: number | null;
          session_data_key?: string | null;
          rest_of_day_schedule?: unknown;
          explanation?: string | null;
          reasoning?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          recommendation_type?: 'next_nap' | 'bedtime';
          start_window_begin?: string;
          start_window_end?: string;
          recommended_cap_minutes?: number;
          expected_bedtime?: string;
          recommended_wake_window_minutes?: number | null;
          session_data_key?: string | null;
          rest_of_day_schedule?: unknown;
          explanation?: string | null;
          reasoning?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      sleep_import_codes: {
        Row: {
          code: string;
          user_id: string;
          baby_id: string;
          created_at: string;
        };
        Insert: {
          code: string;
          user_id: string;
          baby_id: string;
          created_at?: string;
        };
        Update: {
          code?: string;
          user_id?: string;
          baby_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      trainer_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          trainer_type: 'human' | 'ai_agent';
          bio: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          trainer_type?: 'human' | 'ai_agent';
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          trainer_type?: 'human' | 'ai_agent';
          bio?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trainer_client_assignments: {
        Row: {
          id: string;
          trainer_id: string;
          family_id: string;
          status: 'pending' | 'accepted' | 'declined' | 'revoked';
          permissions: Record<string, unknown>;
          invited_by: string | null;
          invited_by_role: 'family_admin' | 'trainer';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          family_id: string;
          status?: 'pending' | 'accepted' | 'declined' | 'revoked';
          permissions?: Record<string, unknown>;
          invited_by?: string | null;
          invited_by_role?: 'family_admin' | 'trainer';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trainer_id?: string;
          family_id?: string;
          status?: 'pending' | 'accepted' | 'declined' | 'revoked';
          permissions?: Record<string, unknown>;
          invited_by?: string | null;
          invited_by_role?: 'family_admin' | 'trainer';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sleep_session_comments: {
        Row: {
          id: string;
          sleep_session_id: string;
          baby_id: string;
          author_id: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sleep_session_id: string;
          baby_id?: string;
          author_id: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sleep_session_id?: string;
          baby_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trainer_conversations: {
        Row: {
          id: string;
          family_id: string;
          baby_id: string | null;
          trainer_id: string;
          status: 'active' | 'archived';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_id: string;
          baby_id?: string | null;
          trainer_id: string;
          status?: 'active' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          family_id?: string;
          baby_id?: string | null;
          trainer_id?: string;
          status?: 'active' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trainer_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sleep_plans: {
        Row: {
          id: string;
          baby_id: string;
          author_id: string;
          author_type: 'trainer' | 'family' | 'ai_agent';
          title: string;
          summary: string | null;
          instructions: unknown;
          starts_on: string | null;
          ends_on: string | null;
          status: 'draft' | 'active' | 'archived';
          client_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          baby_id: string;
          author_id: string;
          author_type?: 'trainer' | 'family' | 'ai_agent';
          title: string;
          summary?: string | null;
          instructions?: unknown;
          starts_on?: string | null;
          ends_on?: string | null;
          status?: 'draft' | 'active' | 'archived';
          client_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          baby_id?: string;
          author_id?: string;
          author_type?: 'trainer' | 'family' | 'ai_agent';
          title?: string;
          summary?: string | null;
          instructions?: unknown;
          starts_on?: string | null;
          ends_on?: string | null;
          status?: 'draft' | 'active' | 'archived';
          client_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      ensure_profile_trial: {
        Args: {
          p_user_id?: string;
        };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      ensure_user_family: {
        Args: {
          p_user_id?: string;
          p_family_name?: string | null;
        };
        Returns: Database['public']['Tables']['families']['Row'];
      };
      ensure_family_trial: {
        Args: {
          p_family_id: string;
        };
        Returns: Database['public']['Tables']['families']['Row'];
      };
      get_user_family_id: {
        Args: {
          p_user_id?: string;
        };
        Returns: string;
      };
      get_entitlement_status: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          has_premium_access: boolean;
          has_subscription_access: boolean;
          is_trial_active: boolean;
          access_source: 'subscription' | 'trial' | 'none';
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: Database['public']['Tables']['profiles']['Row']['subscription_status'];
          subscription_provider: Database['public']['Tables']['profiles']['Row']['subscription_provider'];
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
        }[];
      };
      get_my_entitlement_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          has_premium_access: boolean;
          has_subscription_access: boolean;
          is_trial_active: boolean;
          access_source: 'subscription' | 'trial' | 'none';
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: Database['public']['Tables']['profiles']['Row']['subscription_status'];
          subscription_provider: Database['public']['Tables']['profiles']['Row']['subscription_provider'];
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
        }[];
      };
      get_family_entitlement_status: {
        Args: {
          p_family_id: string;
        };
        Returns: {
          family_id: string;
          has_premium_access: boolean;
          has_subscription_access: boolean;
          is_trial_active: boolean;
          access_source: 'subscription' | 'trial' | 'none';
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: Database['public']['Tables']['families']['Row']['subscription_status'];
          subscription_provider: Database['public']['Tables']['families']['Row']['subscription_provider'];
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
        }[];
      };
      get_my_family_entitlement_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          family_id: string;
          has_premium_access: boolean;
          has_subscription_access: boolean;
          is_trial_active: boolean;
          access_source: 'subscription' | 'trial' | 'none';
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: Database['public']['Tables']['families']['Row']['subscription_status'];
          subscription_provider: Database['public']['Tables']['families']['Row']['subscription_provider'];
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
        }[];
      };
      get_baby_entitlement_status: {
        Args: {
          p_baby_id: string;
        };
        Returns: {
          family_id: string;
          has_premium_access: boolean;
          has_subscription_access: boolean;
          is_trial_active: boolean;
          access_source: 'subscription' | 'trial' | 'none';
          trial_started_at: string | null;
          trial_ends_at: string | null;
          subscription_status: Database['public']['Tables']['families']['Row']['subscription_status'];
          subscription_provider: Database['public']['Tables']['families']['Row']['subscription_provider'];
          subscription_product_id: string | null;
          subscription_expires_at: string | null;
        }[];
      };
      is_family_member: {
        Args: {
          p_family_id: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
      is_family_admin: {
        Args: {
          p_family_id: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
      has_trainer_family_access: {
        Args: {
          p_family_id: string;
          p_user_id?: string;
          p_permission?: string | null;
        };
        Returns: boolean;
      };
      has_trainer_baby_access: {
        Args: {
          p_baby_id: string;
          p_user_id?: string;
          p_permission?: string | null;
        };
        Returns: boolean;
      };
      has_baby_read_access: {
        Args: {
          p_baby_id: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const isLocalDev = !supabaseUrl || !supabaseAnonKey;
const url = supabaseUrl || 'http://127.0.0.1:54421';
const anonKey =
  supabaseAnonKey ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let supabase: ReturnType<typeof createClient<Database>>;

try {
  if (isLocalDev) {
    console.warn(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, using local defaults'
    );
  }

  supabase = createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'supabase.auth.token',
    },
  });
} catch (error) {
  console.error('Failed to initialize Supabase:', error);
  supabase = createClient<Database>('http://127.0.0.1:54421', 'dummy-key', {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'supabase.auth.token',
    },
  });
}

export { supabase };
