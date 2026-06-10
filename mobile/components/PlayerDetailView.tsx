import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import type { Player, Team, PlayerEvent, PlayerEventType } from '../types';
import type {
  MatchTypeFilter,
  PlayerRadarResult,
  RadarPerMatchStats,
} from '../lib/services/players';
import type { PlayerFeedbackRow } from '../lib/services/feedback';

// ─── Design tokens — FM Light ──────────────────────────────────────────────

const C = {
  bg:        '#edf0f5',
  surface:   '#ffffff',
  surface2:  '#f4f6fa',
  border:    '#dde3ec',
  navy:      '#1a2744',
  amber:     '#d97706',
  amberLt:   '#fef3c7',
  amberDim:  'rgba(217,119,6,0.10)',
  green:     '#059669',
  red:       '#dc2626',
  blue:      '#1e40af',
  purple:    '#7c3aed',
  text1:     '#0f172a',
  text2:     '#475569',
  text3:     '#94a3b8',
  divider:   '#e8edf4',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export type SessionStatus = 'present' | 'late' | 'absent' | 'injured' | 'not_recorded';
export type TrainingSession = { date: string; status: SessionStatus };
export type PlayerStats = {
  matches_played: number; goals: number;
  training_attendance: number; attendance_percentage: number;
  victories: number; draws: number; defeats: number;
};

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const POSITION_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  Gardien:   { abbr: 'GB',  color: '#92400e', bg: '#fef3c7' },
  Ailier:    { abbr: 'AIL', color: '#1e40af', bg: '#dbeafe' },
  Meneur:    { abbr: 'MEN', color: '#065f46', bg: '#d1fae5' },
  Pivot:     { abbr: 'PIV', color: '#7c2d12', bg: '#ffedd5' },
};

