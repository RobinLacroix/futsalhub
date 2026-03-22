import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import PieChart from 'react-native-chart-kit/dist/PieChart';
import BarChart from 'react-native-chart-kit/dist/BarChart';
import LineChart from 'react-native-chart-kit/dist/line-chart';
import StackedBarChart from 'react-native-chart-kit/dist/StackedBarChart';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getTrainingsByTeam } from '../../../lib/services/trainings';
import { getMatchesByTeam } from '../../../lib/services/matches';
import { getPlayersByTeam, getPlayerStats } from '../../../lib/services/players';
import { aggregateByField, calculateAverageByField, CHART_COLORS } from '../../../lib/utils/chartUtils';
import type { Training, Match, Player } from '../../../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

type PlayerWithStats = Player & {
  matches_played?: number;
  goals?: number;
  victories?: number;
  draws?: number;
  defeats?: number;
};

const getChartConfig = (isSmallScreen: boolean) => ({
  backgroundColor: '#fff',
  backgroundGradientFrom: '#f8fafc',
  backgroundGradientTo: '#f1f5f9',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(30, 41, 59, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
  style: { borderRadius: 12 },
  propsForLabels: { fontSize: isSmallScreen ? 9 : 12 },
  propsForVerticalLabels: { fontSize: isSmallScreen ? 8 : 11 },
  propsForHorizontalLabels: { fontSize: isSmallScreen ? 8 : 11 },
});

export default function DashboardScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { activeTeamId, activeTeam } = useActiveTeam();
  const isSmallScreen = screenWidth < 380;
  const chartWidth = screenWidth - 32;
  const chartHeight = isSmallScreen ? 230 : 300;
  const pieChartHeight = 280;
  const stackedBarHeight = isSmallScreen ? 260 : 340;
  const chartConfig = getChartConfig(isSmallScreen);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [upcomingTrainingCount, setUpcomingTrainingCount] = useState(0);
  const [upcomingMatchCount, setUpcomingMatchCount] = useState(0);
  const [nextTrainings, setNextTrainings] = useState<Training[]>([]);
  const [nextMatches, setNextMatches] = useState<Match[]>([]);
  const [playersWithStats, setPlayersWithStats] = useState<PlayerWithStats[]>([]);
  const [trainingsAll, setTrainingsAll] = useState<Training[]>([]);
  const [matchesAll, setMatchesAll] = useState<Match[]>([]);

  const load = useCallback(async () => {
    if (!activeTeamId) {
      setPlayerCount(0);
      setUpcomingTrainingCount(0);
      setUpcomingMatchCount(0);
      setNextTrainings([]);
      setNextMatches([]);
      setPlayersWithStats([]);
      setTrainingsAll([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [trainingsData, matchesData, players] = await Promise.all([
        getTrainingsByTeam(activeTeamId),
        getMatchesByTeam(activeTeamId),
        getPlayersByTeam(activeTeamId),
      ]);
      setTrainingsAll(trainingsData);
      setMatchesAll(matchesData);
      setPlayerCount(players.length);

      const withStats: PlayerWithStats[] = await Promise.all(
        players.map(async (p) => {
          try {
            const s = await getPlayerStats(p.id, activeTeamId);
            return { ...p, ...s };
          } catch {
            return { ...p, matches_played: 0, goals: 0, victories: 0, draws: 0, defeats: 0 };
          }
        })
      );
      setPlayersWithStats(withStats);

      const from = todayStart();
      const upcomingTAll = trainingsData
        .filter((t) => t.date >= from)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const upcomingMAll = matchesData
        .filter((m) => m.date >= from)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUpcomingTrainingCount(upcomingTAll.length);
      setUpcomingMatchCount(upcomingMAll.length);
      setNextTrainings(upcomingTAll.slice(0, 5));
      setNextMatches(upcomingMAll.slice(0, 5));
    } catch {
      setNextTrainings([]);
      setNextMatches([]);
      setPlayersWithStats([]);
      setTrainingsAll([]);
      setMatchesAll([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTeamId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const chartData = useMemo(() => {
    const themeDistribution = (() => {
      const acc: Record<string, number> = {};
      trainingsAll.forEach((t) => {
        const theme = t.theme || 'Non spécifié';
        acc[theme] = (acc[theme] || 0) + 1;
      });
      return Object.entries(acc).map(([name, value]) => ({ name, value }));
    })();

    const goalsByTypeDistribution = (() => {
      if (!matchesAll.length) return null;
      const sum = {
        offensive: { scored: 0, conceded: 0 },
        transition: { scored: 0, conceded: 0 },
        cpa: { scored: 0, conceded: 0 },
        superiority: { scored: 0, conceded: 0 },
      };
      matchesAll.forEach((m) => {
        const gb: any = (m as any).goals_by_type || {};
        const cb: any = (m as any).conceded_by_type || {};
        sum.offensive.scored += Number(gb.offensive ?? 0);
        sum.transition.scored += Number(gb.transition ?? 0);
        sum.cpa.scored += Number(gb.cpa ?? 0);
        sum.superiority.scored += Number(gb.superiority ?? 0);
        sum.offensive.conceded += Number(cb.offensive ?? 0);
        sum.transition.conceded += Number(cb.transition ?? 0);
        sum.cpa.conceded += Number(cb.cpa ?? 0);
        sum.superiority.conceded += Number(cb.superiority ?? 0);
      });
      return sum;
    })();

    const goalsDistributionPerMatch = (() => {
      if (!matchesAll.length) return null;
      const scored = matchesAll.map((m) => {
        const gb: any = (m as any).goals_by_type || {};
        return {
          title: (m.title || m.opponent_team || m.competition || 'Match').toString(),
          offensive: Number(gb.offensive ?? 0),
          transition: Number(gb.transition ?? 0),
          cpa: Number(gb.cpa ?? 0),
          superiority: Number(gb.superiority ?? 0),
        };
      });
      const conceded = matchesAll.map((m) => {
        const cb: any = (m as any).conceded_by_type || {};
        return {
          title: (m.title || m.opponent_team || m.competition || 'Match').toString(),
          offensive: Number(cb.offensive ?? 0),
          transition: Number(cb.transition ?? 0),
          cpa: Number(cb.cpa ?? 0),
          superiority: Number(cb.superiority ?? 0),
        };
      });
      return { scored, conceded };
    })();

    return {
      statusDistribution: aggregateByField(playersWithStats, 'status'),
      footDistribution: aggregateByField(playersWithStats, 'strong_foot'),
      matchesByStatus: calculateAverageByField(playersWithStats, 'status', 'matches_played'),
      goalsByStatus: calculateAverageByField(playersWithStats, 'status', 'goals'),
      matchesByPlayer: playersWithStats.map((p) => {
        const shortName = `${p.first_name} ${p.last_name ? p.last_name[0] + '.' : ''}`;
        return {
          joueur: shortName,
          Victoires: p.victories ?? 0,
          Nuls: p.draws ?? 0,
          Défaites: p.defeats ?? 0,
        };
      }),
      themeDistribution,
      presentPerSession: trainingsAll
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-15)
        .map((t) => {
          const att = t.attendance || {};
          const present = Object.values(att).filter(
            (v) => v === 'present' || v === 'late'
          ).length;
          return {
            date: format(new Date(t.date), 'd/MM', { locale: fr }),
            present,
          };
        }),
      goalsByTypeDistribution,
      goalsDistributionPerMatch,
    };
  }, [playersWithStats, trainingsAll, matchesAll]);

  if (!activeTeamId || !activeTeam) {
    return (
      <View style={styles.centered}>
        <Ionicons name="trophy-outline" size={48} color="#94a3b8" />
        <Text style={styles.noTeamTitle}>Aucune équipe sélectionnée</Text>
        <Text style={styles.noTeamText}>
          Choisissez une équipe depuis l'accueil ou l'écran Équipes pour voir le dashboard.
        </Text>
      </View>
    );
  }

  if (loading && nextTrainings.length === 0 && nextMatches.length === 0 && playersWithStats.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const pieData = (items: { name: string; value: number }[]) =>
    items.map((item, i) => ({
      name: item.name,
      population: item.value,
      color: CHART_COLORS[i % CHART_COLORS.length],
      legendFontColor: '#475569',
      legendFontSize: 15,
    }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3b82f6']} />
      }
    >
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>{activeTeam.name}</Text>

      <View style={styles.cardsRow}>
        <View style={styles.card}>
          <Ionicons name="people" size={28} color="#3b82f6" />
          <Text style={styles.cardValue}>{playerCount}</Text>
          <Text style={styles.cardLabel}>Joueurs</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="calendar" size={28} color="#16a34a" />
          <Text style={styles.cardValue}>{upcomingTrainingCount}</Text>
          <Text style={styles.cardLabel}>À venir (entr.)</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="trophy" size={28} color="#ea580c" />
          <Text style={styles.cardValue}>{upcomingMatchCount}</Text>
          <Text style={styles.cardLabel}>À venir (matchs)</Text>
        </View>
      </View>

      {/* Analyse de l'effectif */}
      <Text style={styles.sectionTitle}>Analyse de l'effectif</Text>

      {chartData.statusDistribution.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Répartition par statut</Text>
          <PieChart
            data={pieData(chartData.statusDistribution)}
            width={chartWidth}
            height={pieChartHeight}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            center={[10, 0]}
            absolute
          />
        </View>
      )}

      {chartData.footDistribution.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Répartition par pied fort</Text>
          <PieChart
            data={pieData(chartData.footDistribution)}
            width={chartWidth}
            height={pieChartHeight}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            center={[10, 0]}
            absolute
          />
        </View>
      )}

      {chartData.matchesByStatus.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Moyenne de matchs par statut</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: chartData.matchesByStatus.map((x) => x.name),
                datasets: [{ data: chartData.matchesByStatus.map((x) => x.value) }],
              }}
              width={Math.max(chartWidth, chartData.matchesByStatus.length * 80)}
              height={chartHeight}
              chartConfig={{ ...chartConfig, color: () => '#3b82f6' }}
              style={styles.chart}
              showValuesOnTopOfBars={!isSmallScreen}
              verticalLabelRotation={isSmallScreen ? 40 : 0}
            />
          </ScrollView>
        </View>
      )}

      {chartData.goalsByStatus.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Buts marqués par statut</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: chartData.goalsByStatus.map((x) => x.name),
                datasets: [{ data: chartData.goalsByStatus.map((x) => x.value) }],
              }}
              width={Math.max(chartWidth, chartData.goalsByStatus.length * 80)}
              height={chartHeight}
              chartConfig={{ ...chartConfig, color: () => '#16a34a' }}
              style={styles.chart}
              showValuesOnTopOfBars={!isSmallScreen}
              verticalLabelRotation={isSmallScreen ? 40 : 0}
            />
          </ScrollView>
        </View>
      )}

      {chartData.matchesByPlayer.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Résultats des matchs par joueur</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <StackedBarChart
              data={{
                labels: chartData.matchesByPlayer.map((x) =>
                  x.joueur.length > 8 ? `${x.joueur.slice(0, 7)}…` : x.joueur
                ),
                legend: ['Victoires', 'Nuls', 'Défaites'],
                data: chartData.matchesByPlayer.map((x) => [x.Victoires, x.Nuls, x.Défaites]),
                barColors: ['#22c55e', '#eab308', '#ef4444'],
              }}
              width={Math.max(chartWidth, chartData.matchesByPlayer.length * 70)}
              height={stackedBarHeight}
              chartConfig={chartConfig}
              style={styles.chart}
            />
          </ScrollView>
        </View>
      )}

      {/* Analyse des matchs */}
      <Text style={styles.sectionTitle}>Analyse des matchs</Text>

      {chartData.goalsByTypeDistribution && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Répartition des buts par type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={{
                labels: ['Off.', 'Off.', 'Trans.', 'Trans.', 'CPA', 'CPA', 'Sup.', 'Sup.'],
                datasets: [
                  {
                    data: [
                      chartData.goalsByTypeDistribution.offensive.scored,
                      chartData.goalsByTypeDistribution.offensive.conceded,
                      chartData.goalsByTypeDistribution.transition.scored,
                      chartData.goalsByTypeDistribution.transition.conceded,
                      chartData.goalsByTypeDistribution.cpa.scored,
                      chartData.goalsByTypeDistribution.cpa.conceded,
                      chartData.goalsByTypeDistribution.superiority.scored,
                      chartData.goalsByTypeDistribution.superiority.conceded,
                    ],
                    colors: [
                      () => 'rgba(34,197,94,0.85)', // Off. marqués
                      () => 'rgba(239,68,68,0.75)', // Off. encaissés
                      () => 'rgba(34,197,94,0.85)', // Trans. marqués
                      () => 'rgba(239,68,68,0.75)', // Trans. encaissés
                      () => 'rgba(34,197,94,0.85)', // CPA marqués
                      () => 'rgba(239,68,68,0.75)', // CPA encaissés
                      () => 'rgba(34,197,94,0.85)', // Sup. marqués
                      () => 'rgba(239,68,68,0.75)', // Sup. encaissés
                    ],
                  },
                ],
              }}
              width={Math.max(chartWidth, 8 * 40)}
              height={chartHeight}
              chartConfig={{
                ...chartConfig,
                color: () => 'rgba(148,163,184,0.4)', // fallback neutre (non utilisé avec flatColor)
              }}
              withCustomBarColorFromData
              flatColor
              style={styles.chart}
              fromZero
              showValuesOnTopOfBars={!isSmallScreen}
            />
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: 'rgba(34,197,94,0.85)',
                }}
              />
              <Text style={{ fontSize: 12, color: '#475569' }}>Buts marqués</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: 'rgba(239,68,68,0.75)',
                }}
              />
              <Text style={{ fontSize: 12, color: '#475569' }}>Buts encaissés</Text>
            </View>
          </View>
        </View>
      )}

      {chartData.goalsDistributionPerMatch && chartData.goalsDistributionPerMatch.scored.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Buts marqués par match (par type)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <StackedBarChart
              data={{
                labels: chartData.goalsDistributionPerMatch.scored.map((m) =>
                  m.title.length > 10 ? `${m.title.slice(0, 9)}…` : m.title
                ),
                legend: ['Offensif', 'Transition', 'CPA', 'Supériorité'],
                data: chartData.goalsDistributionPerMatch.scored.map((m) => [
                  m.offensive,
                  m.transition,
                  m.cpa,
                  m.superiority,
                ]),
                barColors: ['#22c55e', '#0ea5e9', '#eab308', '#8b5cf6'],
              }}
              width={Math.max(chartWidth, chartData.goalsDistributionPerMatch.scored.length * 80)}
              height={stackedBarHeight}
              chartConfig={chartConfig}
              style={styles.chart}
            />
          </ScrollView>
        </View>
      )}

      {chartData.goalsDistributionPerMatch && chartData.goalsDistributionPerMatch.conceded.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Buts encaissés par match (par type)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <StackedBarChart
              data={{
                labels: chartData.goalsDistributionPerMatch.conceded.map((m) =>
                  m.title.length > 10 ? `${m.title.slice(0, 9)}…` : m.title
                ),
                legend: ['Offensif', 'Transition', 'CPA', 'Supériorité'],
                data: chartData.goalsDistributionPerMatch.conceded.map((m) => [
                  m.offensive,
                  m.transition,
                  m.cpa,
                  m.superiority,
                ]),
                barColors: ['#ef4444', '#0ea5e9', '#eab308', '#8b5cf6'],
              }}
              width={Math.max(chartWidth, chartData.goalsDistributionPerMatch.conceded.length * 80)}
              height={stackedBarHeight}
              chartConfig={chartConfig}
              style={styles.chart}
            />
          </ScrollView>
        </View>
      )}

      {/* Analyse de l'entraînement */}
      <Text style={styles.sectionTitle}>Analyse de l'entraînement</Text>

      {chartData.presentPerSession.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Joueurs présents par séance</Text>
          <LineChart
            data={{
              labels: chartData.presentPerSession.map((x) => x.date),
              datasets: [{ data: chartData.presentPerSession.map((x) => x.present) }],
            }}
            width={chartWidth}
            height={chartHeight}
            chartConfig={{ ...chartConfig, color: () => '#10b981' }}
            style={styles.chart}
            bezier
            withDots
            withInnerLines
          />
        </View>
      )}

      {chartData.themeDistribution.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Répartition des thèmes d'entraînement</Text>
          <BarChart
            data={{
              labels: chartData.themeDistribution.map((x) => x.name),
              datasets: [{ data: chartData.themeDistribution.map((x) => x.value) }],
            }}
            width={chartWidth}
            height={chartHeight}
            chartConfig={{ ...chartConfig, color: () => '#8b5cf6' }}
            style={styles.chart}
            showValuesOnTopOfBars
          />
        </View>
      )}

      {/* Prochains événements */}
      <Text style={styles.sectionTitle}>À venir</Text>

      {nextTrainings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.subSectionTitle}>Prochains entraînements</Text>
          {nextTrainings.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.eventRow}
              onPress={() => router.push(`/calendar/training/${t.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.eventDate}>
                <Text style={styles.eventDay}>{format(new Date(t.date), 'd', { locale: fr })}</Text>
                <Text style={styles.eventMonth}>{format(new Date(t.date), 'MMM', { locale: fr })}</Text>
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{t.theme}</Text>
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {t.location || 'Lieu non renseigné'}
                  {t.key_principle ? ` · ${t.key_principle}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {nextMatches.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.subSectionTitle}>Prochains matchs</Text>
          {nextMatches.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={styles.eventRow}
              onPress={() => router.push(`/calendar/matchDetail/${m.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.eventDate}>
                <Text style={styles.eventDay}>{format(new Date(m.date), 'd', { locale: fr })}</Text>
                <Text style={styles.eventMonth}>{format(new Date(m.date), 'MMM', { locale: fr })}</Text>
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{m.title || m.opponent_team || 'Match'}</Text>
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {m.opponent_team ? `vs ${m.opponent_team}` : m.competition || m.location}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {nextTrainings.length === 0 && nextMatches.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucun entraînement ni match à venir.</Text>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/calendar')}>
            <Text style={styles.linkBtnText}>Voir le calendrier</Text>
            <Ionicons name="arrow-forward" size={18} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  noTeamTitle: { fontSize: 18, fontWeight: '600', color: '#334155', marginTop: 12 },
  noTeamText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 20 },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardValue: { fontSize: 24, fontWeight: '700', color: '#1e293b', marginTop: 8 },
  cardLabel: { fontSize: 12, color: '#64748b', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 12 },
  subSectionTitle: { fontSize: 15, fontWeight: '600', color: '#475569', marginBottom: 8 },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chartTitle: { fontSize: 16, fontWeight: '600', color: '#334155', marginBottom: 12 },
  chart: { marginVertical: 8, borderRadius: 12 },
  section: { marginBottom: 20 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  eventDate: { width: 44, alignItems: 'center', marginRight: 12 },
  eventDay: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  eventMonth: { fontSize: 12, color: '#64748b' },
  eventBody: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  eventMeta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 15, color: '#64748b', marginBottom: 12 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkBtnText: { fontSize: 15, fontWeight: '600', color: '#3b82f6' },
});
