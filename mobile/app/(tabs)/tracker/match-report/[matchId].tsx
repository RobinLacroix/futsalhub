import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalsByType {
  offensive: number;
  transition: number;
  cpa: number;
  superiority: number;
}

interface MatchRow {
  id: string;
  title: string;
  date: string;
  competition: string;
  location: string;
  score_team: number;
  score_opponent: number;
  opponent_team: string | null;
  goals_by_type: GoalsByType | null;
  conceded_by_type: GoalsByType | null;
  players: Array<{ id: string; goals: number; yellow_cards: number; red_cards: number; time_played: number }> | null;
  team_id: string | null;
}

interface EventRow {
  id: string;
  event_type: string;
  match_time_seconds: number;
  half: number;
  player_id: string | null;
  players_on_field: string[] | null;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  number: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AMBER = '#FFB020';
const DARK_BG = '#0E0E10';
const CARD_BG = 'rgba(255,255,255,0.05)';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#f9fafb';
const MUTED = '#9ca3af';

const GOAL_COLORS: Record<string, string> = {
  offensive: AMBER,
  transition: '#3B82F6',
  cpa: '#10B981',
  superiority: '#8B5CF6',
};
const GOAL_LABELS: Record<string, string> = {
  offensive: 'Offensif',
  transition: 'Transition',
  cpa: 'CPA',
  superiority: 'Supériorité',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getResult(scoreTeam: number, scoreOpponent: number) {
  if (scoreTeam > scoreOpponent) return { label: 'VICTOIRE', color: '#10B981' };
  if (scoreTeam < scoreOpponent) return { label: 'DÉFAITE', color: '#EF4444' };
  return { label: 'NUL', color: '#6B7280' };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function count(arr: EventRow[], ...types: string[]) {
  return arr.filter(e => types.includes(e.event_type)).length;
}

const screenW = Dimensions.get('window').width;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={styles.hBarRow}>
      <Text style={styles.hBarLabel}>{label}</Text>
      <View style={styles.hBarTrack}>
        <View style={[styles.hBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.hBarCount}>{value}</Text>
    </View>
  );
}

function GoalTypeSection({ title, data }: { title: string; data: GoalsByType }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={[styles.muted, { textAlign: 'center', paddingVertical: 12 }]}>Aucun but</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {Object.entries(data)
        .filter(([, v]) => v > 0)
        .map(([key, val]) => (
          <HorizontalBar
            key={key}
            label={`${GOAL_LABELS[key] ?? key}  (${val})`}
            value={val}
            max={total}
            color={GOAL_COLORS[key] ?? AMBER}
          />
        ))}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MatchReportScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<MatchRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!matchId) return;
    load();
  }, [matchId]);

  async function load() {
    setLoading(true);

    const { data: m } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!m) { setLoading(false); return; }
    setMatch(m);

    if (m.team_id) {
      const { data: t } = await supabase.from('teams').select('name').eq('id', m.team_id).single();
      if (t) setTeamName(t.name);
    }

    const { data: evts } = await supabase
      .from('match_events')
      .select('id, event_type, match_time_seconds, half, player_id, players_on_field')
      .eq('match_id', matchId)
      .order('half').order('match_time_seconds');

    const evtsArr: EventRow[] = evts ?? [];
    setEvents(evtsArr);

    const fromEvents = evtsArr.filter(e => e.player_id).map(e => e.player_id as string);
    const fromMatch = (m.players ?? []).map((p: { id: string }) => p.id);
    const allIds = [...new Set([...fromEvents, ...fromMatch])];

    if (allIds.length) {
      const { data: ps } = await supabase
        .from('players')
        .select('id, first_name, last_name, number')
        .in('id', allIds);
      setPlayers(ps ?? []);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={AMBER} size="large" />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Match introuvable</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: AMBER }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Stats ──

  const result = getResult(match.score_team, match.score_opponent);
  const h1 = events.filter(e => e.half === 1);
  const h2 = events.filter(e => e.half === 2);

  const ourShotsOnTarget = count(events, 'shot_on_target');
  const ourShotsOff = count(events, 'shot');
  const oppShotsOnTarget = count(events, 'opponent_shot_on_target');
  const oppShotsOff = count(events, 'opponent_shot');

  const shotsCadres = ourShotsOnTarget + match.score_team;
  const oppShotsCadres = oppShotsOnTarget + match.score_opponent;
  const totalShots = ourShotsOff + shotsCadres;
  const oppTotalShots = oppShotsOff + oppShotsCadres;
  const maxShots = Math.max(totalShots, oppTotalShots, 1);

  const recoveries = count(events, 'recovery', 'ball_recovery');
  const efficiency = shotsCadres > 0 ? Math.round((match.score_team / shotsCadres) * 100) : 0;

  const gbt = match.goals_by_type ?? { offensive: 0, transition: 0, cpa: 0, superiority: 0 };
  const cbt = match.conceded_by_type ?? { offensive: 0, transition: 0, cpa: 0, superiority: 0 };

  const goalTimeline = events
    .filter(e => e.event_type === 'goal' || e.event_type === 'opponent_goal')
    .map(e => ({
      ...e,
      isOurs: e.event_type === 'goal',
      minute: Math.ceil((e.half === 1 ? 0 : 20) + e.match_time_seconds / 60),
      pct: Math.min(0.99, ((e.half === 1 ? 0 : 20) + e.match_time_seconds / 60) / 40),
    }));

  // Événements de but pour le calcul +/-
  const goalEvents = events.filter(
    e => e.event_type === 'goal' || e.event_type === 'opponent_goal',
  );

  const playerStats = players
    .map(p => {
      const pe = events.filter(e => e.player_id === p.id);
      const mp = (match.players ?? []).find(x => x.id === p.id);

      // +1 quand l'équipe marque avec le joueur sur le terrain
      // -1 quand l'adversaire marque avec le joueur sur le terrain
      const plusMinus = goalEvents.reduce((acc, e) => {
        const onField = e.players_on_field ?? [];
        if (onField.includes(p.id)) {
          return acc + (e.event_type === 'goal' ? 1 : -1);
        }
        return acc;
      }, 0);

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        number: p.number,
        timePlayed: mp?.time_played ?? 0,
        goals: count(pe, 'goal'),
        shotsOnTarget: count(pe, 'shot_on_target'),
        shotsOff: count(pe, 'shot'),
        recovery: count(pe, 'recovery', 'ball_recovery'),
        ballLoss: count(pe, 'ball_loss'),
        yellowCards: count(pe, 'yellow_card'),
        redCards: count(pe, 'red_card'),
        plusMinus,
      };
    })
    .filter(p => p.timePlayed > 0 || p.goals > 0 || p.shotsOnTarget > 0 || p.recovery > 0)
    .sort((a, b) => b.timePlayed - a.timePlayed);

  const timelineW = screenW - 48;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>FutsalHub</Text>
        <Text style={styles.competition}>{match.competition}</Text>
      </View>

      {/* Score block */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreRow}>
          <Text style={styles.teamName} numberOfLines={2}>{teamName || 'Notre équipe'}</Text>
          <Text style={styles.scoreText}>{match.score_team} — {match.score_opponent}</Text>
          <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>
            {match.opponent_team || 'Adversaire'}
          </Text>
        </View>
        <View style={[styles.resultBadge, { backgroundColor: result.color + '22' }]}>
          <Text style={[styles.resultLabel, { color: result.color }]}>{result.label}</Text>
        </View>
        <View style={styles.metaRow}>
          {match.location ? <Text style={styles.metaText}>📍 {match.location}</Text> : null}
          <Text style={styles.metaText}>📅 {formatDate(match.date)}</Text>
        </View>
      </View>

      {/* Stat cards */}
      <View style={styles.statRow}>
        <StatCard icon="🎯" value={totalShots} label="Tirs" sub={`${oppTotalShots} adv.`} />
        <StatCard icon="⚽" value={shotsCadres} label="Cadrés" sub={`${oppShotsCadres} adv.`} />
        <StatCard icon="💪" value={recoveries} label="Récup." />
        <StatCard icon="📊" value={efficiency > 0 ? `${efficiency}%` : '—'} label="Efficacité" />
      </View>

      {/* Shots comparison */}
      {events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tirs — Nous vs Adversaire</Text>
          <HorizontalBar label={`Cadrés (nous)`} value={shotsCadres} max={maxShots} color="#10B981" />
          <HorizontalBar label="Non cadrés (nous)" value={ourShotsOff} max={maxShots} color="#6EE7B7" />
          <View style={styles.divider} />
          <HorizontalBar label="Cadrés (adv.)" value={oppShotsCadres} max={maxShots} color="#EF4444" />
          <HorizontalBar label="Non cadrés (adv.)" value={oppShotsOff} max={maxShots} color="#FCA5A5" />
        </View>
      )}

      {/* Goals by type */}
      <GoalTypeSection
        title={`Nos buts par type (${match.score_team})`}
        data={gbt}
      />
      <GoalTypeSection
        title={`Buts concédés par type (${match.score_opponent})`}
        data={cbt}
      />

      {/* Timeline */}
      {goalTimeline.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Chronologie des buts</Text>
          <View style={{ height: 80, marginTop: 8 }}>
            {/* Axe */}
            <View style={[styles.timelineAxis, { width: timelineW }]} />
            {/* Séparateur mi-temps */}
            <View style={[styles.timelineMid, { left: timelineW / 2 }]} />
            <Text style={[styles.timelineMidLabel, { left: timelineW / 2 - 10 }]}>MT</Text>

            {/* Buts */}
            {goalTimeline.map((g, i) => {
              const x = g.pct * timelineW;
              return (
                <View key={i} style={[styles.goalMarkerWrap, { left: x }]}>
                  {g.isOurs ? (
                    <View style={styles.goalAbove}>
                      <Text style={styles.goalMinuteAbove}>{g.minute}&apos;</Text>
                      <View style={[styles.goalDot, { backgroundColor: '#10B981' }]} />
                      <View style={[styles.goalStem, { backgroundColor: '#10B981' }]} />
                    </View>
                  ) : (
                    <View style={styles.goalBelow}>
                      <View style={[styles.goalStem, { backgroundColor: '#EF4444' }]} />
                      <View style={[styles.goalDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.goalMinuteBelow}>{g.minute}&apos;</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <View style={styles.timelineLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.muted}>Buts marqués</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.muted}>Buts concédés</Text>
            </View>
          </View>
        </View>
      )}

      {/* Demi-temps shots */}
      {events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tirs par mi-temps</Text>
          {[
            { label: '1ère MT — Cadrés', val: count(h1, 'shot_on_target') + count(h1, 'goal'), color: '#10B981' },
            { label: '1ère MT — Non cadrés', val: count(h1, 'shot'), color: '#6EE7B7' },
            { label: '2ème MT — Cadrés', val: count(h2, 'shot_on_target') + count(h2, 'goal'), color: '#3B82F6' },
            { label: '2ème MT — Non cadrés', val: count(h2, 'shot'), color: '#93C5FD' },
          ].map(r => (
            <HorizontalBar key={r.label} label={r.label} value={r.val} max={Math.max(1, totalShots)} color={r.color} />
          ))}
        </View>
      )}

      {/* Player stats */}
      {playerStats.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Statistiques joueurs</Text>
          {/* Header row */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.colNum]}>#</Text>
            <Text style={[styles.tableCell, styles.colName]}>Joueur</Text>
            <Text style={[styles.tableCell, styles.colStat]}>Min</Text>
            <Text style={[styles.tableCell, styles.colStat]}>+/-</Text>
            <Text style={[styles.tableCell, styles.colStat]}>Buts</Text>
            <Text style={[styles.tableCell, styles.colStat]}>Tirs⊕</Text>
            <Text style={[styles.tableCell, styles.colStat]}>Récup</Text>
            <Text style={[styles.tableCell, styles.colStat]}>🟨🟥</Text>
          </View>
          {playerStats.map((p, i) => {
            const pm = p.plusMinus;
            const pmColor = pm > 0 ? '#10B981' : pm < 0 ? '#EF4444' : undefined;
            const pmLabel = pm > 0 ? `+${pm}` : pm === 0 ? '0' : `${pm}`;
            return (
              <View key={p.id} style={[styles.tableRow, i % 2 === 0 ? styles.tableRowEven : {}]}>
                <Text style={[styles.tableCell, styles.colNum, styles.muted]}>{p.number}</Text>
                <Text style={[styles.tableCell, styles.colName]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.tableCell, styles.colStat, styles.muted]}>
                  {p.timePlayed > 0 ? `${Math.floor(p.timePlayed / 60)}'` : '—'}
                </Text>
                <Text style={[styles.tableCell, styles.colStat, styles.bold, pmColor ? { color: pmColor } : styles.muted]}>
                  {pmLabel}
                </Text>
                <Text style={[styles.tableCell, styles.colStat, p.goals > 0 && styles.highlight]}>
                  {p.goals || '—'}
                </Text>
                <Text style={[styles.tableCell, styles.colStat, styles.muted]}>{p.shotsOnTarget || '—'}</Text>
                <Text style={[styles.tableCell, styles.colStat, styles.muted]}>{p.recovery || '—'}</Text>
                <Text style={[styles.tableCell, styles.colStat]}>
                  {p.yellowCards > 0 ? '🟨' : ''}{p.redCards > 0 ? '🟥' : ''}{!p.yellowCards && !p.redCards ? '—' : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Footer */}
      <Text style={styles.footer}>
        FutsalHub · Rapport généré le {new Date().toLocaleDateString('fr-FR')}
      </Text>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: DARK_BG, justifyContent: 'center', alignItems: 'center' },
  backBtn: { marginTop: 16, padding: 12 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  logo: { fontSize: 20, fontWeight: '900', color: AMBER, letterSpacing: -0.5 },
  competition: { fontSize: 12, color: MUTED },

  scoreCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between' },
  teamName: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT, textAlign: 'right' },
  teamNameRight: { textAlign: 'left', color: MUTED },
  scoreText: { fontSize: 42, fontWeight: '900', color: TEXT, marginHorizontal: 12, letterSpacing: -1 },
  resultBadge: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 99, marginTop: 10 },
  resultLabel: { fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 10 },
  metaText: { fontSize: 11, color: MUTED },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: TEXT },
  statLabel: { fontSize: 9, color: MUTED, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
  statSub: { fontSize: 9, color: MUTED, marginTop: 1 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },

  hBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  hBarLabel: { fontSize: 11, color: MUTED, width: 140 },
  hBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' },
  hBarFill: { height: '100%', borderRadius: 4 },
  hBarCount: { fontSize: 11, fontWeight: '700', color: TEXT, width: 24, textAlign: 'right' },

  divider: { height: 1, backgroundColor: BORDER, marginVertical: 8 },

  timelineAxis: {
    position: 'absolute',
    top: 38,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  timelineMid: {
    position: 'absolute',
    top: 30,
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  timelineMidLabel: {
    position: 'absolute',
    top: 12,
    fontSize: 9,
    color: MUTED,
  },
  goalMarkerWrap: {
    position: 'absolute',
  },
  goalAbove: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 38,
    left: -8,
  },
  goalBelow: {
    alignItems: 'center',
    position: 'absolute',
    top: 42,
    left: -8,
  },
  goalDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: DARK_BG },
  goalStem: { width: 2, height: 10 },
  goalMinuteAbove: { fontSize: 9, fontWeight: '700', color: '#10B981', marginBottom: 2 },
  goalMinuteBelow: { fontSize: 9, fontWeight: '700', color: '#EF4444', marginTop: 2 },
  timelineLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  tableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderColor: BORDER },
  tableRowEven: { backgroundColor: 'rgba(255,255,255,0.025)' },
  tableHeader: { borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginBottom: 2 },
  tableCell: { fontSize: 12, color: TEXT },
  colNum: { width: 28, color: MUTED, fontVariant: ['tabular-nums'] },
  colName: { flex: 1, paddingRight: 4 },
  colStat: { width: 40, textAlign: 'center' },

  muted: { color: MUTED, fontSize: 12 },
  highlight: { color: AMBER, fontWeight: '800' } as object,

  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 10, marginTop: 8 },
});