function getPosition(position?: string) {
  if (!position) return { abbr: '—', color: C.text3, bg: C.surface2 };
  const key = Object.keys(POSITION_MAP).find(k =>
    position.toLowerCase().startsWith(k.toLowerCase())
  );
  return key ? POSITION_MAP[key] : { abbr: position.slice(0, 3).toUpperCase(), color: C.text2, bg: C.surface2 };
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMonth(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

const SESSION_COLORS: Record<SessionStatus, string> = {
  present:      '#059669',
  late:         '#d97706',
  absent:       '#dc2626',
  injured:      '#7c3aed',
  not_recorded: '#e2e8f0',
};

const EVENT_CONFIG: Record<PlayerEventType, { icon: 'mic-outline' | 'medkit-outline' | 'ban-outline' | 'chatbubble-outline'; color: string; bg: string; label: string }> = {
  interview:  { icon: 'mic-outline',         color: C.blue,  bg: '#dbeafe', label: 'Entretien'   },
  injury:     { icon: 'medkit-outline',       color: C.red,   bg: '#fee2e2', label: 'Blessure'    },
  suspension: { icon: 'ban-outline',          color: C.amber, bg: '#fef3c7', label: 'Suspension'  },
  feedback:   { icon: 'chatbubble-outline',   color: C.green, bg: '#ecfdf5', label: 'Commentaire' },
};

function groupByMonth(sessions: TrainingSession[]): { month: string; items: TrainingSession[] }[] {
  const map = new Map<string, TrainingSession[]>();
  for (const s of sessions) {
    const key = fmtMonth(s.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

// ─── Radar helpers ─────────────────────────────────────────────────────────

type RadarNormKey = keyof PlayerRadarResult['normalized'];
type RadarAxis = {
  normKey: RadarNormKey;
  rawKey: keyof RadarPerMatchStats;
  label: string;
  fullLabel: string;
  gridLabel: string;
};

const FIELD_axes: RadarAxis[] = [
  { normKey: 'avgPlaytime',           rawKey: 'avgPlaytimeSec',        label: 'Tps/m',    fullLabel: 'Temps/match',        gridLabel: 'Tps/match' },
  { normKey: 'goalsPerMatch',         rawKey: 'goalsPerMatch',         label: 'Buts/m',   fullLabel: 'Buts/match',         gridLabel: 'Buts'      },
  { normKey: 'shotsOnTargetPerMatch', rawKey: 'shotsOnTargetPerMatch', label: 'T.cad/m',  fullLabel: 'Tirs cadrés/match',  gridLabel: 'T.cadrés'  },
  { normKey: 'totalShotsPerMatch',    rawKey: 'totalShotsPerMatch',    label: 'T.tot/m',  fullLabel: 'Tirs totaux/match',  gridLabel: 'T.totaux'  },
  { normKey: 'assistsPerMatch',       rawKey: 'assistsPerMatch',       label: 'Pdec/m',   fullLabel: 'Passes déc./match',  gridLabel: 'Passes déc.' },
  { normKey: 'recoveriesPerMatch',    rawKey: 'recoveriesPerMatch',    label: 'Récup/m',  fullLabel: 'Récup./match',       gridLabel: 'Récup.'    },
  { normKey: 'ballLossPerMatch',      rawKey: 'ballLossPerMatch',      label: 'Pertes/m', fullLabel: 'Pertes/match',       gridLabel: 'Pertes'    },
  { normKey: 'plusMinus',             rawKey: 'plusMinus',             label: '+/-',      fullLabel: '+/- saison',         gridLabel: '+/-'       },
];

const GK_axes: RadarAxis[] = [
  { normKey: 'avgPlaytime',           rawKey: 'avgPlaytimeSec',           label: 'Min/m',      fullLabel: 'Minutes/match',    gridLabel: 'Tps/match' },
  { normKey: 'savesPerMatch',         rawKey: 'savesPerMatch',            label: 'Arrêts/m',   fullLabel: 'Arrêts/match',     gridLabel: 'Arrêts'    },
  { normKey: 'savePercentage',        rawKey: 'savePercentage',           label: '% Arrêts',   fullLabel: '% Arrêts saison',  gridLabel: '% Arrêts'  },
  { normKey: 'recoveriesPerMatch',    rawKey: 'recoveriesPerMatch',       label: 'Récup/m',    fullLabel: 'Récup./match',     gridLabel: 'Récup.'    },
  { normKey: 'goalsConcededPerMatch', rawKey: 'goalsConcededPerMatch',    label: 'Buts enc/m', fullLabel: 'Buts encaissés/m', gridLabel: 'Buts enc.' },
];

function fmtTimeSec(sec: number): string {
  const min = Math.round(sec / 60);
  if (min >= 60) { const h = Math.floor(min / 60); const m = min % 60; return m > 0 ? `${h}h${m}` : `${h}h`; }
  return `${min}min`;
}

function fmtPerMatch(val: number): string {
  if (val === 0) return '0';
  if (val >= 10) return Math.round(val).toString();
  if (val >= 1)  return val.toFixed(1);
  return val.toFixed(2);
}

function fmtAxisValue(val: number, rawKey: keyof RadarPerMatchStats): string {
  if (rawKey === 'avgPlaytimeSec') return fmtTimeSec(val);
  if (rawKey === 'plusMinus') { const r = Math.round(val); return r >= 0 ? `+${r}` : String(r); }
  if (rawKey === 'savePercentage') return `${Math.round(val)}%`;
  return fmtPerMatch(val);
}

function getRadarGridTotal(data: PlayerRadarResult, rawKey: keyof RadarPerMatchStats): string {
  const raw = data.raw;
  switch (rawKey) {
    case 'avgPlaytimeSec': return fmtTimeSec(raw.avgPlaytimeSec);
    case 'plusMinus': { const pm = raw.plusMinus; return pm >= 0 ? `+${pm}` : String(pm); }
    case 'savePercentage': return `${Math.round(raw.savePercentage)}%`;
    case 'goalsConcededPerMatch': return fmtPerMatch(raw.goalsConcededPerMatch);
    default: return String(Math.round((raw[rawKey] as number) * raw.matchCount));
  }
}

function isGoalkeeper(position?: string) {
  return (position ?? '').toLowerCase().startsWith('gardien');
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface PlayerDetailViewProps {
  player: Player;
  playerTeams: Team[];
  availableTeams: Team[];
  stats: PlayerStats | null;
  radarData: PlayerRadarResult | null;
  radarLoading: boolean;
  feedbackRows: PlayerFeedbackRow[];
  feedbackLoading: boolean;
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

// ─── Main Component ────────────────────────────────────────────────────────

export function PlayerDetailView({
  player, playerTeams, availableTeams,
  stats, radarData, radarLoading,
  feedbackRows, feedbackLoading, allSessions, initialEvents,
  matchFilter, updatingTeamId, isManager,
  onMatchFilterChange, onBack, onEdit, onAddToTeam, onRemoveFromTeam,
}: PlayerDetailViewProps) {
  const insets = useSafeAreaInsets();

  const [events, setEvents]                 = useState<PlayerEvent[]>(initialEvents);
  const [showEventForm, setShowEventForm]   = useState(false);
  const [eventType, setEventType]           = useState<PlayerEventType>('interview');
  const [eventDate, setEventDate]           = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [eventReport, setEventReport]       = useState('');
  const [injuryType, setInjuryType]         = useState('');
  const [unavailDays, setUnavailDays]       = useState('');
  const [matchesSusp, setMatchesSusp]       = useState('');
  const [savingEvent, setSavingEvent]       = useState(false);
  const [assignModal, setAssignModal]       = useState(false);

  const handleSaveEvent = async () => {
    setSavingEvent(true);
    try {
      const payload: Record<string, unknown> = {
        player_id:  player.id,
        event_type: eventType,
        event_date: eventDate.toISOString().split('T')[0],
        report:     eventReport.trim() || null,
      };
      if (eventType === 'injury') {
        payload.injury_type         = injuryType.trim() || null;
        payload.unavailability_days = unavailDays ? Number(unavailDays) : null;
      }
      if (eventType === 'suspension') {
        payload.matches_suspended = matchesSusp ? Number(matchesSusp) : null;
      }
      const { data, error: err } = await supabase.from('player_events').insert(payload).select().single();
      if (err) throw err;
      setEvents(prev => [data as PlayerEvent, ...prev]);
      setShowEventForm(false);
      setEventReport(''); setInjuryType(''); setUnavailDays(''); setMatchesSusp('');
      setEventType('interview'); setEventDate(new Date());
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer');
    } finally { setSavingEvent(false); }
  };

  const handleDeleteEvent = (ev: PlayerEvent) => {
    Alert.alert('Supprimer', 'Supprimer cet événement ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await supabase.from('player_events').delete().eq('id', ev.id);
        setEvents(prev => prev.filter(e => e.id !== ev.id));
      }},
    ]);
  };

  const pos          = getPosition(player.position);
  const totalMatches = stats ? stats.victories + stats.draws + stats.defeats : 0;
  const winPct       = totalMatches > 0 ? Math.round((stats!.victories / totalMatches) * 100) : null;

  const recordedSessions = allSessions.filter(s => s.status !== 'not_recorded');
  const presentCount     = allSessions.filter(s => s.status === 'present').length;
  const lateCount        = allSessions.filter(s => s.status === 'late').length;
  const absentCount      = allSessions.filter(s => s.status === 'absent').length;
  const injuredCount     = allSessions.filter(s => s.status === 'injured').length;
  const attendedCount    = presentCount + lateCount;
  const attPct           = recordedSessions.length > 0 ? Math.round((attendedCount / recordedSessions.length) * 100) : 0;
  const monthGroups      = groupByMonth(allSessions);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* ── Header joueur (navy) ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerNav}>
          {onBack ? (
            <TouchableOpacity style={styles.navBtn} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.7)" />
              <Text style={styles.navBtnText}>Effectif</Text>
            </TouchableOpacity>
          ) : <View />}
          {isManager && onEdit && (
            <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.7}>
              <Ionicons name="pencil-outline" size={13} color={C.navy} />
              <Text style={styles.editBtnText}>Modifier</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.playerCard}>
          <View style={styles.numberRing}>
            <Text style={styles.numberVal}>{player.number ?? '—'}</Text>
          </View>
          <View style={styles.playerIdentity}>
            <Text style={styles.lastName}>{player.last_name.toUpperCase()}</Text>
            <Text style={styles.firstName}>{player.first_name}</Text>
            <View style={styles.tagRow}>
              <View style={[styles.posBadge, { backgroundColor: pos.bg }]}>
                <Text style={[styles.posText, { color: pos.color }]}>{pos.abbr}</Text>
              </View>
              <Text style={styles.tagInfo}>{player.birth_date ? `${calcAge(player.birth_date)} ans · ` : ''}{player.strong_foot || '—'}</Text>
              {player.status && player.status !== 'Actif' && (
                <View style={[styles.statusBadge, player.status === 'Blessé' ? { backgroundColor: '#fee2e2' } : { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.statusText, player.status === 'Blessé' ? { color: C.red } : { color: C.amber }]}>{player.status}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(['all', 'Championnat', 'Coupe', 'Amical'] as MatchTypeFilter[]).map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.chip, matchFilter === v && styles.chipActive]}
              onPress={() => onMatchFilterChange(v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, matchFilter === v && styles.chipTextActive]}>
                {v === 'all' ? 'Tous' : v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Performances ── */}
        <FMSection title="Performances matchs">
          {stats ? (
            <>
              <View style={styles.kpiGrid}>
                <KPIBlock label="Matchs"    value={String(stats.matches_played)} />
                <KPIBlock label="Buts"      value={String(stats.goals)}          color={C.amber} />
                <KPIBlock label="Victoires" value={String(stats.victories)}      color={C.green} />
                <KPIBlock label="Win %"     value={winPct !== null ? `${winPct}%` : '—'} color={winPct !== null && winPct >= 50 ? C.green : C.red} />
              </View>
              {totalMatches > 0 && (
                <View style={styles.vndBlock}>
                  <View style={styles.vndBar}>
                    {stats.victories > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.victories, backgroundColor: C.green }]}>
                        <Text style={styles.vndText}>{stats.victories}V</Text>
                      </View>
                    )}
                    {stats.draws > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.draws, backgroundColor: '#94a3b8' }]}>
                        <Text style={styles.vndText}>{stats.draws}N</Text>
                      </View>
                    )}
                    {stats.defeats > 0 && (
                      <View style={[styles.vndSeg, { flex: stats.defeats, backgroundColor: C.red }]}>
                        <Text style={styles.vndText}>{stats.defeats}D</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.vndLegend}>
                    <Text style={[styles.vndLegTxt, { color: C.green }]}>{stats.victories}V</Text>
                    <Text style={[styles.vndLegTxt, { color: C.text3 }]}>{stats.draws}N</Text>
                    <Text style={[styles.vndLegTxt, { color: C.red }]}>{stats.defeats}D</Text>
                  </View>
                </View>
              )}
            </>
          ) : (
            <ActivityIndicator size="small" color={C.amber} style={{ marginVertical: 20 }} />
          )}
        </FMSection>

        {/* ── Radar ── */}
        <FMSection title="Radar de performance">
          {radarLoading
            ? <ActivityIndicator size="small" color={C.amber} style={{ marginVertical: 20 }} />
            : radarData && Object.values(radarData.normalized).some(v => v > 0)
            ? <RadarChart data={radarData} axes={isGoalkeeper(player.position) ? GK_axes : FIELD_axes} />
            : <EmptyState text="Aucune donnée du match recorder disponible" />
          }
        </FMSection>

        {/* ── Feedback ── */}
        <FMSection title="Questionnaire — Évolution">
          {feedbackLoading
            ? <ActivityIndicator size="small" color={C.amber} style={{ marginVertical: 20 }} />
            : feedbackRows.length < 2
            ? <EmptyState text={feedbackRows.length === 0 ? 'Aucun questionnaire rempli' : 'Minimum 2 séances requises'} />
            : <FeedbackLineChart rows={feedbackRows} />
          }
        </FMSection>

        {/* ── Présence ── */}
        <FMSection title="Présence aux séances">
          <View style={styles.attHeader}>
            <View>
              <Text style={styles.attPct}>{attPct}<Text style={styles.attPctUnit}>%</Text></Text>
              <Text style={styles.attPctSub}>{attendedCount} / {recordedSessions.length} séances</Text>
            </View>
            <View style={styles.attRight}>
              <View style={styles.attBarBg}>
                <View style={[styles.attBarFill, { width: `${attPct}%` }]} />
              </View>
              <View style={styles.attLegend}>
                <AttLegendItem color={C.green}   label="Présent"  value={presentCount}  />
                <AttLegendItem color={C.amber}   label="Retard"   value={lateCount}     />
                <AttLegendItem color={C.red}     label="Absent"   value={absentCount}   />
                <AttLegendItem color={C.purple}  label="Blessé"   value={injuredCount}  />
              </View>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={styles.attSeasonLabel}>{allSessions.length} séances cette saison</Text>

          {allSessions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={styles.calContainer}>
                {monthGroups.map(group => (
                  <View key={group.month} style={styles.calMonth}>
                    <Text style={styles.calMonthLabel}>{group.month}</Text>
                    <View style={styles.calDots}>
                      {group.items.map((s, i) => (
                        <View key={i} style={[styles.calDot, { backgroundColor: SESSION_COLORS[s.status] }]} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {recordedSessions.length > 0 && (
            <View style={styles.seasonBar}>
              {allSessions.map((s, i) => (
                <View key={i} style={[styles.seasonBarSeg, { backgroundColor: SESSION_COLORS[s.status] }]} />
              ))}
            </View>
          )}
        </FMSection>

        {/* ── Événements ── */}
        <FMSection
          title="Événements"
          count={events.length}
          action={isManager ? (
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowEventForm(v => !v)} activeOpacity={0.7}>
              <Ionicons name={showEventForm ? 'close' : 'add'} size={14} color={C.amber} />
              <Text style={styles.addBtnText}>{showEventForm ? 'Annuler' : 'Ajouter'}</Text>
            </TouchableOpacity>
          ) : undefined}
        >
          {isManager && showEventForm && (
            <View style={styles.eventForm}>
              <Text style={styles.formLabel}>Type</Text>
              <View style={styles.eventTypeRow}>
                {(['interview', 'injury', 'suspension'] as PlayerEventType[]).map(t => {
                  const cfg = EVENT_CONFIG[t];
                  const active = eventType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, active && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                      onPress={() => setEventType(t)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={cfg.icon} size={13} color={active ? cfg.color : C.text2} />
                      <Text style={[styles.typeChipText, active && { color: cfg.color }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.formLabel}>Date</Text>
              <TouchableOpacity style={styles.dateInput} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={15} color={C.text2} />
                <Text style={styles.dateInputText}>{eventDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={eventDate} mode="date" display="spinner" onChange={(_e, d) => { setShowDatePicker(false); if (d) setEventDate(d); }} maximumDate={new Date()} />
              )}
              {eventType === 'injury' && (
                <>
                  <Text style={styles.formLabel}>Type de blessure</Text>
                  <TextInput style={styles.formInput} placeholder="Ex : entorse cheville..." placeholderTextColor={C.text3} value={injuryType} onChangeText={setInjuryType} />
                  <Text style={styles.formLabel}>Jours d'indisponibilité</Text>
                  <TextInput style={styles.formInput} placeholder="Nombre de jours" placeholderTextColor={C.text3} value={unavailDays} onChangeText={setUnavailDays} keyboardType="numeric" />
                </>
              )}
              {eventType === 'suspension' && (
                <>
                  <Text style={styles.formLabel}>Matchs suspendus</Text>
                  <TextInput style={styles.formInput} placeholder="Nombre de matchs" placeholderTextColor={C.text3} value={matchesSusp} onChangeText={setMatchesSusp} keyboardType="numeric" />
                </>
              )}
              <Text style={styles.formLabel}>Notes / Rapport</Text>
              <TextInput style={[styles.formInput, styles.formTextarea]} placeholder="Observations, contexte..." placeholderTextColor={C.text3} value={eventReport} onChangeText={setEventReport} multiline numberOfLines={3} textAlignVertical="top" />
              <TouchableOpacity style={[styles.saveEventBtn, savingEvent && { opacity: 0.6 }]} onPress={handleSaveEvent} disabled={savingEvent} activeOpacity={0.8}>
                {savingEvent ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveEventBtnText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          )}
          {events.length === 0
            ? <EmptyState text="Aucun événement enregistré" />
            : (
              <View style={styles.timeline}>
                {events.map((ev, i) => (
                  <EventRow key={ev.id} event={ev} isLast={i === events.length - 1} onDelete={isManager ? () => handleDeleteEvent(ev) : undefined} />
                ))}
              </View>
            )
          }
        </FMSection>

        {/* ── Équipes (coach seulement) ── */}
        {isManager && (
          <FMSection title="Équipes" last>
            {playerTeams.length === 0
              ? <EmptyState text="Ce joueur n'est dans aucune équipe" />
              : (
                <View style={{ gap: 6, marginBottom: 12 }}>
                  {playerTeams.map(t => (
                    <View key={t.id} style={styles.teamRow}>
                      <View style={[styles.teamDot, { backgroundColor: t.color || C.text3 }]} />
                      <Text style={styles.teamName}>{t.name}</Text>
                      {onRemoveFromTeam && (
                        <TouchableOpacity onPress={() => onRemoveFromTeam(t)} disabled={updatingTeamId !== null} style={{ padding: 4 }}>
                          {updatingTeamId === t.id
                            ? <ActivityIndicator size="small" color={C.red} />
                            : <Ionicons name="close-circle-outline" size={20} color={C.red} />
                          }
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )
            }
            {onAddToTeam && (
              <TouchableOpacity style={styles.assignBtn} onPress={() => setAssignModal(true)} disabled={availableTeams.length === 0} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={15} color="#fff" />
                <Text style={styles.assignBtnText}>Assigner à une équipe</Text>
              </TouchableOpacity>
            )}
          </FMSection>
        )}

      </ScrollView>

      {isManager && (
        <Modal visible={assignModal} transparent animationType="fade" onRequestClose={() => setAssignModal(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAssignModal(false)}>
            <View style={styles.modalBox} onStartShouldSetResponder={() => true}>
              <Text style={styles.modalTitle}>Choisir une équipe</Text>
              {availableTeams.length === 0
                ? <EmptyState text="Aucune équipe disponible" />
                : (
                  <FlatList
                    data={availableTeams}
                    keyExtractor={t => t.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity style={styles.modalTeamRow} onPress={() => { setAssignModal(false); onAddToTeam!(item.id); }} disabled={updatingTeamId !== null}>
                        <View style={[styles.teamDot, { backgroundColor: item.color || C.text3 }]} />
                        <Text style={styles.modalTeamName}>{item.name}</Text>
                        {updatingTeamId === item.id
                          ? <ActivityIndicator size="small" color={C.navy} />
                          : <Ionicons name="add" size={20} color={C.navy} />
                        }
                      </TouchableOpacity>
                    )}
                  />
                )
              }
              <TouchableOpacity style={styles.modalClose} onPress={() => setAssignModal(false)}>
                <Text style={styles.modalCloseText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FMSection({ title, children, count, last = false, action }: {
  title: string; children: React.ReactNode; count?: number; last?: boolean; action?: React.ReactNode;
}) {
  return (
    <View style={[sec.wrap, last && { marginBottom: 40 }]}>
      <View style={sec.head}>
        <View style={sec.titleRow}>
          <View style={sec.accent} />
          <Text style={sec.title}>{title.toUpperCase()}</Text>
          {count !== undefined && (
            <View style={sec.badge}><Text style={sec.badgeText}>{count}</Text></View>
          )}
        </View>
        {action && <View>{action}</View>}
      </View>
      <View style={sec.body}>{children}</View>
    </View>
  );
}
const sec = StyleSheet.create({
  wrap:     { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  head:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 11, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider, backgroundColor: C.surface2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent:   { width: 3, height: 13, borderRadius: 2, backgroundColor: C.amber },
  title:    { fontSize: 10, fontWeight: '800', color: C.navy, letterSpacing: 1.1 },
  badge:    { backgroundColor: C.amberDim, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 99, borderWidth: 1, borderColor: C.amber + '44' },
  badgeText:{ fontSize: 10, fontWeight: '700', color: C.amber },
  body:     { padding: 14 },
});

function KPIBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={kpi.block}>
      <Text style={[kpi.value, { color: color ?? C.text1 }]}>{value}</Text>
      <Text style={kpi.label}>{label.toUpperCase()}</Text>
    </View>
  );
}
const kpi = StyleSheet.create({
  block: { flex: 1, alignItems: 'center', paddingVertical: 14, borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.surface2 },
  value: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  label: { fontSize: 8, fontWeight: '700', color: C.text3, letterSpacing: 0.8, marginTop: 4 },
});

function AttLegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={al.row}>
      <View style={[al.dot, { backgroundColor: color }]} />
      <Text style={al.label}>{label}</Text>
      <Text style={[al.val, { color }]}>{value}</Text>
    </View>
  );
}
const al = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, color: C.text2, flex: 1 },
  val:   { fontSize: 11, fontWeight: '700' },
});

function EmptyState({ text }: { text: string }) {
  return <Text style={{ fontSize: 13, color: C.text3, fontStyle: 'italic', paddingVertical: 4 }}>{text}</Text>;
}

function EventRow({ event, isLast, onDelete }: { event: PlayerEvent; isLast: boolean; onDelete?: () => void }) {
  const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.interview;
  return (
    <View style={er.wrap}>
      <View style={er.left}>
        <View style={[er.dot, { backgroundColor: cfg.bg, borderColor: cfg.color + '66' }]}>
          <Ionicons name={cfg.icon} size={11} color={cfg.color} />
        </View>
        {!isLast && <View style={er.line} />}
      </View>
      <View style={er.body}>
        <View style={er.head}>
          <Text style={[er.type, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={er.date}>{fmtDate(event.event_date)}</Text>
          {onDelete && (
            <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={13} color={C.text3} />
            </TouchableOpacity>
          )}
        </View>
        {event.report ? <Text style={er.report}>{event.report}</Text> : null}
        <View style={er.chips}>
          {event.injury_type ? <View style={[er.chip, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}><Text style={[er.chipText, { color: C.red }]}>{event.injury_type}</Text></View> : null}
          {event.unavailability_days != null && event.unavailability_days > 0
            ? <View style={er.chip}><Text style={er.chipText}>{event.unavailability_days}j indispo.</Text></View> : null}
          {event.matches_suspended != null && event.matches_suspended > 0
            ? <View style={[er.chip, { backgroundColor: C.amberLt, borderColor: C.amber + '55' }]}><Text style={[er.chipText, { color: C.amber }]}>{event.matches_suspended} match(s) suspendu</Text></View> : null}
        </View>
      </View>
    </View>
  );
}
const er = StyleSheet.create({
  wrap:  { flexDirection: 'row', gap: 10 },
  left:  { width: 26, alignItems: 'center' },
  dot:   { width: 26, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  line:  { flex: 1, width: 1, backgroundColor: C.border, marginTop: 2 },
  body:  { flex: 1, paddingBottom: 14 },
  head:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, height: 26 },
  type:  { fontSize: 12, fontWeight: '700', flex: 1 },
  date:  { fontSize: 10, color: C.text3 },
  report:{ fontSize: 12, color: C.text2, lineHeight: 17, marginBottom: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip:  { borderWidth: 1, borderColor: C.border, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: C.surface2 },
  chipText: { fontSize: 10, color: C.text2, fontWeight: '600' },
});

// ─── RadarChart ────────────────────────────────────────────────────────────

function RadarChart({ data, axes }: { data: PlayerRadarResult; axes: RadarAxis[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const screenW  = Dimensions.get('window').width;
  const isTablet = screenW >= 768;
  const svgW  = (screenW - 56) * (isTablet ? 0.4 : 0.8);
  const cx    = svgW / 2;
  const cy    = svgW / 2;
  const maxR  = cx - 72;
  const lblR  = maxR + 26;
  const svgH  = svgW + 24;
  const N     = axes.length;
  const step  = (2 * Math.PI) / N;
  const start = -Math.PI / 2;

  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(start + i * step),
    y: cy + r * Math.sin(start + i * step),
  });

  const dataPoints = axes.map(({ normKey }, i) => {
    const { x, y } = pt(i, (data.normalized[normKey] / 100) * maxR);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const avgPoints = axes.map(({ rawKey }, i) => {
    const max = data.squadMax[rawKey];
    const avg = data.squadAvg[rawKey];
    const frac = max > 0 ? Math.min(1, Math.max(0, avg / max)) : 0;
    const { x, y } = pt(i, frac * maxR);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const gridPts = (pct: number) =>
    axes.map((_, i) => { const { x, y } = pt(i, pct * maxR); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(' ');

  const sel = selectedIdx !== null ? axes[selectedIdx] : null;

  return (
    <View>
      <Svg width={svgW} height={svgH} style={{ alignSelf: 'center' }}>
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <Polygon key={pct} points={gridPts(pct)}
            fill={pct === 1 ? 'rgba(26,39,68,0.03)' : 'none'}
            stroke={pct === 1 ? 'rgba(26,39,68,0.18)' : 'rgba(26,39,68,0.08)'}
            strokeWidth={pct === 1 ? 1.5 : 1}
          />
        ))}
        {axes.map((_, i) => {
          const { x, y } = pt(i, maxR);
          return <Line key={i} x1={cx.toFixed(1)} y1={cy.toFixed(1)} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke={selectedIdx === i ? C.amber : 'rgba(26,39,68,0.1)'} strokeWidth={selectedIdx === i ? 1.5 : 1} />;
        })}
        <Polygon points={avgPoints} fill="rgba(148,163,184,0.12)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 2" strokeLinejoin="round" />
        <Polygon points={dataPoints} fill="rgba(217,119,6,0.12)" stroke={C.amber} strokeWidth={2} strokeLinejoin="round" />
        {axes.map(({ normKey }, i) => {
          const { x, y } = pt(i, (data.normalized[normKey] / 100) * maxR);
          return <Circle key={i} cx={x} cy={y} r={selectedIdx === i ? 5 : 3} fill={selectedIdx === i ? C.navy : C.amber} />;
        })}
        {axes.map(({ label }, i) => {
          const angle  = start + i * step;
          const ca     = Math.cos(angle);
          const sa     = Math.sin(angle);
          const lx     = cx + lblR * ca;
          const ly     = cy + lblR * sa;
          const anchor: 'start' | 'end' | 'middle' = ca > 0.2 ? 'start' : ca < -0.2 ? 'end' : 'middle';
          const dy = sa > 0.2 ? 12 : sa < -0.2 ? -2 : 4;
          const active = selectedIdx === i;
          return (
            // @ts-ignore
            <SvgText key={i} x={lx} y={ly + dy} textAnchor={anchor} fontSize={9} fontWeight="700" fill={active ? C.amber : C.text2} onPress={() => setSelectedIdx(p => p === i ? null : i)}>
              {label}
            </SvgText>
          );
        })}
        {axes.map((_, i) => {
          const angle = start + i * step;
          return <Circle key={`t${i}`} cx={cx + lblR * Math.cos(angle)} cy={cy + lblR * Math.sin(angle)} r={16} fill="transparent" onPress={() => setSelectedIdx(p => p === i ? null : i)} />;
        })}
        {[0.5, 1].map(pct => {
          const { y: gy } = pt(0, pct * maxR);
          return <SvgText key={pct} x={cx + 3} y={gy - 2} textAnchor="start" fontSize={7} fill="rgba(26,39,68,0.2)">{Math.round(pct * 100)}</SvgText>;
        })}
      </Svg>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 2, backgroundColor: C.amber }} />
          <Text style={{ fontSize: 9, color: C.text3, fontWeight: '600' }}>Joueur</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 12, height: 2, backgroundColor: '#94a3b8' }} />
          <Text style={{ fontSize: 9, color: C.text3, fontWeight: '600' }}>Moy. effectif</Text>
        </View>
      </View>

      {sel && (
        <View style={rdr.tooltip}>
          <View style={rdr.tooltipHead}>
            <Text style={rdr.tooltipTitle}>{sel.fullLabel}</Text>
            <TouchableOpacity onPress={() => setSelectedIdx(null)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="close" size={13} color={C.text3} />
            </TouchableOpacity>
          </View>
          <View style={rdr.tooltipRow}>
            {[
              { val: fmtAxisValue(data.raw[sel.rawKey], sel.rawKey), label: 'Vous', color: C.amber },
              { val: fmtAxisValue(data.squadMax[sel.rawKey], sel.rawKey), label: 'Max', color: C.green },
              { val: fmtAxisValue(data.squadAvg[sel.rawKey], sel.rawKey), label: 'Moy.', color: C.text2 },
            ].map((col, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={rdr.div} />}
                <View style={rdr.col}>
                  <Text style={[rdr.colVal, { color: col.color }]}>{col.val}</Text>
                  <Text style={rdr.colLbl}>{col.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      <View style={rdr.grid}>
        {axes.map(({ normKey, rawKey, gridLabel }) => {
          const isPM    = rawKey === 'plusMinus';
          const pm      = data.raw.plusMinus;
          const pmColor = isPM ? (pm > 0 ? C.green : pm < 0 ? C.red : C.text1) : C.text1;
          const col     = `${100 / (axes.length <= 6 ? 3 : 4)}%` as const;
          return (
            <View key={normKey} style={[rdr.statItem, { width: col }]}>
              <Text style={[rdr.statVal, { color: pmColor }]}>{getRadarGridTotal(data, rawKey)}</Text>
              <Text style={rdr.statLbl}>{gridLabel}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const rdr = StyleSheet.create({
  tooltip:     { backgroundColor: C.surface2, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10, marginBottom: 4 },
  tooltipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tooltipTitle:{ fontSize: 10, fontWeight: '800', color: C.navy, textTransform: 'uppercase', letterSpacing: 0.8 },
  tooltipRow:  { flexDirection: 'row', alignItems: 'center' },
  col:         { flex: 1, alignItems: 'center' },
  colVal:      { fontSize: 17, fontWeight: '800' },
  colLbl:      { fontSize: 9, fontWeight: '600', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  div:         { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: C.border },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider, paddingTop: 10 },
  statItem:    { alignItems: 'center', paddingVertical: 5 },
  statVal:     { fontSize: 13, fontWeight: '800', color: C.text1 },
  statLbl:     { fontSize: 8, fontWeight: '600', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
});

// ─── FeedbackLineChart ─────────────────────────────────────────────────────

function buildSmoothPath(
  pts: { x: number; y: number }[]
): string {
  if (pts.length < 2) return '';
  const d: string[] = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] ?? pts[i - 1];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[i + 1] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  return d.join(' ');
}

const FEEDBACK_LINES = [
  { key: 'auto_evaluation' as const, label: 'Auto-éval.',  color: '#2563eb' },
  { key: 'rpe'             as const, label: 'Intensité',   color: '#dc2626' },
  { key: 'physical_form'   as const, label: 'Forme',       color: '#059669' },
  { key: 'pleasure'        as const, label: 'Plaisir',     color: C.amber  },
];

function FeedbackLineChart({ rows }: { rows: PlayerFeedbackRow[] }) {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    () => new Set(FEEDBACK_LINES.map(l => l.key))
  );
  const [chartWidth, setChartWidth] = useState(0);

  const data = rows.slice(-20);
  const n    = data.length;

  const PAD_L = 26; const PAD_R = 8; const PAD_T = 10; const PAD_B = 32;
  const plotW   = Math.max(0, chartWidth - PAD_L - PAD_R);
  const plotH   = 130;
  const svgH    = PAD_T + plotH + PAD_B;
  const toY     = (v: number) => PAD_T + plotH - ((v - 1) / 9) * plotH;
  const toX     = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const dateIdxs = (() => {
    if (n <= 5) return data.map((_, i) => i);
    const st = Math.floor((n - 1) / 4);
    const r = [0]; for (let k = 1; k <= 3; k++) r.push(st * k); r.push(n - 1);
    return [...new Set(r)];
  })();

  const toggleKey = (k: string) => {
    setActiveKeys(prev => {
      if (prev.has(k) && prev.size === 1) return prev;
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const activeLines = FEEDBACK_LINES.filter(l => activeKeys.has(l.key));

  return (
    <View>
      {/* Filter / legend chips */}
      <View style={fb.filterRow}>
        {FEEDBACK_LINES.map(({ key, label, color }) => {
          const active = activeKeys.has(key);
          return (
            <TouchableOpacity
              key={key}
              style={[fb.filterChip, active && { backgroundColor: color + '22', borderColor: color }]}
              onPress={() => toggleKey(key)}
              activeOpacity={0.7}
            >
              <View style={[fb.filterDot, { backgroundColor: active ? color : C.border }]} />
              <Text style={[fb.filterLabel, { color: active ? color : C.text3 }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {chartWidth > 0 && <Svg width={chartWidth} height={svgH}>
        {[2, 4, 6, 8, 10].map(v => {
          const gy = toY(v);
          return (
            <React.Fragment key={v}>
              <Line x1={PAD_L} y1={gy} x2={PAD_L + plotW} y2={gy} stroke="rgba(26,39,68,0.06)" strokeWidth={1} />
              <SvgText x={PAD_L - 4} y={gy + 4} textAnchor="end" fontSize={8} fill={C.text3}>{v}</SvgText>
            </React.Fragment>
          );
        })}
        <Line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH} stroke={C.border} strokeWidth={1} />
        {FEEDBACK_LINES.map(({ key, color }) => {
          if (!activeKeys.has(key)) return null;
          const pts = data.reduce<{ x: number; y: number }[]>((acc, row, i) => {
            const v = row[key];
            if (v != null) acc.push({ x: toX(i), y: toY(v as number) });
            return acc;
          }, []);
          const d = buildSmoothPath(pts);
          if (!d) return null;
          return <Path key={key} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />;
        })}
        {FEEDBACK_LINES.map(({ key, color }) =>
          !activeKeys.has(key) ? null :
          data.map((row, i) => { const v = row[key]; if (v == null) return null; return <Circle key={`${key}${i}`} cx={toX(i)} cy={toY(v)} r={3} fill={color} />; })
        )}
        {dateIdxs.map(i => (
          <SvgText key={i} x={toX(i)} y={PAD_T + plotH + 14} textAnchor="middle" fontSize={8} fill={C.text3}>
            {new Date(data[i].date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </SvgText>
        ))}
      </Svg>}
      </View>

      {(() => {
        const last = data[data.length - 1];
        if (!activeLines.some(l => last[l.key] != null)) return null;
        return (
          <View style={fb.lastRow}>
            <Text style={fb.lastTitle}>Dernière séance</Text>
            <View style={fb.lastVals}>
              {activeLines.map(({ key, label, color }) => (
                last[key] != null ? (
                  <View key={key} style={fb.lastItem}>
                    <Text style={[fb.lastVal, { color }]}>{last[key]}</Text>
                    <Text style={fb.lastLabel}>{label}</Text>
                  </View>
                ) : null
              ))}
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const fb = StyleSheet.create({
  filterRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  filterChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2 },
  filterDot:   { width: 8, height: 8, borderRadius: 4 },
  filterLabel: { fontSize: 11, fontWeight: '700' },
  lastRow:     { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.divider },
  lastTitle:   { fontSize: 8, fontWeight: '800', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  lastVals:    { flexDirection: 'row', gap: 6 },
  lastItem:    { flex: 1, alignItems: 'center', backgroundColor: C.surface2, borderRadius: 6, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  lastVal:     { fontSize: 18, fontWeight: '800' },
  lastLabel:   { fontSize: 8, color: C.text3, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },
});

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content:{ padding: 12, gap: 10 },

  // Header navy
  header:      { backgroundColor: C.navy, paddingHorizontal: 16, paddingBottom: 14 },
  headerNav:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn:      { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navBtnText:  { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  editBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: C.amberLt },
  editBtnText: { fontSize: 12, fontWeight: '700', color: C.navy },

  // Player card
  playerCard:     { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  numberRing:     { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  numberVal:      { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  playerIdentity: { flex: 1 },
  lastName:       { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.3, lineHeight: 24 },
  firstName:      { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2, marginBottom: 6 },
  tagRow:         { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  posBadge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  posText:        { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  tagInfo:        { fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText:     { fontSize: 10, fontWeight: '700' },

  // Filter chips
  filterRow:      { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)' },
  chipActive:     { backgroundColor: C.amber, borderColor: C.amber },
  chipText:       { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  chipTextActive: { color: '#fff' },

  // KPI
  kpiGrid:  { flexDirection: 'row', gap: 6, marginBottom: 14 },

  // V/N/D
  vndBlock:  { gap: 6 },
  vndBar:    { flexDirection: 'row', height: 28, borderRadius: 6, overflow: 'hidden', gap: 2 },
  vndSeg:    { justifyContent: 'center', alignItems: 'center' },
  vndText:   { color: '#fff', fontSize: 11, fontWeight: '800' },
  vndLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  vndLegTxt: { fontSize: 11, fontWeight: '700' },

  // Attendance
  attHeader:      { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 10 },
  attPct:         { fontSize: 40, fontWeight: '900', color: C.amber, lineHeight: 42 },
  attPctUnit:     { fontSize: 20, fontWeight: '700', color: C.amber },
  attPctSub:      { fontSize: 10, color: C.text3, marginTop: 2 },
  attRight:       { flex: 1, justifyContent: 'center', gap: 10 },
  attBarBg:       { height: 6, backgroundColor: C.border, borderRadius: 99, overflow: 'hidden' },
  attBarFill:     { height: '100%', backgroundColor: C.amber, borderRadius: 99 },
  attLegend:      { gap: 4 },
  divider:        { height: 1, backgroundColor: C.divider, marginVertical: 10 },
  attSeasonLabel: { fontSize: 10, color: C.text3, marginBottom: 2 },
  calContainer:   { flexDirection: 'row', gap: 10, paddingHorizontal: 2, paddingBottom: 4 },
  calMonth:       { gap: 4 },
  calMonthLabel:  { fontSize: 8, fontWeight: '700', color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  calDots:        { flexDirection: 'row', flexWrap: 'wrap', gap: 3, maxWidth: 80 },
  calDot:         { width: 11, height: 11, borderRadius: 2 },
  seasonBar:      { flexDirection: 'row', height: 5, borderRadius: 99, overflow: 'hidden', gap: 1, marginTop: 10 },
  seasonBarSeg:   { flex: 1, height: '100%' },

  // Event form
  addBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: C.amber + '66', backgroundColor: C.amberDim },
  addBtnText:      { fontSize: 11, fontWeight: '700', color: C.amber },
  eventForm:       { backgroundColor: C.surface2, borderRadius: 8, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: C.border },
  formLabel:       { fontSize: 10, fontWeight: '700', color: C.text2, textTransform: 'uppercase', letterSpacing: 0.6 },
  formInput:       { backgroundColor: C.surface, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: C.text1, borderWidth: 1, borderColor: C.border },
  formTextarea:    { minHeight: 64, textAlignVertical: 'top' },
  eventTypeRow:    { flexDirection: 'row', gap: 7 },
  typeChip:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 7, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  typeChipText:    { fontSize: 12, fontWeight: '700', color: C.text2 },
  dateInput:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  dateInputText:   { fontSize: 13, color: C.text1 },
  saveEventBtn:    { backgroundColor: C.navy, borderRadius: 7, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  saveEventBtnText:{ color: '#fff', fontWeight: '800', fontSize: 13 },

  // Timeline
  timeline: { gap: 0 },

  // Teams
  teamRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface2, borderRadius: 7, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: C.border },
  teamDot:       { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  teamName:      { flex: 1, fontSize: 13, fontWeight: '600', color: C.text1 },
  assignBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.navy, paddingVertical: 10, borderRadius: 7 },
  assignBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalBox:      { backgroundColor: C.surface, borderRadius: 14, padding: 20, maxHeight: '70%', borderWidth: 1, borderColor: C.border },
  modalTitle:    { fontSize: 16, fontWeight: '700', color: C.text1, marginBottom: 14 },
  modalTeamRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider },
  modalTeamName: { flex: 1, fontSize: 14, color: C.text1, fontWeight: '500' },
  modalClose:    { marginTop: 14, paddingVertical: 11, alignItems: 'center' },
  modalCloseText:{ fontSize: 14, color: C.navy, fontWeight: '600' },
});
