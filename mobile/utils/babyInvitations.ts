import { supabase } from '@/lib/supabase';

export async function inviteParentToBaby(babyId: string, parentEmail: string) {
  const { data: baby, error: babyError } = await supabase
    .from('babies')
    .select('family_id')
    .eq('id', babyId)
    .single();

  if (babyError || !baby?.family_id) {
    throw new Error('Family not found for this baby');
  }

  // First, find the user by email
  const { data: profiles, error: userError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', parentEmail.toLowerCase().trim())
    .limit(1)
    .maybeSingle();

  if (userError || !profiles) {
    throw new Error('User not found with that email');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Check if invitation already exists
  const { data: existing } = await supabase
    .from('family_members')
    .select('id')
    .eq('family_id', baby.family_id)
    .eq('user_id', profiles.id)
    .single();

  if (existing) {
    throw new Error('Parent already invited or added');
  }

  // Create invitation
  const { data, error } = await supabase
    .from('family_members')
    .insert({
      family_id: baby.family_id,
      user_id: profiles.id,
      role: 'member',
      status: 'pending',
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptInvitation(invitationId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('family_members')
    .update({ status: 'accepted' })
    .eq('id', invitationId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function declineInvitation(invitationId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('family_members')
    .update({ status: 'declined' })
    .eq('id', invitationId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export type PendingInvitation = {
  id: string;
  family_id: string;
  family_name: string | null;
  inviter_name: string | null;
};

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('family_members')
    .select(`
      id,
      family_id,
      invited_by,
      families (
        name
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return [];

  const invitedByIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))] as string[];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', invitedByIds);

  const inviterByName = new Map(
    (profiles || []).map((p) => [p.id, (p as { full_name?: string | null }).full_name?.trim() || null])
  );

  return rows.map((row) => {
    const families = row.families as { name?: string } | null;
    return {
      id: row.id,
      family_id: row.family_id,
      family_name: families?.name ?? null,
      inviter_name: row.invited_by ? inviterByName.get(row.invited_by) ?? null : null,
    };
  });
}

