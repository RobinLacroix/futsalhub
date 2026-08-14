/**
 * Accueil — briefing du coach (P0-4)
 *
 * Réécriture complète. L'ancien écran affichait une grille de six boutons de
 * navigation, quatre raccourcis et l'email du compte : un menu déguisé en
 * dashboard, sans une seule donnée, sur le premier écran d'un produit vendu sur
 * l'analyse de performance.
 *
 * Ce qu'il montre maintenant, dans l'ordre où un coach en a besoin :
 *   1. la prochaine échéance, avec l'action qui va avec ;
 *   2. la forme de l'équipe ;
 *   3. trois indicateurs de saison ;
 *   4. ce qui demande son attention.
 *
 * La grille de fonctionnalités disparaît : c'est le rôle de la navigation, pas
 * celui de l'accueil (P0-5).
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../contexts/ThemeContext';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../contexts/ActiveSeasonContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useBriefing, relativeDayLabel, type ResultLetter } from '../../hooks/useBriefing';
import { getUserClubId } from '../../lib/services/clubs';
import { haptics } from '../../lib/design/haptics';
import {
  Screen, Section, Card, Button, Text, Stat, Badge, Sheet, EmptyState, SkeletonStats,
} from '../../components/ui';

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeam, activeTeamId, teams, loading: teamsLoading, setActiveTeamId, refetchTeams } =
    useActiveTeam();
  const { activeSeason } = useActiveSeason();
  const { counts, refresh: refreshCounts } = useNotifications();
  const { next, form, loading, error, refresh } = useBriefing(activeTeamId ?? null, activeSeason);

  const [teamSheet, setTeamSheet] = useState(false);
  const [hasNoClub, setHasNoClub] = useState<boolean | null>(null);

  useEffect(() => { void refetchTeams(); }, [refetchTeams]);

  const checkUserClub = useCallback(async () => {
    if (!teamsLoading && teams.length === 0) {
      try { setHasNoClub((await getUserClubId()) === null); }
      catch { setHasNoClub(false); }
    } else { setHasNoClub(false); }
  }, [teamsLoading, teams.length]);

  useEffect(() => { void checkUserClub(); }, [checkUserClub]);

  const onRefresh = useCallback(async () => {
    await Promise.all([refresh(), refreshCounts()]);
  }, [refresh, refreshCounts]);

  // ── Aucune équipe : l'accueil redevient un écran d'onboarding ──────────────

  if (!teamsLoading && teams.length === 0) {
    return (
      <Screen>
        <BrandHeader />
        {hasNoClub ? (
          <Section title="Premiers pas" subtitle="Choisis comment tu rejoins FutsalHub">
            <View style={{ gap: theme.space.md }}>
              <OnboardingRow
                icon="add-circle-outline"
                title="Créer un club"
                description="Tu deviens administrateur et tu invites ton staff."
                onPress={() => router.push('/(tabs)/create-club')}
              />
              <OnboardingRow
                icon="enter-outline"
                title="Rejoindre un club en tant que staff"
                description="Avec le code d'invitation fourni par l'administrateur."
                onPress={() => router.push('/(tabs)/join-club-staff' as any)}
              />
              <OnboardingRow
                icon="person-add-outline"
                title="Lier un profil joueur"
                description="Avec le code fourni par ton coach."
                onPress={() => router.push('/join-club' as any)}
              />
            </View>
          </Section>
        ) : (
          <Section>
            <EmptyState
              icon="flag-outline"
              title="Aucune équipe"
              description="Crée ta première équipe pour commencer à suivre tes séances et tes matchs."
              action={{ label: 'Ajouter une équipe', onPress: () => router.push('/(tabs)/teams') }}
            />
          </Section>
        )}
      </Screen>
    );
  }

  // ── Briefing ───────────────────────────────────────────────────────────────

  const goalsFor = form.played > 0 ? form.goalsFor / form.played : 0;
  const goalsAgainst = form.played > 0 ? form.goalsAgainst / form.played : 0;
  const winRate = form.played > 0 ? Math.round((form.wins / form.played) * 100) : 0;

  const alerts = [
    { key: 'absences', label: 'Absences signalées', count: counts.absence_report, icon: 'person-remove-outline' as const, route: '/(tabs)/calendar' },
    { key: 'injuries', label: 'Blessures et douleurs', count: counts.injury, icon: 'medkit-outline' as const, route: '/(tabs)/calendar' },
    { key: 'quest', label: 'Questionnaires reçus', count: counts.questionnaire_response, icon: 'clipboard-outline' as const, route: '/(tabs)/squad' },
    { key: 'feedback', label: 'Retours joueurs', count: counts.feedback_comment, icon: 'chatbubble-ellipses-outline' as const, route: '/(tabs)/squad' },
  ].filter((a) => a.count > 0);

  return (
    <Screen onRefresh={onRefresh} refreshing={loading}>
      <BrandHeader />

      {/* Équipe active */}
      <Card
        variant="raised"
        padding="md"
        onPress={teams.length > 1 ? () => setTeamSheet(true) : undefined}
        accessibilityLabel={
          teams.length > 1 ? `Équipe active ${activeTeam?.name}. Toucher pour changer` : undefined
        }
        style={{ marginTop: theme.space.lg, flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
      >
        <View
          style={{
            width: 10, height: 10, borderRadius: 5,
            backgroundColor: activeTeam?.color || c.accent.default,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="tertiary">Équipe active</Text>
          <Text variant="headline" numberOfLines={1}>{activeTeam?.name ?? '—'}</Text>
        </View>
        {teams.length > 1 ? (
          <Badge label="Changer" tone="accent" icon="swap-vertical" size="sm" />
        ) : null}
      </Card>

      {error ? (
        <Section>
          <EmptyState
            icon="cloud-offline-outline"
            title="Données indisponibles"
            description={error}
            action={{ label: 'Réessayer', onPress: () => void onRefresh() }}
            tone="negative"
            compact
          />
        </Section>
      ) : null}

      {/* 1. Prochaine échéance */}
      <Section title="Prochaine échéance">
        {loading ? (
          <Card variant="flat" padding="none"><SkeletonStats count={2} columns={2} /></Card>
        ) : next ? (
          <Card variant={next.daysAway <= 1 ? 'accent' : 'raised'} padding="lg" style={{ gap: theme.space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Badge
                label={next.kind === 'match' ? 'Match' : 'Entraînement'}
                tone={next.kind === 'match' ? 'accent' : 'neutral'}
                icon={next.kind === 'match' ? 'football-outline' : 'barbell-outline'}
                size="sm"
              />
              <Text variant="caption" tone="secondary">
                {relativeDayLabel(next.daysAway)}
              </Text>
            </View>

            <View style={{ gap: theme.space.xs }}>
              <Text variant="title" numberOfLines={2}>{next.title}</Text>
              <Text variant="callout" tone="tertiary" numeric>
                {next.date.toLocaleDateString('fr-FR', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
                {' · '}
                {next.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {next.location ? ` · ${next.location}` : ''}
              </Text>
              {next.competition ? (
                <Text variant="caption" tone="tertiary">{next.competition}</Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' }}>
              {next.kind === 'match' && next.daysAway <= 0 ? (
                <Button
                  label="Ouvrir le recorder"
                  onPress={() => router.push('/(tabs)/tracker/record' as any)}
                  icon="radio-button-on"
                />
              ) : null}
              <Button
                label="Voir le détail"
                onPress={() =>
                  router.push(
                    (next.kind === 'match'
                      ? `/(tabs)/calendar/matchDetail/${next.id}`
                      : `/(tabs)/calendar/training/${next.id}`) as any,
                  )
                }
                variant="secondary"
              />
            </View>
          </Card>
        ) : (
          <EmptyState
            icon="calendar-outline"
            title="Rien de programmé"
            description="Planifie ton prochain match ou ta prochaine séance."
            action={{ label: 'Nouveau match', onPress: () => router.push('/(tabs)/calendar/new-match' as any) }}
            secondaryAction={{ label: 'Nouvel entraînement', onPress: () => router.push('/(tabs)/calendar/new' as any) }}
            compact
          />
        )}
      </Section>

      {/* 2. Forme */}
      <Section
        title="Forme"
        subtitle={form.played > 0 ? `${form.played} match${form.played > 1 ? 's' : ''} joué${form.played > 1 ? 's' : ''} cette saison` : undefined}
        action={form.played > 0 ? { label: 'Analytics', onPress: () => router.push('/(tabs)/analytics') } : undefined}
      >
        <Card variant="raised" padding="lg" style={{ gap: theme.space.lg }}>
          {form.results.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              {form.results.map((r, i) => (
                <ResultPill key={i} result={r} />
              ))}
            </View>
          ) : (
            <Text variant="callout" tone="tertiary">Aucun match joué pour l'instant.</Text>
          )}
          <View style={{ flexDirection: 'row', gap: theme.space.lg }}>
            <Stat size="compact" value={String(form.wins)} label="Victoires" style={{ flex: 1 }} />
            <Stat size="compact" value={String(form.draws)} label="Nuls" style={{ flex: 1 }} />
            <Stat size="compact" value={String(form.losses)} label="Défaites" style={{ flex: 1 }} />
          </View>
        </Card>
      </Section>

      {/* 3. Indicateurs de saison */}
      <Section title="Saison">
        {loading ? (
          <Card variant="flat" padding="none"><SkeletonStats count={3} columns={3} /></Card>
        ) : (
          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <Card variant="raised" padding="lg" style={{ flex: 1 }}>
              <Stat value={`${winRate}`} unit="%" label="Victoires" size="compact" />
            </Card>
            <Card variant="raised" padding="lg" style={{ flex: 1 }}>
              <Stat value={goalsFor.toFixed(1)} label="Buts marqués / match" size="compact" />
            </Card>
            <Card variant="raised" padding="lg" style={{ flex: 1 }}>
              <Stat
                value={goalsAgainst.toFixed(1)}
                label="Buts encaissés / match"
                size="compact"
                valueColor={goalsAgainst > 0 && goalsAgainst > goalsFor ? c.negative.default : undefined}
              />
            </Card>
          </View>
        )}
      </Section>

      {/* 4. Attention requise */}
      {alerts.length > 0 ? (
        <Section title="À traiter">
          <View style={{ gap: theme.space.sm }}>
            {alerts.map((a) => (
              <Card
                key={a.key}
                variant="flat"
                padding="md"
                onPress={() => router.push(a.route as any)}
                accessibilityLabel={`${a.count} ${a.label}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
              >
                <Ionicons name={a.icon} size={20} color={c.warning.default} />
                <Text variant="body" style={{ flex: 1 }}>{a.label}</Text>
                <Badge label={String(a.count)} tone="warning" solid size="sm" />
                <Ionicons name="chevron-forward" size={16} color={c.text.tertiary} />
              </Card>
            ))}
          </View>
        </Section>
      ) : null}

      {/* Sélecteur d'équipe */}
      <Sheet
        visible={teamSheet}
        onClose={() => setTeamSheet(false)}
        title="Choisir une équipe"
        subtitle="L'équipe active s'applique à tout le contenu de l'app"
      >
        {teams.map((team) => {
          const isActive = team.id === activeTeamId;
          return (
            <Card
              key={team.id}
              variant={isActive ? 'accent' : 'flat'}
              padding="md"
              onPress={async () => {
                await setActiveTeamId(team.id);
                setTeamSheet(false);
              }}
              accessibilityLabel={`Activer l'équipe ${team.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
            >
              <View
                style={{
                  width: 10, height: 10, borderRadius: 5,
                  backgroundColor: team.color || c.neutralData,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="body" tone={isActive ? 'accent' : 'primary'}>{team.name}</Text>
                {team.category ? (
                  <Text variant="caption" tone="tertiary">{team.category} · {team.level}</Text>
                ) : null}
              </View>
              {isActive ? (
                <Ionicons name="checkmark-circle" size={20} color={c.accent.default} />
              ) : null}
            </Card>
          );
        })}
        <Button
          label="Gérer les équipes"
          onPress={() => { setTeamSheet(false); router.push('/(tabs)/teams' as any); }}
          variant="ghost"
          block
          icon="settings-outline"
        />
      </Sheet>
    </Screen>
  );
}

// ─── Sous-composants locaux ──────────────────────────────────────────────────

function BrandHeader() {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginTop: theme.space.lg }}>
      <View
        style={{
          width: 40, height: 40, borderRadius: theme.radius.md,
          backgroundColor: theme.colors.accent.subtle,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="football" size={22} color={theme.colors.accent.default} />
      </View>
      <View>
        <Text variant="title">FutsalHub</Text>
        <Text variant="caption" tone="tertiary">Analyse et gestion de club</Text>
      </View>
    </View>
  );
}

function ResultPill({ result }: { result: ResultLetter }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const bg =
    result === 'V' ? c.positive.fill : result === 'D' ? c.negative.fill : c.neutralData;
  return (
    <View
      style={{
        width: 32, height: 32, borderRadius: theme.radius.sm,
        backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
      }}
      accessible
      accessibilityLabel={result === 'V' ? 'Victoire' : result === 'D' ? 'Défaite' : 'Match nul'}
    >
      <Text variant="caption" tone="onFill">{result}</Text>
    </View>
  );
}

function OnboardingRow({
  icon, title, description, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Card
      variant="raised"
      padding="lg"
      onPress={onPress}
      accessibilityLabel={title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}
    >
      <Ionicons name={icon} size={22} color={theme.colors.accent.default} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="caption" tone="tertiary">{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.text.tertiary} />
    </Card>
  );
}
