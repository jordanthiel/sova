import { supabase } from '@/lib/supabase';

export async function inviteParentToBaby(babyId: string, parentEmail: string) {
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
    .from('baby_parents')
    .select('id')
    .eq('baby_id', babyId)
    .eq('parent_id', profiles.id)
    .single();

  if (existing) {
    throw new Error('Parent already invited or added');
  }

  // Create invitation
  const { data, error } = await supabase
    .from('baby_parents')
    .insert({
      baby_id: babyId,
      parent_id: profiles.id,
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
    .from('baby_parents')
    .update({ status: 'accepted' })
    .eq('id', invitationId)
    .eq('parent_id', user.id)
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
    .from('baby_parents')
    .update({ status: 'declined' })
    .eq('id', invitationId)
    .eq('parent_id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export type PendingInvitation = {
  id: string;
  baby_id: string;
  baby_name: string | null;
  inviter_name: string | null;
};

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('baby_parents')
    .select(`
      id,
      baby_id,
      invited_by,
      babies (
        name
      )
    `)
    .eq('parent_id', user.id)
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
    const babies = row.babies as { name?: string } | null;
    return {
      id: row.id,
      baby_id: row.baby_id,
      baby_name: babies?.name ?? null,
      inviter_name: row.invited_by ? inviterByName.get(row.invited_by) ?? null : null,
    };
  });
}

