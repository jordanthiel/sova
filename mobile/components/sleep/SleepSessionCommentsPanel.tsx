import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DarkPanel } from '@/components/ui/DarkPanel';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useSleepSessionComments } from '@/hooks/useSleepSessionComments';
import { useThemeColors } from '@/hooks/use-theme-color';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface SleepSessionCommentsPanelProps {
  sessionId: string;
}

export function SleepSessionCommentsPanel({ sessionId }: SleepSessionCommentsPanelProps) {
  const colors = useThemeColors();
  const { comments, loading, addComment } = useSleepSessionComments(sessionId);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  const authorIds = useMemo(
    () => [...new Set(comments.map((comment) => comment.authorId).filter(Boolean))],
    [comments]
  );
  const authorKey = authorIds.join(',');

  useEffect(() => {
    const ids = authorKey ? authorKey.split(',') : [];
    if (ids.length === 0) {
      setAuthorNames({});
      return;
    }

    supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
      .then(({ data }) => {
        const next: Record<string, string> = {};
        for (const profile of data ?? []) {
          next[profile.id] = profile.full_name?.trim() || profile.email?.trim() || 'Sova user';
        }
        setAuthorNames(next);
      });
  }, [authorKey]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await addComment(text);
      setBody('');
    } catch (err: any) {
      Alert.alert('Could not add comment', err.message ?? 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[Typography.captionMedium, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
        Session comments
      </Text>
      <DarkPanel padding="md" shadow="sm">
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : comments.length === 0 ? (
          <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
            No comments yet. Sleep trainers and family members can leave guidance or follow-up here.
          </Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.commentHeader}>
                <Text style={[Typography.captionMedium, { color: colors.text }]}>
                  {authorNames[comment.authorId] ?? 'Sova user'}
                </Text>
                <Text style={[Typography.small, { color: colors.textTertiary }]}>
                  {format(new Date(comment.createdAt), 'MMM d, h:mm a')}
                </Text>
              </View>
              <Text style={[Typography.body, { color: colors.textSecondary }]}>{comment.body}</Text>
            </View>
          ))
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={body}
            onChangeText={setBody}
            placeholder="Leave a comment on this sleep session..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending || body.trim().length === 0}
            style={[
              styles.sendButton,
              { backgroundColor: body.trim().length > 0 ? colors.accent : colors.border },
            ]}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={[Typography.buttonSmall, { color: colors.background }]}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </DarkPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  commentRow: {
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
  },
  sendButton: {
    minWidth: 64,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
