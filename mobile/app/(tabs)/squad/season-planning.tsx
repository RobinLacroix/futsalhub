/**
 * Planification de saison — migration vers les tokens
 *
 * Dernier gros écran du chantier UI : 235 couleurs figées, calibrées pour un
 * fond blanc, dans un fichier qui n'avait aucune notion de thème. En sombre,
 * l'écran restait entièrement clair.
 *
 * ## Ce qui change au-delà des teintes
 *
 * - **La table des postes disparaît.** `POSITION_COLORS` était la **sixième**
 *   copie trouvée dans le dépôt, après `squad/index`, `PlayerDetailView`,
 *   `TeamDashboardView`, la feuille de présence et l'importeur. Le catalogue
 *   unique est `components/players/positions.ts` — il donne aussi la liste des
 *   postes, ce qui retire les deux tableaux `['Gardien', 'Meneur', …]` écrits
 *   en dur dans les modales de recrue.
 * - **Les niveaux de hiérarchie ne sont plus notés.** `H_COLORS` allait du vert
 *   (H1) au gris (H5) : ça se lisait comme un barème « bons / mauvais joueurs ».
 *   Or le coach renomme lui-même ces niveaux (`hierarchyNames`) — ce sont des
 *   groupes, pas un classement de valeur. Les passer sur `chartSeries` ne
 *   règle rien : cette rampe contient les teintes sémantiques du thème, et H1
 *   ressortait en teal, H3 en rouge — le même jugement, avec une caution
 *   « catégorielle ». Un niveau ne porte donc plus **aucune** teinte propre :
 *   il est identifié par son numéro et son nom, et le liseré de la section
 *   prend la couleur d'identité de l'équipe. Cette couleur vient de
 *   `TEAM_COLORS`, calibrée pour la reconnaissance et non pour le contraste de
 *   texte : elle ne sert qu'en bordure, jamais sous un libellé.
 * - **La feuille modale roulée à la main disparaît.** Le `BottomSheet` local
 *   (`Animated`, `KeyboardAvoidingView`, poignée décorative, aucun geste de
 *   fermeture) est remplacé par la primitive `Sheet`, qui apporte le glissement,
 *   la safe area et le retour haptique.
 *
 * ## Règle du bandeau
 *
 * Le bandeau est une surface de marque, sombre dans les deux thèmes
 * (`fmPalette`). Tout ce qui est posé dessus se limite donc à :
 * - texte : `onBrand` / `onBrandMuted` ;
 * - pastilles : `onBrandFill` + `onBrandBorder` ;
 * - aplats d'action : les variantes `.fill` (`accent`, `warning`), **identiques
 *   dans les deux thèmes** et donc les seules sûres sur un fond fixe.
 *
 * Ne jamais y poser un `positive.default` ou un `text.*` : ils basculent avec le
 * thème et deviennent illisibles sur le navy en clair. C'est exactement le
 * défaut corrigé sur `TeamDashboardView`.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
  Alert, ActionSheetIOS, Platform, Modal, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { useActiveSeason } from '../../../contexts/ActiveSeasonContext';
import { useTheme, makeStyles } from '../../../contexts/ThemeContext';
import { fmPalette } from '../../../components/players/fmPalette';
import { POSITIONS, positionStyle } from '../../../components/players/positions';
import { DEFAULT_TEAM_COLOR } from '../../../lib/teamColors';
import { Text, EmptyState, Sheet } from '../../../components/ui';
import { advanceClubSeason } from '../../../lib/services/clubs';
import { getPlayersByClubWithTeams } from '../../../lib/services/players';
import {
  loadSeasonPlanning, saveSeasonPlanning, listSeasons,
  applySeasonPlan, revertSeasonPlan,
  PlanningData, RecruitData,
} from '../../../lib/services/seasonPlanning';
import type { Player, Team } from '../../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function currentSeason(): string {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function deepClone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

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

type SheetMode =
  | { kind: 'place'; playerId: string }
  | { kind: 'pick'; teamId: string; h: number };

// ── Position badge ────────────────────────────────────────────────────────────

function PosBadge({ position }: { position: string }) {
  const s = useStyles();
  const { theme } = useTheme();
  if (!position) return null;
  const p = positionStyle(position, theme.colors);
  return (
    <View style={[s.posBadge, { backgroundColor: p.color + '1A', borderColor: p.color + '55' }]}>
      <Text variant="caption" weight="800" color={p.color}>{p.abbr}</Text>
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
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const name = player ? `${player.first_name} ${player.last_name}` : recruit?.name ?? '—';
  const pos  = player?.position ?? recruit?.position ?? '';
  const num  = player?.number;
  const isRec = cardId.startsWith('recruit|');

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[s.poolRow, selected && s.poolRowSelected]}
    >
      <View style={s.poolRowLeft}>
        {num != null && (
          <Text variant="caption" tone="tertiary" numeric weight="700" style={s.poolNum}>#{num}</Text>
        )}
        <View style={s.flexMin}>
          <Text variant="body" weight="600" tone={selected ? 'accent' : 'primary'} numberOfLines={1}>
            {name}
          </Text>
          {isRec && (
            <Text variant="caption" weight="600" color={c.chartSeries[5]}>Recrue</Text>
          )}
        </View>
      </View>
      <View style={s.poolRowRight}>
        <PosBadge position={pos} />
        <Ionicons
          name={selected ? 'checkmark-circle' : 'chevron-forward'}
          size={18}
          color={selected ? c.accent.default : c.text.tertiary}
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
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const name = player ? `${player.first_name} ${player.last_name}` : recruit?.name ?? '—';
  const pos  = player?.position ?? recruit?.position ?? '';
  const num  = player?.number;
  const isRec = cardId.startsWith('recruit|');

  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      activeOpacity={0.75}
      style={[s.chip, confirmed && s.chipConfirmed]}
    >
      <TouchableOpacity
        onPress={onConfirmToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        accessibilityLabel={`Valider ${name}`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[s.chipDot, confirmed && s.chipDotOn]}
      />
      {num != null && <Text variant="caption" tone="tertiary" numeric weight="700">{num}</Text>}
      <Text variant="caption" weight="600" numberOfLines={1} style={s.chipName}>{name}</Text>
      {pos ? <PosBadge position={pos} /> : null}
      {isRec && (
        <View style={[s.recBadge, { backgroundColor: (c.chartSeries[5] ?? c.accent.default) + '26' }]}>
          <Text variant="caption" weight="800" color={c.chartSeries[5]}>R</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Hierarchy slot section ────────────────────────────────────────────────────

interface HierSectionProps {
  /** Couleur d'identité de l'équipe. Liseré uniquement, jamais sous un texte. */
  tint: string;
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

