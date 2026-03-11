import { supabase } from '@/lib/supabase';
import { inviteParentToBaby } from '@/utils/babyInvitations';
import type { Caregiver } from '@/types/domain';

function rowToCaregiver(row: any, fallbackName = 'Caregiver'): Caregiver {
  try {
    const profile = row?.profiles ?? row;
    const name =
      (profile?.full_name && String(profile.full_name).trim()) ||
      (profile?.email && String(profile.email).trim()) ||
      fallbackName;
    const id = row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name,
      role: row?.role === 'owner' ? 'owner' : 'caregiver',
      permission: row?.role === 'owner' ? 'can_edit' : 'can_log',
    };
  } catch {
    const id = row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name: fallbackName,
      role: row?.role === 'owner' ? 'owner' : 'caregiver',
      permission: row?.role === 'owner' ? 'can_edit' : 'can_log',
    };
  }
}

export const caregiversRepo = {
  async list(babyId: string): Promise<Caregiver[]> {
    const { data: baby, error: babyError } = await supabase
      .from('babies')
      .select('created_by')
      .eq('id', babyId)
      .single();

    if (babyError) {
      console.warn('[caregiversRepo] Error loading baby owner:', babyError.message);
    }
    const ownerId = baby?.created_by;

    let rows: any[] | null = null;
    let error: { message: string } | null = null;

    const { data: withProfiles, error: err1 } = await supabase
      .from('baby_parents')
      .select('id, parent_id, role, status, profiles(full_name, email)')
      .eq('baby_id', babyId)
      .eq('status', 'accepted');

    if (!err1 && withProfiles) {
      rows = withProfiles;
    } else {
      if (err1) {
        console.warn('[caregiversRepo] Error loading caregivers (with profiles):', err1.message);
      }
      const { data: withoutProfiles, error: err2 } = await supabase
        .from('baby_parents')
        .select('id, parent_id, role, status')
        .eq('baby_id', babyId)
        .eq('status', 'accepted');
      if (!err2 && withoutProfiles) {
        rows = withoutProfiles;
      } else if (err2) {
        console.warn('[caregiversRepo] Error loading caregivers (without profiles):', err2.message);
        error = err2;
      }
    }

    if (error || !rows) {
      return [];
    }

    const list = rows
      .map((row: any) => rowToCaregiver(row, 'Caregiver'))
      .filter(Boolean) as Caregiver[];
    if (ownerId && !list.some((c) => c.id === ownerId)) {
      // Owner not in baby_parents (e.g. legacy data); add them
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', ownerId)
        .single();
      list.unshift({
        id: ownerId,
        name: (profile as any)?.full_name || (profile as any)?.email || 'You',
        role: 'owner',
        permission: 'can_edit',
      });
    }
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
    const roleMap: Record<string, 'owner' | 'member'> = {
      can_edit: 'owner',
      can_log: 'member',
      view_only: 'member',
    };

    const { error } = await supabase
      .from('baby_parents')
      .update({ role: roleMap[permission] ?? 'member' })
      .eq('baby_id', babyId)
      .eq('parent_id', caregiverId);

    if (error) {
      console.warn('[caregiversRepo] Error updating permission:', error.message);
      throw error;
    }
  },

  async remove(babyId: string, caregiverId: string): Promise<void> {
    const { error } = await supabase
      .from('baby_parents')
      .delete()
      .eq('baby_id', babyId)
      .eq('parent_id', caregiverId);

    if (error) {
      console.warn('[caregiversRepo] Error removing caregiver:', error.message);
      throw error;
    }
  },
};
