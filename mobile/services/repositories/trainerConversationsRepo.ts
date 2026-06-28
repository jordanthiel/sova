import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';
import type { TrainerConversation, TrainerMessage } from '@/types/domain';

type ConversationRow = Database['public']['Tables']['trainer_conversations']['Row'];
type MessageRow = Database['public']['Tables']['trainer_messages']['Row'];

function mapConversation(row: ConversationRow): TrainerConversation {
  return {
    id: row.id,
    familyId: row.family_id,
    babyId: row.baby_id,
    trainerId: row.trainer_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): TrainerMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
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

export const trainerConversationsRepo = {
  async listForBaby(babyId: string): Promise<TrainerConversation[]> {
    const { data, error } = await supabase
      .from('trainer_conversations')
      .select('*')
      .eq('baby_id', babyId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapConversation);
  },

  async getOrCreateForBaby(babyId: string, trainerId: string): Promise<TrainerConversation> {
    const familyId = await getFamilyForBaby(babyId);
    const { data: existing, error: existingError } = await supabase
      .from('trainer_conversations')
      .select('*')
      .eq('family_id', familyId)
      .eq('baby_id', babyId)
      .eq('trainer_id', trainerId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return mapConversation(existing);

    const { data, error } = await supabase
      .from('trainer_conversations')
      .insert({
        family_id: familyId,
        baby_id: babyId,
        trainer_id: trainerId,
      })
      .select()
      .single();

    if (error) throw error;
    return mapConversation(data);
  },

  async listMessages(conversationId: string): Promise<TrainerMessage[]> {
    const { data, error } = await supabase
      .from('trainer_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) throw error;
    return (data ?? []).map(mapMessage);
  },

  async sendMessage(conversationId: string, body: string): Promise<TrainerMessage> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('trainer_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: body.trim(),
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('trainer_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return mapMessage(data);
  },
};
