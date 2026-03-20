import { supabase } from '@/lib/supabase';
import { inviteParentToBaby } from '@/utils/babyInvitations';
import type { Caregiver } from '@/types/domain';

async function getFamilyForBaby(babyId: string) {
  const { data, error } = await supabase
    .from('babies')
    .select('family_id')
    .eq('id', babyId)
    .single();

  if (error || !data?.family_id) {
    throw new Error('Family not found for this baby');
  }

  return data.family_id;
}

function rowToCaregiver(row: any, fallbackName = 'Caregiver'): Caregiver {
  try {
    const profile = row?.profiles ?? row;
    const name =
      (profile?.full_name && String(profile.full_name).trim()) ||
      (profile?.email && String(profile.email).trim()) ||
      fallbackName;
    const id = row?.user_id ?? row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name,
      role: row?.role === 'admin' ? 'owner' : 'caregiver',
      permission: row?.role === 'admin' ? 'can_edit' : 'can_log',
    };
  } catch {
    const id = row?.user_id ?? row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name: fallbackName,
      role: row?.role === 'admin' ? 'owner' : 'caregiver',
      permission: row?.role === 'admin' ? 'can_edit' : 'can_log',
    };
  }
}

export const caregiversRepo = {
  async list(babyId: string): Promise<Caregiver[]> {
    const familyId = await getFamilyForBaby(babyId);

    let rows: any[] | null = null;
    let error: { message: string } | null = null;

    const { data: members, error: err1 } = await supabase
      .from('family_members')
      .select('id, user_id, role, status')
      .eq('family_id', familyId)
      .eq('status', 'accepted');

    if (!err1 && members) {
      const userIds = members.map((member) => member.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      rows = members.map((member) => ({
        ...member,
        profiles: profileById.get(member.user_id) ?? null,
      }));
    } else if (err1) {
      console.warn('[caregiversRepo] Error loading caregivers:', err1.message);
      error = err1;
    }

    if (error || !rows) {
      return [];
    }

    const list = rows
      .map((row: any) => rowToCaregiver(row, 'Caregiver'))
      .filter(Boolean) as Caregiver[];
    return list;
  },

  async invite(babyId: string, email: string): Promise<void> {
    try {
      await inviteParentToBaby(babyId, email);
    } catch (err: any) {
      if (err?.message === 'User not found with that email') {
        // User doesn't have an account yet — send invite-to-join email
        const { error } = await supabase.functions.invoke('send-caregiver-invite', {
          body: { babyId, inviteeEmail: email, inviteToSignUp: true },
        });
        if (error) {
          throw new Error('Could not send invitation email. Please try again.');
        }
        return;
      }
      throw err;
    }

    const { error } = await supabase.functions.invoke('send-caregiver-invite', {
      body: { babyId, inviteeEmail: email },
    });
    if (error) {
      throw new Error(
        'Invitation was created but the email could not be sent. The person may not receive the invitation.'
      );
    }
  },

  async updatePermission(
    babyId: string,
    caregiverId: string,
    permission: Caregiver['permission']
  ): Promise<void> {
    const familyId = await getFamilyForBaby(babyId);
    const roleMap: Record<string, 'admin' | 'member'> = {
      can_edit: 'admin',
      can_log: 'member',
      view_only: 'member',
    };

    const { error } = await supabase
      .from('family_members')
      .update({ role: roleMap[permission] ?? 'member' })
      .eq('family_id', familyId)
      .eq('user_id', caregiverId);

    if (error) {
      console.warn('[caregiversRepo] Error updating permission:', error.message);
      throw error;
    }
  },

  async remove(babyId: string, caregiverId: string): Promise<void> {
    const familyId = await getFamilyForBaby(babyId);
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('family_id', familyId)
      .eq('user_id', caregiverId);

    if (error) {
      console.warn('[caregiversRepo] Error removing caregiver:', error.message);
      throw error;
    }
  },
};
