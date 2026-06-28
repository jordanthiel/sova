import { supabase, type SleepPlanAuthorType, type SleepPlanStatus, type TrainerAssignmentStatus, type TrainerInvitedByRole, type TrainerPermissionMap, type TrainerType } from '../lib/supabase'

export type Baby = {
  id: string
  name: string
  birthDate: string
  familyId: string
}

export type SleepTrainer = {
  id: string
  assignmentId: string
  familyId: string
  name: string
  email: string | null
  trainerType: TrainerType
  status: TrainerAssignmentStatus
  invitedByRole: TrainerInvitedByRole
  permissions: TrainerPermissionMap
}

export type TrainerClientFamily = {
  assignmentId: string
  familyId: string
  familyName: string | null
  babies: Baby[]
  status: TrainerAssignmentStatus
  invitedByRole: TrainerInvitedByRole
  permissions: TrainerPermissionMap
}

export type SleepSession = {
  id: string
  babyId: string
  type: 'nap' | 'night'
  startTime: string
  endTime: string | null
  durationMinutes: number | null
  notes: string | null
}

export type SleepSessionComment = {
  id: string
  sleepSessionId: string
  authorId: string
  body: string
  createdAt: string
}

export type TrainerMessage = {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

export type SleepPlanInstruction = {
  title: string
  body: string
}

export type SleepPlan = {
  id: string
  babyId: string
  authorId: string
  authorType: SleepPlanAuthorType
  title: string
  summary: string | null
  instructions: SleepPlanInstruction[]
  status: SleepPlanStatus
  clientVisible: boolean
  createdAt: string
}

export const defaultTrainerPermissions: TrainerPermissionMap = {
  read_logs: true,
  comment: true,
  message: true,
  write_plans: true,
}

function normalizePermissions(value: Record<string, unknown> | null | undefined): TrainerPermissionMap {
  return {
    read_logs: typeof value?.read_logs === 'boolean' ? value.read_logs : true,
    comment: typeof value?.comment === 'boolean' ? value.comment : true,
    message: typeof value?.message === 'boolean' ? value.message : true,
    write_plans: typeof value?.write_plans === 'boolean' ? value.write_plans : true,
  }
}

function normalizeInstructions(value: unknown): SleepPlanInstruction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const body = typeof raw.body === 'string' ? raw.body.trim() : ''
    return title && body ? [{ title, body }] : []
  })
}

function mapBaby(row: { id: string; name: string; birth_date: string; family_id: string }): Baby {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    familyId: row.family_id,
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function listAccessibleBabies(userId: string): Promise<Baby[]> {
  const [{ data: memberships, error: membershipError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from('family_members').select('family_id').eq('user_id', userId).eq('status', 'accepted'),
    supabase.from('trainer_client_assignments').select('family_id').eq('trainer_id', userId).eq('status', 'accepted'),
  ])

  if (membershipError) throw membershipError
  if (assignmentError) throw assignmentError

  const familyIds = [
    ...new Set([
      ...(memberships ?? []).map((row) => row.family_id),
      ...(assignments ?? []).map((row) => row.family_id),
    ]),
  ].filter(Boolean)

  if (familyIds.length === 0) return []

  const { data, error } = await supabase
    .from('babies')
    .select('id, name, birth_date, family_id')
    .in('family_id', familyIds)
    .order('birth_date', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapBaby)
}

export async function isFamilyAdmin(familyId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id')
    .eq('family_id', familyId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .eq('role', 'admin')
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}

export async function listTrainersForFamily(familyId: string): Promise<SleepTrainer[]> {
  const { data: assignments, error } = await supabase
    .from('trainer_client_assignments')
    .select('id, trainer_id, family_id, status, permissions, invited_by_role')
    .eq('family_id', familyId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: true })

  if (error) throw error
  if (!assignments?.length) return []

  const trainerIds = [...new Set(assignments.map((row) => row.trainer_id))]
  const [{ data: profiles }, { data: trainerProfiles }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').in('id', trainerIds),
    supabase.from('trainer_profiles').select('user_id, display_name, trainer_type').in('user_id', trainerIds),
  ])
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const trainerProfileById = new Map((trainerProfiles ?? []).map((profile) => [profile.user_id, profile]))

  return assignments.map((assignment) => {
    const profile = profileById.get(assignment.trainer_id)
    const trainerProfile = trainerProfileById.get(assignment.trainer_id)
    const email = profile?.email?.trim() || null
    const name = trainerProfile?.display_name?.trim() || profile?.full_name?.trim() || email || 'Sleep trainer'

    return {
      id: assignment.trainer_id,
      assignmentId: assignment.id,
      familyId: assignment.family_id,
      name,
      email,
      trainerType: trainerProfile?.trainer_type ?? 'human',
      status: assignment.status,
      invitedByRole: assignment.invited_by_role,
      permissions: normalizePermissions(assignment.permissions),
    }
  })
}

export async function inviteTrainerByEmail(familyId: string, email: string, invitedBy: string): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile?.id) throw new Error('No Sova user was found with that trainer email.')

  const { error } = await supabase.from('trainer_client_assignments').upsert(
    {
      trainer_id: profile.id,
      family_id: familyId,
      status: 'pending',
      permissions: defaultTrainerPermissions,
      invited_by: invitedBy,
      invited_by_role: 'family_admin',
    },
    { onConflict: 'trainer_id,family_id' },
  )
  if (error) throw error
}

