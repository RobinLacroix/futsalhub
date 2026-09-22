'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { playersService, trainingsService } from '@/lib/services';
import type { PlayerFormData } from '@/types';
import {
  Plus,
  X,
  Trash2,
  AlertCircle,
  Check,
  Pencil,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  LayoutGrid,
  List,
  Lock,
  Upload,
} from 'lucide-react';
import { STRONG_FOOT_OPTIONS } from '@/lib/playerVocabulary';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';
import { useTheme } from '../../contexts/ThemeContext';
import ImportPlayersModal from './ImportPlayersModal';

// ─── Design tokens (dérivés du thème, voir lib/design/tokens.ts) ─────────────
function useT() {
  const { theme } = useTheme();
  const c = theme.colors;
  return {
    pageBg: c.bg.canvas,
    cardBg: c.bg.surface,
    border: c.border.subtle,
    borderStrong: c.border.strong,
    text: c.text.primary,
    textMuted: c.text.secondary,
    accent: c.accent.default,
    accentFill: c.accent.fill,
    accentSubtle: c.accent.subtle,
    rowOdd: c.bg.stripe,
    chartSeries: c.chartSeries,
    positive: c.positive.default,
    positiveSubtle: c.positive.subtle,
    negative: c.negative.default,
    negativeSubtle: c.negative.subtle,
    warning: c.warning.default,
    warningSubtle: c.warning.subtle,
    neutralData: c.neutralData,
  };
}
type T = ReturnType<typeof useT>;

