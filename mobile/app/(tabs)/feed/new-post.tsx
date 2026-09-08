import { useEffect, useState } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { createTeamPost } from '../../../lib/services/teamFeed';
import { getPlayersByTeam } from '../../../lib/services/players';
import { haptics } from '../../../lib/design/haptics';
import { Card, Button, Input, Text } from '../../../components/ui';
import type { Player } from '../../../types';

export default function NewPostScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId } = useActiveTeam();

  const [content, setContent] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTeamId) return;
    getPlayersByTeam(activeTeamId).then(setPlayers).catch(() => setPlayers([]));
  }, [activeTeamId]);

  const toggleTag = (playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const submit = async () => {
    if (!activeTeamId) return;
    const trimmed = content.trim();
    if (!trimmed) { setError('Écris un message avant de publier.'); return; }

    setSaving(true);
    setError(null);
    const r = await createTeamPost(activeTeamId, trimmed, Array.from(selected));
    setSaving(false);

    if (r.success) {
      haptics.success();
      router.back();
    } else {
      haptics.error();
      setError(r.error ?? 'Impossible de publier ce post');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: theme.space.xl }} keyboardShouldPersistTaps="handled">
        <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
          <Input
            label="Message"
            value={content}
            onChangeText={(v) => { setContent(v); if (error) setError(null); }}
            error={error || undefined}
            placeholder="Écris ton annonce pour l'équipe…"
            multiline
            numberOfLines={6}
            inputStyle={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
          />
        </Card>

        <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
          <Text variant="callout" tone="secondary" weight="600">
            Taguer des joueurs {selected.size > 0 ? `(${selected.size})` : ''}
          </Text>
          {players.length === 0 ? (
            <Text variant="callout" tone="tertiary">Aucun joueur dans cette équipe.</Text>
          ) : (
            <View style={{ gap: theme.space.sm }}>
              {players.map((p) => {
                const active = selected.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => toggleTag(p.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${p.first_name} ${p.last_name}`}
                  >
                    <Card
                      variant={active ? 'accent' : 'flat'}
                      padding="md"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
                    >
                      <Text variant="body" tone={active ? 'accent' : 'primary'} style={{ flex: 1 }}>
                        {p.first_name} {p.last_name}
                      </Text>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={c.accent.default} /> : null}
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        <Button label={saving ? 'Publication…' : 'Publier'} onPress={submit} loading={saving} disabled={saving} size="lg" block />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
