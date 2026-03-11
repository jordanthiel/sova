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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          settings?: Record<string, unknown> | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          settings?: Record<string, unknown> | null;
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
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          birth_date: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          birth_date?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
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
    };
    Views: {};
    Functions: {};
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
