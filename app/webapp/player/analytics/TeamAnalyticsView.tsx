/**
 * TeamAnalyticsView — vue joueur de l'onglet « Équipe » d'Analytics
 * (manager/analytics/AnalyticsView.tsx), en lecture seule.
 *
 * Volontairement réduite à ce qui ne requiert QUE matches/eventsByMatch de
 * l'équipe du joueur : KPI, domicile/extérieur, buts par type, moments du
 * match. Pas de classement de combos ni d'insights coach adjoint ici : ces
 * deux blocs ont besoin des noms des coéquipiers (`players`), et la policy
 * RLS sur `players` ne laisse un compte joueur pur lire que sa propre ligne
 * (`user_id = auth.uid()`, pas d'accès club) — pas de fuite de données
 * individuelles tant qu'aucune RPC dédiée n'est écrite pour ça. L'onglet
 * « Joueurs » (stats individuelles) reste hors périmètre, comme demandé.
 */
'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Goal, Trophy, XCircle, TrendingUp, TrendingDown, ShieldCheck, CircleDot } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { fmPalette } from '@/lib/design/fmPalette';
import { Text, Card, Stat, EmptyState, SkeletonStats } from '../../manager/analytics/ui';
import { MatchMomentsView } from '../../manager/analytics/MatchMomentsView';
import { GoalsByTypeTrendChart } from '../../manager/analytics/GoalsByTypeTrendChart';
import { SectionHeader, RecordPill, FilterRow, LOCATION_FILTERS, COMPETITION_FILTERS } from '../../manager/analytics/AnalyticsView';
import { useIsTablet } from '../../hooks/useIsTablet';
import { usePlayerTeamAnalytics } from './usePlayerTeamAnalytics';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function TeamAnalyticsView() {
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
      .sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime())
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
      <div style={{ padding: theme.space.lg }}>
        <SkeletonStats />
      </div>
    );
  }

  if (!teamId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <EmptyState icon={BarChart3} title="Aucune équipe" description="Vous n'êtes rattaché à aucune équipe pour l'instant." />
      </div>
    );
  }

  const kpiCols = isTablet ? 4 : 2;

  const KPI_ITEMS = [
    { label: 'Matchs joués', value: teamStats.played, color: c.text.primary, Icon: Goal },
    { label: 'Victoires', value: teamStats.wins, color: c.positive.default, Icon: Trophy },
    { label: 'Défaites', value: teamStats.losses, color: c.negative.default, Icon: XCircle },
    { label: '% victoires', value: `${teamStats.winRate}%`, color: c.text.primary, Icon: BarChart3 },
    { label: 'Buts marqués', value: teamStats.goalsFor, color: c.positive.default, Icon: TrendingUp },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst, color: c.negative.default, Icon: TrendingDown },
    { label: 'Clean sheets', value: teamStats.cleanSheets, color: c.text.primary, Icon: ShieldCheck },
    { label: 'Tirs cadrés', value: shotsOnTarget, color: c.text.primary, Icon: CircleDot },
  ];

  return (
    <div>
      {/* ── Hero header ── */}
      <div style={{ backgroundColor: bp.brand, borderRadius: 12, padding: `${theme.space.xl}px ${theme.space.xl}px ${theme.space.lg}px`, display: 'flex', flexDirection: 'column', gap: theme.space.lg }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: theme.space.md }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Text variant="caption" color={bp.onBrandMuted}>Analyse</Text>
            <Text variant="title" color={bp.onBrand}>Mon équipe</Text>
          </div>
          {teamStats.form.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: theme.space.xs }}>
              <Text variant="caption" color={bp.onBrandMuted}>Forme</Text>
              <div style={{ display: 'flex', gap: 3 }}>
                {teamStats.form.map((r, i) => (
                  <div key={i} style={{
                    minWidth: 22, height: 22, borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                    backgroundColor: r === 'W' ? c.positive.fill : r === 'D' ? c.warning.fill : c.negative.fill,
                  }}>
                    <Text variant="caption" weight={700} color={c.text.onFill}>{r === 'W' ? 'V' : r === 'D' ? 'N' : 'D'}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RecordPill value={teamStats.wins} label="Victoires" color={c.positive.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.draws} label="Nuls" color={c.warning.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <RecordPill value={teamStats.losses} label="Défaites" color={c.negative.default} labelColor={bp.onBrandMuted} />
          <div style={{ width: 1, height: 24, marginLeft: theme.space.lg, marginRight: theme.space.lg, backgroundColor: bp.onBrandBorder }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Text variant="title" numeric>
              <span style={{ color: c.positive.default }}>{teamStats.goalsFor}</span>
              <span style={{ color: bp.onBrandMuted }}> – </span>
              <span style={{ color: c.negative.default }}>{teamStats.goalsAgainst}</span>
            </Text>
            <Text variant="caption" color={bp.onBrandMuted}>Buts pour / contre</Text>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ backgroundColor: c.bg.surface, borderBottom: `1px solid ${c.border.subtle}`, padding: `${theme.space.md}px ${theme.space.lg}px`, display: 'flex', flexDirection: 'column', gap: theme.space.sm, marginTop: theme.space.sm }}>
        <FilterRow label="Lieu" options={LOCATION_FILTERS as unknown as string[]} active={filterLoc} onSelect={setFilterLoc} allLabel="Tous" />
        <FilterRow label="Compétition" options={COMPETITION_FILTERS as unknown as string[]} active={filterComp} onSelect={setFilterComp} allLabel="Toutes" />
      </div>

      {matches.length === 0 ? (
        <div style={{ margin: theme.space.lg, padding: theme.space.xxl, borderRadius: theme.radius.md, border: `1px solid ${c.border.subtle}`, backgroundColor: c.bg.surface }}>
          <EmptyState icon={BarChart3} title="Aucun match enregistré" description="Aucune statistique d'équipe disponible pour l'instant." compact />
        </div>
      ) : (
        <>
          <SectionHeader label="Vue d'ensemble" />
          <div style={{ display: 'flex', flexWrap: 'wrap', paddingTop: theme.space.xs, paddingBottom: theme.space.xs, paddingLeft: 14, paddingRight: 14 }}>
            {KPI_ITEMS.map((k) => (
              <Card key={k.label} padding="sm" style={{ width: `${100 / kpiCols - 2}%`, margin: '1%', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ width: 26, height: 26, borderRadius: theme.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2, backgroundColor: c.bg.sunken }}>
                  <k.Icon size={15} color={k.color} />
                </div>
                <Stat value={String(k.value)} label={k.label} size="compact" valueColor={k.color} />
              </Card>
            ))}
          </div>

          {(homeAway.homeWR !== null || homeAway.awayWR !== null) && (
            <>
              <SectionHeader label="Domicile / Extérieur" />
              <div style={{ display: 'flex', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg, marginBottom: theme.space.xs }}>
                {homeAway.homeWR !== null && (
                  <div style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, backgroundColor: c.positive.subtle }}>
                    <Text variant="caption" weight={600} color={c.positive.default}>Domicile</Text>
                    <Text variant="headline" weight={800} color={c.positive.default}>{homeAway.homeWR}% V</Text>
                  </div>
                )}
                {homeAway.awayWR !== null && (
                  <div style={{ flex: 1, borderRadius: theme.radius.md, padding: theme.space.md, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, backgroundColor: c.warning.subtle }}>
                    <Text variant="caption" weight={600} color={c.warning.default}>Extérieur</Text>
                    <Text variant="headline" weight={800} color={c.warning.default}>{homeAway.awayWR}% V</Text>
                  </div>
                )}
              </div>
            </>
          )}

          {goalsByType.some((g) => g.scored > 0 || g.conceded > 0) && (
            <>
              <SectionHeader label="Buts par type" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.space.sm, paddingLeft: theme.space.lg, paddingRight: theme.space.lg }}>
                {([
                  { title: 'Buts marqués', ramp: c.positive, pick: (g: typeof goalsByType[number]) => g.scored },
                  { title: 'Buts encaissés', ramp: c.negative, pick: (g: typeof goalsByType[number]) => g.conceded },
                ] as const).map((block) => (
                  <Card key={block.title} style={{ display: 'flex', flexDirection: 'column', gap: theme.space.md }}>
                    <Text variant="headline" color={block.ramp.default}>{block.title}</Text>
                    {goalsByType.map((g) => {
                      const value = block.pick(g);
                      return (
                        <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: theme.space.xs }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="callout" tone="secondary">{g.label}</Text>
                            <Text variant="headline" color={block.ramp.default} numeric>{value}</Text>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: c.bg.sunken }}>
                            <div style={{ width: `${(value / maxGoalsByType) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: block.ramp.default }} />
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                ))}
              </div>
            </>
          )}

          <SectionHeader label="Évolution des buts par type" />
          <GoalsByTypeTrendChart matches={filteredMatches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />

          <SectionHeader label="Moments du match" />
          <div style={{ paddingLeft: theme.space.lg, paddingRight: theme.space.lg, paddingBottom: theme.space.lg }}>
            <MatchMomentsView matches={matches} eventsByMatch={eventsByMatch} filteredMatchIds={filteredMatchIds} />
          </div>
        </>
      )}
    </div>
  );
}
