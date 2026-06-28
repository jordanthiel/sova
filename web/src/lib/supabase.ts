import { createClient } from '@supabase/supabase-js'

export type TrainerAssignmentStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export type TrainerInvitedByRole = 'family_admin' | 'trainer'
export type TrainerType = 'human' | 'ai_agent'
export type SleepPlanStatus = 'draft' | 'active' | 'archived'
export type SleepPlanAuthorType = 'trainer' | 'family' | 'ai_agent'

export type TrainerPermissionMap = {
  read_logs: boolean
  comment: boolean
  message: boolean
  write_plans: boolean
}

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<{
        id: string
        email: string | null
        full_name: string | null
      }>
      babies: TableDef<{
        id: string
        name: string
        birth_date: string
        family_id: string
        created_by: string
      }>
      families: TableDef<{
        id: string
        name: string
        created_by: string
      }>
      family_members: TableDef<{
        id: string
        family_id: string
        user_id: string
        role: 'admin' | 'member'
        status: 'pending' | 'accepted' | 'declined'
      }>
      trainer_profiles: TableDef<
        {
          user_id: string
          display_name: string | null
          trainer_type: TrainerType
          bio: string | null
        },
        {
          user_id: string
          display_name?: string | null
          trainer_type?: TrainerType
          bio?: string | null
        }
      >
      trainer_client_assignments: TableDef<
        {
          id: string
          trainer_id: string
          family_id: string
          status: TrainerAssignmentStatus
          permissions: Record<string, unknown>
          invited_by: string | null
          invited_by_role: TrainerInvitedByRole
          created_at: string
          updated_at: string
        },
        {
          trainer_id: string
          family_id: string
          status?: TrainerAssignmentStatus
          permissions?: Record<string, unknown>
          invited_by?: string | null
          invited_by_role?: TrainerInvitedByRole
        },
        {
          status?: TrainerAssignmentStatus
          permissions?: Record<string, unknown>
        }
      >
      sleep_sessions: TableDef<{
        id: string
        baby_id: string
        logged_by: string
        type: 'nap' | 'night'
        start_time: string
        end_time: string | null
        duration_minutes: number | null
        notes: string | null
        created_at: string
        updated_at: string
      }>
      sleep_session_comments: TableDef<
        {
          id: string
          sleep_session_id: string
          baby_id: string
          author_id: string
          body: string
          created_at: string
          updated_at: string
        },
        {
          sleep_session_id: string
          author_id: string
          body: string
        }
      >
      trainer_conversations: TableDef<
        {
          id: string
          family_id: string
          baby_id: string | null
          trainer_id: string
          status: 'active' | 'archived'
          created_at: string
          updated_at: string
        },
        {
          family_id: string
          baby_id?: string | null
          trainer_id: string
          status?: 'active' | 'archived'
        },
        {
          status?: 'active' | 'archived'
          updated_at?: string
        }
      >
      trainer_messages: TableDef<
        {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          created_at: string
        },
        {
          conversation_id: string
          sender_id: string
          body: string
        }
      >
      sleep_plans: TableDef<
        {
          id: string
          baby_id: string
          author_id: string
          author_type: SleepPlanAuthorType
          title: string
          summary: string | null
          instructions: unknown
          starts_on: string | null
          ends_on: string | null
          status: SleepPlanStatus
          client_visible: boolean
          created_at: string
          updated_at: string
        },
        {
          baby_id: string
          author_id: string
          author_type?: SleepPlanAuthorType
          title: string
          summary?: string | null
          instructions?: unknown
          starts_on?: string | null
          ends_on?: string | null
          status?: SleepPlanStatus
          client_visible?: boolean
        },
        {
          status?: SleepPlanStatus
          title?: string
          summary?: string | null
          instructions?: unknown
          client_visible?: boolean
        }
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient<Database>(
  supabaseUrl || 'http://127.0.0.1:54421',
  supabaseAnonKey || 'missing-anon-key',
)
