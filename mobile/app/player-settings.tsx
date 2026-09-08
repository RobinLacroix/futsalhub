/**
 * Réglages de l'espace joueur.
 *
 * N'existait pas avant cette session : l'espace joueur n'avait aucun écran de
 * réglages, ses actions de compte (déconnexion, bascule coach) vivaient
 * directement dans le header de l'onglet « Ma fiche ». Cet écran les
 * consolide derrière une icône réglages, même format que « Plus » côté coach
 * (`(tabs)/plus.tsx`) : `Section` "Apparence" puis "Compte".
 *
 * Écran poussé, pas un onglet (même famille que `join-club.tsx` /
 * `design-gallery.tsx`) : header natif désactivé globalement
 * (`app/_layout.tsx`), donc back row manuel, comme `CodeEntryScreen`.
 */

import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { useAppRole } from '../contexts/AppRoleContext';
import { supabase } from '../lib/supabase';
import { unlinkPlayerAccount } from '../lib/services/players';
import { Screen, Section, Card, Text, Button, ThemeSwitcher } from '../components/ui';
import { DeleteAccountSheet } from '../components/DeleteAccountSheet';

export default function PlayerSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { player, isCoach, setAppRole, refetch } = useAppRole();
  const c = theme.colors;
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const handleUnlink = () => {
    if (!player) return;
    Alert.alert(
      'Délier mon compte ?',
      "Tu ne recevras plus tes convocations ni tes questionnaires tant qu'un nouveau code n'aura pas été généré par ton coach et saisi.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Délier',
          style: 'destructive',
          onPress: async () => {
            setUnlinking(true);
            const result = await unlinkPlayerAccount(player.id);
            setUnlinking(false);
            if (result.ok) {
              await refetch();
              router.replace('/');
            } else {
              Alert.alert('Erreur', result.error ?? 'Une erreur est survenue.');
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert('Déconnexion', 'Veux-tu te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  return (
    <Screen edgeTop>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingTop: insets.top ? 0 : theme.space.sm,
          paddingBottom: theme.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={({ pressed }) => [{ padding: 4, marginLeft: -4 }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={24} color={c.text.secondary} />
        </Pressable>
        <Text variant="title">Réglages</Text>
      </View>

      <Section title="Apparence">
        <ThemeSwitcher />
      </Section>

      <Section title="Compte">
        <View style={{ gap: theme.space.sm }}>
          {isCoach ? (
            <Card
              variant="flat"
              padding="md"
              onPress={async () => {
                await setAppRole('coach');
                router.replace('/(tabs)');
              }}
              accessibilityLabel="Basculer vers l'espace coach"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={c.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Espace coach</Text>
                <Text variant="caption" tone="tertiary">
                  Basculer vers ton profil coach
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          ) : (
            <Card
              variant="flat"
              padding="md"
              onPress={() => router.push('/join-staff-code')}
              accessibilityLabel="Rejoindre le staff avec un code"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color={c.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Rejoindre le staff</Text>
                <Text variant="caption" tone="tertiary">
                  Lier ce compte à un club avec un code d&apos;invitation
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          )}

          {player ? (
            <Button
              label={unlinking ? 'Déliage…' : 'Délier mon compte'}
              onPress={handleUnlink}
              variant="ghost"
              icon="unlink-outline"
              disabled={unlinking}
              block
            />
          ) : null}

          <Button
            label="Déconnexion"
            onPress={handleSignOut}
            variant="secondary"
            icon="log-out-outline"
            block
          />
          <Button
            label="Supprimer mon compte"
            onPress={() => setDeleteAccountOpen(true)}
            variant="destructive"
            icon="trash-outline"
            block
          />
        </View>
      </Section>

      <DeleteAccountSheet visible={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />
    </Screen>
  );
}
