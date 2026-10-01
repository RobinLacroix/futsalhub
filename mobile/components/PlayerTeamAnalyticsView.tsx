/**
 * PlayerTeamAnalyticsView — vue joueur de l'onglet « Équipe » d'Analytics
 * (components/AnalyticsView.tsx), en lecture seule.
 *
 * Volontairement réduite à ce qui ne requiert QUE matches/eventsByMatch de
 * l'équipe du joueur : KPI, domicile/extérieur, buts par type, moments du
 * match. Pas de classement de combos ni d'insights coach adjoint ici : ces
 * deux blocs ont besoin des noms des coéquipiers (`players`), et la policy
 * RLS sur `players` ne laisse un compte joueur pur lire que sa propre ligne
 * (`user_id = auth.uid()`, pas d'accès club) — pas de fuite de données
 * individuelles tant qu'aucune RPC dédiée n'est écrite pour ça. L'onglet
 * « Joueurs » (stats individuelles) reste hors périmètre, comme demandé.
 *
 * Miroir de app/webapp/player/analytics/TeamAnalyticsView.tsx.
 */
import { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { fmPalette } from './players/fmPalette';
import { Text, Card, Stat, EmptyState, SkeletonStats } from './ui';
import {
  SectionHeader, RecordPill, FilterRow, LOCATION_FILTERS, COMPETITION_FILTERS,
} from './AnalyticsView';
import { MatchMomentsView } from './MatchMomentsView';
import { GoalsByTypeTrendChart } from './analytics/GoalsByTypeTrendChart';
import { useIsTablet } from '../hooks/useIsTablet';
import { usePlayerTeamAnalytics } from '../hooks/usePlayerTeamAnalytics';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function PlayerTeamAnalyticsView() {
  const { theme } = useTheme();
  const c = theme.colors;
  const bp = fmPalette(theme.colors, theme.scheme);
  const isTablet = useIsTablet();

  const { teamId, matches, eventsByMatch, loading } = usePlayerTeamAnalytics();

  const [filterLoc, setFilterLoc] = useState('all');
  const [filterComp, setFilterComp] = useState('all');

  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach((m) => {
      const locOk = filterLoc === 'all' || norm(m.location ?? '') === norm(filterLoc);
      const compOk = filterComp === 'all' || norm(m.competition ?? '') === norm(filterComp);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLoc, filterComp]);

  const filteredMatches = useMemo(() => matches.filter((m) => filteredMatchIds.has(m.id)), [matches, filteredMatchIds]);

  const homeAway = useMemo(() => {
    // score_team/score_opponent valent 0 par défaut (colonnes NOT NULL) sur un
    // match pas encore joué : ce filtre ne les excluait jamais. Seule la date
    // de coup d'envoi distingue un résultat réel d'un match à venir.
    const withScore = filteredMatches.filter((m) => new Date(m.date as string).getTime() <= Date.now());
    const home = withScore.filter((m) => (m.location ?? '').toLowerCase().includes('dom'));
    const away = withScore.filter((m) => !(m.location ?? '').toLowerCase().includes('dom'));
    const wr = (arr: typeof withScore) =>
      arr.length ? Math.round((arr.filter((m) => (m.score_team as number) > (m.score_opponent as number)).length / arr.length) * 100) : null;
    return { homeWR: wr(home), awayWR: wr(away) };
  }, [filteredMatches]);

  const teamStats = useMemo(() => {
    const played = filteredMatches.length;
    // score_team/score_opponent valent 0 par défaut (colonnes NOT NULL) sur un
    // match pas encore joué : ce filtre ne les excluait jamais. Seule la date
    // de coup d'envoi distingue un résultat réel d'un match à venir.
    const withScore = filteredMatches.filter((m) => new Date(m.date as string).getTime() <= Date.now());
    const wins = withScore.filter((m) => (m.score_team as number) > (m.score_opponent as number)).length;
    const draws = withScore.filter((m) => (m.score_team as number) === (m.score_opponent as number)).length;
    const losses = withScore.length - wins - draws;
    const goalsFor = withScore.reduce((s, m) => s + ((m.score_team as number) ?? 0), 0);
    const goalsAgainst = withScore.reduce((s, m) => s + ((m.score_opponent as number) ?? 0), 0);
    const cleanSheets = withScore.filter((m) => (m.score_opponent as number) === 0).length;
    const winRate = withScore.length > 0 ? Math.round((wins / withScore.length) * 100) : 0;

    const form = [...withScore]
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
      .slice(0, 5)
      .map((m) => {
        const t = m.score_team as number, o = m.score_opponent as number;
        return t > o ? 'W' : t < o ? 'L' : 'D';
      });

    return { played, wins, draws, losses, goalsFor, goalsAgainst, cleanSheets, winRate, form };
  }, [filteredMatches]);

  const shotsOnTarget = useMemo(() => {
    let total = 0;
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach((ev) => { if (ev.event_type === 'shot_on_target') total++; });
    });
    return total;
  }, [eventsByMatch, filteredMatchIds]);

  const goalsByType = useMemo(() => {
    const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
    const labels: Record<string, string> = { offensive: 'Phase offensive', transition: 'Transition', cpa: 'CPA', superiority: 'Supériorité' };
    const scored: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    const conceded: Record<string, number> = Object.fromEntries(types.map((t) => [t, 0]));
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach((ev) => {
        const gt = (ev as unknown as { goal_type?: string | null }).goal_type;
        if (ev.event_type === 'goal' && gt && scored[gt] !== undefined) scored[gt]++;
        if (ev.event_type === 'opponent_goal' && gt && conceded[gt] !== undefined) conceded[gt]++;
      });
    });
    return types.map((t) => ({ key: t, label: labels[t], scored: scored[t], conceded: conceded[t] }));
  }, [eventsByMatch, filteredMatchIds]);

  const maxGoalsByType = useMemo(() => Math.max(1, ...goalsByType.map((g) => Math.max(g.scored, g.conceded))), [goalsByType]);

  if (loading) {
    return (
      <View style={{ padding: theme.space.lg }}>
        <SkeletonStats />
      </View>
    );
  }

  if (!teamId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <EmptyState icon="bar-chart-outline" title="Aucune équipe" description="Vous n'êtes rattaché à aucune équipe pour l'instant." />
      </View>
    );
  }

  const kpiCols = isTablet ? 4 : 2;

  const KPI_ITEMS = [
    { label: 'Matchs joués', value: teamStats.played, color: c.text.primary, icon: 'football-outline' as const },
    { label: 'Victoires', value: teamStats.wins, color: c.positive.default, icon: 'trophy-outline' as const },
    { label: 'Défaites', value: teamStats.losses, color: c.negative.default, icon: 'close-circle-outline' as const },
    { label: '% victoires', value: `${teamStats.winRate}%`, color: c.text.primary, icon: 'stats-chart-outline' as const },
    { label: 'Buts marqués', value: teamStats.goalsFor, color: c.positive.default, icon: 'trending-up-outline' as const },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst, color: c.negative.default, icon: 'trending-down-outline' as const },
    { label: 'Clean sheets', value: teamStats.cleanSheets, color: c.text.primary, icon: 'shield-checkmark-outline' as const },
    { label: 'Tirs cadrés', value: shotsOnTarget, color: c.text.primary, icon: 'radio-button-on-outline' as const },
  ];

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* ── Hero header ── */}
      <View style={{ backgroundColor: bp.brand, borderRadius: 12, padding: theme.space.xl, paddingBottom: theme.space.lg, gap: theme.space.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.space.md }}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text variant="caption" color={bp.onBrandMuted}>Analyse</Text>
            <Text variant="title" color={bp.onBrand}>Mon équipe</Text>
          </View>
          {teamStats.form.length > 0 && (
            <View style={{ alignItems: 'flex-end', gap: theme.space.xs }}>
              <Text variant="caption" color={bp.onBrandMuted}>Forme</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {teamStats.form.map((r, i) => (
                  <View key={i} style={{
                    minWidth: 22, height: 22, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                    backgroundColor: r === 'W' ? c.positive.fill : r === 'D' ? c.warning.fill : c.negative.fill,
                  }}>
                    <Text variant="caption" weight="700" color={c.text.onFill}>{r === 'W' ? 'V' : r === 'D' ? 'N' : 'D'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <RecordPill value={teamStats.wins} label="Victoires" color={c.positive.default} labelColor={bp.onBrandMuted} />
          <View style={{ width: 1, height: 24, marginHorizontal: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.draws} label="Nuls" color={c.warning.default} labelColor={bp.onBrandMuted} />
          <View style={{ width: 1, height: 24, marginHorizontal: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.losses} label="Défaites" color={c.negative.default} labelColor={bp.onBrandMuted} />
          <View style={{ width: 1, height: 24, marginHorizontal: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <View style={{ gap: 1 }}>
            <Text variant="title" numeric>
              <Text variant="title" color={c.positive.default}>{teamStats.goalsFor}</Text>
              <Text variant="title" color={bp.onBrandMuted}> – </Text>
              <Text variant="title" color={c.negative.default}>{teamStats.goalsAgainst}</Text>
            </Text>
            <Text variant="caption" color={bp.onBrandMuted}>Buts pour / contre</Text>
          </View>
        </View>
      </View>

      {/* ── Filters ── */}
      <View style={{ backgroundColor: c.bg.surface, borderBottomWidth: 1, borderBottomColor: c.border.subtle, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.sm, marginTop: theme.space.sm }}>
        <FilterRow label="Lieu" options={LOCATION_FILTERS as unknown as string[]} active={filterLoc} onSelect={setFilterLoc} allLabel="Tous" />
        <FilterRow label="Compétition" options={COMPETITION_FILTERS as unknown as string[]} active={filterComp} onSelect={setFilterComp} allLabel="Toutes" />
      </View>

      {matches.length === 0 ? (
        <View style={{ margin: theme.space.lg, padding: theme.space.xxl, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.border.subtle, backgroundColor: c.bg.surface }}>
          <EmptyState icon="analytics-outline" title="Aucun match enregistré" description="Aucune statistique d'équipe disponible pour l'instant." compact />
        </View>
      ) : (
        <>
          <SectionHeader label="Vue d'ensemble" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: theme.space.xs }}>
            {KPI_ITEMS.map((k) => (
              <Card key={k.label} padding="sm" style={{ width: `${100 / kpiCols - 2}%` as never, margin: '1%' as never, gap: 3 }}>
                <View style={{ width: 26, height: 26, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: c.bg.sunken }}>
                  <Ionicons name={k.icon} size={15} color={k.color} />
                </View>
                <Stat value={String(k.value)} label={k.label} size="compact" valueColor={k.color} />
              </Card>
            ))}
          </View>

          {(homeAway.homeWR !== null || homeAway.awayWR !== null) && (
            <>
              <SectionHeader label="Domicile / Extérieur" />
              <View style={{ flexDirection: 'row', gap: theme.space.sm, paddingHorizontal: theme.space.lg, marginBottom: theme.space.xs }}>
                {homeAway.homeWR !== null && (
                  <View style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, alignItems: 'center', gap: 2, backgroundColor: c.positive.subtle }}>
                    <Text variant="caption" weight="600" color={c.positive.default}>Domicile</Text>
                    <Text variant="headline" weight="800" color={c.positive.default}>{homeAway.homeWR}% V</Text>
                  </View>
                )}
                {homeAway.awayWR !== null && (
                  <View style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, alignItems: 'center', gap: 2, backgroundColor: c.warning.subtle }}>
                    <Text variant="caption" weight="600" color={c.warning.default}>Extérieur</Text>
                    <Text variant="headline" weight="800" color={c.warning.default}>{homeAway.awayWR}% V</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {goalsByType.some((g) => g.scored > 0 || g.conceded > 0) && (
            <>
              <SectionHeader label="Buts par type" />
              <View style={{ gap: theme.space.sm, paddingHorizontal: theme.space.lg }}>
                {([
                  { title: 'Buts marqués', ramp: c.positive, pick: (g: typeof goalsByType[number]) => g.scored },
                  { title: 'Buts encaissés', ramp: c.negative, pick: (g: typeof goalsByType[number]) => g.conceded },
                ] as const).map((block) => (
                  <Card key={block.title} style={{ gap: theme.space.md }}>
                    <Text variant="headline" color={block.ramp.default}>{block.title}</Text>
                    {goalsByType.map((g) => {
                      const value = block.pick(g);
                      return (
                        <View key={g.key} style={{ gap: theme.space.xs }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="callout" tone="secondary">{g.label}</Text>
                            <Text variant="headline" color={block.ramp.default} numeric>{value}</Text>
                          </View>
                          <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: c.bg.sunken }}>
                            <View style={{ width: `${(value / maxGoalsByType) * 100}%` as never, height: '100%', borderRadius: 3, backgroundColor: block.ramp.default }} />
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                ))}
              </View>
            </>
          )}

          <SectionHeader label="Évolution des buts par type" />
          <GoalsByTypeTrendChart matches={filteredMatches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />

          <SectionHeader label="Moments du match" />
          <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.lg }}>
            <MatchMomentsView matches={matches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