export async function requestClientAccess(familyId: string, trainerId: string): Promise<void> {
  const { error: profileError } = await supabase
    .from('trainer_profiles')
    .upsert({ user_id: trainerId }, { onConflict: 'user_id' })

  if (profileError) throw profileError

  const { error } = await supabase.from('trainer_client_assignments').upsert(
    {
      trainer_id: trainerId,
      family_id: familyId.trim(),
      status: 'pending',
      permissions: defaultTrainerPermissions,
      invited_by: trainerId,
      invited_by_role: 'trainer',
    },
    { onConflict: 'trainer_id,family_id' },
  )
  if (error) throw error
}

export async function updateAssignmentStatus(assignmentId: string, status: TrainerAssignmentStatus): Promise<void> {
  const { error } = await supabase.from('trainer_client_assignments').update({ status }).eq('id', assignmentId)
  if (error) throw error
}

export async function removeAssignment(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('trainer_client_assignments').delete().eq('id', assignmentId)
  if (error) throw error
}

export async function listTrainerClientFamilies(trainerId: string): Promise<TrainerClientFamily[]> {
  const { data: assignments, error } = await supabase
    .from('trainer_client_assignments')
    .select('id, family_id, status, permissions, invited_by_role')
    .eq('trainer_id', trainerId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!assignments?.length) return []

  const acceptedFamilyIds = assignments.filter((row) => row.status === 'accepted').map((row) => row.family_id)
  const [{ data: families }, { data: babies }] = await Promise.all([
    acceptedFamilyIds.length
      ? supabase.from('families').select('id, name').in('id', acceptedFamilyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    acceptedFamilyIds.length
      ? supabase.from('babies').select('id, name, birth_date, family_id').in('family_id', acceptedFamilyIds)
      : Promise.resolve({ data: [] as { id: string; name: string; birth_date: string; family_id: string }[] }),
  ])

  const familyNameById = new Map((families ?? []).map((family) => [family.id, family.name]))
  const babiesByFamily = new Map<string, Baby[]>()
  for (const baby of babies ?? []) {
    const rows = babiesByFamily.get(baby.family_id) ?? []
    rows.push(mapBaby(baby))
    babiesByFamily.set(baby.family_id, rows)
  }

  return assignments.map((assignment) => ({
    assignmentId: assignment.id,
    familyId: assignment.family_id,
    familyName: familyNameById.get(assignment.family_id) ?? null,
    babies: babiesByFamily.get(assignment.family_id) ?? [],
    status: assignment.status,
    invitedByRole: assignment.invited_by_role,
    permissions: normalizePermissions(assignment.permissions),
  }))
}

export async function listRecentSleepSessions(babyId: string): Promise<SleepSession[]> {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data, error } = await supabase
    .from('sleep_sessions')
    .select('id, baby_id, type, start_time, end_time, duration_minutes, notes')
    .eq('baby_id', babyId)
    .gte('start_time', since.toISOString())
    .order('start_time', { ascending: false })
    .limit(25)

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    babyId: row.baby_id,
    type: row.type,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    notes: row.notes,
  }))
}

export async function listSessionComments(sessionId: string): Promise<SleepSessionComment[]> {
  const { data, error } = await supabase
    .from('sleep_session_comments')
    .select('id, sleep_session_id, author_id, body, created_at')
    .eq('sleep_session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    sleepSessionId: row.sleep_session_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function addSessionComment(sessionId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('sleep_session_comments')
    .insert({ sleep_session_id: sessionId, author_id: authorId, body: body.trim() })
  if (error) throw error
}

export async function getOrCreateTrainerConversation(baby: Baby, trainerId: string): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('trainer_conversations')
    .select('id')
    .eq('family_id', baby.familyId)
    .eq('baby_id', baby.id)
    .eq('trainer_id', trainerId)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.id) return existing.id

  const { data, error } = await supabase
    .from('trainer_conversations')
    .insert({ family_id: baby.familyId, baby_id: baby.id, trainer_id: trainerId })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function listTrainerMessages(conversationId: string): Promise<TrainerMessage[]> {
  const { data, error } = await supabase
    .from('trainer_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function sendTrainerMessage(conversationId: string, senderId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('trainer_messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })

  if (error) throw error

  await supabase.from('trainer_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
}

export async function listSleepPlans(babyId: string): Promise<SleepPlan[]> {
  const { data, error } = await supabase
    .from('sleep_plans')
    .select('id, baby_id, author_id, author_type, title, summary, instructions, status, client_visible, created_at')
    .eq('baby_id', babyId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    babyId: row.baby_id,
    authorId: row.author_id,
    authorType: row.author_type,
    title: row.title,
    summary: row.summary,
    instructions: normalizeInstructions(row.instructions),
    status: row.status,
    clientVisible: row.client_visible,
    createdAt: row.created_at,
  }))
}

export async function createSleepPlan(input: {
  babyId: string
  authorId: string
  authorType: SleepPlanAuthorType
  title: string
  summary: string
  instructions: SleepPlanInstruction[]
}): Promise<void> {
  const { error } = await supabase.from('sleep_plans').insert({
    baby_id: input.babyId,
    author_id: input.authorId,
    author_type: input.authorType,
    title: input.title.trim(),
    summary: input.summary.trim() || null,
    instructions: input.instructions,
    status: 'active',
    client_visible: true,
  })

  if (error) throw error
}

export async function archiveSleepPlan(planId: string): Promise<void> {
  const { error } = await supabase.from('sleep_plans').update({ status: 'archived' }).eq('id', planId)
  if (error) throw error
}
