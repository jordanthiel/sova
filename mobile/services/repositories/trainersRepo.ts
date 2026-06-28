import { supabase } from '@/lib/supabase';
import type {
  TrainerClientFamily,
  SleepTrainer,
  TrainerPermissionMap,
  TrainerPermission,
} from '@/types/domain';

export const DEFAULT_TRAINER_PERMISSIONS: TrainerPermissionMap = {
  read_logs: true,
  comment: true,
  message: true,
  write_plans: true,
};

type AssignmentRow = {
  id: string;
  trainer_id: string;
  family_id: string;
  status: SleepTrainer['status'];
  permissions: Record<string, unknown> | null;
  invited_by_role: SleepTrainer['invitedByRole'];
};

function normalizePermissions(value: Record<string, unknown> | null | undefined): TrainerPermissionMap {
  const out = { ...DEFAULT_TRAINER_PERMISSIONS };
  (Object.keys(out) as TrainerPermission[]).forEach((permission) => {
    if (typeof value?.[permission] === 'boolean') {
      out[permission] = value[permission] as boolean;
    }
  });
  return out;
}

function rowToTrainer(
  assignment: AssignmentRow,
  profile?: { full_name?: string | null; email?: string | null } | null,
  trainerProfile?: { display_name?: string | null; trainer_type?: 'human' | 'ai_agent'; bio?: string | null } | null
): SleepTrainer {
  const email = profile?.email?.trim() || null;
  const name = trainerProfile?.display_name?.trim() || profile?.full_name?.trim() || email || 'Sleep trainer';
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
    bio: trainerProfile?.bio ?? null,
  };
}

async function getFamilyForBaby(babyId: string): Promise<string> {
  const { data, error } = await supabase
    .from('babies')
    .select('family_id')
    .eq('id', babyId)
    .single();

  if (error || !data?.family_id) {
    throw error ?? new Error('Family not found for this baby');
  }

  return data.family_id;
}

export const trainersRepo = {
  async listForBaby(babyId: string): Promise<SleepTrainer[]> {
    const familyId = await getFamilyForBaby(babyId);
    const { data: assignments, error } = await supabase
      .from('trainer_client_assignments')
      .select('id, trainer_id, family_id, status, permissions, invited_by_role')
      .eq('family_id', familyId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!assignments?.length) return [];

    const trainerIds = [...new Set(assignments.map((row) => row.trainer_id).filter(Boolean))];
    const [{ data: profiles }, { data: trainerProfiles }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', trainerIds),
      supabase.from('trainer_profiles').select('user_id, display_name, trainer_type, bio').in('user_id', trainerIds),
    ]);

    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const trainerProfilesById = new Map((trainerProfiles ?? []).map((profile) => [profile.user_id, profile]));

    return assignments
      .map((assignment) =>
        rowToTrainer(
          assignment as AssignmentRow,
          profilesById.get(assignment.trainer_id),
          trainerProfilesById.get(assignment.trainer_id)
        )
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'accepted' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  },

  async inviteTrainerByEmail(
    babyId: string,
    email: string,
    permissions: TrainerPermissionMap = DEFAULT_TRAINER_PERMISSIONS
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const familyId = await getFamilyForBaby(babyId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (profileError || !profile?.id) {
      throw new Error('Trainer user not found with that email');
    }

    const { error } = await supabase
      .from('trainer_client_assignments')
      .upsert(
        {
          trainer_id: profile.id,
          family_id: familyId,
          status: 'pending',
          permissions,
          invited_by: user.id,
          invited_by_role: 'family_admin',
        },
        { onConflict: 'trainer_id,family_id' }
      );

    if (error) throw error;
  },

  async listClientFamilies(): Promise<TrainerClientFamily[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: assignments, error } = await supabase
      .from('trainer_client_assignments')
      .select('id, family_id, status, permissions, invited_by_role')
      .eq('trainer_id', user.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!assignments?.length) return [];

    const acceptedFamilyIds = assignments
      .filter((assignment) => assignment.status === 'accepted')
      .map((assignment) => assignment.family_id);

    const [{ data: families }, { data: babies }] = await Promise.all([
      acceptedFamilyIds.length > 0
        ? supabase.from('families').select('id, name').in('id', acceptedFamilyIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      acceptedFamilyIds.length > 0
        ? supabase.from('babies').select('id, family_id, name').in('family_id', acceptedFamilyIds)
        : Promise.resolve({ data: [] as { id: string; family_id: string; name: string }[] }),
    ]);

    const familyNameById = new Map((families ?? []).map((family) => [family.id, family.name]));
    const babiesByFamily = new Map<string, { id: string; name: string }[]>();
    for (const baby of babies ?? []) {
      const list = babiesByFamily.get(baby.family_id) ?? [];
      list.push({ id: baby.id, name: baby.name });
      babiesByFamily.set(baby.family_id, list);
    }

    return assignments.map((assignment) => ({
      assignmentId: assignment.id,
      familyId: assignment.family_id,
      familyName: familyNameById.get(assignment.family_id) ?? null,
      babies: babiesByFamily.get(assignment.family_id) ?? [],
      babyNames: (babiesByFamily.get(assignment.family_id) ?? []).map((baby) => baby.name),
      status: assignment.status,
      invitedByRole: assignment.invited_by_role,
      permissions: normalizePermissions(assignment.permissions),
    }));
  },

  async requestClientAccess(
    familyAccessCode: string,
    permissions: TrainerPermissionMap = DEFAULT_TRAINER_PERMISSIONS
  ): Promise<void> {
    const familyId = familyAccessCode.trim();
    if (!familyId) throw new Error('Enter a family access code');

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    await supabase
      .from('trainer_profiles')
      .upsert({ user_id: user.id }, { onConflict: 'user_id' });

    const { error } = await supabase
      .from('trainer_client_assignments')
      .upsert(
        {
          trainer_id: user.id,
          family_id: familyId,
          status: 'pending',
          permissions,
          invited_by: user.id,
          invited_by_role: 'trainer',
        },
        { onConflict: 'trainer_id,family_id' }
      );

    if (error) throw error;
  },

  async approveAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('trainer_client_assignments')
      .update({ status: 'accepted' })
      .eq('id', assignmentId);

    if (error) throw error;
  },

  async rejectAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('trainer_client_assignments')
      .update({ status: 'declined' })
      .eq('id', assignmentId);

    if (error) throw error;
  },

  async acceptAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('trainer_client_assignments')
      .update({ status: 'accepted' })
      .eq('id', assignmentId);

    if (error) throw error;
  },

  async declineAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('trainer_client_assignments')
      .update({ status: 'declined' })
      .eq('id', assignmentId);

    if (error) throw error;
  },

  async removeAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('trainer_client_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;
  },
};