function HierSection({ tint, h, label, cards, confirmed, getPlayer, getRecruit, onAddFromPool, onLongPress, onConfirmToggle, onLabelEdit }: HierSectionProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={[s.hierSection, { borderLeftColor: tint }]}>
      <TouchableOpacity onPress={onLabelEdit} style={s.hierSectionHeader} activeOpacity={0.7}>
        <View style={s.hBadge}>
          <Text variant="caption" weight="800" numeric>{h}</Text>
        </View>
        <Text variant="callout" weight="700" style={s.flex}>{label}</Text>
        <Text variant="caption" tone="tertiary">
          {cards.length} joueur{cards.length !== 1 ? 's' : ''}
        </Text>
        <Ionicons name="pencil-outline" size={13} color={c.text.tertiary} />
      </TouchableOpacity>

      {cards.length > 0 && (
        <View style={s.chipsWrap}>
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

      <TouchableOpacity onPress={onAddFromPool} style={s.addFromPool} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={16} color={c.accent.default} />
        <Text variant="callout" tone="accent" weight="600">Ajouter depuis le pool</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Tab = 'pool' | string | 'departures';

export default function SeasonPlanningScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;
  const brand = fmPalette(c, theme.scheme);
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const router = useRouter();
  const { teams, activeTeam } = useActiveTeam();
  const { clubSeason, refresh: refreshSeason } = useActiveSeason();
  const clubId = activeTeam?.club_id ?? '';

  const [season, setSeason]       = useState(currentSeason());
  const [activating, setActivating] = useState(false);
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
  const [recruitPos, setRecruitPos]       = useState<string>(POSITIONS[1].key);
  const [seasonModal, setSeasonModal]     = useState(false);
  const [editLabelModal, setEditLabelModal] = useState<{ teamId: string; h: number; current: string } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [editRecruitModal, setEditRecruitModal] = useState<{ id: string; name: string; position: string } | null>(null);
  const [editRecruitName, setEditRecruitName] = useState('');
  const [editRecruitPos, setEditRecruitPos] = useState<string>(POSITIONS[1].key);

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

  // ── rollover : activer la saison consultée comme saison active du club ──────
  const handleActivateSeason = () => {
    if (!clubId) return;
    Alert.alert(
      `Passer à la saison ${season} ?`,
      'Les nouveaux matchs et entraînements seront rattachés à cette saison. Les données des saisons précédentes restent consultables.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setActivating(true);
            try {
              await advanceClubSeason(clubId, season);
              await refreshSeason();
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : 'Changement de saison impossible');
            } finally {
              setActivating(false);
            }
          },
        },
      ]
    );
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
    setEditRecruitPos(r.position ?? POSITIONS[1].key);
    setEditRecruitModal({ id: cardId, name: r.name, position: r.position ?? POSITIONS[1].key });
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
      <View style={s.centered}>
        <ActivityIndicator size="large" color={c.accent.default} />
        <Text variant="callout" tone="secondary">Chargement…</Text>
      </View>
    );
  }
  if (!planning) return null;

  const activeTeamObj = teamList.find(t => t.id === activeTab);
  const activeTeamState = activeTeamObj ? planning.teams[activeTeamObj.id] : null;

  return (
    <View style={s.root}>

      {/* ── Top bar ── */}
      <View style={[s.topBar, { backgroundColor: brand.brand, paddingTop: insets.top + theme.space.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color={brand.onBrand} />
        </TouchableOpacity>
        <View style={s.flex}>
          <Text variant="callout" weight="700" color={brand.onBrand}>Planification de saison</Text>
          <View style={s.topMetaRow}>
            <TouchableOpacity
              onPress={() => setSeasonModal(true)}
              style={s.seasonRow}
              accessibilityRole="button"
              accessibilityLabel={`Saison ${season}, changer`}
            >
              <Text variant="caption" color={brand.onBrandMuted}>{season}</Text>
              <Ionicons name="chevron-down" size={12} color={brand.onBrandMuted} />
            </TouchableOpacity>
            {clubSeason === season ? (
              <View style={[s.brandPill, { backgroundColor: brand.onBrandFill, borderColor: brand.onBrandBorder }]}>
                <Text variant="caption" weight="700" color={brand.onBrand}>active</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleActivateSeason}
                disabled={activating}
                style={[s.brandAction, { backgroundColor: c.accent.fill }, activating && s.dimmed]}
              >
                <Text variant="caption" weight="700" tone="onFill">
                  {activating ? '…' : 'Passer à cette saison'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {savedAt && (
          <Text variant="caption" color={brand.onBrandMuted} numeric>
            {savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
        {/* Apply / revert */}
        {planning?.appliedAt ? (
          <TouchableOpacity
            onPress={() => setApplyModal('revert')}
            style={[s.brandAction, s.brandActionRow, { backgroundColor: c.warning.fill }]}
          >
            <Ionicons name="arrow-undo" size={14} color={c.text.onFill} />
            <Text variant="caption" weight="700" tone="onFill">Annuler</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setApplyModal('apply')}
            style={[s.brandAction, s.brandActionRow, { backgroundColor: c.accent.fill }]}
          >
            <Ionicons name="play-circle-outline" size={15} color={c.text.onFill} />
            <Text variant="caption" weight="700" tone="onFill">Appliquer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[s.brandAction, s.brandActionRow, { backgroundColor: brand.onBrandFill, borderColor: brand.onBrandBorder, borderWidth: 1 }, saving && s.dimmed]}
        >
          {saving
            ? <ActivityIndicator size="small" color={brand.onBrand} />
            : <Ionicons name="checkmark-done" size={16} color={brand.onBrand} />
          }
          <Text variant="caption" weight="700" color={brand.onBrand}>{saving ? '…' : 'Sauv.'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={s.tabBarContent}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          const isDep = tab.key === 'departures';
          const activeTint = isDep ? c.negative.default : c.accent.default;
          return (
            <TouchableOpacity
              key={String(tab.key)}
              onPress={() => setActiveTab(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={[
                s.tab,
                isActive && {
                  backgroundColor: isDep ? c.negative.subtle : c.accent.subtle,
                  borderColor: isDep ? c.negative.default + '55' : c.accent.border,
                },
              ]}
              activeOpacity={0.7}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? activeTint : c.text.tertiary}
                />
              )}
              <Text
                variant="caption"
                weight={isActive ? '700' : '500'}
                color={isActive ? activeTint : c.text.secondary}
              >
                {tab.label}
              </Text>
              {tab.count !== undefined && (
                <View style={[s.tabBadge, isActive && { backgroundColor: activeTint + '26' }]}>
                  <Text
                    variant="caption"
                    weight="600"
                    numeric
                    color={isActive ? activeTint : c.text.tertiary}
                  >
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
        <View style={s.flex}>
          {/* Search + add recruit */}
          <View style={s.poolTop}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={c.text.tertiary} />
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher un joueur…"
                accessibilityLabel="Rechercher un joueur"
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={c.text.tertiary}
                clearButtonMode="while-editing"
              />
            </View>
            <TouchableOpacity
              onPress={() => setRecruitModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Ajouter une recrue"
              style={[s.addRecruitBtn, {
                backgroundColor: (c.chartSeries[5] ?? c.accent.default) + '1A',
                borderColor: (c.chartSeries[5] ?? c.accent.default) + '55',
              }]}
            >
              <Ionicons name="person-add-outline" size={18} color={c.chartSeries[5] ?? c.accent.default} />
            </TouchableOpacity>
          </View>

          {/* Position filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterContent}>
            {[{ key: '', label: 'Tous' }, ...POSITIONS.map(p => ({ key: p.key as string, label: p.abbr }))].map(({ key, label }) => {
              const isActive = filterPos === key;
              const tint = key ? positionStyle(key, c).color : c.accent.default;
              return (
                <TouchableOpacity
                  key={key || 'all'}
                  onPress={() => setFilterPos(key === filterPos ? '' : key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  style={[
                    s.filterChip,
                    isActive && { backgroundColor: tint + '1A', borderColor: tint + '55' },
                  ]}
                >
                  <Text
                    variant="caption"
                    weight="600"
                    color={isActive ? tint : c.text.secondary}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pool count */}
          <View style={s.poolMeta}>
            <Text variant="caption" tone="tertiary">
              {filteredPool.length} / {planning.unassigned.length} joueur{planning.unassigned.length !== 1 ? 's' : ''} non assignés
            </Text>
          </View>

          {/* Player list */}
          <ScrollView style={s.flex} contentContainerStyle={s.listPad} keyboardShouldPersistTaps="handled">
            {filteredPool.length === 0 ? (
              <EmptyState
                icon="checkmark-circle-outline"
                title={planning.unassigned.length === 0 ? 'Tous les joueurs sont placés' : 'Aucun résultat'}
                description={planning.unassigned.length === 0 ? undefined : 'Essayez un autre nom ou un autre poste.'}
                compact
              />
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
            <View style={s.floatBar}>
              <View style={s.flex}>
                <View style={s.floatNameRow}>
                  <Ionicons name="person-circle-outline" size={18} color={c.text.secondary} />
                  <Text variant="callout" weight="700" numberOfLines={1} style={s.flex}>
                    {getCardName(sheet.playerId)}
                  </Text>
                </View>
                <Text variant="caption" tone="tertiary" style={s.floatHint}>
                  Choisissez une équipe et un niveau
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSheet(null)}
                accessibilityRole="button"
                accessibilityLabel="Désélectionner"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={s.floatClose}
              >
                <Ionicons name="close" size={18} color={c.text.secondary} />
              </TouchableOpacity>
              {/* Quick team buttons */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.floatScroll}>
                {teamList.map(team => {
                  const tint = team.color || DEFAULT_TEAM_COLOR;
                  const ts = planning.teams[team.id];
                  return (
                    <View key={team.id} style={s.floatCol}>
                      {/* La couleur d'équipe passe par la pastille, pas par le
                          libellé : `TEAM_COLORS` n'est pas calibrée pour porter
                          du texte. */}
                      <View style={s.floatTeamRow}>
                        <View style={[s.floatTeamDot, { backgroundColor: tint }]} />
                        <Text variant="caption" weight="700" style={s.floatTeamLabel}>
                          {team.name}
                        </Text>
                      </View>
                      <View style={s.floatRow}>
                        {Array.from({ length: ts.hierarchyCount }, (_, i) => i + 1).map(h => {
                          const label = ts.hierarchyNames?.[h] ?? DEFAULT_H_NAMES[h];
                          return (
                            <TouchableOpacity
                              key={h}
                              onPress={() => assignToSlot(sheet.playerId, team.id, h)}
                              accessibilityRole="button"
                              accessibilityLabel={`${team.name}, ${label}`}
                              style={[s.floatSlotBtn, { borderColor: tint }]}
                            >
                              <Text variant="caption" weight="800">H{h}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                <View style={s.floatCol}>
                  <Text variant="caption" weight="700" tone="negative" style={s.floatTeamLabel}>Départs</Text>
                  <TouchableOpacity
                    onPress={() => { moveToDepartures(sheet.playerId); setSheet(null); }}
                    accessibilityRole="button"
                    accessibilityLabel="Marquer comme départ du club"
                    style={[s.floatSlotBtn, { backgroundColor: c.negative.subtle, borderColor: c.negative.default }]}
                  >
                    <Ionicons name="exit-outline" size={14} color={c.negative.default} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* ── Team Tab ── */}
      {activeTeamObj && activeTeamState && (
        <ScrollView style={s.flex} contentContainerStyle={s.teamPad}>
          {/* Team header */}
          <View style={[s.teamHeader, { borderLeftColor: activeTeamObj.color || DEFAULT_TEAM_COLOR }]}>
            <View style={s.flex}>
              <View style={s.teamTitleRow}>
                <View style={[s.teamDot, { backgroundColor: activeTeamObj.color || DEFAULT_TEAM_COLOR }]} />
                <Text variant="headline" weight="700">{activeTeamObj.name}</Text>
                {activeTeamObj.category && (
                  <Text variant="caption" tone="tertiary">{activeTeamObj.category}</Text>
                )}
              </View>
              {/* Stats */}
              <View style={s.statRow}>
                {(() => {
                  const all = Object.values(activeTeamState.slots).flat();
                  const gkTint = positionStyle('Gardien', c).color;
                  const gk  = all.filter(id => getCardPos(id) === 'Gardien').length;
                  const field = all.length - gk;
                  return (
                    <>
                      <View style={s.statBadge}>
                        <Text variant="caption" weight="600" tone="secondary">
                          {field} joueur{field !== 1 ? 's' : ''} de champ
                        </Text>
                      </View>
                      <View style={[s.statBadge, { backgroundColor: gkTint + '1A', borderColor: gkTint + '55' }]}>
                        <Text variant="caption" weight="600" color={gkTint}>{gk} GB</Text>
                      </View>
                      <View style={[s.statBadge, { backgroundColor: c.accent.subtle, borderColor: c.accent.border }]}>
                        <Text variant="caption" weight="600" tone="accent">{all.length} total</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
            {/* Hierarchy controls */}
            <View style={s.hierControls}>
              <Text variant="caption" weight="700" tone="tertiary">Niveaux</Text>
              <View style={s.hierControlsRow}>
                <TouchableOpacity
                  onPress={() => changeHierarchy(activeTeamObj.id, -1)}
                  disabled={activeTeamState.hierarchyCount <= 1}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer un niveau"
                  style={[s.hierBtn, activeTeamState.hierarchyCount <= 1 && s.disabled]}
                >
                  <Ionicons name="remove" size={16} color={c.text.primary} />
                </TouchableOpacity>
                <Text variant="headline" weight="800" numeric style={s.hierCount}>
                  {activeTeamState.hierarchyCount}
                </Text>
                <TouchableOpacity
                  onPress={() => changeHierarchy(activeTeamObj.id, +1)}
                  disabled={activeTeamState.hierarchyCount >= 5}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter un niveau"
                  style={[s.hierBtn, activeTeamState.hierarchyCount >= 5 && s.disabled]}
                >
                  <Ionicons name="add" size={16} color={c.text.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Hierarchy sections */}
          <View style={s.hierList}>
            {Array.from({ length: activeTeamState.hierarchyCount }, (_, i) => i + 1).map(h => {
              const label = activeTeamState.hierarchyNames?.[h] ?? DEFAULT_H_NAMES[h];
              const cards = activeTeamState.slots[h] ?? [];
              return (
                <HierSection
                  key={h}
                  tint={activeTeamObj.color || DEFAULT_TEAM_COLOR}
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
        <ScrollView style={s.flex} contentContainerStyle={s.departPad}>
          <View style={s.departCard}>
            {/* Header */}
            <View style={s.departHeader}>
              <View style={s.departHeaderLeft}>
                <View style={[s.hBadge, { backgroundColor: c.negative.default, borderColor: c.negative.default }]}>
                  <Ionicons name="exit-outline" size={11} color={c.text.onFill} />
                </View>
                <Text variant="callout" weight="700" tone="negative">Départs du club</Text>
              </View>
              <View style={s.departHeaderRight}>
                <Text variant="caption" tone="secondary">
                  {planning.departures.length} joueur{planning.departures.length !== 1 ? 's' : ''}
                </Text>
                {planning.appliedAt && planning.departures.length > 0 && (
                  <View style={[s.appliedBadge, { backgroundColor: c.positive.subtle, borderColor: c.positive.default + '55' }]}>
                    <Text variant="caption" weight="700" tone="positive">status: left ✓</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Players */}
            {planning.departures.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="Aucun départ enregistré"
                description={'Depuis le pool, sélectionnez un joueur et choisissez « Départs ».'}
                compact
              />
            ) : (
              <View>
                {planning.departures.map(id => (
                  <View key={id} style={s.departRow}>
                    <View style={s.flex}>
                      <Text variant="callout" weight="600">{getCardName(id)}</Text>
                      <View style={s.departBadgeRow}>
                        <PosBadge position={getCardPos(id)} />
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCardLongPress(id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Actions sur ${getCardName(id)}`}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={c.text.secondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Assignment sheet (pick from pool) ── */}
      <Sheet
        visible={sheet?.kind === 'pick'}
        onClose={() => { setSheet(null); setPickSearch(''); }}
        title={sheet?.kind === 'pick'
          ? `${teamList.find(t => t.id === sheet.teamId)?.name ?? ''} · H${sheet.h}`
          : ''}
        subtitle="Ajouter un joueur depuis le pool"
        scrollable={false}
      >
        {sheet?.kind === 'pick' && (
          // Le corps de `Sheet` applique un retrait horizontal ; on l'annule
          // pour que les lignes de joueur restent pleine largeur, comme dans le
          // pool — leur séparateur doit filer d'un bord à l'autre.
          <View style={s.sheetBleed}>
            {/* `searchBar` porte `flex: 1`, pensé pour la rangée du pool. Posé
                tel quel dans la colonne de la feuille, ce `flexBasis: 0` lui
                prend sa hauteur et le champ s'écrase à quelques points. Il lui
                faut donc sa propre rangée. */}
            <View style={s.sheetSearchRow}>
              <View style={[s.searchBar, s.sheetSearch]}>
                <Ionicons name="search-outline" size={16} color={c.text.tertiary} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Filtrer…"
                  accessibilityLabel="Filtrer les joueurs du pool"
                  value={pickSearch}
                  onChangeText={setPickSearch}
                  placeholderTextColor={c.text.tertiary}
                  clearButtonMode="while-editing"
                />
              </View>
            </View>
            <ScrollView style={{ maxHeight: screenH * 0.5 }} keyboardShouldPersistTaps="handled">
              {filteredPickPool.length === 0 ? (
                <EmptyState
                  icon="people-outline"
                  title={planning.unassigned.length === 0 ? 'Aucun joueur dans le pool' : 'Aucun résultat'}
                  compact
                />
              ) : (
                filteredPickPool.map(id => (
                  <PoolRow
                    key={id}
                    cardId={id}
                    player={getPlayer(id)}
                    recruit={getRecruit(id)}
                    selected={false}
                    onPress={() => assignToSlot(id, sheet.teamId, sheet.h)}
                    onLongPress={() => {}}
                  />
                ))
              )}
            </ScrollView>
          </View>
        )}
      </Sheet>

      {/* ── Apply modal ── */}
      <Modal visible={applyModal === 'apply'} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.applyModalHeader}>
              <View style={[s.applyIconWrap, { backgroundColor: c.accent.subtle }]}>
                <Ionicons name="play-circle-outline" size={24} color={c.accent.default} />
              </View>
              <View style={s.flex}>
                <Text variant="title">Appliquer la saison {season}</Text>
                <Text variant="caption" tone="secondary" style={s.modalSub}>
                  Cette action modifie les données réelles des joueurs.
                </Text>
              </View>
            </View>

            {planSummary && (
              <View style={s.summaryRow}>
                <View style={[s.summaryCell, { backgroundColor: c.negative.subtle, borderColor: c.negative.default + '55' }]}>
                  <Text variant="display" numeric tone="negative">{planSummary.departureCount}</Text>
                  <Text variant="caption" weight="700" tone="negative">
                    Départ{planSummary.departureCount !== 1 ? 's' : ''}
                  </Text>
                  <Text variant="caption" tone="tertiary">status → left</Text>
                </View>
                <View style={[s.summaryCell, { backgroundColor: c.accent.subtle, borderColor: c.accent.border }]}>
                  <Text variant="display" numeric tone="accent">{planSummary.assignedCount}</Text>
                  <Text variant="caption" weight="700" tone="accent">Réassign.</Text>
                  <Text variant="caption" tone="tertiary">teams MAJ</Text>
                </View>
                <View style={[s.summaryCell, s.summaryCellNeutral]}>
                  <Text variant="display" numeric tone="secondary">{planSummary.unassignedCount}</Text>
                  <Text variant="caption" weight="700" tone="secondary">Pool</Text>
                  <Text variant="caption" tone="tertiary">non touchés</Text>
                </View>
              </View>
            )}

            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={15} color={c.warning.default} />
              <Text variant="caption" tone="warning" style={s.flex}>
                Un snapshot sera créé — tu pourras annuler l&apos;opération.
              </Text>
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setApplyModal(null)} disabled={applying} style={s.modalCancel}>
                <Text variant="callout" tone="secondary">Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApply}
                disabled={applying}
                style={[s.modalConfirm, { backgroundColor: c.positive.fill }, applying && s.dimmed]}
              >
                {applying
                  ? <ActivityIndicator size="small" color={c.text.onFill} />
                  : <Ionicons name="play-circle-outline" size={16} color={c.text.onFill} />
                }
                <Text variant="callout" weight="700" tone="onFill">
                  {applying ? 'Application…' : 'Appliquer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Revert modal ── */}
      <Modal visible={applyModal === 'revert'} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.applyModalHeader}>
              <View style={[s.applyIconWrap, { backgroundColor: c.warning.subtle }]}>
                <Ionicons name="arrow-undo" size={24} color={c.warning.default} />
              </View>
              <View style={s.flex}>
                <Text variant="title">Annuler l&apos;application</Text>
                <Text variant="caption" tone="secondary" style={s.modalSub}>
                  Remet les joueurs dans leur état d&apos;avant.
                </Text>
              </View>
            </View>

            <Text variant="callout" tone="secondary" style={s.modalBody}>
              Les statuts et appartenances d&apos;équipe seront restaurés depuis le snapshot de
              sécurité. Le plan de planification sera conservé.
            </Text>

            {planning?.appliedAt && (
              <Text variant="caption" tone="tertiary" style={s.modalCentered}>
                Appliqué le {new Date(planning.appliedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            )}

            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={15} color={c.warning.default} />
              <Text variant="caption" tone="warning" style={s.flex}>
                Le plan de planification restera intact, seules les données réelles sont restaurées.
              </Text>
            </View>

            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setApplyModal(null)} disabled={applying} style={s.modalCancel}>
                <Text variant="callout" tone="secondary">Garder</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRevert}
                disabled={applying}
                style={[s.modalConfirm, { backgroundColor: c.warning.fill }, applying && s.dimmed]}
              >
                {applying
                  ? <ActivityIndicator size="small" color={c.text.onFill} />
                  : <Ionicons name="arrow-undo" size={16} color={c.text.onFill} />
                }
                <Text variant="callout" weight="700" tone="onFill">
                  {applying ? 'Restauration…' : 'Restaurer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Recruit modal ── */}
      <Modal visible={recruitModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text variant="title">Nouvelle recrue</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Nom prénom"
              accessibilityLabel="Nom et prénom de la recrue"
              value={recruitName}
              onChangeText={setRecruitName}
              autoFocus
              placeholderTextColor={c.text.tertiary}
            />
            <Text variant="callout" weight="600" style={s.modalLabel}>Poste</Text>
            <View style={s.posOptions}>
              {POSITIONS.map(p => {
                const tint = positionStyle(p.key, c).color;
                const active = recruitPos === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => setRecruitPos(p.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[s.posOption, active && { backgroundColor: tint + '1A', borderColor: tint }]}
                  >
                    <Text
                      variant="callout"
                      weight={active ? '700' : '400'}
                      color={active ? tint : c.text.secondary}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setRecruitModal(false)} style={s.modalCancel}>
                <Text variant="callout" tone="secondary">Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateRecruit} style={s.modalConfirm}>
                <Text variant="callout" weight="700" tone="onFill">Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit label modal ── */}
      <Modal visible={!!editLabelModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text variant="title">Renommer le niveau</Text>
            <TextInput
              style={s.modalInput}
              value={editLabelValue}
              accessibilityLabel="Nom du niveau"
              onChangeText={setEditLabelValue}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={c.text.tertiary}
            />
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setEditLabelModal(null)} style={s.modalCancel}>
                <Text variant="callout" tone="secondary">Annuler</Text>
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
                style={s.modalConfirm}
              >
                <Text variant="callout" weight="700" tone="onFill">Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit recruit modal ── */}
      <Modal visible={!!editRecruitModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text variant="title">Modifier la recrue</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Nom prénom"
              accessibilityLabel="Nom et prénom de la recrue"
              value={editRecruitName}
              onChangeText={setEditRecruitName}
              autoFocus
              selectTextOnFocus
              placeholderTextColor={c.text.tertiary}
            />
            <Text variant="callout" weight="600" style={s.modalLabel}>Poste</Text>
            <View style={s.posOptions}>
              {POSITIONS.map(p => {
                const tint = positionStyle(p.key, c).color;
                const active = editRecruitPos === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    onPress={() => setEditRecruitPos(p.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[s.posOption, active && { backgroundColor: tint + '1A', borderColor: tint }]}
                  >
                    <Text
                      variant="callout"
                      weight={active ? '700' : '400'}
                      color={active ? tint : c.text.secondary}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setEditRecruitModal(null)} style={s.modalCancel}>
                <Text variant="callout" tone="secondary">Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdateRecruit} style={s.modalConfirm}>
                <Text variant="callout" weight="700" tone="onFill">Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Season picker ── */}
      <Modal visible={seasonModal} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setSeasonModal(false)}>
          <View style={[s.modalBox, s.seasonBox]}>
            <Text variant="title">Choisir une saison</Text>
            <ScrollView>
              {seasons.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => { setSeason(item); setSeasonModal(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item === season }}
                  style={[s.seasonOption, item === season && { backgroundColor: c.accent.subtle }]}
                >
                  <Text
                    variant="callout"
                    weight={item === season ? '700' : '400'}
                    tone={item === season ? 'accent' : 'primary'}
                    numeric
                  >
                    {item}
                  </Text>
                  {item === season && <Ionicons name="checkmark" size={16} color={c.accent.default} />}
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
                style={s.seasonOption}
              >
                <Text variant="callout" tone="accent" weight="600">+ Saison suivante</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles((t) => ({
  flex:     { flex: 1 },
  flexMin:  { flex: 1, minWidth: 0 },
  dimmed:   { opacity: 0.6 },
  disabled: { opacity: 0.3 },

  root:     { flex: 1, backgroundColor: t.colors.bg.canvas },
  centered: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: t.space.md, backgroundColor: t.colors.bg.canvas,
  },

  // ── Top bar (surface de marque : voir l'en-tête du fichier)
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.sm,
    paddingHorizontal: t.space.lg, paddingBottom: t.space.md,
  },
  backBtn:      { padding: 2 },
  topMetaRow:   { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginTop: 2 },
  seasonRow:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  brandPill: {
    borderRadius: t.radius.sm, borderWidth: 1,
    paddingHorizontal: t.space.sm, paddingVertical: 2,
  },
  brandAction: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space.sm, paddingVertical: t.space.xs,
  },
  brandActionRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  // ── Tab bar
  tabBar: {
    backgroundColor: t.colors.bg.surface,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
    maxHeight: 50,
  },
  tabBarContent: {
    paddingHorizontal: t.space.md, gap: t.space.xs,
    alignItems: 'center', paddingVertical: t.space.sm,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.xs,
    paddingHorizontal: t.space.md, paddingVertical: t.space.xs,
    borderRadius: t.radius.pill, borderWidth: 1, borderColor: 'transparent',
  },
  tabBadge: {
    backgroundColor: t.colors.bg.sunken, borderRadius: t.radius.sm,
    paddingHorizontal: t.space.xs, paddingVertical: 1,
  },

  // ── Pool
  poolTop: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.sm,
    paddingHorizontal: t.space.lg, paddingTop: t.space.md, paddingBottom: t.space.sm,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space.sm,
    backgroundColor: t.colors.bg.surface, borderRadius: t.radius.md,
    borderWidth: 1, borderColor: t.colors.border.subtle,
    paddingHorizontal: t.space.md, height: 44,
  },
  searchInput: { flex: 1, ...t.typography.body, color: t.colors.text.primary },
  addRecruitBtn: {
    width: 44, height: 44, borderRadius: t.radius.md, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  filterScroll:  { maxHeight: 42 },
  filterContent: { paddingHorizontal: t.space.lg, gap: t.space.xs, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: t.space.md, paddingVertical: t.space.xs + 1,
    borderRadius: t.radius.pill, borderWidth: 1,
    borderColor: t.colors.border.subtle, backgroundColor: t.colors.bg.surface,
  },
  poolMeta: { paddingHorizontal: t.space.lg, paddingVertical: t.space.xs },
  listPad:  { paddingBottom: t.space.xxl },

  // ── Pool row
  poolRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: t.space.lg, paddingVertical: t.space.md,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
    backgroundColor: t.colors.bg.surface,
  },
  poolRowSelected: {
    backgroundColor: t.colors.accent.subtle,
    borderBottomColor: t.colors.accent.border,
  },
  poolRowLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minWidth: 0 },
  poolNum:      { minWidth: 28 },
  poolRowRight: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginLeft: t.space.sm },

  // ── Floating bar
  floatBar: {
    backgroundColor: t.colors.bg.elevated,
    borderTopWidth: 1, borderTopColor: t.colors.border.subtle,
    paddingHorizontal: t.space.lg, paddingVertical: t.space.md,
    ...t.elevation.floating,
  },
  floatNameRow:   { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  floatHint:      { marginTop: 2, marginBottom: t.space.sm },
  floatClose:     { position: 'absolute', top: t.space.md, right: t.space.lg },
  floatScroll:    { gap: t.space.sm, paddingLeft: t.space.sm },
  floatCol:       { gap: t.space.xs },
  floatRow:       { flexDirection: 'row', gap: t.space.xs },
  floatTeamRow:   { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  floatTeamDot:   { width: 7, height: 7, borderRadius: 4 },
  floatTeamLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  floatSlotBtn: {
    paddingHorizontal: t.space.sm + 2, paddingVertical: t.space.xs + 2,
    borderRadius: t.radius.sm, borderWidth: 1.5,
    backgroundColor: t.colors.bg.surface,
    minWidth: 38, alignItems: 'center', justifyContent: 'center',
  },

  // ── Team header
  teamPad:   { paddingBottom: t.space.xxxl },
  teamHeader: {
    margin: t.space.lg, marginBottom: t.space.xs,
    backgroundColor: t.colors.bg.surface, borderRadius: t.radius.lg,
    borderWidth: 1, borderColor: t.colors.border.subtle,
    borderLeftWidth: 4,
    padding: t.space.lg,
    flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md,
  },
  teamTitleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  teamDot:      { width: 10, height: 10, borderRadius: 5 },
  statRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm, marginTop: t.space.sm },
  statBadge: {
    paddingHorizontal: t.space.sm, paddingVertical: 3,
    backgroundColor: t.colors.bg.sunken, borderRadius: t.radius.sm,
    borderWidth: 1, borderColor: t.colors.border.subtle,
  },
  hierControls:     { alignItems: 'center' },
  hierControlsRow:  { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, marginTop: t.space.xs },
  hierBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: t.colors.bg.sunken,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: t.colors.border.subtle,
  },
  hierCount: { minWidth: 24, textAlign: 'center' },

  // ── Hierarchy section
  hierList: { paddingHorizontal: t.space.lg, paddingTop: t.space.sm, gap: t.space.sm },
  hierSection: {
    backgroundColor: t.colors.bg.surface, borderRadius: t.radius.md,
    borderWidth: 1, borderColor: t.colors.border.subtle,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  hierSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.sm,
    paddingHorizontal: t.space.md, paddingVertical: t.space.sm + 2,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
  },
  hBadge: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: t.colors.bg.sunken,
    borderWidth: 1, borderColor: t.colors.border.subtle,
  },

  // ── Chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs + 2, padding: t.space.sm + 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.xs + 1,
    backgroundColor: t.colors.bg.sunken,
    borderWidth: 1, borderColor: t.colors.border.subtle,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space.sm + 2, paddingVertical: t.space.xs + 2,
  },
  chipConfirmed: {
    borderLeftWidth: 3, borderLeftColor: t.colors.positive.default,
    backgroundColor: t.colors.positive.subtle,
    borderColor: t.colors.positive.default + '55',
  },
  chipDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 1.5, borderColor: t.colors.border.strong,
  },
  chipDotOn: {
    backgroundColor: t.colors.positive.default,
    borderColor: t.colors.positive.default,
  },
  chipName:  { maxWidth: 110 },
  recBadge:  { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },

  // ── Add from pool
  addFromPool: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.xs + 2,
    paddingHorizontal: t.space.md, paddingVertical: t.space.sm + 2,
    borderTopWidth: 1, borderTopColor: t.colors.border.subtle,
  },

  // ── Departures
  departPad: { padding: t.space.lg, paddingBottom: t.space.xxxl },
  departCard: {
    backgroundColor: t.colors.bg.surface, borderRadius: t.radius.lg,
    borderWidth: 1, borderColor: t.colors.negative.default + '40',
    overflow: 'hidden',
  },
  departHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: t.space.lg, paddingVertical: t.space.md,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
    backgroundColor: t.colors.negative.subtle,
  },
  departHeaderLeft:  { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  departHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  departRow: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.sm,
    paddingHorizontal: t.space.lg, paddingVertical: t.space.md,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
  },
  departBadgeRow: { flexDirection: 'row', marginTop: t.space.xs },
  appliedBadge: {
    borderRadius: t.radius.sm, borderWidth: 1,
    paddingHorizontal: t.space.sm, paddingVertical: 2,
  },

  // ── Sheet
  sheetBleed: { marginHorizontal: -t.space.xl },
  /**
   * Le champ hérite de `searchBar`, qui est en `bg.surface` : posé sur le
   * canvas il ressort, mais la feuille est en `bg.elevated`, plus clair — le
   * champ y perdait tout bord lisible en thème sombre. Il descend donc d'un
   * cran, avec un liseré franc.
   */
  sheetSearchRow: {
    flexDirection: 'row',
    marginHorizontal: t.space.xl, marginBottom: t.space.sm,
  },
  sheetSearch: {
    backgroundColor: t.colors.bg.sunken, borderColor: t.colors.border.strong,
  },

  // ── Position badge
  posBadge: {
    paddingHorizontal: t.space.sm - 1, paddingVertical: 2,
    borderRadius: t.radius.sm, borderWidth: 1,
    alignSelf: 'flex-start',
  },

  // ── Modals
  modalOverlay: {
    flex: 1, backgroundColor: t.colors.overlay,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBox: {
    backgroundColor: t.colors.bg.elevated, borderRadius: t.radius.xl,
    padding: t.space.xxl, width: '88%',
    borderWidth: 1, borderColor: t.colors.border.subtle,
  },
  modalSub:      { marginTop: 2 },
  modalBody:     { marginBottom: t.space.md },
  modalCentered: { textAlign: 'center', marginBottom: t.space.md },
  modalLabel:    { marginTop: t.space.md, marginBottom: t.space.sm },
  modalInput: {
    borderWidth: 1.5, borderColor: t.colors.border.subtle,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space.md, paddingVertical: t.space.sm + 2,
    marginTop: t.space.md,
    ...t.typography.body,
    color: t.colors.text.primary,
    backgroundColor: t.colors.bg.surface,
  },
  posOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  posOption: {
    paddingHorizontal: t.space.lg, paddingVertical: t.space.sm,
    borderRadius: t.radius.sm, borderWidth: 1.5,
    borderColor: t.colors.border.subtle,
  },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: t.space.sm, marginTop: t.space.lg,
  },
  modalCancel: { paddingHorizontal: t.space.lg, paddingVertical: t.space.sm + 2 },
  modalConfirm: {
    flexDirection: 'row', alignItems: 'center', gap: t.space.xs,
    paddingHorizontal: t.space.xl, paddingVertical: t.space.sm + 2,
    backgroundColor: t.colors.accent.fill, borderRadius: t.radius.sm,
  },
  seasonBox:    { maxHeight: 380 },
  seasonOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: t.space.md, paddingVertical: t.space.md,
    borderRadius: t.radius.sm,
    borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle,
  },

  // ── Apply modal
  applyModalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: t.space.md, marginBottom: t.space.lg,
  },
  applyIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Summary
  summaryRow:  { flexDirection: 'row', gap: t.space.sm, marginBottom: t.space.md },
  summaryCell: {
    flex: 1, borderWidth: 1, borderRadius: t.radius.md,
    padding: t.space.sm + 2, alignItems: 'center',
  },
  summaryCellNeutral: {
    backgroundColor: t.colors.bg.sunken,
    borderColor: t.colors.border.subtle,
  },

  // ── Warning box
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm,
    backgroundColor: t.colors.warning.subtle,
    borderWidth: 1, borderColor: t.colors.warning.default + '55',
    borderRadius: t.radius.sm, padding: t.space.sm + 2,
  },
}));
