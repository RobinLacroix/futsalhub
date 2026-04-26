import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, ActionSheetIOS, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByClubWithTeams } from '../../../lib/services/players';
import {
  loadSeasonPlanning, saveSeasonPlanning, listSeasons,
  PlanningData, RecruitData, TeamPlanningState,
} from '../../../lib/services/seasonPlanning';
import type { Player, Team } from '../../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function currentSeason(): string {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

const POSITION_COLORS: Record<string, { bg: string; text: string }> = {
  Gardien: { bg: '#fef9c3', text: '#a16207' },
  Meneur:  { bg: '#dbeafe', text: '#1d4ed8' },
  Ailier:  { bg: '#dcfce7', text: '#15803d' },
  Pivot:   { bg: '#fee2e2', text: '#b91c1c' },
};
const posColor = (p: string) => POSITION_COLORS[p] ?? { bg: '#f3f4f6', text: '#374151' };

const H_COLORS = [
  { border: '#6ee7b7', bg: '#f0fdf4', badge: '#10b981' },
  { border: '#93c5fd', bg: '#eff6ff', badge: '#3b82f6' },
  { border: '#fcd34d', bg: '#fffbeb', badge: '#f59e0b' },
  { border: '#fdba74', bg: '#fff7ed', badge: '#f97316' },
  { border: '#d1d5db', bg: '#f9fafb', badge: '#9ca3af' },
];
const hColor = (h: number) => H_COLORS[Math.min(h - 1, 4)];

const DEFAULT_H_NAMES: Record<number, string> = {
  1: 'Hiérarchie 1', 2: 'Hiérarchie 2', 3: 'Hiérarchie 3',
  4: 'Hiérarchie 4', 5: 'Hiérarchie 5',
};

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

type Zone =
  | { type: 'unassigned' }
  | { type: 'departure' }
  | { type: 'slot'; teamId: string; h: number };

// ── sub-components ────────────────────────────────────────────────────────────

