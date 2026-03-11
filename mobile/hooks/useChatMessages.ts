import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

export function useChatMessages(babyId: string | null, conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const prevConversationIdRef = useRef<string | null>(null);

  const loadMessages = useCallback(async (silent = false) => {
    if (!babyId || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('baby_id', babyId)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw error;
      const list = data || [];
      setMessages((prev) => {
        // Never replace with empty when we already have messages (optimistic or realtime)
        if (list.length === 0 && prev.length > 0) return prev;
        // Merge server list with any messages we already have (e.g. first user message before refetch sees it)
        const byId = new Map(list.map((m) => [m.id, m]));
        for (const m of prev) {
          if (!byId.has(m.id)) byId.set(m.id, m);
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return merged.length > 0 ? merged : list;
      });
    } catch (error) {
      console.error('Error loading messages:', error);
      // Don't clear messages on error so the screen doesn't go blank
    } finally {
      setLoading(false);
    }
  }, [babyId, conversationId]);

  useEffect(() => {
    if (!conversationId) {
      prevConversationIdRef.current = null;
      setMessages([]);
      setLoading(false);
      return;
    }

    // Only clear when switching from one conversation to another (not when opening a newly created one)
    const prevId = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;
    if (prevId != null && prevId !== conversationId) {
      setMessages([]);
    }
    loadMessages();

    const channel = supabase
      .channel(`chat_messages:${babyId}:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          if (newMsg.conversation_id !== conversationId) return;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort((a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [babyId, conversationId, loadMessages]);

  const refetch = (silent = false) => {
    loadMessages(silent);
  };

  const sendMessage = async (
    content: string,
    options: { conversationId: string | null; onCreateConversation?: (id: string) => void }
  ): Promise<{ message: ChatMessage; conversationId: string } | null> => {
    if (!babyId || !content.trim()) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    let convId = options.conversationId;
    if (!convId && options.onCreateConversation) {
      const { data: newConv } = await supabase
        .from('coach_conversations')
        .insert({ baby_id: babyId })
        .select('id')
        .single();
      if (!newConv?.id) return null;
      convId = newConv.id;
      options.onCreateConversation(newConv.id);
    }
    if (!convId) return null;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        baby_id: babyId,
        user_id: user.id,
        conversation_id: convId,
        role: 'user',
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return null;
    }

    // Set conversation title from this user message (truncated) so the list shows a readable label
    const title = content.trim().slice(0, 50) || null;
    await supabase
      .from('coach_conversations')
      .update({ title })
      .eq('id', convId);

    setMessages((prev) => {
      if (prev.some((msg) => msg.id === data.id)) return prev;
      return [...prev, data].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return { message: data, conversationId: convId };
  };

  return { messages, loading, sendMessage, refetch };
}

