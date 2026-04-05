import { supabase } from '@/lib/supabase';
import { inviteEmailToFamily, inviteParentToBaby } from '@/utils/babyInvitations';
import type { Caregiver } from '@/types/domain';

async function getFamilyForBaby(babyId: string) {
  const { data, error } = await supabase
    .from('babies')
    .select('family_id')
    .eq('id', babyId)
    .maybeSingle();

  if (error || !data?.family_id) {
    return null;
  }

  return data.family_id;
}

function rowToCaregiver(row: any, fallbackName = 'Caregiver'): Caregiver {
  try {
    const profile = row?.profiles ?? row;
    const email =
      (profile?.email && String(profile.email).trim()) ||
      (row?.email && String(row.email).trim()) ||
      null;
    const name =
      (profile?.full_name && String(profile.full_name).trim()) ||
      email ||
      fallbackName;
    const id = row?.user_id ?? row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name,
      role: row?.role === 'admin' ? 'owner' : 'caregiver',
      permission: row?.role === 'admin' ? 'can_edit' : 'can_log',
      email,
      status: row?.status === 'pending' ? 'pending' : 'accepted',
      inviteSource: row?.inviteSource ?? 'family_member',
    };
  } catch {
    const id = row?.user_id ?? row?.parent_id ?? row?.id;
    if (!id) return null as unknown as Caregiver;
    return {
      id,
      name: fallbackName,
      role: row?.role === 'admin' ? 'owner' : 'caregiver',
      permission: row?.role === 'admin' ? 'can_edit' : 'can_log',
      email: null,
      status: row?.status === 'pending' ? 'pending' : 'accepted',
      inviteSource: row?.inviteSource ?? 'family_member',
    };
  }
}

export const caregiversRepo = {
  async list(babyId: string): Promise<Caregiver[]> {
    const familyId = await getFamilyForBaby(babyId);
    if (!familyId) return [];

    let rows: any[] | null = null;
    let error: { message: string } | null = null;

    const { data: members, error: err1 } = await supabase
      .from('family_members')
      .select('id, user_id, role, status')
      .eq('family_id', familyId)
      .in('status', ['accepted', 'pending']);

    if (!err1 && members) {
      const userIds = members.map((member) => member.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const memberRows = members.map((member) => ({
        ...member,
        profiles: profileById.get(member.user_id) ?? null,
        inviteSource: 'family_member' as const,
      }));

      const { data: pendingInvitations, error: invitationError } = await supabase
        .from('family_invitations')
        .select('id, email')
        .eq('family_id', familyId);

      if (invitationError) {
        console.warn('[caregiversRepo] Error loading family invitations:', invitationError.message);
      }

      const existingEmails = new Set(
        memberRows
          .map((member) => member.profiles?.email?.trim().toLowerCase())
          .filter(Boolean)
      );

      const invitationRows = (pendingInvitations || [])
        .filter((invitation) => !existingEmails.has(invitation.email.trim().toLowerCase()))
        .map((invitation) => ({
          id: invitation.id,
          role: 'member',
          status: 'pending',
          email: invitation.email,
          inviteSource: 'family_invitation' as const,
        }));

      rows = [...memberRows, ...invitationRows];
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

    return list.sort((a, b) => {
      if ((a.status ?? 'accepted') !== (b.status ?? 'accepted')) {
        return (a.status ?? 'accepted') === 'accepted' ? -1 : 1;
      }
      if (a.role !== b.role) {
        return a.role === 'owner' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  },

  async invite(babyId: string, email: string): Promise<void> {
    let emailSendError: string | null = null;
    let emailSendAttempted = false;

    try {
      await inviteParentToBaby(babyId, email);
    } catch (err: any) {
      if (err?.message === 'User not found with that email') {
        await inviteEmailToFamily(babyId, email);
        const { error } = await supabase.functions.invoke('send-caregiver-invite', {
          body: { babyId, inviteeEmail: email, inviteToSignUp: true },
        });
        emailSendAttempted = true;
        if (error) {
          emailSendError = error.message || 'Could not send invitation email.';
        }
      } else {
        throw err;
      }
    }

    if (!emailSendAttempted) {
      const { error } = await supabase.functions.invoke('send-caregiver-invite', {
        body: { babyId, inviteeEmail: email },
      });
      if (error) {
        emailSendError = error.message || 'The invitation email could not be sent.';
      }
    }

    if (emailSendError) {
      console.warn('[caregiversRepo] Invite created, but email failed:', emailSendError);
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

  async remove(babyId: string, caregiver: Caregiver): Promise<void> {
    const familyId = await getFamilyForBaby(babyId);
    if (!familyId) return;
    const { error } = caregiver.inviteSource === 'family_invitation'
      ? await supabase
          .from('family_invitations')
          .delete()
          .eq('family_id', familyId)
          .eq('id', caregiver.id)
      : await supabase
          .from('family_members')
          .delete()
          .eq('family_id', familyId)
          .eq('user_id', caregiver.id);

    if (error) {
      console.warn('[caregiversRepo] Error removing caregiver/invite:', error.message);
      throw error;
    }
  },
};