// ─── Player Card component ────────────────────────────────────────────────────
function PlayerCard({
  player, pos, st, attPct, onOpen, onEdit, onDelete, canEdit,
}: {
  player: any;
  pos: { abbr: string; color: string; bg: string };
  st: { label: string; color: string; bg: string };
  attPct: number;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  canEdit: boolean;
}) {
  const t = useT();
  const [hov, setHov] = useState(false);
  const goals = player.goals ?? 0;
  const assists = player.assists ?? 0;
  const matches = player.matches_played ?? 0;
  const mvpCount = player.mvp_count ?? 0;
  const attendanceColor = attPct >= 80 ? t.positive : attPct >= 60 ? t.warning : attPct > 0 ? t.negative : t.textMuted;
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        backgroundColor: t.cardBg,
        border: `1.5px solid ${hov ? pos.color + '60' : t.border}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? `0 6px 20px ${pos.color}18` : '0 1px 4px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top color stripe */}
      <div style={{ height: 4, backgroundColor: pos.color, width: '100%' }} />

      <div style={{ padding: '12px 14px 14px' }}>
        {/* Header row: position + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3,
            backgroundColor: pos.bg, color: pos.color, letterSpacing: '0.3px',
          }}>
            {pos.abbr}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            backgroundColor: st.bg, color: st.color,
          }}>
            {st.label}
          </span>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, letterSpacing: '0.3px', lineHeight: 1.2 }}>
            {player.last_name.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {player.first_name}{player.birth_date ? ` · ${calcAge(player.birth_date)} ans` : ''}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
          {[
            { val: matches,  label: 'Matchs',   color: t.text },
            { val: goals,    label: 'Buts',      color: goals > 0 ? t.positive : t.textMuted },
            { val: assists,  label: 'Passes déc.', color: assists > 0 ? t.positive : t.textMuted },
            { val: mvpCount, label: 'MVP',       color: mvpCount > 0 ? '#f59e0b' : t.textMuted },
            { val: `${attPct}%`, label: 'Présence', color: attendanceColor },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? `1px solid ${t.border}` : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 9, color: t.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Attendance bar */}
        {attPct > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 3, borderRadius: 2, backgroundColor: t.border, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(attPct, 100)}%`,
                backgroundColor: attendanceColor,
                transition: 'width 600ms ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Hover actions */}
      {hov && canEdit && (
        <div
          style={{
            position: 'absolute', top: 10, right: 10,
            display: 'flex', gap: 4,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.border}`, backgroundColor: t.cardBg, cursor: 'pointer', color: t.accent }}
            title="Modifier"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            style={{ padding: 5, borderRadius: 6, border: `1px solid ${t.border}`, backgroundColor: t.cardBg, cursor: 'pointer', color: t.negative }}
            title="Supprimer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Position config ──────────────────────────────────────────────────────────
// Le poste est une catégorie, pas un jugement : sa teinte vient de la rampe
// catégorielle du thème (chartSeries), jamais de positive/negative/warning —
// même principe et mêmes index que mobile/components/players/positions.ts,
// pour qu'un joueur ait la même couleur de poste sur les deux apps.
const POSITION_ABBR: Record<string, string> = { Gardien: 'GB', Meneur: 'MEN', Ailier: 'AIL', Pivot: 'PIV' };
const POSITION_SERIES_INDEX: Record<string, number> = { Gardien: 2, Meneur: 0, Ailier: 4, Pivot: 5 };

// Ordre tactique des postes pour le tri (Gardien → Meneur → Ailier → Pivot).
const POSITION_ORDER: Record<string, number> = { Gardien: 0, Meneur: 1, Ailier: 2, Pivot: 3 };
function positionRank(position?: string): number {
  if (!position) return 99;
  const key = Object.keys(POSITION_ORDER).find(k =>
    position.toLowerCase().startsWith(k.toLowerCase())
  );
  return key ? POSITION_ORDER[key] : 98;
}

function matchPositionKey(position?: string): string | undefined {
  if (!position) return undefined;
  return Object.keys(POSITION_ABBR).find(k => position.toLowerCase().startsWith(k.toLowerCase()));
}

function positionColor(key: string | undefined, t: T): string {
  const idx = key ? POSITION_SERIES_INDEX[key] : undefined;
  return idx != null ? (t.chartSeries[idx] ?? t.neutralData) : t.neutralData;
}

function getPosition(position: string | undefined, t: T) {
  const key = matchPositionKey(position);
  const color = positionColor(key, t);
  return {
    abbr: key ? POSITION_ABBR[key] : (position ? position.slice(0, 3).toUpperCase() : '—'),
    color,
    bg: `${color}1A`,
  };
}

// ─── Status badge config ─────────────────────────────────────────────────────
// Vocabulaire de mutation FFF, propre au web (le mobile n'a que Actif/Parti —
// divergence connue et documentée dans mobile/components/players/positions.ts,
// pas touchée ici : on ne recolore que l'existant, sans changer les valeurs).
const STATUS_LABELS: Record<string, string> = {
  'Non-muté': 'Actif',
  'Muté': 'Muté',
  'Muté HP': 'Muté HP',
  'Blessé': 'Blessé',
  'Suspendu': 'Suspendu',
  left: 'Parti',
};
const STATUS_SEMANTIC: Record<string, 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'> = {
  'Non-muté': 'positive',
  'Muté': 'accent',
  'Muté HP': 'warning',
  'Blessé': 'negative',
  'Suspendu': 'warning',
  left: 'neutral',
};

function getStatus(status: string | undefined, t: T) {
  if (!status) return { label: status || '—', color: t.textMuted, bg: t.rowOdd };
  const label = STATUS_LABELS[status] ?? status;
  switch (STATUS_SEMANTIC[status]) {
    case 'positive': return { label, color: t.positive, bg: t.positiveSubtle };
    case 'negative': return { label, color: t.negative, bg: t.negativeSubtle };
    case 'warning':  return { label, color: t.warning,  bg: t.warningSubtle };
    case 'accent':   return { label, color: t.accent,   bg: t.accentSubtle };
    default:          return { label, color: t.textMuted, bg: t.rowOdd };
  }
}

// ─── Match type filter ────────────────────────────────────────────────────────
type MatchTypeFilter = 'all' | 'Championnat' | 'Coupe' | 'Amical';
const MATCH_FILTERS: { label: string; value: MatchTypeFilter }[] = [
  { label: 'Tous',         value: 'all' },
  { label: 'Championnat', value: 'Championnat' },
  { label: 'Coupe',       value: 'Coupe' },
  { label: 'Amical',      value: 'Amical' },
];

// ─── Sort ─────────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'position' | 'seances' | 'matches' | 'goals' | 'assists' | 'mvp_count';
type SortDir = 'asc' | 'desc';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Player {
  id: string;
  first_name: string;
  last_name: string;
  birth_date?: string | null;
  position: string;
  strong_foot: string;
  status: string;
  number?: number;
  matches_played?: number;
  goals?: number;
  assists?: number;
  mvp_count?: number;
  training_attendance?: number;
  attendance_percentage?: number;
  sequence_time_limit?: number;
  phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
}

// PlayerFormData est importé de @/types (source unique).

const initialFormData: PlayerFormData = {
  first_name: '',
  last_name: '',
  birth_date: '',
  position: '',
  strong_foot: '',
  status: '',
  number: '',
  sequence_time_limit: '180',
  selectedTeams: [],
  phone: '',
  parent_name: '',
  parent_phone: '',
};

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Sort icon helper ─────────────────────────────────────────────────────────
function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  const t = useT();
  if (sortKey !== col) return <ChevronsUpDown size={13} style={{ color: t.textMuted, marginLeft: 3 }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={13} style={{ color: t.accent, marginLeft: 3 }} />
    : <ChevronDown size={13} style={{ color: t.accent, marginLeft: 3 }} />;
}

// ─── Page component ───────────────────────────────────────────────────────────
export default function SquadPage() {
  const t = useT();
  const router = useRouter();
  const { activeTeam, teams, canEditActiveTeam } = useActiveTeam();
  const { activeSeason } = useActiveSeasonContext();

  // Data state
  const [players, setPlayers]           = useState<Player[]>([]);
  const [totalTrainings, setTotalTrainings] = useState<number>(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditing, setIsEditing]       = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [formData, setFormData]         = useState<PlayerFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI state
  const [searchName, setSearchName]     = useState('');
  const [matchFilter, setMatchFilter]   = useState<MatchTypeFilter>('all');
  const [sortKey, setSortKey]           = useState<SortKey>('name');
  const [sortDir, setSortDir]           = useState<SortDir>('asc');
  const [viewMode, setViewMode]         = useState<'cards' | 'table'>('cards');

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTeam) {
      setPlayers([]);
      setTotalTrainings(0);
      setLoading(true);
      const loadData = async () => {
        try {
          await fetchTotalTrainings();
          await fetchPlayers();
        } catch (err) {
          console.error('Erreur lors du chargement des données:', err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    } else {
      setPlayers([]);
      setTotalTrainings(0);
      setLoading(false);
    }
  }, [activeTeam, activeSeason]);

  useEffect(() => {
    if (totalTrainings > 0 && players.length > 0 && activeTeam) {
      recalculatePlayerStats();
    }
  }, [totalTrainings, players.length, activeTeam, activeSeason]);

  const fetchTotalTrainings = async () => {
    try {
      if (!activeTeam) { setTotalTrainings(0); return; }
      setTotalTrainings(await trainingsService.getTotalTrainingsCount(activeTeam.id, activeSeason));
    } catch (err) {
      console.error('Erreur trainings:', err);
      setTotalTrainings(0);
    }
  };

  const recalculatePlayerStats = async () => {
    try {
      if (!activeTeam) return;
      const statsById = await playersService.getSquadBasicStats(
        activeTeam.id,
        players.map(p => p.id),
        activeSeason
      );
      setPlayers(prev => prev.map(player => {
        const stats = statsById.get(player.id);
        return stats ? { ...player, ...stats } : player;
      }));
    } catch (err) {
      console.error('Erreur recalcul stats:', err);
    }
  };

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!activeTeam) { setPlayers([]); return; }

      // Chargement via la couche service (exclut déjà les joueurs partis 'left').
      // L'ordre est indifférent ici : displayedPlayers re-trie côté client.
      const playersData = await playersService.getPlayersByTeam(activeTeam.id);

      const statsById = await playersService.getSquadBasicStats(
        activeTeam.id,
        playersData.map(p => p.id),
        activeSeason
      );

      const playersWithStats = playersData.map(player => {
        const sequenceTimeLimit = typeof player.sequence_time_limit === 'number' ? player.sequence_time_limit : 180;
        const stats = statsById.get(player.id) ?? {
          matches_played: 0,
          goals: 0,
          assists: 0,
          mvp_count: 0,
          training_attendance: 0,
          attendance_percentage: 0,
        };

        return {
          ...player,
          ...stats,
          sequence_time_limit: sequenceTimeLimit,
        };
      });

      setPlayers(playersWithStats);
    } catch (err) {
      console.error('Erreur chargement joueurs:', err);
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  // ── Sorting ─────────────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc'); }
  };

  // ── Filtering + sorting pipeline ────────────────────────────────────────────

  const displayedPlayers = useMemo(() => {
    let list = [...players];

    // Name search
    if (searchName.trim()) {
      const q = searchName.toLowerCase();
      list = list.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'position': va = positionRank(a.position); vb = positionRank(b.position); break;
        case 'seances': va = a.training_attendance ?? 0; vb = b.training_attendance ?? 0; break;
        case 'matches': va = a.matches_played ?? 0;      vb = b.matches_played ?? 0;      break;
        case 'goals':   va = a.goals ?? 0;               vb = b.goals ?? 0;               break;
        case 'assists': va = a.assists ?? 0;             vb = b.assists ?? 0;             break;
        case 'mvp_count': va = a.mvp_count ?? 0;         vb = b.mvp_count ?? 0;           break;
        default:
          va = `${a.last_name} ${a.first_name}`;
          vb = `${b.last_name} ${b.first_name}`;
      }
      if (typeof va === 'string')
        return sortDir === 'asc' ? va.localeCompare(vb as string, 'fr') : (vb as string).localeCompare(va, 'fr');
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [players, searchName, sortKey, sortDir]);

  // ── Modal handlers ──────────────────────────────────────────────────────────

  const handleOpenModal = async (player?: Player) => {
    if (!activeTeam) {
      setError('Aucune équipe active sélectionnée.');
      return;
    }
    if (!canEditActiveTeam) return; // lecture seule : équipe non rattachée
    if (player) {
      setIsEditing(true);
      setCurrentPlayer(player);
      let playerTeamIds: string[] = [];
      try {
        playerTeamIds = await playersService.getPlayerTeamIds(player.id);
      } catch { /* ignore */ }
      if (playerTeamIds.length === 0) playerTeamIds = [activeTeam.id];
      setFormData({
        first_name: player.first_name,
        last_name: player.last_name,
        birth_date: player.birth_date || '',
        position: player.position,
        strong_foot: player.strong_foot,
        status: player.status,
        number: player.number?.toString() || '',
        sequence_time_limit: (player.sequence_time_limit ?? 180).toString(),
        selectedTeams: playerTeamIds,
        phone: player.phone || '',
        parent_name: player.parent_name || '',
        parent_phone: player.parent_phone || '',
      });
    } else {
      setIsEditing(false);
      setCurrentPlayer(null);
      setFormData({ ...initialFormData, selectedTeams: [activeTeam.id] });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(initialFormData);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!formData.selectedTeams || formData.selectedTeams.length === 0) {
        setError('Veuillez sélectionner au moins une équipe.');
        return;
      }
      if (isEditing && currentPlayer) {
        // Update routé via le service (updatePlayer réécrit tous les champs,
        // team_id inclus, et resynchronise player_teams — cf. playersService).
        await playersService.updatePlayer(currentPlayer.id, formData);
        const teamNames = teams.filter(t => formData.selectedTeams.includes(t.id)).map(t => t.name).join(', ');
        setSuccess(`Joueur modifié dans ${teamNames}`);
      } else {
        // Création routée via le service (même insert + relations player_teams).
        await playersService.createPlayer(formData);
        const teamNames = teams.filter(t => formData.selectedTeams.includes(t.id)).map(t => t.name).join(', ');
        setSuccess(`Joueur ajouté dans ${teamNames}`);
      }

      handleCloseModal();
      fetchPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (playerId: string) => {
    if (!canEditActiveTeam) return; // lecture seule : équipe non rattachée
    const player = players.find(p => p.id === playerId);
    const name = player ? `${player.first_name} ${player.last_name}` : 'ce joueur';
    if (!confirm(
      `Retirer ${name} de l'effectif ?\n\n` +
      `${name} sera marqué « Parti (quitte le club) » : il quitte l'effectif actif mais son historique (matchs, buts, présences) est conservé.\n\n` +
      `Ne supprimez jamais définitivement un joueur : cela ferait perdre les données collectives des matchs. Le statut « Parti » est la bonne pratique.`
    )) return;
    try {
      setError(null);
      await playersService.deletePlayer(playerId);
      setSuccess(`${name} marqué « Parti »`);
      setPlayers(players.filter(p => p.id !== playerId));
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la suppression');
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ backgroundColor: t.pageBg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: t.accent }} />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 w-full">

      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: t.negativeSubtle, color: t.negative, border: `1px solid ${t.negative}33` }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: t.positiveSubtle, color: t.positive, border: `1px solid ${t.positive}33` }}>
          <Check size={16} /><span>{success}</span>
        </div>
      )}

      {/* ── Header banner ──────────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 flex items-center gap-4"
        style={{ background: `linear-gradient(135deg, ${t.accentFill} 0%, ${t.accent} 100%)`, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: activeTeam?.color || t.accent, flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
            {activeTeam?.name?.[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
            Effectif {activeTeam ? `— ${activeTeam.name}` : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
            {displayedPlayers.length} joueur{displayedPlayers.length !== 1 ? 's' : ''}
            {players.length !== displayedPlayers.length && ` (${players.length} au total)`}
          </div>
        </div>
        {/* Position legend — ordre tactique, même palette catégorielle que le tableau */}
        <div className="hidden md:flex gap-3">
          {Object.keys(POSITION_ORDER).map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: positionColor(key, t) }} />
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl flex items-center gap-3 p-3 flex-wrap"
        style={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, boxShadow: '0 1px 4px rgba(30,58,95,0.05)' }}>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: t.textMuted, pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Rechercher un joueur..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: t.text,
              backgroundColor: t.rowOdd,
              outline: 'none',
              width: '100%',
            }}
          />
        </div>

        {/* Match type filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {MATCH_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setMatchFilter(f.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${matchFilter === f.value ? t.accent : t.border}`,
                backgroundColor: matchFilter === f.value ? t.accent : 'transparent',
                color: matchFilter === f.value ? '#fff' : t.textMuted,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort by (for card view) */}
        {viewMode === 'cards' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {([['name', 'Nom'], ['position', 'Poste'], ['goals', 'Buts'], ['assists', 'Passes déc.'], ['matches', 'Matchs'], ['mvp_count', 'MVP'], ['seances', 'Séances']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${sortKey === key ? t.accent : t.border}`,
                  backgroundColor: sortKey === key ? t.accentSubtle : 'transparent',
                  color: sortKey === key ? t.accent : t.textMuted,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {label}
                {sortKey === key && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
              </button>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${t.border}` }}>
          <button
            onClick={() => setViewMode('cards')}
            title="Vue cartes"
            style={{
              padding: '7px 10px', border: 'none',
              backgroundColor: viewMode === 'cards' ? t.accentFill : t.cardBg,
              color: viewMode === 'cards' ? '#fff' : t.textMuted,
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            title="Vue tableau"
            style={{
              padding: '7px 10px', border: 'none',
              borderLeft: `1px solid ${t.border}`,
              backgroundColor: viewMode === 'table' ? t.accentFill : t.cardBg,
              color: viewMode === 'table' ? '#fff' : t.textMuted,
              cursor: 'pointer',
            }}
          >
            <List size={15} />
          </button>
        </div>

        {/* New player + import Excel — masqués en lecture seule (équipe non rattachée) */}
        {canEditActiveTeam ? (
          <>
            <button
              onClick={() => setIsImportOpen(true)}
              disabled={!activeTeam}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
              style={{
                backgroundColor: t.cardBg,
                color: activeTeam ? t.text : t.textMuted,
                border: `1px solid ${t.border}`,
                cursor: activeTeam ? 'pointer' : 'not-allowed',
              }}
            >
              <Upload size={15} /> Importer un effectif
            </button>
            <button
              onClick={() => handleOpenModal()}
              disabled={!activeTeam}
              className="fm-btn fm-btn-primary"
            >
              <Plus size={15} /> Nouveau joueur
            </button>
          </>
        ) : (
          <span
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: t.rowOdd, color: t.textMuted, border: `1px solid ${t.border}` }}
            title="Vous n'êtes pas rattaché à cette équipe : consultation uniquement."
          >
            <Lock size={13} /> Lecture seule
          </span>
        )}
      </div>

      {/* ── Card grid view ──────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
        <div>
          {displayedPlayers.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}` }}>
              <p style={{ color: t.textMuted, fontSize: 14 }}>
                {players.length === 0 ? 'Aucun joueur dans cette équipe' : 'Aucun joueur ne correspond à la recherche'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {displayedPlayers.map(player => {
                const pos = getPosition(player.position, t);
                const st  = getStatus(player.status, t);
                const attPct = player.attendance_percentage ?? 0;
                return (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    pos={pos}
                    st={st}
                    attPct={attPct}
                    canEdit={canEditActiveTeam}
                    onOpen={() => router.push(`/webapp/manager/squad/${player.id}`)}
                    onEdit={e => { e.stopPropagation(); handleOpenModal(player); }}
                    onDelete={e => { e.stopPropagation(); handleDelete(player.id); }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Table view ─────────────────────────────────────────────────────── */}
      {viewMode === 'table' && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: t.rowOdd, borderBottom: `1px solid ${t.border}` }}>
                  <th style={{ padding: 0, width: 3 }} />
                  <th style={{ padding: '10px 8px', width: 64, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('position')}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'position' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      POS <SortIcon col="position" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'name' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      NOM <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 100, fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>STATUT</th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('seances')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'seances' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      SÉA <SortIcon col="seances" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('matches')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'matches' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      MAT <SortIcon col="matches" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('goals')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'goals' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      BUT <SortIcon col="goals" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('assists')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'assists' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      PD <SortIcon col="assists" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('mvp_count')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'mvp_count' ? t.accent : t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      MVP <SortIcon col="mvp_count" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 20px 10px 8px', width: 72, fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {displayedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px 20px', textAlign: 'center', color: t.textMuted, fontSize: 14 }}>
                      {players.length === 0 ? 'Aucun joueur dans cette équipe' : 'Aucun joueur ne correspond à la recherche'}
                    </td>
                  </tr>
                ) : displayedPlayers.map((player, index) => {
                  const pos = getPosition(player.position, t);
                  const st  = getStatus(player.status, t);
                  const isEven = index % 2 === 0;
                  return (
                    <tr key={player.id} onClick={() => router.push(`/webapp/manager/squad/${player.id}`)}
                      style={{ backgroundColor: isEven ? t.cardBg : t.rowOdd, borderBottom: `1px solid ${t.border}`, cursor: 'pointer', transition: 'background-color .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = t.accentSubtle)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = isEven ? t.cardBg : t.rowOdd)}
                    >
                      <td style={{ padding: 0, width: 0, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: pos.color }} />
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 800, letterSpacing: '0.3px', backgroundColor: pos.bg, color: pos.color }}>
                          {pos.abbr}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{player.last_name.toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{player.first_name}</div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'seances' ? t.accent : t.textMuted }}>
                        {player.training_attendance ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'matches' ? t.accent : t.textMuted }}>
                        {player.matches_played ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'goals' ? t.accent : (player.goals ?? 0) > 0 ? t.positive : t.textMuted }}>
                        {player.goals ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'assists' ? t.accent : (player.assists ?? 0) > 0 ? t.positive : t.textMuted }}>
                        {player.assists ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'mvp_count' ? t.accent : (player.mvp_count ?? 0) > 0 ? '#f59e0b' : t.textMuted }}>
                        {player.mvp_count ?? 0}
                      </td>
                      <td style={{ padding: '10px 20px 10px 8px', textAlign: 'right' }}>
                        {canEditActiveTeam && (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleOpenModal(player)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: t.accent, borderRadius: 4 }} title="Modifier">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => handleDelete(player.id)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: t.negative, borderRadius: 4 }} title="Supprimer">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fm-overlay">
          <div className="fm-modal" style={{ maxWidth: 480 }}>
            <div className="fm-modal-header">
              <div className="fm-modal-title">
                <div className="fm-modal-title-bar" />
                {isEditing ? 'Modifier le joueur' : 'Nouveau joueur'}
              </div>
              <button className="fm-modal-close" onClick={handleCloseModal}>
                <X size={16} />
              </button>
            </div>

            <form id="squad-player-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="fm-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Numéro */}
                <div>
                  <label className="fm-label">Numéro de maillot</label>
                  <input
                    type="number" min="1" max="99"
                    value={formData.number}
                    onChange={e => setFormData({ ...formData, number: e.target.value })}
                    placeholder="Ex: 10"
                    className="fm-input"
                  />
                </div>

                {/* Prénom + Nom */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="fm-label">Prénom *</label>
                    <input type="text" required value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} className="fm-input" />
                  </div>
                  <div>
                    <label className="fm-label">Nom *</label>
                    <input type="text" required value={formData.last_name} onChange={e => setFormData({ ...formData, last_name: e.target.value })} className="fm-input" />
                  </div>
                </div>

                {/* Date de naissance */}
                <div>
                  <label className="fm-label">Date de naissance</label>
                  <input type="date" value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })} className="fm-input" />
                </div>

                {/* Poste + Pied fort */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="fm-label">Poste *</label>
                    <select required value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} className="fm-select">
                      <option value="">Sélectionner</option>
                      <option value="Gardien">Gardien</option>
                      <option value="Meneur">Meneur</option>
                      <option value="Ailier">Ailier</option>
                      <option value="Pivot">Pivot</option>
                    </select>
                  </div>
                  <div>
                    <label className="fm-label">Pied fort *</label>
                    <select required value={formData.strong_foot} onChange={e => setFormData({ ...formData, strong_foot: e.target.value })} className="fm-select">
                      <option value="">Sélectionner</option>
                      {/* Écrivait « Ambidextre » là où le mobile écrit
                          « Droit et gauche » : le même joueur changeait de
                          valeur en base selon l'écran de saisie, et les filtres
                          « pied fort » du web en cachaient toujours une part. */}
                      {STRONG_FOOT_OPTIONS.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Statut administratif — PAS la disponibilité.
                    « Blessé » et « Suspendu » ont été retirés le 2026-08-13 : la
                    disponibilité vit dans `player_availability`, historisée, avec
                    date de retour et zone. Les garder ici créait deux vérités
                    concurrentes, et surtout écrasait définitivement le statut de
                    mutation FFF du joueur, qui est la vraie donnée de ce champ. */}
                <div>
                  <label className="fm-label">Statut *</label>
                  <select required value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="fm-select">
                    <option value="">Sélectionner</option>
                    <option value="Non-muté">Non-Muté</option>
                    <option value="Muté">Muté</option>
                    <option value="Muté HP">Muté HP</option>
                    <option value="left">Parti (quitte le club)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Statut de mutation. Pour une blessure ou une suspension, passez par le Pôle
                    Performance.
                  </p>
                </div>

                {/* Limite séquence */}
                <div>
                  <label className="fm-label">Limite par séquence (secondes) *</label>
                  <input type="number" required min="30" step="10" value={formData.sequence_time_limit} onChange={e => setFormData({ ...formData, sequence_time_limit: e.target.value })} className="fm-input" />
                  <p style={{ fontSize: '0.75rem', color: t.textMuted, marginTop: 4 }}>Durée max avant alerte dans le match recorder (défaut 180 s)</p>
                </div>

                {/* Contact */}
                <div>
                  <label className="fm-label">Téléphone du joueur</label>
                  <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="fm-input" placeholder="06 12 34 56 78" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="fm-label">Nom du parent</label>
                    <input type="text" value={formData.parent_name} onChange={e => setFormData({ ...formData, parent_name: e.target.value })} className="fm-input" placeholder="Nom du parent" />
                  </div>
                  <div>
                    <label className="fm-label">Téléphone du parent</label>
                    <input type="tel" value={formData.parent_phone} onChange={e => setFormData({ ...formData, parent_phone: e.target.value })} className="fm-input" placeholder="06 12 34 56 78" />
                  </div>
                </div>

                {/* Équipes */}
                <div>
                  <label className="fm-label">
                    Équipes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: t.textMuted }}>(sélection multiple)</span>
                  </label>
                  <div style={{ border: `1.5px solid ${t.border}`, borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
                    {teams.map((team, i) => (
                      <label
                        key={team.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px', cursor: 'pointer',
                          borderBottom: i < teams.length - 1 ? `1px solid ${t.border}` : 'none',
                          background: t.cardBg,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.selectedTeams.includes(team.id)}
                          onChange={e => setFormData({
                            ...formData,
                            selectedTeams: e.target.checked
                              ? [...formData.selectedTeams, team.id]
                              : formData.selectedTeams.filter(id => id !== team.id),
                          })}
                          style={{ accentColor: t.accent, width: 15, height: 15 }}
                        />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: team.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8125rem', color: t.text }}>
                          {team.name} {team.category && `(${team.category}${team.level ? ` - ${team.level}` : ''})`}
                        </span>
                      </label>
                    ))}
                  </div>
                  {formData.selectedTeams.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: t.negative, marginTop: 4 }}>Veuillez sélectionner au moins une équipe</p>
                  )}
                </div>
              </div>

              <div className="fm-modal-footer">
                <button type="button" className="fm-btn fm-btn-secondary" onClick={handleCloseModal}>
                  Annuler
                </button>
                <button type="submit" disabled={isSubmitting} className="fm-btn fm-btn-primary">
                  {isSubmitting ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Ajouter le joueur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportOpen && activeTeam && (
        <ImportPlayersModal
          teamId={activeTeam.id}
          teamName={activeTeam.name}
          existingPlayers={players.map(p => ({ first_name: p.first_name, last_name: p.last_name }))}
          onClose={() => setIsImportOpen(false)}
          onImported={fetchPlayers}
        />
      )}
    </div>
  );
}

// ─── Shared input style ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 5,
  padding: '8px 11px',
  border: '1px solid #DDE1EA',
  borderRadius: 6,
  fontSize: 13,
  color: '#1A2332',
  backgroundColor: '#F9FAFB',
  outline: 'none',
  boxSizing: 'border-box',
};
