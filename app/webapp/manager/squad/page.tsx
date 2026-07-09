'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
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
} from 'lucide-react';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { useActiveSeasonContext } from '../../contexts/ActiveSeasonContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  pageBg:      '#EEF0F5',
  cardBg:      '#FFFFFF',
  border:      '#DDE1EA',
  text:        '#1A2332',
  textMuted:   '#697585',
  accent:      '#3B82F6',
  accentAmber: '#FFB020',
  rowOdd:      '#F9FAFB',
};

// ─── Player Card component ────────────────────────────────────────────────────
function PlayerCard({
  player, pos, st, attPct, onOpen, onEdit, onDelete,
}: {
  player: any;
  pos: { abbr: string; color: string; bg: string };
  st: { label: string; color: string; bg: string };
  attPct: number;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const goals = player.goals ?? 0;
  const matches = player.matches_played ?? 0;
  const trainings = player.training_attendance ?? 0;
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        backgroundColor: '#FFFFFF',
        border: `1.5px solid ${hov ? pos.color + '60' : '#DDE1EA'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? `0 6px 20px ${pos.color}18` : '0 1px 4px rgba(30,58,95,0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top color stripe */}
      <div style={{ height: 4, backgroundColor: pos.color, width: '100%' }} />

      <div style={{ padding: '12px 14px 14px' }}>
        {/* Header row: number + position + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 900, color: pos.color,
            width: 28, height: 28, borderRadius: 6,
            backgroundColor: pos.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {player.number != null ? player.number : '#'}
          </span>
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
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A2332', letterSpacing: '0.3px', lineHeight: 1.2 }}>
            {player.last_name.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: '#697585', marginTop: 2 }}>
            {player.first_name}{player.birth_date ? ` · ${calcAge(player.birth_date)} ans` : ''}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
          {[
            { val: matches,  label: 'Matchs',   color: '#2563EB' },
            { val: goals,    label: 'Buts',      color: goals > 0 ? '#D97706' : '#94A3B8' },
            { val: `${attPct}%`, label: 'Présence',
              color: attPct >= 80 ? '#16A34A' : attPct >= 60 ? '#D97706' : attPct > 0 ? '#DC2626' : '#94A3B8' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Attendance bar */}
        {attPct > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 3, borderRadius: 2, backgroundColor: '#F1F5F9', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${Math.min(attPct, 100)}%`,
                backgroundColor: attPct >= 80 ? '#16A34A' : attPct >= 60 ? '#D97706' : '#DC2626',
                transition: 'width 600ms ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Hover actions */}
      {hov && (
        <div
          style={{
            position: 'absolute', top: 10, right: 10,
            display: 'flex', gap: 4,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            style={{ padding: 5, borderRadius: 6, border: '1px solid #E2E8F0', backgroundColor: '#FFF', cursor: 'pointer', color: '#3B82F6' }}
            title="Modifier"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            style={{ padding: 5, borderRadius: 6, border: '1px solid #E2E8F0', backgroundColor: '#FFF', cursor: 'pointer', color: '#EF4444' }}
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
const POSITION_MAP: Record<string, { abbr: string; color: string; bg: string }> = {
  Gardien:   { abbr: 'GB',  color: '#EF4444', bg: 'rgba(239,68,68,0.10)'   },
  Ailier:    { abbr: 'AIL', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)'  },
  Meneur:    { abbr: 'MEN', color: '#22C55E', bg: 'rgba(34,197,94,0.10)'   },
  Pivot:     { abbr: 'PIV', color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)'  },
};

function getPosition(position?: string) {
  if (!position) return { abbr: '—', color: T.textMuted, bg: '#F1F5F9' };
  const key = Object.keys(POSITION_MAP).find(k =>
    position.toLowerCase().startsWith(k.toLowerCase())
  );
  return key ? POSITION_MAP[key] : { abbr: position.slice(0, 3).toUpperCase(), color: T.textMuted, bg: '#F1F5F9' };
}

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'Non-muté': { label: 'Actif',     color: '#16A34A', bg: 'rgba(22,163,74,0.10)'    },
  'Muté':     { label: 'Muté',      color: '#3B82F6', bg: 'rgba(59,130,246,0.10)'   },
  'Muté HP':  { label: 'Muté HP',   color: '#F97316', bg: 'rgba(249,115,22,0.10)'   },
  'Blessé':   { label: 'Blessé',    color: '#EF4444', bg: 'rgba(239,68,68,0.10)'    },
  'Suspendu': { label: 'Suspendu',  color: '#FFB020', bg: 'rgba(255,176,32,0.10)'   },
  'left':     { label: 'Parti',     color: '#6B7280', bg: 'rgba(107,114,128,0.12)'  },
};

function getStatus(status?: string) {
  if (!status) return { label: status || '—', color: T.textMuted, bg: '#F1F5F9' };
  return STATUS_MAP[status] ?? { label: status, color: T.textMuted, bg: '#F1F5F9' };
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
type SortKey = 'name' | 'seances' | 'matches' | 'goals';
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
  training_attendance?: number;
  attendance_percentage?: number;
  sequence_time_limit?: number;
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
  if (sortKey !== col) return <ChevronsUpDown size={13} style={{ color: T.textMuted, marginLeft: 3 }} />;
  return sortDir === 'asc'
    ? <ChevronUp size={13} style={{ color: T.accent, marginLeft: 3 }} />
    : <ChevronDown size={13} style={{ color: T.accent, marginLeft: 3 }} />;
}

// ─── Page component ───────────────────────────────────────────────────────────
export default function SquadPage() {
  const router = useRouter();
  const { activeTeam, teams } = useActiveTeam();
  const { activeSeason } = useActiveSeasonContext();

  // Data state
  const [players, setPlayers]           = useState<Player[]>([]);
  const [totalTrainings, setTotalTrainings] = useState<number>(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen]   = useState(false);
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

      const { data, error } = await supabase
        .from('player_teams')
        .select(`player_id, players (*)`)
        .eq('team_id', activeTeam.id)
        .order('players(last_name)');

      if (error) throw error;
      // Exclure les joueurs partis (statut 'left') de l'effectif affiché.
      const playersData = (data?.map((item: any) => item.players).filter(Boolean) || [])
        .filter((p: any) => p.status !== 'left') as any[];

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
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
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
        case 'seances': va = a.training_attendance ?? 0; vb = b.training_attendance ?? 0; break;
        case 'matches': va = a.matches_played ?? 0;      vb = b.matches_played ?? 0;      break;
        case 'goals':   va = a.goals ?? 0;               vb = b.goals ?? 0;               break;
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
    if (player) {
      setIsEditing(true);
      setCurrentPlayer(player);
      let playerTeamIds: string[] = [];
      try {
        const { data: ptData } = await supabase
          .from('player_teams')
          .select('team_id')
          .eq('player_id', player.id);
        playerTeamIds = ptData?.map((pt: { team_id: string }) => pt.team_id) || [];
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
      const playerData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        birth_date: formData.birth_date || null,
        position: formData.position,
        strong_foot: formData.strong_foot,
        status: formData.status,
        number: formData.number ? parseInt(formData.number) : null,
        sequence_time_limit: formData.sequence_time_limit ? parseInt(formData.sequence_time_limit) : 180,
        team_id: formData.selectedTeams[0],
      };

      let playerId: string;

      if (isEditing && currentPlayer) {
        // NOTE: reste en accès direct volontairement. playersService.updatePlayer
        // diverge du comportement inline (n'écrit pas team_id, update conditionnel,
        // ne réinitialise pas sequence_time_limit). À réconcilier séparément (cf. audit §3).
        const { error: updateError } = await supabase.from('players').update(playerData).eq('id', currentPlayer.id);
        if (updateError) throw updateError;
        playerId = currentPlayer.id;
        const { error: deleteError } = await supabase.from('player_teams').delete().eq('player_id', playerId);
        if (deleteError) throw deleteError;
        const { error: insertError } = await supabase.from('player_teams').insert(
          formData.selectedTeams.map(teamId => ({ player_id: playerId, team_id: teamId }))
        );
        if (insertError) throw insertError;
        const teamNames = teams.filter(t => formData.selectedTeams.includes(t.id)).map(t => t.name).join(', ');
        setSuccess(`Joueur modifié dans ${teamNames}`);
      } else {
        // Création : identique à playersService.createPlayer (même insert + relations player_teams), routé via le service.
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
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce joueur ?')) return;
    try {
      setError(null);
      await playersService.deletePlayer(playerId);
      setSuccess('Joueur supprimé avec succès');
      setPlayers(players.filter(p => p.id !== playerId));
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la suppression');
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ backgroundColor: T.pageBg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: T.accent }} />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 w-full">

      {/* ── Toasts ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: 'rgba(34,197,94,0.08)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Check size={16} /><span>{success}</span>
        </div>
      )}

      {/* ── Header banner ──────────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2a4f7c 100%)', boxShadow: '0 4px 20px rgba(30,58,95,0.15)' }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: activeTeam?.color || T.accent, flexShrink: 0 }}>
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
        {/* Position legend */}
        <div className="hidden md:flex gap-3">
          {Object.entries(POSITION_MAP).filter(([,v]) => ['GB','DEF','PIV','MEN','AIL'].includes(v.abbr)).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: val.color }} />
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl flex items-center gap-3 p-3 flex-wrap"
        style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(30,58,95,0.05)' }}>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Rechercher un joueur..."
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              fontSize: 13,
              color: T.text,
              backgroundColor: '#F9FAFB',
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
                border: `1px solid ${matchFilter === f.value ? T.accent : T.border}`,
                backgroundColor: matchFilter === f.value ? T.accent : 'transparent',
                color: matchFilter === f.value ? '#fff' : T.textMuted,
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
            {([['name', 'Nom'], ['goals', 'Buts'], ['matches', 'Matchs'], ['seances', 'Séances']] as [SortKey, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${sortKey === key ? '#1e3a5f' : T.border}`,
                  backgroundColor: sortKey === key ? '#EFF6FF' : 'transparent',
                  color: sortKey === key ? '#1e3a5f' : T.textMuted,
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
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
          <button
            onClick={() => setViewMode('cards')}
            title="Vue cartes"
            style={{
              padding: '7px 10px', border: 'none',
              backgroundColor: viewMode === 'cards' ? '#1e3a5f' : T.cardBg,
              color: viewMode === 'cards' ? '#fff' : T.textMuted,
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
              borderLeft: `1px solid ${T.border}`,
              backgroundColor: viewMode === 'table' ? '#1e3a5f' : T.cardBg,
              color: viewMode === 'table' ? '#fff' : T.textMuted,
              cursor: 'pointer',
            }}
          >
            <List size={15} />
          </button>
        </div>

        {/* New player */}
        <button
          onClick={() => handleOpenModal()}
          disabled={!activeTeam}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
          style={{
            backgroundColor: activeTeam ? T.accentAmber : '#CBD5E1',
            color: activeTeam ? '#1A0A00' : '#94A3B8',
            border: 'none',
            cursor: activeTeam ? 'pointer' : 'not-allowed',
          }}
        >
          <Plus size={15} /> Nouveau joueur
        </button>
      </div>

      {/* ── Card grid view ──────────────────────────────────────────────────── */}
      {viewMode === 'cards' && (
        <div>
          {displayedPlayers.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}>
              <p style={{ color: T.textMuted, fontSize: 14 }}>
                {players.length === 0 ? 'Aucun joueur dans cette équipe' : 'Aucun joueur ne correspond à la recherche'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {displayedPlayers.map(player => {
                const pos = getPosition(player.position);
                const st  = getStatus(player.status);
                const attPct = player.attendance_percentage ?? 0;
                return (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    pos={pos}
                    st={st}
                    attPct={attPct}
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
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: '10px 12px 10px 20px', textAlign: 'center', width: 44, fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>N°</th>
                  <th style={{ padding: '10px 8px', width: 64, fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>POS</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'name' ? T.accent : T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      NOM <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 100, fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>STATUT</th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('seances')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'seances' ? T.accent : T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      SÉA <SortIcon col="seances" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('matches')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'matches' ? T.accent : T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      MAT <SortIcon col="matches" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 8px', width: 70, cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('goals')}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: sortKey === 'goals' ? T.accent : T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      BUT <SortIcon col="goals" sortKey={sortKey} sortDir={sortDir} />
                    </div>
                  </th>
                  <th style={{ padding: '10px 20px 10px 8px', width: 72, fontSize: 11, fontWeight: 700, color: T.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {displayedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: T.textMuted, fontSize: 14 }}>
                      {players.length === 0 ? 'Aucun joueur dans cette équipe' : 'Aucun joueur ne correspond à la recherche'}
                    </td>
                  </tr>
                ) : displayedPlayers.map((player, index) => {
                  const pos = getPosition(player.position);
                  const st  = getStatus(player.status);
                  const isEven = index % 2 === 0;
                  return (
                    <tr key={player.id} onClick={() => router.push(`/webapp/manager/squad/${player.id}`)}
                      style={{ backgroundColor: isEven ? T.cardBg : T.rowOdd, borderBottom: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background-color .1s' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = isEven ? T.cardBg : T.rowOdd)}
                    >
                      <td style={{ padding: 0, width: 0, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: pos.color }} />
                        <span style={{ display: 'block', paddingLeft: 23, paddingRight: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, color: T.textMuted }}>
                          {player.number != null ? player.number : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 800, letterSpacing: '0.3px', backgroundColor: pos.bg, color: pos.color }}>
                          {pos.abbr}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{player.last_name.toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{player.first_name}</div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, backgroundColor: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'seances' ? T.accent : T.textMuted }}>
                        {player.training_attendance ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'matches' ? T.accent : T.textMuted }}>
                        {player.matches_played ?? 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14, fontWeight: 700, color: sortKey === 'goals' ? T.accent : (player.goals ?? 0) > 0 ? '#F59E0B' : T.textMuted }}>
                        {player.goals ?? 0}
                      </td>
                      <td style={{ padding: '10px 20px 10px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleOpenModal(player)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: T.accent, borderRadius: 4 }} title="Modifier">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => handleDelete(player.id)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', borderRadius: 4 }} title="Supprimer">
                            <Trash2 size={15} />
                          </button>
                        </div>
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
                      <option value="Droit">Droit</option>
                      <option value="Gauche">Gauche</option>
                      <option value="Ambidextre">Ambidextre</option>
                    </select>
                  </div>
                </div>

                {/* Statut */}
                <div>
                  <label className="fm-label">Statut *</label>
                  <select required value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="fm-select">
                    <option value="">Sélectionner</option>
                    <option value="Non-muté">Non-Muté</option>
                    <option value="Muté">Muté</option>
                    <option value="Muté HP">Muté HP</option>
                    <option value="Blessé">Blessé</option>
                    <option value="Suspendu">Suspendu</option>
                    <option value="left">Parti (quitte le club)</option>
                  </select>
                </div>

                {/* Limite séquence */}
                <div>
                  <label className="fm-label">Limite par séquence (secondes) *</label>
                  <input type="number" required min="30" step="10" value={formData.sequence_time_limit} onChange={e => setFormData({ ...formData, sequence_time_limit: e.target.value })} className="fm-input" />
                  <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 4 }}>Durée max avant alerte dans le match recorder (défaut 180 s)</p>
                </div>

                {/* Équipes */}
                <div>
                  <label className="fm-label">
                    Équipes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#9CA3AF' }}>(sélection multiple)</span>
                  </label>
                  <div style={{ border: '1.5px solid #C8D4E0', borderRadius: 8, maxHeight: 160, overflowY: 'auto' }}>
                    {teams.map((team, i) => (
                      <label
                        key={team.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px', cursor: 'pointer',
                          borderBottom: i < teams.length - 1 ? '1px solid #EEF0F5' : 'none',
                          background: 'white',
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
                          style={{ accentColor: '#2563EB', width: 15, height: 15 }}
                        />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: team.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8125rem', color: '#0F172A' }}>
                          {team.name} {team.category && `(${team.category}${team.level ? ` - ${team.level}` : ''})`}
                        </span>
                      </label>
                    ))}
                  </div>
                  {formData.selectedTeams.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: 4 }}>Veuillez sélectionner au moins une équipe</p>
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
