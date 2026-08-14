/**
 * PlayerDetailView — fiche joueur (P0-7)
 *
 * Écran signature de FutsalHub : bandeau de marque, sections denses, KPI,
 * radar, barre de saison. Ce caractère « Football Manager » vient de la
 * structure et il est conservé tel quel. Ce qui change : les 83 couleurs figées
 * passent par `components/players/fmPalette.ts`, donc l'écran fonctionne enfin
 * en thème sombre, et les trois graphiques sont sortis dans
 * `components/players/PlayerCharts.tsx` (règle du repo : décomposer avant de
 * restyler).
 *
 * Corrections de fond, au-delà des couleurs :
 *
 * - **Le bandeau était le dernier consommateur du ton `onColor`** de
 *   `SeasonHeaderButton`. Il reste une surface de marque, mais définie par le
 *   thème et non plus par un `#1a2744` en dur. La pastille de saison a depuis
 *   quitté le bandeau : elle ne s'affichait que pour le joueur (`!isManager`),
 *   à qui elle ne servait pas — il ne consulte que la saison en cours. Le ton
 *   `onColor` n'a plus d'appelant et a été supprimé du composant.
 * - Le statut « blessé » était violet ici et bleu sur la feuille de présence.
 *   Une seule teinte désormais, via `sessionColor`.
 * - Les libellés de KPI faisaient **8 px**, ceux du calendrier de séances aussi.
 *   Tout remonte au plancher de 12 px.
 * - Les puces de suppression d'événement et de retrait d'équipe faisaient 21 pt
 *   de cible tactile. Portées à 44.
 * - Le formulaire d'événement écrivait en base par `supabase.from(...)` depuis
 *   le composant. Dette signalée, non corrigée ici : la router vers un service
 *   est un chantier Batch 2, pas un chantier de design.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { supabase } from '../lib/supabase';
import { getPlayerPainReports, deleteMyPainReport } from '../lib/services/painReports';
import PainReportModal from './PainReportModal';
import { INTENSITY_COLORS, INTENSITY_LABELS, zoneLabel } from '../lib/painMap';
import { Text, Button, Badge, EmptyState, SkeletonList } from './ui';
import { positionStyle, strongFootLabel } from './players/positions';
import { fmPalette, sessionColor, type FMPalette, type SessionStatus } from './players/fmPalette';
import { PlayerAccountLink } from './players/PlayerAccountLink';
import { PlayerTestsSection } from './players/PlayerTestsSection';
import {
  RadarChart,
  FeedbackLineChart,
  RatingLineChart,
  FIELD_AXES,
  GK_AXES,
} from './players/PlayerCharts';
import type { Player, Team, PlayerEvent, PlayerEventType, PainReportGroup } from '../types';
import type { MatchTypeFilter, PlayerRadarResult } from '../lib/services/players';
import type { PlayerFeedbackRow } from '../lib/services/feedback';

// ─── Types publics ────────────────────────────────────────────────────────────

export type { SessionStatus };
export type TrainingSession = { date: string; status: SessionStatus };
export type PlayerStats = {
  matches_played: number;
  goals: number;
  training_attendance: number;
  attendance_percentage: number;
  victories: number;
  draws: number;
  defeats: number;
};

export interface PlayerDetailViewProps {
  player: Player;
  playerTeams: Team[];
  availableTeams: Team[];
  stats: PlayerStats | null;
  radarData: PlayerRadarResult | null;
  radarLoading: boolean;
  feedbackRows: PlayerFeedbackRow[];
  feedbackLoading: boolean;
  /** Note data par match, ordre chronologique. */
  ratingSeries?: { date: string; rating: number }[];
  allSessions: TrainingSession[];
  initialEvents: PlayerEvent[];
  matchFilter: MatchTypeFilter;
  updatingTeamId: string | null;
  isManager: boolean;
  onMatchFilterChange: (f: MatchTypeFilter) => void;
  onBack?: () => void;
  onEdit?: () => void;
  onAddToTeam?: (teamId: string) => void;
  onRemoveFromTeam?: (team: Team) => void;
}

// ─── Aides ────────────────────────────────────────────────────────────────────

const MATCH_FILTERS: MatchTypeFilter[] = ['all', 'Championnat', 'Coupe', 'Amical'];