interface CardProps {
  cardId: string;
  player?: Player;
  recruit?: RecruitData;
  selected: boolean;
  confirmed: boolean;
  showConfirm: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

function PlayerCard({ cardId, player, recruit, selected, confirmed, showConfirm, onPress, onLongPress }: CardProps) {
  const name  = player ? `${player.first_name} ${player.last_name}` : recruit?.name ?? '—';
  const pos   = player?.position ?? recruit?.position ?? '';
  const num   = player?.number;
  const pc    = posColor(pos);
  const isRec = cardId.startsWith('recruit|');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        selected  && styles.cardSelected,
        confirmed && styles.cardConfirmed,
      ]}
    >
      {showConfirm && (
        <View style={[styles.confirmDot, confirmed && styles.confirmDotOn]} />
      )}
      {num != null && <Text style={styles.cardNum}>{num}</Text>}
      <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
      {pos ? (
        <View style={[styles.posBadge, { backgroundColor: pc.bg }]}>
          <Text style={[styles.posText, { color: pc.text }]}>{pos.substring(0, 3).toUpperCase()}</Text>
        </View>
      ) : null}
      {isRec && (
        <View style={styles.recBadge}>
          <Text style={styles.recText}>RECRUE</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

interface SlotProps {
  teamId: string;
  h: number;
  label: string;
  cards: string[];
  hc: typeof H_COLORS[0];
  selectedId: string | null;
  confirmed: string[];
  onSlotPress: (zone: Zone) => void;
  onCardPress: (cardId: string) => void;
  onCardLongPress: (cardId: string) => void;
  getPlayer: (id: string) => Player | undefined;
  getRecruit: (id: string) => RecruitData | undefined;
  onLabelEdit: () => void;
}

function HierarchySlot({ teamId, h, label, cards, hc, selectedId, confirmed, onSlotPress, onCardPress, onCardLongPress, getPlayer, getRecruit, onLabelEdit }: SlotProps) {
  return (
    <View style={[styles.slot, { backgroundColor: hc.bg, borderColor: hc.border }]}>
      <View style={styles.slotHeader}>
        <View style={[styles.hBadge, { backgroundColor: hc.badge }]}>
          <Text style={styles.hBadgeText}>{h}</Text>
        </View>
        <TouchableOpacity onPress={onLabelEdit} style={styles.slotLabelBtn}>
          <Text style={styles.slotLabel}>{label}</Text>
          <Ionicons name="pencil-outline" size={11} color="#9ca3af" style={{ marginLeft: 3 }} />
        </TouchableOpacity>
        <Text style={styles.slotCount}>({cards.length})</Text>
      </View>
      <TouchableOpacity
        activeOpacity={selectedId ? 0.6 : 1}
        onPress={() => selectedId && onSlotPress({ type: 'slot', teamId, h })}
        style={[styles.dropArea, selectedId && styles.dropAreaActive]}
      >
        {cards.length === 0 ? (
          <Text style={styles.dropHint}>{selectedId ? 'Placer ici' : 'Vide'}</Text>
        ) : (
          <View style={styles.cardsWrap}>
            {cards.map(id => (
              <PlayerCard
                key={id}
                cardId={id}
                player={getPlayer(id)}
                recruit={getRecruit(id)}
                selected={selectedId === id}
                confirmed={confirmed.includes(id)}
                showConfirm
                onPress={() => onCardPress(id)}
                onLongPress={() => onCardLongPress(id)}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function SeasonPlanningScreen() {
  const router = useRouter();
  const { teams, activeTeam } = useActiveTeam();
  const clubId = activeTeam?.club_id ?? '';

  const [season, setSeason]       = useState(currentSeason());
  const [seasons, setSeasons]     = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerTeamMap, setPlayerTeamMap] = useState<Map<string, string[]>>(new Map());
  const [planning, setPlanning]   = useState<PlanningData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [savedAt, setSavedAt]     = useState<Date | null>(null);

  // selected card (tap-to-place)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // filters
  const [search, setSearch]       = useState('');
  const [filterPos, setFilterPos] = useState('');

  // recruit modal
  const [recruitModal, setRecruitModal] = useState(false);
  const [recruitName, setRecruitName]   = useState('');
  const [recruitPos, setRecruitPos]     = useState('Meneur');

  // hierarchy label editing
  const [editLabelModal, setEditLabelModal] = useState<{ teamId: string; h: number; current: string } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');

  // season picker
  const [seasonModal, setSeasonModal] = useState(false);

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
        const map = new Map<string, string[]>();
        rows.forEach(r => map.set(r.player.id, r.teamIds));
        setPlayerTeamMap(map);

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

  // reload when season changes
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

  // ── card selection & placement ─────────────────────────────────────────────
  const handleCardPress = (cardId: string) => {
    setSelectedId(prev => prev === cardId ? null : cardId);
  };

  const handleSlotPress = (zone: Zone) => {
    if (!selectedId || !planning) return;
    setPlanning(prev => {
      if (!prev) return prev;
      return addToZone(removeFromAll(prev, selectedId), selectedId, zone);
    });
    setSelectedId(null);
  };

  const handleCardLongPress = (cardId: string) => {
    const options = ['Retirer vers non assignés', 'Valider / Annuler validation', 'Annuler'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, destructiveButtonIndex: 0 },
        (i) => {
          if (i === 0) moveToUnassigned(cardId);
          if (i === 1) toggleConfirmed(cardId);
        }
      );
    } else {
      Alert.alert('Action', undefined, [
        { text: 'Retirer vers non assignés', onPress: () => moveToUnassigned(cardId) },
        { text: 'Valider / Annuler validation', onPress: () => toggleConfirmed(cardId) },
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  };

  const moveToUnassigned = (cardId: string) => {
    setPlanning(prev => prev ? addToZone(removeFromAll(prev, cardId), cardId, { type: 'unassigned' }) : prev);
    setSelectedId(null);
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

  // ── hierarchy controls ─────────────────────────────────────────────────────
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

  // ── helpers ────────────────────────────────────────────────────────────────
  const getPlayer  = (id: string) => allPlayers.find(p => p.id === id);
  const getRecruit = (id: string) => planning?.recruits[id];

  const getCardPos = (id: string) => getPlayer(id)?.position ?? getRecruit(id)?.position ?? '';

  const teamStats = (t: TeamPlanningState) => {
    const all = Object.values(t.slots).flat();
    const gk  = all.filter(id => getCardPos(id) === 'Gardien').length;
    return { field: all.length - gk, gk };
  };

  const filteredUnassigned = (planning?.unassigned ?? []).filter(id => {
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

  const teamList = teams.filter(t => planning?.teams[t.id]);

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }
  if (!planning) return null;

  return (
    <View style={styles.root}>
      {/* ── top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.backText}>Effectif</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Planification saison</Text>
        <View style={styles.topRight}>
          <TouchableOpacity onPress={() => setSeasonModal(true)} style={styles.seasonBtn}>
            <Text style={styles.seasonText}>{season}</Text>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </TouchableOpacity>
          {savedAt && (
            <Text style={styles.savedHint}>
              {savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          >
            <Ionicons name="checkmark" size={15} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── hint when a card is selected ── */}
      {selectedId && (
        <View style={styles.hint}>
          <Ionicons name="hand-left-outline" size={14} color="#1d4ed8" />
          <Text style={styles.hintText}>
            Sélectionné : <Text style={{ fontWeight: '700' }}>
              {getPlayer(selectedId)?.first_name ?? getRecruit(selectedId)?.name}
            </Text>  — Appuyez sur un emplacement pour placer le joueur
          </Text>
          <TouchableOpacity onPress={() => setSelectedId(null)}>
            <Ionicons name="close-circle" size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.body}>
        {/* ── left panel: unassigned ── */}
        <View style={styles.leftPanel}>
          {/* header */}
          <View style={styles.leftHeader}>
            <View>
              <Text style={styles.leftTitle}>Non assignés</Text>
              <Text style={styles.leftCount}>
                {filteredUnassigned.length}/{planning.unassigned.length} joueur{planning.unassigned.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setRecruitModal(true)} style={styles.recruitBtn}>
              <Ionicons name="person-add-outline" size={16} color="#7c3aed" />
              <Text style={styles.recruitBtnText}>Recrue</Text>
            </TouchableOpacity>
          </View>

          {/* search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={15} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher un joueur…"
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#9ca3af"
              clearButtonMode="while-editing"
            />
          </View>

          {/* position filter — grille 2×2 + bouton Tous */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Poste</Text>
            <View style={styles.filterGrid}>
              <TouchableOpacity
                onPress={() => setFilterPos('')}
                style={[styles.filterBtn, filterPos === '' && styles.filterBtnActive, { flex: 1 }]}
              >
                <Text style={[styles.filterBtnText, filterPos === '' && styles.filterBtnTextActive]}>Tous</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.filterGrid}>
              {[
                { pos: 'Gardien', short: 'GK',  color: '#a16207', bg: '#fef9c3' },
                { pos: 'Meneur',  short: 'MEN', color: '#1d4ed8', bg: '#dbeafe' },
                { pos: 'Ailier',  short: 'AIL', color: '#15803d', bg: '#dcfce7' },
                { pos: 'Pivot',   short: 'PIV', color: '#b91c1c', bg: '#fee2e2' },
              ].map(({ pos, short, color, bg }) => (
                <TouchableOpacity
                  key={pos}
                  onPress={() => setFilterPos(filterPos === pos ? '' : pos)}
                  style={[
                    styles.filterBtnPos,
                    filterPos === pos
                      ? { backgroundColor: bg, borderColor: color }
                      : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
                  ]}
                >
                  <Text style={[styles.filterBtnPosText, { color: filterPos === pos ? color : '#64748b' }]}>
                    {short}
                  </Text>
                  <Text style={[styles.filterBtnPosLabel, { color: filterPos === pos ? color : '#94a3b8' }]}>
                    {pos}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* pool */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.poolContent}
            keyboardShouldPersistTaps="handled"
          >
            {filteredUnassigned.length === 0 ? (
              <View style={styles.poolEmpty}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#d1d5db" />
                <Text style={styles.poolEmptyText}>
                  {planning.unassigned.length === 0 ? 'Tous les joueurs sont placés !' : 'Aucun résultat'}
                </Text>
              </View>
            ) : (
              filteredUnassigned.map(id => (
                <PlayerCard
                  key={id}
                  cardId={id}
                  player={getPlayer(id)}
                  recruit={getRecruit(id)}
                  selected={selectedId === id}
                  confirmed={(planning.confirmed ?? []).includes(id)}
                  showConfirm={false}
                  onPress={() => handleCardPress(id)}
                  onLongPress={() => handleCardLongPress(id)}
                />
              ))
            )}
          </ScrollView>

          {/* "placer ici" quand un joueur est sélectionné */}
          {selectedId && (
            <TouchableOpacity
              style={styles.placeUnassignedBtn}
              onPress={() => handleSlotPress({ type: 'unassigned' })}
            >
              <Ionicons name="arrow-down-outline" size={15} color="#fff" />
              <Text style={styles.placeUnassignedText}>Retirer dans le pool</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── right: board ── */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
          {/* departures */}
          <View style={styles.departBox}>
            <TouchableOpacity
              activeOpacity={selectedId ? 0.6 : 1}
              onPress={() => selectedId && handleSlotPress({ type: 'departure' })}
              style={[styles.departHeader, selectedId && { opacity: 0.85 }]}
            >
              <Ionicons name="exit-outline" size={16} color="#dc2626" />
              <Text style={styles.departTitle}>Départs du club</Text>
              <Text style={styles.departCount}>({planning.departures.length})</Text>
              {selectedId && <Text style={styles.placeHere}>  → Placer ici</Text>}
            </TouchableOpacity>
            {planning.departures.length > 0 && (
              <View style={styles.cardsWrap}>
                {planning.departures.map(id => (
                  <PlayerCard
                    key={id}
                    cardId={id}
                    player={getPlayer(id)}
                    recruit={getRecruit(id)}
                    selected={selectedId === id}
                    confirmed={(planning.confirmed ?? []).includes(id)}
                    showConfirm
                    onPress={() => handleCardPress(id)}
                    onLongPress={() => handleCardLongPress(id)}
                  />
                ))}
              </View>
            )}
          </View>

          {/* teams grid */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.teamsRow}>
              {teamList.map(team => {
                const ts = planning.teams[team.id];
                if (!ts) return null;
                const { field, gk } = teamStats(ts);
                return (
                  <View key={team.id} style={styles.teamBox}>
                    {/* team header */}
                    <View style={[styles.teamHeader, { borderBottomColor: team.color || '#6366f1' }]}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.teamNameRow}>
                          <View style={[styles.teamDot, { backgroundColor: team.color || '#6366f1' }]} />
                          <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
                          <Text style={styles.teamCat}>{team.category}</Text>
                        </View>
                        <View style={styles.teamStatsRow}>
                          <View style={styles.statBadge}>
                            <Text style={styles.statText}>{field} joueur{field !== 1 ? 's' : ''} de champ</Text>
                          </View>
                          <View style={[styles.statBadge, { backgroundColor: '#fef9c3' }]}>
                            <Text style={[styles.statText, { color: '#a16207' }]}>{gk} GK</Text>
                          </View>
                        </View>
                      </View>
                      {/* hierarchy controls */}
                      <View style={styles.hierControls}>
                        <TouchableOpacity
                          onPress={() => changeHierarchy(team.id, -1)}
                          disabled={ts.hierarchyCount <= 1}
                          style={[styles.hierBtn, ts.hierarchyCount <= 1 && { opacity: 0.3 }]}
                        >
                          <Ionicons name="remove" size={14} color="#374151" />
                        </TouchableOpacity>
                        <Text style={styles.hierCount}>{ts.hierarchyCount}</Text>
                        <TouchableOpacity
                          onPress={() => changeHierarchy(team.id, +1)}
                          disabled={ts.hierarchyCount >= 5}
                          style={[styles.hierBtn, ts.hierarchyCount >= 5 && { opacity: 0.3 }]}
                        >
                          <Ionicons name="add" size={14} color="#374151" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* hierarchy slots */}
                    {Array.from({ length: ts.hierarchyCount }, (_, i) => i + 1).map(h => {
                      const hc    = hColor(h);
                      const label = ts.hierarchyNames?.[h] ?? DEFAULT_H_NAMES[h];
                      const cards = ts.slots[h] ?? [];
                      return (
                        <HierarchySlot
                          key={h}
                          teamId={team.id}
                          h={h}
                          label={label}
                          cards={cards}
                          hc={hc}
                          selectedId={selectedId}
                          confirmed={planning.confirmed ?? []}
                          onSlotPress={handleSlotPress}
                          onCardPress={handleCardPress}
                          onCardLongPress={handleCardLongPress}
                          getPlayer={getPlayer}
                          getRecruit={getRecruit}
                          onLabelEdit={() => {
                            setEditLabelModal({ teamId: team.id, h, current: label });
                            setEditLabelValue(label);
                          }}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

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
            />
            <Text style={styles.modalLabel}>Poste</Text>
            <View style={styles.posOptions}>
              {['Gardien', 'Meneur', 'Ailier', 'Pivot'].map(pos => (
                <TouchableOpacity
                  key={pos}
                  onPress={() => setRecruitPos(pos)}
                  style={[styles.posOption, recruitPos === pos && styles.posOptionActive]}
                >
                  <Text style={[styles.posOptionText, recruitPos === pos && { color: '#fff' }]}>{pos}</Text>
                </TouchableOpacity>
              ))}
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

      {/* ── Season picker modal ── */}
      <Modal visible={seasonModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSeasonModal(false)}>
          <View style={[styles.modalBox, { maxHeight: 320 }]}>
            <Text style={styles.modalTitle}>Choisir une saison</Text>
            <ScrollView>
              {seasons.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => { setSeason(s); setSeasonModal(false); }}
                  style={[styles.seasonOption, s === season && styles.seasonOptionActive]}
                >
                  <Text style={[styles.seasonOptionText, s === season && { color: '#3b82f6', fontWeight: '700' }]}>{s}</Text>
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

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#f1f5f9' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // top bar
  topBar:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText:       { color: '#fff', fontSize: 14 },
  topTitle:       { flex: 1, color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  topRight:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seasonBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  seasonText:     { color: '#fff', fontSize: 13, fontWeight: '600' },
  savedHint:      { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  saveBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16a34a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  saveBtnText:    { color: '#fff', fontSize: 13, fontWeight: '600' },

  // hint bar
  hint:           { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe', paddingHorizontal: 12, paddingVertical: 8 },
  hintText:       { flex: 1, fontSize: 12, color: '#1d4ed8' },

  // body
  body:           { flex: 1, flexDirection: 'row' },

  // left panel
  leftPanel:      { width: 250, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e2e8f0', flexDirection: 'column' },
  leftHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  leftTitle:      { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  leftCount:      { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  recruitBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#e9d5ff', backgroundColor: '#faf5ff' },
  recruitBtnText: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  searchRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginBottom: 10, paddingHorizontal: 10, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', height: 38 },
  searchInput:    { flex: 1, fontSize: 13, color: '#0f172a' },
  filterSection:  { paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  filterLabel:    { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  filterGrid:     { flexDirection: 'row', gap: 5, marginBottom: 5 },
  filterBtn:      { paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  filterBtnText:  { fontSize: 12, color: '#64748b', fontWeight: '500' },
  filterBtnTextActive: { color: '#3b82f6', fontWeight: '700' },
  filterBtnPos:   { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  filterBtnPosText: { fontSize: 11, fontWeight: '800' },
  filterBtnPosLabel: { fontSize: 9, fontWeight: '500', marginTop: 1 },
  poolContent:    { padding: 10, gap: 6 },
  poolEmpty:      { alignItems: 'center', paddingVertical: 32, gap: 8 },
  poolEmptyText:  { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  placeUnassignedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 8, paddingVertical: 10, backgroundColor: '#3b82f6', borderRadius: 10 },
  placeUnassignedText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // right board
  departBox:      { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', marginBottom: 4, overflow: 'hidden' },
  departHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#fef2f2' },
  departTitle:    { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  departCount:    { fontSize: 12, color: '#fca5a5' },
  placeHere:      { fontSize: 12, color: '#3b82f6', fontWeight: '600' },

  teamsRow:       { flexDirection: 'row', gap: 10, paddingBottom: 24 },
  teamBox:        { width: 240, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' },
  teamHeader:     { padding: 10, borderBottomWidth: 3, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  teamNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  teamDot:        { width: 10, height: 10, borderRadius: 5 },
  teamName:       { fontSize: 14, fontWeight: '700', color: '#111', flex: 1 },
  teamCat:        { fontSize: 11, color: '#9ca3af' },
  teamStatsRow:   { flexDirection: 'row', gap: 6 },
  statBadge:      { paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#f3f4f6', borderRadius: 10 },
  statText:       { fontSize: 10, color: '#374151', fontWeight: '500' },
  hierControls:   { flexDirection: 'column', alignItems: 'center', gap: 2 },
  hierBtn:        { width: 22, height: 22, borderRadius: 11, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  hierCount:      { fontSize: 13, fontWeight: '700', color: '#374151' },

  // slot
  slot:           { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  slotHeader:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  hBadge:         { width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  hBadgeText:     { color: '#fff', fontSize: 9, fontWeight: '800' },
  slotLabelBtn:   { flexDirection: 'row', alignItems: 'center', flex: 1 },
  slotLabel:      { fontSize: 11, fontWeight: '600', color: '#374151' },
  slotCount:      { fontSize: 10, color: '#9ca3af' },
  dropArea:       { minHeight: 44, margin: 6, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: 'transparent', padding: 4 },
  dropAreaActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  dropHint:       { textAlign: 'center', fontSize: 11, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 10 },
  cardsWrap:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 4 },

  // card
  card:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, gap: 5, maxWidth: 200 },
  cardSelected:   { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  cardConfirmed:  { borderLeftWidth: 3, borderLeftColor: '#10b981' },
  confirmDot:     { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#d1d5db' },
  confirmDotOn:   { backgroundColor: '#10b981', borderColor: '#10b981' },
  cardNum:        { fontSize: 10, fontWeight: '700', color: '#9ca3af', minWidth: 14, textAlign: 'right' },
  cardName:       { fontSize: 12, fontWeight: '600', color: '#111', maxWidth: 90 },
  posBadge:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  posText:        { fontSize: 9, fontWeight: '700' },
  recBadge:       { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: '#f3e8ff' },
  recText:        { fontSize: 9, fontWeight: '700', color: '#7c3aed' },

  // modals
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalBox:       { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  modalLabel:     { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 10, marginBottom: 6 },
  modalInput:     { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111' },
  posOptions:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posOption:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
  posOptionActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  posOptionText:  { fontSize: 13, color: '#374151' },
  modalActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  modalCancel:    { paddingHorizontal: 14, paddingVertical: 8 },
  modalCancelText: { fontSize: 14, color: '#6b7280' },
  modalConfirm:   { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#3b82f6', borderRadius: 8 },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  seasonOption:   { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  seasonOptionActive: { backgroundColor: '#eff6ff' },
  seasonOptionText: { fontSize: 14, color: '#374151' },
});
