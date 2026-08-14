/**
 * Plus — destinations secondaires et actions de compte (P0-5)
 *
 * Recueille ce qui ne mérite pas une place en tab bar : Partages, Équipes,
 * Paramètres, plus les actions de compte.
 *
 * C'est aussi ici que la déconnexion se pose définitivement. Elle existait à
 * trois endroits (barre de navigation permanente, drawer, accueil), ce que
 * l'audit relevait comme un symptôme de hiérarchie mal posée : une action de
 * compte n'a rien à faire dans un chrome de navigation permanent.
 */

import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppRole } from '../../contexts/AppRoleContext';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { supabase } from '../../lib/supabase';
import { SECONDARY_DESTINATIONS } from '../../lib/navigation';
import { Screen, Section, Card, Text, Button, ThemeSwitcher } from '../../components/ui';

export default function PlusScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { isPlayer, player, setAppRole } = useAppRole();
  const { activeTeam, teams } = useActiveTeam();
  const c = theme.colors;

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
    <Screen>
      <Section title="Sections">
        <View style={{ gap: theme.space.sm }}>
          {SECONDARY_DESTINATIONS.map((d) => (
            <Card
              key={d.key}
              variant="raised"
              padding="md"
              onPress={() => router.push(d.route as any)}
              accessibilityLabel={d.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name={d.icon} size={22} color={c.accent.default} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline">{d.label}</Text>
                {d.description ? (
                  <Text variant="caption" tone="tertiary">{d.description}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          ))}
        </View>
      </Section>

      <Section title="Apparence" subtitle="S'applique aussi à l'espace joueur">
        <ThemeSwitcher />
      </Section>

      <Section title="Compte">
        <View style={{ gap: theme.space.sm }}>
          {teams.length > 1 ? (
            <Card
              variant="flat"
              padding="md"
              onPress={() => router.push('/(tabs)/choose-team' as any)}
              accessibilityLabel="Changer d'équipe active"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={c.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Changer d'équipe</Text>
                <Text variant="caption" tone="tertiary">{activeTeam?.name ?? '—'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          ) : null}

          {/* En club amateur, un coach est très souvent aussi joueur — un
              senior qui entraîne les jeunes. L'écran de liaison n'était pourtant
              atteignable que depuis l'accueil d'un compte SANS aucune équipe :
              dès qu'on avait une équipe, on ne pouvait plus lier son propre
              profil, donc plus jamais accéder à son espace joueur. L'entrée est
              ici en permanence, dans les deux états. */}
          {isPlayer ? (
            <Card
              variant="flat"
              padding="md"
              onPress={async () => {
                await setAppRole('player');
                router.replace('/(player-tabs)');
              }}
              accessibilityLabel="Basculer vers l'espace joueur"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name="person-outline" size={20} color={c.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Espace joueur</Text>
                <Text variant="caption" tone="tertiary">
                  {player ? `${player.first_name} ${player.last_name}` : 'Profil lié'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          ) : (
            <Card
              variant="flat"
              padding="md"
              onPress={() => router.push('/join-club' as any)}
              accessibilityLabel="Lier mon profil joueur"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <Ionicons name="person-add-outline" size={20} color={c.text.secondary} />
              <View style={{ flex: 1 }}>
                <Text variant="body">Lier mon profil joueur</Text>
                <Text variant="caption" tone="tertiary">
                  Tu es aussi joueur ? Accède à tes convocations et à ta fiche.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
            </Card>
          )}

          <Button
            label="Déconnexion"
            onPress={handleSignOut}
            variant="secondary"
            icon="log-out-outline"
            block
          />
        </View>
      </Section>

      {/* Accès à la galerie du design system pendant la refonte UI.
          `__DEV__` est faux dans tout build de production. */}
      {__DEV__ ? (
        <Section title="Développement">
          <Button
            label="Design system"
            onPress={() => router.push('/design-gallery' as any)}
            variant="ghost"
            icon="color-palette-outline"
            block
          />
        </Section>
      ) : null}
    </Screen>
  );
}
