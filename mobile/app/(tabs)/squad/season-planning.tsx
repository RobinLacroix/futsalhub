import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, ActionSheetIOS, Platform,
  Modal, Animated, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByClubWithTeams } from '../../../lib/services/players';
import {
  loadSeasonPlanning, saveSeasonPlanning, listSeasons,
  applySeasonPlan, revertSeasonPlan,
  PlanningData, RecruitData,
} from '../../../lib/services/seasonPlanning';
import type { Player, Team } from '../../../types';

const { height: SCREEN_H } = Dimensions.get('window');

// ── helpers ───────────────────────────────────────────────────────────────────

function currentSeason(): string {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

const POSITION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Gardien: { bg: '#fef9c3', text: '#a16207', border: '#fde68a' },
  Meneur:  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  Ailier:  { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  Pivot:   { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
};
const posColor = (p: string) => POSITION_COLORS[p] ?? { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };

const H_COLORS = [
  { border: '#6ee7b7', bg: '#f0fdf4', badge: '#10b981', light: '#ecfdf5' },
  { border: '#93c5fd', bg: '#eff6ff', badge: '#3b82f6', light: '#eff6ff' },
  { border: '#fcd34d', bg: '#fffbeb', badge: '#f59e0b', light: '#fffbeb' },
  { border: '#fdba74', bg: '#fff7ed', badge: '#f97316', light: '#fff7ed' },
  { border: '#d1d5db', bg: '#f9fafb', badge: '#9ca3af', light: '#f9fafb' },
];
const hColor = (h: number) => H_COLORS[Math.min(h - 1, 4)];

const DEFAULT_H_NAMES: Record<number, string> = {
  1: 'Titulaires', 2: 'Rotation', 3: 'Développement',
  4: 'Hiérarchie 4', 5: 'Hiérarchie 5',
};

type Zone =
  | { type: 'unassigned' }
  | { type: 'departure' }
  | { type: 'slot'; teamId: string; h: number };

function removeFromAll(data: PlanningData, cardId: string): PlanningData {
  const n = deepClone(data);
  n.unassigned = n.unassigned.filter(id => id !== cardId);
  n.departures = n.departures.filter(id => id !== cardId);
  n.confirmed  = (n.confirmed ?? []).filter(id => id !== cardId);
  for (const t of Object.values(n.teams)) {
    for (const h of Object.keys(t.slots)) {
      t.slots[Number(h)] = t.slots[Number(h)].filter(id => id !== cardId);
    }
  }
  return n;
}

function addToZone(data: PlanningData, cardId: string, zone: Zone): PlanningData {
  const n = deepClone(data);
  if (zone.type === 'unassigned') { n.unassigned.push(cardId); }
  else if (zone.type === 'departure') { n.departures.push(cardId); }
  else if (zone.type === 'slot') {
    const t = n.teams[zone.teamId];
    if (!t) return n;
    if (!t.slots[zone.h]) t.slots[zone.h] = [];
    t.slots[zone.h].push(cardId);
  }
  return n;
}

// ── Bottom Sheet component ────────────────────────────────────────────────────

type SheetMode =
  | { kind: 'place'; playerId: string }
  | { kind: 'pick'; teamId: string; h: number };

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function BottomSheet({ visible, onClose, children, title }: BottomSheetProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible]);

  if (!visible) return null;

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H * 0.7, 0],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Position badge ────────────────────────────────────────────────────────────

