import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { trainerConversationsRepo } from '@/services/repositories/trainerConversationsRepo';
import type { TrainerMessage } from '@/types/domain';

export function useTrainerMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<TrainerMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await trainerConversationsRepo.listMessages(conversationId);
      setMessages(rows);
    } catch (err) {
      console.error('[useTrainerMessages] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
    if (!conversationId) return;

    const channel = supabase
      .channel(`trainer_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trainer_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((message) => message.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                conversationId: row.conversation_id,
                senderId: row.sender_id,
                body: row.body,
                createdAt: row.created_at,
              },
            ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!conversationId || !body.trim()) return null;
      const created = await trainerConversationsRepo.sendMessage(conversationId, body);
      setMessages((prev) => (prev.some((message) => message.id === created.id) ? prev : [...prev, created]));
      return created;
    },
    [conversationId]
  );

  return { messages, loading, sendMessage, refetch: fetchMessages };
}