const EVENT_TYPES: { key: PlayerEventType; label: string; icon: keyof typeof Ionicons.glyphMap; seriesIndex: number }[] = [
  { key: 'interview', label: 'Entretien', icon: 'mic-outline', seriesIndex: 4 },
  { key: 'injury', label: 'Blessure', icon: 'medkit-outline', seriesIndex: 3 },
  { key: 'suspension', label: 'Suspension', icon: 'ban-outline', seriesIndex: 2 },
  { key: 'feedback', label: 'Commentaire', icon: 'chatbubble-outline', seriesIndex: 1 },
];

const eventMeta = (t: PlayerEventType) => EVENT_TYPES.find((e) => e.key === t) ?? EVENT_TYPES[0];

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

function groupByMonth(sessions: TrainingSession[]) {
  const map = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const key = fmtMonth(s.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

const isGoalkeeper = (position?: string) => (position ?? '').toLowerCase().startsWith('gardien');

// ─── Composant principal ──────────────────────────────────────────────────────

export function PlayerDetailView({
  player,
  playerTeams,
  availableTeams,
  stats,
  radarData,
  radarLoading,
  feedbackRows,
  feedbackLoading,
  ratingSeries = [],
  allSessions,
  initialEvents,
  matchFilter,
  updatingTeamId,
  isManager,
  onMatchFilterChange,
  onBack,
  onEdit,
  onAddToTeam,
  onRemoveFromTeam,
}: PlayerDetailViewProps) {
  const { theme } = useTheme();
  const p = useMemo(() => fmPalette(theme.colors, theme.scheme), [theme]);

  const [events, setEvents] = useState<PlayerEvent[]>(initialEvents);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventType, setEventType] = useState<PlayerEventType>('interview');
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [eventReport, setEventReport] = useState('');
  const [injuryType, setInjuryType] = useState('');
  const [unavailDays, setUnavailDays] = useState('');
  const [matchesSusp, setMatchesSusp] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [painReports, setPainReports] = useState<PainReportGroup[]>([]);
  const [painModalOpen, setPainModalOpen] = useState(false);

  const loadPain = useCallback(
    () =>
      getPlayerPainReports(player.id)
        .then(setPainReports)
        .catch(() => setPainReports([])),
    [player.id]
  );

  useEffect(() => {
    loadPain();
  }, [loadPain]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const deletePain = useCallback((reportGroup: string) => {
    Alert.alert('Supprimer ce signalement ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteMyPainReport(reportGroup);
          if (res.success) {
            haptics.success();
            setPainReports((prev) => prev.filter((g) => g.report_group !== reportGroup));
          } else {
            haptics.error();
            Alert.alert('Erreur', res.error || 'Suppression impossible.');
          }
        },
      },
    ]);
  }, []);

  const saveEvent = async () => {
    setSavingEvent(true);
    try {
      // Dette connue : accès direct à la base depuis un composant. À router vers
      // un service (chantier Batch 2), pas dans le périmètre du design.
      const payload: Record<string, unknown> = {
        player_id: player.id,
        event_type: eventType,
        event_date: eventDate.toISOString().split('T')[0],
        report: eventReport.trim() || null,
      };
      if (eventType === 'injury') {
        payload.injury_type = injuryType.trim() || null;
        payload.unavailability_days = unavailDays ? Number(unavailDays) : null;
      }
      if (eventType === 'suspension') {
        payload.matches_suspended = matchesSusp ? Number(matchesSusp) : null;
      }
      const { data, error } = await supabase.from('player_events').insert(payload).select().single();
      if (error) throw error;
      setEvents((prev) => [data as PlayerEvent, ...prev]);
      haptics.success();
      setShowEventForm(false);
      setEventReport('');
      setInjuryType('');
      setUnavailDays('');
      setMatchesSusp('');
      setEventType('interview');
      setEventDate(new Date());
    } catch (e) {
      haptics.error();
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer");
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = (ev: PlayerEvent) => {
    Alert.alert('Supprimer', 'Supprimer cet événement ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('player_events').delete().eq('id', ev.id);
          haptics.success();
          setEvents((prev) => prev.filter((e) => e.id !== ev.id));
        },
      },
    ]);
  };

  // ── Dérivés ───────────────────────────────────────────────────────────────

  const pos = positionStyle(player.position, theme.colors);
  const totalMatches = stats ? stats.victories + stats.draws + stats.defeats : 0;
  const winPct = totalMatches > 0 ? Math.round((stats!.victories / totalMatches) * 100) : null;

  const attendance = useMemo(() => {
    const recorded = allSessions.filter((s) => s.status !== 'not_recorded');
    const by = (s: SessionStatus) => allSessions.filter((x) => x.status === s).length;
    const present = by('present');
    const late = by('late');
    const attended = present + late;
    return {
      recorded: recorded.length,
      present,
      late,
      absent: by('absent'),
      injured: by('injured'),
      attended,
      pct: recorded.length > 0 ? Math.round((attended / recorded.length) * 100) : 0,
    };
  }, [allSessions]);

  const monthGroups = useMemo(() => groupByMonth(allSessions), [allSessions]);
  const styles = useMemo(() => makeStyles(p), [p]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: p.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Bandeau de marque ────────────────────────────────────────────── */}
      {/* Le bandeau ajoutait `insets.top` de haut, alors que les deux écrans qui
          le montent ont un header natif au-dessus — celui-ci consomme déjà
          l'encoche. Ça posait ~59 pt d'aplat de marque vide sous le header sur
          la fiche coach, et l'aurait fait sur la fiche joueur en lui rendant son
          header. `useSafeAreaInsets` ne sait pas qu'un header est présent : il
          renvoie les marges de la fenêtre, pas celles du contenu. */}
      <View style={styles.header}>
        {/* Cette ligne ne s'affiche que si elle a quelque chose à porter. Dans
            l'espace coach, l'écran vit sous un header natif qui assure déjà le
            retour et l'édition : la rendre vide empilait deux barres de
            navigation et mangeait 36 pt de haut d'écran pour rien.

            Le `|| !isManager` a disparu de cette condition en même temps que la
            pastille de saison : c'était son seul motif. Sans lui, la fiche du
            joueur rendait de nouveau une barre vide. */}
        {(onBack || (isManager && onEdit)) && (
        <View style={styles.headerNav}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Retour à l'effectif"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={19} color={p.onBrandMuted} />
              <Text variant="callout" color={p.onBrandMuted}>
                Effectif
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          {isManager && onEdit && (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel="Modifier la fiche du joueur"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[styles.editBtn, { backgroundColor: p.onBrandFill, borderColor: p.onBrandBorder }]}
            >
              <Ionicons name="pencil-outline" size={13} color={p.onBrand} />
              <Text variant="caption" color={p.onBrand} weight="700">
                Modifier
              </Text>
            </Pressable>
          )}
        </View>
        )}

        <View style={styles.playerCard}>
          <View style={[styles.numberRing, { borderColor: p.onBrandBorder, backgroundColor: p.onBrandFill }]}>
            <Text variant="display" color={p.onBrand} numeric>
              {player.number ?? '—'}
            </Text>
          </View>
          <View style={styles.identity}>
            <Text variant="display" color={p.onBrand} numberOfLines={1}>
              {player.last_name.toUpperCase()}
            </Text>
            <Text variant="body" color={p.onBrandMuted} numberOfLines={1}>
              {player.first_name}
            </Text>
            <View style={styles.tagRow}>
              <View style={[styles.posBadge, { borderColor: pos.color }]}>
                <Text variant="caption" color={pos.color} weight="700">
                  {pos.abbr}
                </Text>
              </View>
              <Text variant="caption" color={p.onBrandMuted}>
                {player.birth_date ? `${calcAge(player.birth_date)} ans · ` : ''}
                {strongFootLabel(player.strong_foot)}
              </Text>
              {player.status && player.status !== 'Actif' && (
                <View
                  style={[
                    styles.statusBadge,
                    { borderColor: player.status === 'Blessé' ? p.negative : p.warning },
                  ]}
                >
                  <Text
                    variant="caption"
                    color={player.status === 'Blessé' ? p.negative : p.warning}
                    weight="700"
                  >
                    {player.status}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {!isManager && (
          <Button
            label="Signaler une douleur"
            icon="body-outline"
            variant="destructive"
            block
            onPress={() => setPainModalOpen(true)}
            style={styles.painBtn}
          />
        )}

        <View style={styles.filterRow}>
          {MATCH_FILTERS.map((v) => {
            const active = matchFilter === v;
            return (
              <Pressable
                key={v}
                onPress={() => onMatchFilterChange(v)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={v === 'all' ? 'Toutes compétitions' : v}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? p.accentFill : p.onBrandFill,
                    borderColor: active ? p.accentFill : p.onBrandBorder,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  color={active ? p.onFill : p.onBrandMuted}
                  weight="600"
                >
                  {v === 'all' ? 'Tous' : v}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Performances ───────────────────────────────────────────────── */}
        <FMSection title="Performances matchs" p={p}>
          {!stats ? (
            <SkeletonList rows={2} />
          ) : (
            <>
              <View style={styles.kpiGrid}>
                <KPIBlock p={p} label="Matchs" value={String(stats.matches_played)} />
                <KPIBlock p={p} label="Buts" value={String(stats.goals)} color={p.accent} />
                <KPIBlock p={p} label="Victoires" value={String(stats.victories)} color={p.positive} />
                <KPIBlock
                  p={p}
                  label="Taux de victoire"
                  value={winPct !== null ? `${winPct}%` : '—'}
                  color={winPct === null ? undefined : winPct >= 50 ? p.positive : p.negative}
                />
              </View>
              {totalMatches > 0 && (
                <View
                  style={styles.vndBlock}
                  accessible
                  accessibilityLabel={`${stats.victories} victoires, ${stats.draws} nuls, ${stats.defeats} défaites`}
                >
                  <View style={styles.vndBar}>
                    {stats.victories > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.victories, backgroundColor: p.positive }]}>
                        <Text variant="caption" color={p.onFill} weight="700">
                          {stats.victories}V
                        </Text>
                      </View>
                    )}
                    {stats.draws > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.draws, backgroundColor: p.neutral }]}>
                        <Text variant="caption" color={p.onFill} weight="700">
                          {stats.draws}N
                        </Text>
                      </View>
                    )}
                    {stats.defeats > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.defeats, backgroundColor: p.negative }]}>
                        <Text variant="caption" color={p.onFill} weight="700">
                          {stats.defeats}D
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </FMSection>

        {/* ── Radar ──────────────────────────────────────────────────────── */}
        <FMSection title="Radar de performance" p={p}>
          {radarLoading ? (
            <SkeletonList rows={3} />
          ) : radarData && Object.values(radarData.normalized).some((v) => v > 0) ? (
            <RadarChart
              data={radarData}
              axes={isGoalkeeper(player.position) ? GK_AXES : FIELD_AXES}
            />
          ) : (
            <EmptyState
              icon="analytics-outline"
              title="Pas encore de données"
              description="Le radar se remplit à partir des événements saisis dans le match recorder."
              compact
            />
          )}
        </FMSection>

        {/* ── Note de match ──────────────────────────────────────────────── */}
        {!isGoalkeeper(player.position) && ratingSeries.length > 0 && (
          <FMSection title="Note de match" p={p}>
            <RatingLineChart series={ratingSeries} />
          </FMSection>
        )}

        {/* ── Tests physiques ────────────────────────────────────────────── */}
        {/* Le repère d'effectif n'est passé qu'à l'encadrement : RLS n'ouvre les
            résultats d'un joueur qu'à lui-même et au staff, donc une « moyenne
            du groupe » calculée par un joueur vaudrait sa propre valeur. */}
        <FMSection title="Tests physiques" p={p}>
          <PlayerTestsSection playerId={player.id} showSquadReference={isManager} p={p} />
        </FMSection>

        {/* ── Questionnaire ──────────────────────────────────────────────── */}
        <FMSection title="Questionnaire de séance" p={p}>
          {feedbackLoading ? (
            <SkeletonList rows={3} />
          ) : feedbackRows.length < 2 ? (
            <EmptyState
              icon="clipboard-outline"
              title={feedbackRows.length === 0 ? 'Aucun questionnaire rempli' : 'Une seule séance'}
              description="Il faut au moins deux séances renseignées pour tracer une évolution."
              compact
            />
          ) : (
            <FeedbackLineChart rows={feedbackRows} />
          )}
        </FMSection>

        {/* ── Présence ───────────────────────────────────────────────────── */}
        <FMSection title="Présence aux séances" p={p}>
          <View style={styles.attHeader}>
            <View>
              <Text variant="hero" color={p.accent}>
                {attendance.pct}
                <Text variant="title" color={p.accent}>
                  %
                </Text>
              </Text>
              <Text variant="caption" tone="tertiary">
                {attendance.attended} sur {attendance.recorded} séances
              </Text>
            </View>
            <View style={styles.attRight}>
              <View style={[styles.attBarBg, { backgroundColor: p.surface2 }]}>
                <View
                  style={[styles.attBarFill, { width: `${attendance.pct}%`, backgroundColor: p.accent }]}
                />
              </View>
              <View style={styles.attLegend}>
                <AttLegendItem p={p} color={sessionColor('present', p)} label="Présent" value={attendance.present} />
                <AttLegendItem p={p} color={sessionColor('late', p)} label="Retard" value={attendance.late} />
                <AttLegendItem p={p} color={sessionColor('absent', p)} label="Absent" value={attendance.absent} />
                <AttLegendItem p={p} color={sessionColor('injured', p)} label="Blessé" value={attendance.injured} />
              </View>
            </View>
          </View>

          {allSessions.length > 0 && (
            <>
              <View style={[styles.divider, { backgroundColor: p.divider }]} />
              <Text variant="caption" tone="tertiary">
                {allSessions.length} séances cette saison
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calScroll}>
                <View style={styles.calRow}>
                  {monthGroups.map((group) => (
                    <View key={group.month} style={styles.calMonth}>
                      <Text variant="caption" tone="tertiary" weight="700" style={styles.center}>
                        {group.month}
                      </Text>
                      <View style={styles.calDots}>
                        {group.items.map((s, i) => (
                          <View
                            key={i}
                            style={[styles.calDot, { backgroundColor: sessionColor(s.status, p) }]}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </FMSection>

        {/* ── Événements ─────────────────────────────────────────────────── */}
        <FMSection
          title="Événements"
          p={p}
          count={events.length}
          action={
            isManager ? (
              <Button
                label={showEventForm ? 'Annuler' : 'Ajouter'}
                icon={showEventForm ? 'close' : 'add'}
                variant="ghost"
                size="sm"
                onPress={() => setShowEventForm((v) => !v)}
              />
            ) : undefined
          }
        >
          {isManager && showEventForm && (
            <View style={[styles.eventForm, { backgroundColor: p.surface2, borderColor: p.border }]}>
              <Text variant="callout" tone="secondary" weight="700">
                Type
              </Text>
              <View style={styles.typeRow}>
                {EVENT_TYPES.filter((t) => t.key !== 'feedback').map((t) => {
                  const active = eventType === t.key;
                  const color = p.series[t.seriesIndex] ?? p.accent;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setEventType(t.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, checked: active }}
                      accessibilityLabel={t.label}
                      style={[
                        styles.typeChip,
                        {
                          borderColor: active ? color : p.border,
                          backgroundColor: active ? p.surface : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons name={t.icon} size={14} color={active ? color : p.text3} />
                      <Text variant="caption" color={active ? color : p.text2} weight="700">
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text variant="callout" tone="secondary" weight="700">
                Date
              </Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Date de l'événement : ${fmtLongDate(eventDate.toISOString())}. Appuyer pour modifier`}
                style={[styles.formRow, { backgroundColor: p.surface, borderColor: p.border }]}
              >
                <Ionicons name="calendar-outline" size={16} color={p.text2} />
                <Text variant="body">{fmtLongDate(eventDate.toISOString())}</Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_e, d) => {
                    setShowDatePicker(false);
                    if (d) setEventDate(d);
                  }}
                  textColor={p.text1}
                  themeVariant={theme.scheme}
                  accentColor={p.accent}
                />
              )}

              {eventType === 'injury' && (
                <>
                  <FormInput p={p} label="Type de blessure" value={injuryType} onChangeText={setInjuryType} placeholder="ex : entorse de la cheville" />
                  <FormInput p={p} label="Jours d'indisponibilité" value={unavailDays} onChangeText={setUnavailDays} placeholder="14" keyboardType="numeric" />
                </>
              )}
              {eventType === 'suspension' && (
                <FormInput p={p} label="Matchs suspendus" value={matchesSusp} onChangeText={setMatchesSusp} placeholder="2" keyboardType="numeric" />
              )}
              <FormInput
                p={p}
                label="Notes"
                value={eventReport}
                onChangeText={setEventReport}
                placeholder="Observations, contexte…"
                multiline
              />

              <Button
                label={savingEvent ? 'Enregistrement…' : 'Enregistrer'}
                onPress={saveEvent}
                loading={savingEvent}
                disabled={savingEvent}
                block
              />
            </View>
          )}

          {events.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="Aucun événement"
              description={isManager ? 'Entretiens, blessures et suspensions se consignent ici.' : undefined}
              compact
            />
          ) : (
            events.map((ev, i) => (
              <EventRow
                key={ev.id}
                p={p}
                event={ev}
                isLast={i === events.length - 1}
                onDelete={isManager ? () => deleteEvent(ev) : undefined}
              />
            ))
          )}
        </FMSection>

        {/* ── Douleurs ───────────────────────────────────────────────────── */}
        <FMSection
          title="Suivi des douleurs"
          p={p}
          count={painReports.length}
          action={
            painReports.length > 0 && painReports[0].max_intensity >= 3 ? (
              <Badge label="Intense récent" tone="negative" size="sm" icon="warning-outline" />
            ) : undefined
          }
        >
          {painReports.length === 0 ? (
            <EmptyState icon="body-outline" title="Aucune douleur signalée" compact />
          ) : (
            <View style={styles.painList}>
              {!isManager && (
                <Text variant="caption" tone="tertiary">
                  Glisse un signalement vers la gauche pour le supprimer.
                </Text>
              )}
              {painReports.map((g) => {
                const card = (
                  <View style={[styles.painCard, { backgroundColor: p.surface2, borderColor: p.border }]}>
                    <View style={styles.painHead}>
                      <Text variant="body" weight="700" style={styles.flex}>
                        {fmtLongDate(g.reported_at)}
                      </Text>
                      <Text variant="callout" color={INTENSITY_COLORS[g.max_intensity]} weight="700">
                        {INTENSITY_LABELS[g.max_intensity]}
                      </Text>
                    </View>
                    <View style={styles.painMeta}>
                      <Badge label={g.source === 'questionnaire' ? 'Fin de séance' : 'Spontané'} size="sm" />
                      {g.onset && <Badge label={g.onset === 'aigu' ? 'Aigu' : 'Chronique'} size="sm" />}
                    </View>
                    <View style={styles.painChips}>
                      {g.zones.map((z, i) => (
                        <View
                          key={i}
                          style={[styles.painChip, { borderColor: INTENSITY_COLORS[z.intensity] }]}
                        >
                          <View style={[styles.painDot, { backgroundColor: INTENSITY_COLORS[z.intensity] }]} />
                          <Text variant="caption" color={INTENSITY_COLORS[z.intensity]} weight="700">
                            {zoneLabel(z.zone)}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {g.note ? (
                      <Text variant="callout" tone="secondary">
                        {g.note}
                      </Text>
                    ) : null}
                  </View>
                );

                if (isManager) return <View key={g.report_group}>{card}</View>;

                return (
                  <Swipeable
                    key={g.report_group}
                    renderRightActions={() => (
                      <Pressable
                        onPress={() => deletePain(g.report_group)}
                        accessibilityRole="button"
                        accessibilityLabel="Supprimer ce signalement"
                        style={[styles.painDelete, { backgroundColor: p.negative }]}
                      >
                        <Ionicons name="trash-outline" size={18} color={p.onFill} />
                        <Text variant="caption" color={p.onFill} weight="700">
                          Supprimer
                        </Text>
                      </Pressable>
                    )}
                  >
                    {card}
                  </Swipeable>
                );
              })}
            </View>
          )}
        </FMSection>

        {/* ── Équipes ────────────────────────────────────────────────────── */}
        {isManager && (
          <FMSection title="Équipes" p={p}>
            {playerTeams.length === 0 ? (
              <EmptyState icon="shield-outline" title="Aucune équipe" compact />
            ) : (
              <View style={styles.teamList}>
                {playerTeams.map((t) => (
                  <View
                    key={t.id}
                    style={[styles.teamRow, { backgroundColor: p.surface2, borderColor: p.border }]}
                  >
                    <View style={[styles.teamDot, { backgroundColor: t.color || p.neutral }]} />
                    <Text variant="body" weight="600" style={styles.flex}>
                      {t.name}
                    </Text>
                    {onRemoveFromTeam && (
                      <Pressable
                        onPress={() => onRemoveFromTeam(t)}
                        disabled={updatingTeamId !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer le joueur de ${t.name}`}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.teamRemove}
                      >
                        <Ionicons
                          name={updatingTeamId === t.id ? 'hourglass-outline' : 'close-circle-outline'}
                          size={20}
                          color={p.negative}
                        />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
            {onAddToTeam && (
              <Button
                label="Assigner à une équipe"
                icon="add-circle-outline"
                variant="secondary"
                block
                disabled={availableTeams.length === 0}
                onPress={() => setAssignModal(true)}
              />
            )}
          </FMSection>
        )}

        {/* ── Compte joueur ──────────────────────────────────────────────── */}
        {isManager && (
          <FMSection title="Compte joueur" p={p} last>
            <PlayerAccountLink
              playerId={player.id}
              playerName={`${player.first_name} ${player.last_name}`}
              linked={!!player.user_id}
              p={p}
            />
          </FMSection>
        )}
      </ScrollView>

      {isManager && (
        <Modal visible={assignModal} transparent animationType="fade" onRequestClose={() => setAssignModal(false)}>
          <Pressable
            style={[styles.modalOverlay, { backgroundColor: theme.colors.overlay }]}
            onPress={() => setAssignModal(false)}
            accessibilityLabel="Fermer"
          >
            <View
              style={[styles.modalBox, { backgroundColor: p.surface, borderColor: p.border }]}
              onStartShouldSetResponder={() => true}
            >
              <Text variant="title">Choisir une équipe</Text>
              {availableTeams.length === 0 ? (
                <EmptyState icon="shield-outline" title="Aucune équipe disponible" compact />
              ) : (
                <FlatList
                  data={availableTeams}
                  keyExtractor={(t) => t.id}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setAssignModal(false);
                        onAddToTeam!(item.id);
                      }}
                      disabled={updatingTeamId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Assigner à ${item.name}`}
                      style={[styles.modalRow, { borderBottomColor: p.divider }]}
                    >
                      <View style={[styles.teamDot, { backgroundColor: item.color || p.neutral }]} />
                      <Text variant="body" style={styles.flex}>
                        {item.name}
                      </Text>
                      <Ionicons
                        name={updatingTeamId === item.id ? 'hourglass-outline' : 'add'}
                        size={20}
                        color={p.accent}
                      />
                    </Pressable>
                  )}
                />
              )}
              <Button label="Fermer" variant="ghost" block onPress={() => setAssignModal(false)} />
            </View>
          </Pressable>
        </Modal>
      )}

      {!isManager && (
        <PainReportModal
          visible={painModalOpen}
          onClose={() => setPainModalOpen(false)}
          onSubmitted={loadPain}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function FMSection({
  title,
  children,
  count,
  last = false,
  action,
  p,
}: {
  title: string;
  children: React.ReactNode;
  count?: number;
  last?: boolean;
  action?: React.ReactNode;
  p: FMPalette;
}) {
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={[styles.section, { backgroundColor: p.surface, borderColor: p.border }, last && styles.sectionLast]}>
      <View style={[styles.sectionHead, { backgroundColor: p.surface2, borderBottomColor: p.divider }]}>
        <View style={[styles.sectionAccent, { backgroundColor: p.accent }]} />
        <Text variant="headline" style={styles.flex} numberOfLines={1}>
          {title}
        </Text>
        {count !== undefined && <Badge label={String(count)} tone="neutral" size="sm" />}
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function KPIBlock({ label, value, color, p }: { label: string; value: string; color?: string; p: FMPalette }) {
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View
      style={[styles.kpiBlock, { backgroundColor: p.surface2, borderColor: p.border }]}
      accessible
      accessibilityLabel={`${label} : ${value}`}
    >
      <Text variant="display" color={color ?? p.text1} numeric>
        {value}
      </Text>
      <Text variant="caption" tone="tertiary" numberOfLines={2} style={styles.center}>
        {label}
      </Text>
    </View>
  );
}

function AttLegendItem({ color, label, value, p }: { color: string; label: string; value: number; p: FMPalette }) {
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={styles.legendRow} accessible accessibilityLabel={`${label} : ${value}`}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text variant="caption" tone="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text variant="caption" color={color} weight="700" numeric>
        {value}
      </Text>
    </View>
  );
}

function FormInput({
  label,
  p,
  multiline,
  ...rest
}: {
  label: string;
  p: FMPalette;
  multiline?: boolean;
} & React.ComponentProps<typeof TextInput>) {
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={styles.formField}>
      <Text variant="callout" tone="secondary" weight="700">
        {label}
      </Text>
      <TextInput
        {...rest}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor={p.text3}
        style={[
          styles.formInput,
          { backgroundColor: p.surface, borderColor: p.border, color: p.text1 },
          multiline && styles.formTextarea,
        ]}
      />
    </View>
  );
}

function EventRow({
  event,
  isLast,
  onDelete,
  p,
}: {
  event: PlayerEvent;
  isLast: boolean;
  onDelete?: () => void;
  p: FMPalette;
}) {
  const styles = useMemo(() => makeStyles(p), [p]);
  const meta = eventMeta(event.event_type);
  const color = p.series[meta.seriesIndex] ?? p.accent;

  return (
    <View style={styles.eventRow}>
      <View style={styles.eventLeft}>
        <View style={[styles.eventDot, { borderColor: color, backgroundColor: p.surface2 }]}>
          <Ionicons name={meta.icon} size={12} color={color} />
        </View>
        {!isLast && <View style={[styles.eventLine, { backgroundColor: p.border }]} />}
      </View>
      <View style={styles.eventBody}>
        <View style={styles.eventHead}>
          <Text variant="callout" color={color} weight="700" style={styles.flex}>
            {meta.label}
          </Text>
          <Text variant="caption" tone="tertiary">
            {fmtDate(event.event_date)}
          </Text>
          {onDelete && (
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={`Supprimer l'événement ${meta.label} du ${fmtDate(event.event_date)}`}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="trash-outline" size={15} color={p.text3} />
            </Pressable>
          )}
        </View>
        {event.report ? (
          <Text variant="callout" tone="secondary">
            {event.report}
          </Text>
        ) : null}
        <View style={styles.eventChips}>
          {event.injury_type ? <Badge label={event.injury_type} tone="negative" size="sm" /> : null}
          {event.unavailability_days != null && event.unavailability_days > 0 ? (
            <Badge label={`${event.unavailability_days} j d'indispo.`} size="sm" />
          ) : null}
          {event.matches_suspended != null && event.matches_suspended > 0 ? (
            <Badge label={`${event.matches_suspended} match(s) suspendu(s)`} tone="warning" size="sm" />
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (p: FMPalette) =>
  StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    center: { textAlign: 'center' },
    content: { padding: 10, gap: 10, paddingBottom: 40 },

    header: { backgroundColor: p.brand, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 12 },
    headerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
    navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    editBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      minHeight: 34,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },

    playerCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    numberRing: {
      width: 58,
      height: 58,
      borderRadius: 29,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    identity: { flex: 1, gap: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
    posBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
    painBtn: { marginTop: 2 },

    filterRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: {
      paddingHorizontal: 14,
      minHeight: 36,
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },

    section: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    sectionLast: { marginBottom: 20 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sectionAccent: { width: 3, height: 16, borderRadius: 2 },
    sectionBody: { padding: 14, gap: 10 },

    kpiGrid: { flexDirection: 'row', gap: 6 },
    kpiBlock: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 2,
    },

    vndBlock: { gap: 6 },
    vndBar: { flexDirection: 'row', height: 30, borderRadius: 8, overflow: 'hidden', gap: 2 },
    vndSeg: { justifyContent: 'center', alignItems: 'center' },

    attHeader: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    attRight: { flex: 1, justifyContent: 'center', gap: 10 },
    attBarBg: { height: 8, borderRadius: 99, overflow: 'hidden' },
    attBarFill: { height: '100%', borderRadius: 99 },
    attLegend: { gap: 5 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
    calScroll: { marginTop: 8 },
    calRow: { flexDirection: 'row', gap: 12, paddingBottom: 4 },
    calMonth: { gap: 5 },
    calDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, maxWidth: 84 },
    calDot: { width: 12, height: 12, borderRadius: 3 },

    eventForm: { borderRadius: 10, padding: 12, gap: 10, borderWidth: StyleSheet.hairlineWidth },
    typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      minHeight: 40,
      borderRadius: 999,
      borderWidth: 1.5,
    },
    formField: { gap: 6 },
    formRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      minHeight: 48,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    formInput: {
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      fontSize: 15,
    },
    formTextarea: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },

    eventRow: { flexDirection: 'row', gap: 12 },
    eventLeft: { width: 28, alignItems: 'center' },
    eventDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1,
    },
    eventLine: { flex: 1, width: 1, marginTop: 2 },
    eventBody: { flex: 1, paddingBottom: 16, gap: 4 },
    eventHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
    eventChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

    painList: { gap: 10 },
    painCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
    painHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    painMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    painChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    painChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    painDot: { width: 7, height: 7, borderRadius: 4 },
    painDelete: {
      justifyContent: 'center',
      alignItems: 'center',
      width: 96,
      borderRadius: 12,
      marginLeft: 8,
      gap: 4,
    },

    teamList: { gap: 8 },
    teamRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    teamDot: { width: 10, height: 10, borderRadius: 5 },
    teamRemove: { padding: 2 },

    modalOverlay: { flex: 1, justifyContent: 'center', padding: 24 },
    modalBox: {
      borderRadius: 16,
      padding: 20,
      maxHeight: '70%',
      gap: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  });