function PosBadge({ position }: { position: string }) {
  if (!position) return null;
  const pc = posColor(position);
  return (
    <View style={[styles.posBadge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
      <Text style={[styles.posText, { color: pc.text }]}>{position.substring(0, 3).toUpperCase()}</Text>
    </View>
  );
}

// ── Pool player row ────────────────────────────────────────────────────────────

interface PoolRowProps {
  cardId: string;
  player?: Player;
  recruit?: RecruitData;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function PoolRow({ cardId, player, recruit, selected, onPress, onLongPress }: PoolRowProps) {
  const name = player ? `${player.first_name} ${player.last_name}` : recruit?.name ?? '—';
  const pos  = player?.position ?? recruit?.position ?? '';
  const num  = player?.number;
  const isRec = cardId.startsWith('recruit|');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[styles.poolRow, selected && styles.poolRowSelected]}
    >
      <View style={styles.poolRowLeft}>
        {num != null && (
          <Text style={styles.poolNum}>#{num}</Text>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.poolName, selected && styles.poolNameSelected]} numberOfLines={1}>
            {name}
          </Text>
          {isRec && (
            <Text style={styles.recrueLabel}>Recrue</Text>
          )}
        </View>
      </View>
      <View style={styles.poolRowRight}>
        <PosBadge position={pos} />
        <Ionicons
          name={selected ? 'checkmark-circle' : 'chevron-forward'}
          size={18}
          color={selected ? '#3b82f6' : '#cbd5e1'}
        />
      </View>
    </TouchableOpacity>
  );
}

// ── Team player chip (in slot) ─────────────────────────────────────────────────

interface SlotChipProps {
  cardId: string;
  player?: Player;
  recruit?: RecruitData;
  confirmed: boolean;
  onLongPress: () => void;
  onConfirmToggle: () => void;
}

function SlotChip({ cardId, player, recruit, confirmed, onLongPress, onConfirmToggle }: SlotChipProps) {
  const name = player ? `${player.first_name} ${player.last_name}` : recruit?.name ?? '—';
  const pos  = player?.position ?? recruit?.position ?? '';
  const num  = player?.number;
  const isRec = cardId.startsWith('recruit|');

  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      activeOpacity={0.75}
      style={[styles.chip, confirmed && styles.chipConfirmed]}
    >
      <TouchableOpacity
        onPress={onConfirmToggle}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[styles.chipDot, confirmed && styles.chipDotOn]}
      />
      {num != null && <Text style={styles.chipNum}>{num}</Text>}
      <Text style={styles.chipName} numberOfLines={1}>{name}</Text>
      {pos ? <PosBadge position={pos} /> : null}
      {isRec && (
        <View style={styles.recBadge}>
          <Text style={styles.recText}>R</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Hierarchy slot section ────────────────────────────────────────────────────

interface HierSectionProps {
  teamId: string;
  h: number;
  label: string;
  cards: string[];
  confirmed: string[];
  getPlayer: (id: string) => Player | undefined;
  getRecruit: (id: string) => RecruitData | undefined;
  onAddFromPool: () => void;
  onLongPress: (cardId: string) => void;
  onConfirmToggle: (cardId: string) => void;
  onLabelEdit: () => void;
}

function HierSection({ teamId, h, label, cards, confirmed, getPlayer, getRecruit, onAddFromPool, onLongPress, onConfirmToggle, onLabelEdit }: HierSectionProps) {
  const hc = hColor(h);
  return (
    <View style={[styles.hierSection, { borderLeftColor: hc.badge }]}>
      {/* Header */}
      <TouchableOpacity onPress={onLabelEdit} style={styles.hierSectionHeader} activeOpacity={0.7}>
        <View style={[styles.hBadge, { backgroundColor: hc.badge }]}>
          <Text style={styles.hBadgeText}>{h}</Text>
        </View>
        <Text style={styles.hierSectionLabel}>{label}</Text>
        <Text style={styles.hierSectionCount}>{cards.length} joueur{cards.length !== 1 ? 's' : ''}</Text>
        <Ionicons name="pencil-outline" size={12} color="#9ca3af" />
      </TouchableOpacity>

      {/* Chips */}
      {cards.length > 0 && (
        <View style={styles.chipsWrap}>
          {cards.map(id => (
            <SlotChip
              key={id}
              cardId={id}
              player={getPlayer(id)}
              recruit={getRecruit(id)}
              confirmed={confirmed.includes(id)}
              onLongPress={() => onLongPress(id)}
              onConfirmToggle={() => onConfirmToggle(id)}
            />
          ))}
        </View>
      )}

      {/* Add button */}
      <TouchableOpacity onPress={onAddFromPool} style={styles.addFromPool} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={15} color="#3b82f6" />
        <Text style={styles.addFromPoolText}>Ajouter depuis le pool</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Tab = 'pool' | string | 'departures';

export default function SeasonPlanningScreen() {
  const router = useRouter();
  const { teams, activeTeam } = useActiveTeam();
  const clubId = activeTeam?.club_id ?? '';

  const [season, setSeason]       = useState(currentSeason());
  const [seasons, setSeasons]     = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [planning, setPlanning]   = useState<PlanningData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState<Date | null>(null);

  // tabs
  const [activeTab, setActiveTab] = useState<Tab>('pool');

  // pool filters
  const [search, setSearch]       = useState('');
  const [filterPos, setFilterPos] = useState('');

  // assignment sheet
  const [sheet, setSheet]         = useState<SheetMode | null>(null);
  const [pickSearch, setPickSearch] = useState('');

  // modals
  const [recruitModal, setRecruitModal]   = useState(false);
  const [recruitName, setRecruitName]     = useState('');
  const [recruitPos, setRecruitPos]       = useState('Meneur');
  const [seasonModal, setSeasonModal]     = useState(false);
  const [editLabelModal, setEditLabelModal] = useState<{ teamId: string; h: number; current: string } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [editRecruitModal, setEditRecruitModal] = useState<{ id: string; name: string; position: string } | null>(null);
  const [editRecruitName, setEditRecruitName] = useState('');
  const [editRecruitPos, setEditRecruitPos] = useState('Meneur');

  // apply / revert
  type ApplyModalMode = 'apply' | 'revert' | null;
  const [applyModal, setApplyModal]   = useState<ApplyModalMode>(null);
  const [applying, setApplying]       = useState(false);

  // ── init / load ─────────────────────────────────────────────────────────────
  const initPlanning = useCallback((players: Player[], teamList: Team[]): PlanningData => {
    const t: PlanningData['teams'] = {};
    for (const tm of teamList) {
      t[tm.id] = { hierarchyCount: 2, slots: { 1: [], 2: [] } };
    }
    return { teams: t, departures: [], unassigned: players.map(p => p.id), recruits: {}, confirmed: [] };
  }, []);

  const syncTeams = useCallback((data: PlanningData, teamList: Team[]): PlanningData => {
    const n = deepClone(data);
    for (const tm of teamList) {
      if (!n.teams[tm.id]) n.teams[tm.id] = { hierarchyCount: 2, slots: { 1: [], 2: [] } };
    }
    return n;
  }, []);

  const teamsKey = teams.map(t => t.id).sort().join(',');

  useEffect(() => {
    if (!clubId || !teams.length) return;
    const load = async () => {
      setLoading(true);
      try {
        const [rows, savedSeasons] = await Promise.all([
          getPlayersByClubWithTeams(clubId),
          listSeasons(clubId),
        ]);
        const players = rows.map(r => r.player);
        setAllPlayers(players);

        const activeSeason = savedSeasons[0] ?? season;
        const uniq = savedSeasons.includes(activeSeason) ? savedSeasons : [activeSeason, ...savedSeasons];
        setSeasons(uniq);
        setSeason(activeSeason);

        const saved = await loadSeasonPlanning(clubId, activeSeason);
        if (saved) { setPlanning(syncTeams(saved, teams)); setSavedAt(new Date()); }
        else        { setPlanning(initPlanning(players, teams)); setSavedAt(null); }
      } catch (e) {
        console.error('season planning load', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clubId, teamsKey]); // eslint-disable-line

  useEffect(() => {
    if (!clubId || !planning) return;
    const reload = async () => {
      setLoading(true);
      try {
        const saved = await loadSeasonPlanning(clubId, season);
        if (saved) { setPlanning(syncTeams(saved, teams)); setSavedAt(new Date()); }
        else        { setPlanning(prev => prev ? syncTeams(prev, teams) : null); setSavedAt(null); }
      } finally {
        setLoading(false);
      }
    };
    reload();
  }, [season]); // eslint-disable-line

  const handleSave = async () => {
    if (!clubId || !planning) return;
    setSaving(true);
    try {
      await saveSeasonPlanning(clubId, season, planning);
      setSavedAt(new Date());
      if (!seasons.includes(season)) setSeasons(s => [season, ...s]);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  // ── apply / revert ─────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (!clubId || !planning) return;
    setApplying(true);
    try {
      const updated = await applySeasonPlan(clubId, season, planning);
      await saveSeasonPlanning(clubId, season, updated);
      setPlanning(updated);
      setSavedAt(new Date());
      setApplyModal(null);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'appliquer la saison");
    } finally {
      setApplying(false);
    }
  };

  const handleRevert = async () => {
    if (!clubId || !planning) return;
    setApplying(true);
    try {
      const updated = await revertSeasonPlan(planning);
      await saveSeasonPlanning(clubId, season, updated);
      setPlanning(updated);
      setSavedAt(new Date());
      setApplyModal(null);
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'annuler l'application");
    } finally {
      setApplying(false);
    }
  };

  const planSummary = planning ? {
    departureCount: planning.departures.filter(id => !id.startsWith('recruit|')).length,
    assignedCount:  Object.values(planning.teams)
      .flatMap(t => Object.values(t.slots).flat())
      .filter(id => !id.startsWith('recruit|')).length,
    unassignedCount: planning.unassigned.filter(id => !id.startsWith('recruit|')).length,
  } : null;

  // ── helpers ────────────────────────────────────────────────────────────────
  const getPlayer  = (id: string) => allPlayers.find(p => p.id === id);
  const getRecruit = (id: string) => planning?.recruits[id];
  const getCardPos = (id: string) => getPlayer(id)?.position ?? getRecruit(id)?.position ?? '';
  const getCardName = (id: string) => {
    const p = getPlayer(id);
    if (p) return `${p.first_name} ${p.last_name}`;
    return getRecruit(id)?.name ?? '—';
  };

  // ── card actions ───────────────────────────────────────────────────────────
  const moveToUnassigned = (cardId: string) => {
    setPlanning(prev => prev ? addToZone(removeFromAll(prev, cardId), cardId, { type: 'unassigned' }) : prev);
  };

  const moveToDepartures = (cardId: string) => {
    setPlanning(prev => prev ? addToZone(removeFromAll(prev, cardId), cardId, { type: 'departure' }) : prev);
  };

  const assignToSlot = (cardId: string, teamId: string, h: number) => {
    setPlanning(prev => prev ? addToZone(removeFromAll(prev, cardId), cardId, { type: 'slot', teamId, h }) : prev);
    setSheet(null);
    setPickSearch('');
  };

  const toggleConfirmed = (cardId: string) => {
    setPlanning(prev => {
      if (!prev) return prev;
      const n = deepClone(prev);
      const list = n.confirmed ?? [];
      n.confirmed = list.includes(cardId) ? list.filter(id => id !== cardId) : [...list, cardId];
      return n;
    });
  };

  const openEditRecruit = (cardId: string) => {
    const r = planning?.recruits[cardId];
    if (!r) return;
    setEditRecruitName(r.name);
    setEditRecruitPos(r.position ?? 'Meneur');
    setEditRecruitModal({ id: cardId, name: r.name, position: r.position ?? 'Meneur' });
  };

  const handleDeleteRecruit = (cardId: string) => {
    Alert.alert('Supprimer la recrue', 'Voulez-vous vraiment supprimer cette recrue ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => {
        setPlanning(prev => {
          if (!prev) return prev;
          const n = removeFromAll(prev, cardId);
          delete n.recruits[cardId];
          return n;
        });
      }},
    ]);
  };

  const handleCardLongPress = (cardId: string) => {
    const isRecruit = cardId.startsWith('recruit|');
    const options = [
      'Retirer vers le pool',
      'Départ du club',
      'Valider / Annuler validation',
      ...(isRecruit ? ['Modifier la recrue', 'Supprimer la recrue'] : ['Voir la fiche joueur']),
      'Annuler',
    ];
    const cancelIdx = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIdx, destructiveButtonIndex: isRecruit ? 4 : undefined },
        (i) => {
          if (i === 0) moveToUnassigned(cardId);
          if (i === 1) moveToDepartures(cardId);
          if (i === 2) toggleConfirmed(cardId);
          if (isRecruit && i === 3) openEditRecruit(cardId);
          if (isRecruit && i === 4) handleDeleteRecruit(cardId);
          if (!isRecruit && i === 3) router.push(`/(tabs)/squad/${cardId}` as any);
        }
      );
    } else {
      Alert.alert('Action', undefined, [
        { text: 'Retirer vers le pool', onPress: () => moveToUnassigned(cardId) },
        { text: 'Départ du club', onPress: () => moveToDepartures(cardId) },
        { text: 'Valider / Annuler validation', onPress: () => toggleConfirmed(cardId) },
        ...(isRecruit
          ? [
              { text: 'Modifier la recrue', onPress: () => openEditRecruit(cardId) },
              { text: 'Supprimer la recrue', style: 'destructive' as const, onPress: () => handleDeleteRecruit(cardId) },
            ]
          : [{ text: 'Voir la fiche joueur', onPress: () => router.push(`/(tabs)/squad/${cardId}` as any) }]
        ),
        { text: 'Annuler', style: 'cancel' as const },
      ]);
    }
  };

  // ── hierarchy ──────────────────────────────────────────────────────────────
  const changeHierarchy = (teamId: string, delta: number) => {
    setPlanning(prev => {
      if (!prev) return prev;
      const n = deepClone(prev);
      const t = n.teams[teamId];
      const newCount = Math.max(1, Math.min(5, t.hierarchyCount + delta));
      if (delta > 0) {
        for (let h = t.hierarchyCount + 1; h <= newCount; h++) if (!t.slots[h]) t.slots[h] = [];
      } else {
        for (let h = newCount + 1; h <= t.hierarchyCount; h++) {
          n.unassigned.push(...(t.slots[h] ?? []));
          delete t.slots[h];
        }
      }
      t.hierarchyCount = newCount;
      return n;
    });
  };

  // ── recruit creation ───────────────────────────────────────────────────────
  const handleCreateRecruit = () => {
    if (!recruitName.trim() || !planning) return;
    const id = `recruit|${Date.now()}`;
    setPlanning(prev => {
      if (!prev) return prev;
      const n = deepClone(prev);
      n.recruits[id] = { id, name: recruitName.trim(), position: recruitPos, notes: '' };
      n.unassigned.push(id);
      return n;
    });
    setRecruitName('');
    setRecruitModal(false);
  };

  const handleUpdateRecruit = () => {
    if (!editRecruitModal || !editRecruitName.trim()) return;
    const { id } = editRecruitModal;
    setPlanning(prev => {
      if (!prev) return prev;
      const n = deepClone(prev);
      n.recruits[id] = { ...n.recruits[id], name: editRecruitName.trim(), position: editRecruitPos };
      return n;
    });
    setEditRecruitModal(null);
  };

  // ── filtered pool ──────────────────────────────────────────────────────────
  const filteredPool = (planning?.unassigned ?? []).filter(id => {
    const p = getPlayer(id);
    const r = getRecruit(id);
    const name = p ? `${p.first_name} ${p.last_name}` : r?.name ?? '';
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPos) {
      const pos = p?.position ?? r?.position ?? '';
      if (pos !== filterPos) return false;
    }
    return true;
  });

  const filteredPickPool = (planning?.unassigned ?? []).filter(id => {
    if (!pickSearch.trim()) return true;
    const name = getCardName(id);
    return name.toLowerCase().includes(pickSearch.toLowerCase());
  });

  const teamList = teams.filter(t => planning?.teams[t.id]);

  // ── tab data ───────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string; count?: number; icon?: string }[] = [
    { key: 'pool', label: 'Pool', count: planning?.unassigned.length, icon: 'people-outline' },
    ...teamList.map(t => ({
      key: t.id as Tab,
      label: t.name,
      count: Object.values(planning?.teams[t.id]?.slots ?? {}).flat().length,
    })),
    { key: 'departures', label: 'Départs', count: planning?.departures.length, icon: 'exit-outline' },
  ];

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    );
  }
  if (!planning) return null;

  const activeTeamObj = teamList.find(t => t.id === activeTab);
  const activeTeamState = activeTeamObj ? planning.teams[activeTeamObj.id] : null;

  return (
    <View style={styles.root}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>Planification de saison</Text>
          <TouchableOpacity onPress={() => setSeasonModal(true)} style={styles.seasonRow}>
            <Text style={styles.seasonText}>{season}</Text>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        {savedAt && (
          <Text style={styles.savedHint}>{savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
        )}
        {/* Apply / applied button */}
        {planning?.appliedAt ? (
          <TouchableOpacity
            onPress={() => setApplyModal('revert')}
            style={[styles.applyBtn, { backgroundColor: '#f97316' }]}
          >
            <Ionicons name="arrow-undo" size={15} color="#fff" />
            <Text style={styles.applyBtnText}>Annuler</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setApplyModal('apply')}
            style={styles.applyBtn}
          >
            <Ionicons name="play-circle-outline" size={16} color="#fff" />
            <Text style={styles.applyBtnText}>Appliquer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark-done" size={18} color="#fff" />
          }
          <Text style={styles.saveBtnText}>{saving ? '…' : 'Sauv.'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          const isDep = tab.key === 'departures';
          return (
            <TouchableOpacity
              key={String(tab.key)}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, isActive && styles.tabActive, isDep && styles.tabDep, isActive && isDep && styles.tabDepActive]}
              activeOpacity={0.7}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon as any}
                  size={13}
                  color={isActive ? (isDep ? '#dc2626' : '#3b82f6') : '#94a3b8'}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.tabText, isActive && styles.tabTextActive, isActive && isDep && { color: '#dc2626' }]}>
                {tab.label}
              </Text>
              {tab.count !== undefined && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive, isActive && isDep && { backgroundColor: '#fef2f2' }]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive, isActive && isDep && { color: '#dc2626' }]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Pool Tab ── */}
      {activeTab === 'pool' && (
        <View style={{ flex: 1 }}>
          {/* Search + add recruit */}
          <View style={styles.poolTop}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un joueur…"
                value={search}
                onChangeText={setSearch}
                placeholderTextColor="#9ca3af"
                clearButtonMode="while-editing"
              />
            </View>
            <TouchableOpacity onPress={() => setRecruitModal(true)} style={styles.addRecruitBtn}>
              <Ionicons name="person-add-outline" size={17} color="#7c3aed" />
            </TouchableOpacity>
          </View>

          {/* Position filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            {[
              { pos: '', label: 'Tous' },
              { pos: 'Gardien', label: 'GK' },
              { pos: 'Meneur',  label: 'MEN' },
              { pos: 'Ailier',  label: 'AIL' },
              { pos: 'Pivot',   label: 'PIV' },
            ].map(({ pos, label }) => {
              const isActive = filterPos === pos;
              const pc = pos ? posColor(pos) : null;
              return (
                <TouchableOpacity
                  key={pos || 'all'}
                  onPress={() => setFilterPos(pos === filterPos ? '' : pos)}
                  style={[
                    styles.filterChip,
                    isActive && (pc ? { backgroundColor: pc.bg, borderColor: pc.border } : styles.filterChipAll),
                  ]}
                >
                  <Text style={[styles.filterChipText, isActive && (pc ? { color: pc.text } : { color: '#3b82f6' })]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pool count */}
          <View style={styles.poolMeta}>
            <Text style={styles.poolMetaText}>
              {filteredPool.length} / {planning.unassigned.length} joueur{planning.unassigned.length !== 1 ? 's' : ''} non assignés
            </Text>
          </View>

          {/* Player list */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {filteredPool.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>
                  {planning.unassigned.length === 0 ? 'Tous les joueurs sont placés !' : 'Aucun résultat'}
                </Text>
              </View>
            ) : (
              filteredPool.map(id => (
                <PoolRow
                  key={id}
                  cardId={id}
                  player={getPlayer(id)}
                  recruit={getRecruit(id)}
                  selected={sheet?.kind === 'place' && sheet.playerId === id}
                  onPress={() => {
                    if (sheet?.kind === 'place' && sheet.playerId === id) {
                      setSheet(null);
                    } else {
                      setSheet({ kind: 'place', playerId: id });
                    }
                  }}
                  onLongPress={() => handleCardLongPress(id)}
                />
              ))
            )}
          </ScrollView>

          {/* Selected player floating bar */}
          {sheet?.kind === 'place' && (
            <View style={styles.floatBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.floatName} numberOfLines={1}>
                  👤 {getCardName(sheet.playerId)}
                </Text>
                <Text style={styles.floatHint}>Choisissez une équipe et un niveau</Text>
              </View>
              <TouchableOpacity onPress={() => setSheet(null)} style={styles.floatClose}>
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
              {/* Quick team buttons */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingLeft: 8 }}>
                {teamList.map(team => {
                  const ts = planning.teams[team.id];
                  return (
                    <View key={team.id} style={{ gap: 4 }}>
                      <Text style={[styles.floatTeamLabel, { color: team.color || '#6366f1' }]}>{team.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {Array.from({ length: ts.hierarchyCount }, (_, i) => i + 1).map(h => {
                          const hc = hColor(h);
                          const label = ts.hierarchyNames?.[h] ?? DEFAULT_H_NAMES[h];
                          return (
                            <TouchableOpacity
                              key={h}
                              onPress={() => assignToSlot(sheet.playerId, team.id, h)}
                              style={[styles.floatSlotBtn, { backgroundColor: hc.bg, borderColor: hc.border }]}
                            >
                              <Text style={[styles.floatSlotBtnText, { color: hc.badge }]}>H{h}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                <View style={{ gap: 4 }}>
                  <Text style={[styles.floatTeamLabel, { color: '#dc2626' }]}>Départs</Text>
                  <TouchableOpacity
                    onPress={() => { moveToDepartures(sheet.playerId); setSheet(null); }}
                    style={[styles.floatSlotBtn, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}
                  >
                    <Ionicons name="exit-outline" size={14} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* ── Team Tab ── */}
      {activeTeamObj && activeTeamState && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Team header */}
          <View style={[styles.teamHeader, { borderLeftColor: activeTeamObj.color || '#6366f1' }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.teamDot, { backgroundColor: activeTeamObj.color || '#6366f1' }]} />
                <Text style={styles.teamName}>{activeTeamObj.name}</Text>
                {activeTeamObj.category && <Text style={styles.teamCat}>{activeTeamObj.category}</Text>}
              </View>
              {/* Stats */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {(() => {
                  const all = Object.values(activeTeamState.slots).flat();
                  const gk  = all.filter(id => getCardPos(id) === 'Gardien').length;
                  const field = all.length - gk;
                  return (
                    <>
                      <View style={styles.statBadge}>
                        <Text style={styles.statText}>{field} joueur{field !== 1 ? 's' : ''} de champ</Text>
                      </View>
                      <View style={[styles.statBadge, { backgroundColor: '#fef9c3', borderColor: '#fde68a' }]}>
                        <Text style={[styles.statText, { color: '#a16207' }]}>{gk} GK</Text>
                      </View>
                      <View style={[styles.statBadge, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                        <Text style={[styles.statText, { color: '#1d4ed8' }]}>{all.length} total</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
            {/* Hierarchy controls */}
            <View style={styles.hierControls}>
              <Text style={styles.hierControlLabel}>Niveaux</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() => changeHierarchy(activeTeamObj.id, -1)}
                  disabled={activeTeamState.hierarchyCount <= 1}
                  style={[styles.hierBtn, activeTeamState.hierarchyCount <= 1 && { opacity: 0.3 }]}
                >
                  <Ionicons name="remove" size={16} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.hierCount}>{activeTeamState.hierarchyCount}</Text>
                <TouchableOpacity
                  onPress={() => changeHierarchy(activeTeamObj.id, +1)}
                  disabled={activeTeamState.hierarchyCount >= 5}
                  style={[styles.hierBtn, activeTeamState.hierarchyCount >= 5 && { opacity: 0.3 }]}
                >
                  <Ionicons name="add" size={16} color="#374151" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Hierarchy sections */}
          <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
            {Array.from({ length: activeTeamState.hierarchyCount }, (_, i) => i + 1).map(h => {
              const label = activeTeamState.hierarchyNames?.[h] ?? DEFAULT_H_NAMES[h];
              const cards = activeTeamState.slots[h] ?? [];
              return (
                <HierSection
                  key={h}
                  teamId={activeTeamObj.id}
                  h={h}
                  label={label}
                  cards={cards}
                  confirmed={planning.confirmed ?? []}
                  getPlayer={getPlayer}
                  getRecruit={getRecruit}
                  onAddFromPool={() => {
                    setPickSearch('');
                    setSheet({ kind: 'pick', teamId: activeTeamObj.id, h });
                  }}
                  onLongPress={handleCardLongPress}
                  onConfirmToggle={toggleConfirmed}
                  onLabelEdit={() => {
                    setEditLabelModal({ teamId: activeTeamObj.id, h, current: label });
                    setEditLabelValue(label);
                  }}
                />
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* ── Departures Tab ── */}
      {activeTab === 'departures' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
          <View style={styles.departCard}>
            {/* Header */}
            <View style={styles.departHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.hBadge, { backgroundColor: '#dc2626' }]}>
                  <Ionicons name="exit-outline" size={10} color="#fff" />
                </View>
                <Text style={styles.departTitle}>Départs du club</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.departCount}>{planning.departures.length} joueur{planning.departures.length !== 1 ? 's' : ''}</Text>
                {planning.appliedAt && planning.departures.length > 0 && (
                  <View style={styles.appliedBadge}>
                    <Text style={styles.appliedBadgeText}>status: left ✓</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Players */}
            {planning.departures.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={32} color="#fca5a5" />
                <Text style={[styles.emptyText, { color: '#fca5a5' }]}>Aucun départ enregistré</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
                  Depuis le pool, sélectionnez un joueur et choisissez "Départs"
                </Text>
              </View>
            ) : (
              <View style={{ gap: 1 }}>
                {planning.departures.map(id => (
                  <View key={id} style={styles.departRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.departName}>{getCardName(id)}</Text>
                      <PosBadge position={getCardPos(id)} />
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCardLongPress(id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Assignment bottom sheet (pick from pool) ── */}
      <BottomSheet
        visible={sheet?.kind === 'pick'}
        onClose={() => { setSheet(null); setPickSearch(''); }}
        title={sheet?.kind === 'pick'
          ? `Ajouter → ${teamList.find(t => t.id === (sheet as any).teamId)?.name ?? ''} · H${(sheet as any).h}`
          : ''}
      >
        {sheet?.kind === 'pick' && (
          <View style={{ maxHeight: SCREEN_H * 0.55 }}>
            <View style={[styles.searchBar, { marginHorizontal: 16, marginBottom: 10 }]}>
              <Ionicons name="search-outline" size={16} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                placeholder="Filtrer…"
                value={pickSearch}
                onChangeText={setPickSearch}
                placeholderTextColor="#9ca3af"
                clearButtonMode="while-editing"
              />
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              {filteredPickPool.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    {planning.unassigned.length === 0 ? 'Aucun joueur dans le pool' : 'Aucun résultat'}
                  </Text>
                </View>
              ) : (
                filteredPickPool.map(id => (
                  <PoolRow
                    key={id}
                    cardId={id}
                    player={getPlayer(id)}
                    recruit={getRecruit(id)}
                    selected={false}
                    onPress={() => assignToSlot(id, (sheet as any).teamId, (sheet as any).h)}
                    onLongPress={() => {}}
                  />
                ))
              )}
            </ScrollView>
          </View>
        )}
      </BottomSheet>

      {/* ── Apply modal ── */}
      <Modal visible={applyModal === 'apply'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.applyModalHeader}>
              <View style={[styles.applyIconWrap, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="play-circle-outline" size={24} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Appliquer la saison {season}</Text>
                <Text style={styles.applyModalSub}>Cette action modifie les données réelles des joueurs.</Text>
              </View>
            </View>

            {planSummary && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCell, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <Text style={[styles.summaryNum, { color: '#dc2626' }]}>{planSummary.departureCount}</Text>
                  <Text style={[styles.summaryLabel, { color: '#dc2626' }]}>Départ{planSummary.departureCount !== 1 ? 's' : ''}</Text>
                  <Text style={styles.summaryHint}>status → left</Text>
                </View>
                <View style={[styles.summaryCell, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                  <Text style={[styles.summaryNum, { color: '#2563eb' }]}>{planSummary.assignedCount}</Text>
                  <Text style={[styles.summaryLabel, { color: '#2563eb' }]}>Réassign.</Text>
                  <Text style={styles.summaryHint}>teams MAJ</Text>
                </View>
                <View style={[styles.summaryCell, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                  <Text style={[styles.summaryNum, { color: '#64748b' }]}>{planSummary.unassignedCount}</Text>
                  <Text style={[styles.summaryLabel, { color: '#64748b' }]}>Pool</Text>
                  <Text style={styles.summaryHint}>non touchés</Text>
                </View>
              </View>
            )}

            <View style={styles.applyWarning}>
              <Ionicons name="warning-outline" size={15} color="#92400e" />
              <Text style={styles.applyWarningText}>Un snapshot sera créé — tu pourras annuler l&apos;opération.</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setApplyModal(null)} disabled={applying} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApply}
                disabled={applying}
                style={[styles.modalConfirm, { backgroundColor: '#16a34a' }, applying && { opacity: 0.6 }]}
              >
                {applying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="play-circle-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                }
                <Text style={styles.modalConfirmText}>{applying ? 'Application…' : 'Appliquer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Revert modal ── */}
      <Modal visible={applyModal === 'revert'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.applyModalHeader}>
              <View style={[styles.applyIconWrap, { backgroundColor: '#ffedd5' }]}>
                <Ionicons name="arrow-undo" size={24} color="#ea580c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Annuler l&apos;application</Text>
                <Text style={styles.applyModalSub}>Remet les joueurs dans leur état d&apos;avant.</Text>
              </View>
            </View>

            <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 12 }}>
              Les statuts et appartenances d&apos;équipe seront restaurés depuis le snapshot de sécurité. Le plan de planification sera conservé.
            </Text>

            {planning?.appliedAt && (
              <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginBottom: 12 }}>
                Appliqué le {new Date(planning.appliedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            )}

            <View style={[styles.applyWarning, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
              <Ionicons name="warning-outline" size={15} color="#c2410c" />
              <Text style={[styles.applyWarningText, { color: '#9a3412' }]}>Le plan de planification restera intact, seules les données réelles sont restaurées.</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setApplyModal(null)} disabled={applying} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Garder</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRevert}
                disabled={applying}
                style={[styles.modalConfirm, { backgroundColor: '#ea580c' }, applying && { opacity: 0.6 }]}
              >
                {applying
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="arrow-undo" size={16} color="#fff" style={{ marginRight: 4 }} />
                }
                <Text style={styles.modalConfirmText}>{applying ? 'Restauration…' : 'Restaurer'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Recruit modal ── */}
      <Modal visible={recruitModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nouvelle recrue</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nom prénom"
              value={recruitName}
              onChangeText={setRecruitName}
              autoFocus
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.modalLabel}>Poste</Text>
            <View style={styles.posOptions}>
              {['Gardien', 'Meneur', 'Ailier', 'Pivot'].map(pos => {
                const pc = posColor(pos);
                const active = recruitPos === pos;
                return (
                  <TouchableOpacity
                    key={pos}
                    onPress={() => setRecruitPos(pos)}
                    style={[styles.posOption, active && { backgroundColor: pc.bg, borderColor: pc.border }]}
                  >
                    <Text style={[styles.posOptionText, active && { color: pc.text, fontWeight: '700' }]}>{pos}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRecruitModal(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateRecruit} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit label modal ── */}
      <Modal visible={!!editLabelModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Renommer le niveau</Text>
            <TextInput
              style={styles.modalInput}
              value={editLabelValue}
              onChangeText={setEditLabelValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditLabelModal(null)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!editLabelModal) return;
                  const { teamId, h } = editLabelModal;
                  setPlanning(prev => {
                    if (!prev) return prev;
                    const n = deepClone(prev);
                    if (!n.teams[teamId].hierarchyNames) n.teams[teamId].hierarchyNames = {};
                    n.teams[teamId].hierarchyNames![h] = editLabelValue.trim() || DEFAULT_H_NAMES[h];
                    return n;
                  });
                  setEditLabelModal(null);
                }}
                style={styles.modalConfirm}
              >
                <Text style={styles.modalConfirmText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit recruit modal ── */}
      <Modal visible={!!editRecruitModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Modifier la recrue</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nom prénom"
              value={editRecruitName}
              onChangeText={setEditRecruitName}
              autoFocus
              selectTextOnFocus
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.modalLabel}>Poste</Text>
            <View style={styles.posOptions}>
              {['Gardien', 'Meneur', 'Ailier', 'Pivot'].map(pos => {
                const pc = posColor(pos);
                const active = editRecruitPos === pos;
                return (
                  <TouchableOpacity
                    key={pos}
                    onPress={() => setEditRecruitPos(pos)}
                    style={[styles.posOption, active && { backgroundColor: pc.bg, borderColor: pc.border }]}
                  >
                    <Text style={[styles.posOptionText, active && { color: pc.text, fontWeight: '700' }]}>{pos}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditRecruitModal(null)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdateRecruit} style={styles.modalConfirm}>
                <Text style={styles.modalConfirmText}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Season picker ── */}
      <Modal visible={seasonModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSeasonModal(false)}>
          <View style={[styles.modalBox, { maxHeight: 360 }]}>
            <Text style={styles.modalTitle}>Choisir une saison</Text>
            <ScrollView>
              {seasons.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setSeason(s); setSeasonModal(false); }}
                  style={[styles.seasonOption, s === season && styles.seasonOptionActive]}
                >
                  <Text style={[styles.seasonOptionText, s === season && { color: '#3b82f6', fontWeight: '700' }]}>{s}</Text>
                  {s === season && <Ionicons name="checkmark" size={16} color="#3b82f6" />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => {
                  const [a, b] = season.split('-').map(Number);
                  const next = `${a + 1}-${b + 1}`;
                  if (!seasons.includes(next)) setSeasons(prev => [next, ...prev]);
                  setSeason(next);
                  setSeasonModal(false);
                }}
                style={styles.seasonOption}
              >
                <Text style={[styles.seasonOptionText, { color: '#3b82f6' }]}>+ Saison suivante</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#f1f5f9' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:    { fontSize: 14, color: '#94a3b8' },

  // ── Top bar
  topBar:         {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 14, paddingTop: Platform.OS === 'ios' ? 52 : 16, paddingBottom: 14,
  },
  backBtn:        { padding: 2 },
  topTitle:       { fontSize: 15, fontWeight: '700', color: '#fff', lineHeight: 20 },
  seasonRow:      { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  seasonText:     { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  savedHint:      { fontSize: 11, color: 'rgba(255,255,255,0.45)' },
  saveBtn:        {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  saveBtnText:    { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Tab bar
  tabBar:         { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', maxHeight: 48 },
  tabBarContent:  { paddingHorizontal: 12, gap: 4, alignItems: 'center', paddingVertical: 6 },
  tab:            {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'transparent',
  },
  tabActive:      { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  tabDep:         {},
  tabDepActive:   { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  tabText:        { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  tabTextActive:  { color: '#3b82f6', fontWeight: '700' },
  tabBadge:       { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: '#dbeafe' },
  tabBadgeText:   { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  tabBadgeTextActive: { color: '#3b82f6' },

  // ── Pool
  poolTop:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  searchBar:      {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 12, height: 42,
  },
  searchInput:    { flex: 1, fontSize: 14, color: '#0f172a' },
  addRecruitBtn:  {
    width: 42, height: 42, borderRadius: 12, backgroundColor: '#faf5ff',
    borderWidth: 1, borderColor: '#e9d5ff',
    justifyContent: 'center', alignItems: 'center',
  },
  filterScroll:   { maxHeight: 40 },
  filterContent:  { paddingHorizontal: 14, gap: 6, alignItems: 'center' },
  filterChip:     {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  filterChipAll:  { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  poolMeta:       { paddingHorizontal: 14, paddingVertical: 6 },
  poolMetaText:   { fontSize: 11, color: '#94a3b8', fontWeight: '500' },

  // ── Pool row
  poolRow:        {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  poolRowSelected: { backgroundColor: '#eff6ff', borderBottomColor: '#bfdbfe' },
  poolRowLeft:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  poolNum:        { fontSize: 12, fontWeight: '700', color: '#cbd5e1', minWidth: 28 },
  poolName:       { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  poolNameSelected: { color: '#1d4ed8' },
  recrueLabel:    { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 1 },
  poolRowRight:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },

  // ── Floating bar
  floatBar:       {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12,
    elevation: 10,
  },
  floatName:      { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  floatHint:      { fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 8 },
  floatClose:     { position: 'absolute', top: 12, right: 14 },
  floatTeamLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  floatSlotBtn:   {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1.5,
    minWidth: 36, alignItems: 'center', justifyContent: 'center',
  },
  floatSlotBtnText: { fontSize: 11, fontWeight: '800' },

  // ── Team header
  teamHeader:     {
    margin: 14, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
    borderLeftWidth: 4,
    padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  teamDot:        { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  teamName:       { fontSize: 16, fontWeight: '800', color: '#111' },
  teamCat:        { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  statBadge:      { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#f3f4f6', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  statText:       { fontSize: 11, color: '#374151', fontWeight: '600' },
  hierControls:   { alignItems: 'center' },
  hierControlLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  hierBtn:        { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  hierCount:      { fontSize: 18, fontWeight: '800', color: '#374151', minWidth: 24, textAlign: 'center' },

  // ── Hierarchy section
  hierSection:    {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb',
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  hierSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  hBadge:         { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  hBadgeText:     { color: '#fff', fontSize: 10, fontWeight: '800' },
  hierSectionLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: '#374151' },
  hierSectionCount: { fontSize: 11, color: '#9ca3af', marginRight: 2 },

  // ── Chips wrap
  chipsWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10 },

  // ── Slot chip
  chip:           {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  chipConfirmed:  { borderLeftWidth: 3, borderLeftColor: '#10b981', backgroundColor: '#f0fdf4', borderColor: '#6ee7b7' },
  chipDot:        { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#d1d5db' },
  chipDotOn:      { backgroundColor: '#10b981', borderColor: '#10b981' },
  chipNum:        { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  chipName:       { fontSize: 12, fontWeight: '600', color: '#1e293b', maxWidth: 100 },
  recBadge:       { width: 16, height: 16, borderRadius: 8, backgroundColor: '#f3e8ff', justifyContent: 'center', alignItems: 'center' },
  recText:        { fontSize: 8, fontWeight: '800', color: '#7c3aed' },

  // ── Add from pool button
  addFromPool:    {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  addFromPoolText: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },

  // ── Departures
  departCard:     { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#fecaca', overflow: 'hidden' },
  departHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#fef2f2' },
  departTitle:    { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  departCount:    { fontSize: 12, color: '#fca5a5', fontWeight: '600' },
  departRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#fef2f2' },
  departName:     { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },

  // ── Empty state
  emptyState:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:      { fontSize: 14, color: '#9ca3af', textAlign: 'center', fontWeight: '500' },

  // ── Bottom sheet
  sheetOverlay:   { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:          {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 20,
  },
  sheetHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sheetTitle:     { fontSize: 15, fontWeight: '700', color: '#1e293b', flex: 1, marginRight: 12 },

  // ── Position badge
  posBadge:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  posText:        { fontSize: 10, fontWeight: '800' },

  // ── Modals
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  modalBox:       { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '88%' },
  modalTitle:     { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 14 },
  modalLabel:     { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 8 },
  modalInput:     { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111' },
  posOptions:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posOption:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0' },
  posOptionText:  { fontSize: 13, color: '#374151' },
  modalActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalCancel:    { paddingHorizontal: 14, paddingVertical: 10 },
  modalCancelText: { fontSize: 14, color: '#6b7280' },
  modalConfirm:   { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1e3a5f', borderRadius: 10 },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  seasonOption:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  seasonOptionActive: { backgroundColor: '#eff6ff' },
  seasonOptionText: { fontSize: 14, color: '#374151' },

  // ── Apply button (top bar)
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
  },
  applyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // ── Apply modal
  applyModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  applyIconWrap:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  applyModalSub:    { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 16 },

  // ── Summary row
  summaryRow:  { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCell: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  summaryNum:  { fontSize: 22, fontWeight: '900', lineHeight: 26 },
  summaryLabel:{ fontSize: 11, fontWeight: '700', marginTop: 2 },
  summaryHint: { fontSize: 9, color: '#9ca3af', marginTop: 2 },

  // ── Warning box
  applyWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: 10, padding: 10, marginBottom: 4,
  },
  applyWarningText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },

  // ── Applied badge (departures)
  appliedBadge:     { backgroundColor: '#dcfce7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#86efac' },
  appliedBadgeText: { fontSize: 10, fontWeight: '700', color: '#15803d' },
});
