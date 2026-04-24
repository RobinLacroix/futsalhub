'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUserClub } from '@/app/webapp/hooks/useUserClub';
import { useActiveTeam } from '@/app/webapp/hooks/useActiveTeam';
import { playersService } from '@/lib/services/playersService';
import { seasonPlanningService, PlanningData, RecruitData } from '@/lib/services/seasonPlanningService';
import { Player, Team } from '@/types';
import Link from 'next/link';
import {
  Plus, X, Save, UserPlus, ChevronUp, ChevronDown,
  LogOut, Search, RefreshCw, CheckCircle, Pencil, ExternalLink, RotateCcw
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function currentSeason(): string {
  const y = new Date().getFullYear();
  const m = new Date().getMonth(); // 0-indexed
  return m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const POSITION_COLORS: Record<string, string> = {
  Gardien: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  Meneur:  'bg-blue-100 text-blue-700 border-blue-300',
  Ailier:  'bg-green-100 text-green-700 border-green-300',
  Pivot:   'bg-red-100 text-red-700 border-red-300',
};
const positionColor = (pos: string) => POSITION_COLORS[pos] ?? 'bg-gray-100 text-gray-700 border-gray-300';

const HIERARCHY_STYLES: Record<number, { label: string; border: string; bg: string; badge: string }> = {
  1: { label: 'Hiérarchie 1', border: 'border-emerald-300', bg: 'bg-emerald-50', badge: 'bg-emerald-500' },
  2: { label: 'Hiérarchie 2', border: 'border-blue-300',    bg: 'bg-blue-50',    badge: 'bg-blue-500' },
  3: { label: 'Hiérarchie 3', border: 'border-amber-300',   bg: 'bg-amber-50',   badge: 'bg-amber-500' },
  4: { label: 'Hiérarchie 4', border: 'border-orange-300',  bg: 'bg-orange-50',  badge: 'bg-orange-500' },
  5: { label: 'Hiérarchie 5', border: 'border-gray-300',    bg: 'bg-gray-50',    badge: 'bg-gray-400' },
};
const hierarchyStyle = (h: number) => HIERARCHY_STYLES[h] ?? HIERARCHY_STYLES[5];

// Zone ID helpers
const zoneUnassigned = 'unassigned';
const zoneDepartures = 'departures';
const zoneTeam = (teamId: string, h: number) => `team|${teamId}|${h}`;
const parseTeamZone = (zoneId: string) => {
  const parts = zoneId.split('|');
  if (parts[0] !== 'team' || parts.length < 3) return null;
  const h = parseInt(parts[parts.length - 1], 10);
  const teamId = parts.slice(1, parts.length - 1).join('|');
  return { teamId, h };
};

function removeCardFromAll(data: PlanningData, cardId: string): PlanningData {
  const next = deepClone(data);
  next.unassigned = next.unassigned.filter((id) => id !== cardId);
  next.departures = next.departures.filter((id) => id !== cardId);
  for (const teamId of Object.keys(next.teams)) {
    const team = next.teams[teamId];
    for (const h of Object.keys(team.slots)) {
      team.slots[Number(h)] = team.slots[Number(h)].filter((id) => id !== cardId);
    }
  }
  return next;
}

function addCardToZone(data: PlanningData, cardId: string, zoneId: string): PlanningData {
  const next = deepClone(data);
  if (zoneId === zoneUnassigned) {
    next.unassigned.push(cardId);
  } else if (zoneId === zoneDepartures) {
    next.departures.push(cardId);
  } else {
    const parsed = parseTeamZone(zoneId);
    if (parsed) {
      const { teamId, h } = parsed;
      if (!next.teams[teamId]) return next;
      if (!next.teams[teamId].slots[h]) next.teams[teamId].slots[h] = [];
      next.teams[teamId].slots[h].push(cardId);
    }
  }
  return next;
}

// ── sub-components ────────────────────────────────────────────────────────────

interface PlayerCardProps {
  cardId: string;
  player?: Player;
  recruit?: RecruitData;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onContextMenu: (e: React.MouseEvent, cardId: string) => void;
  onRemoveRecruit?: (recruitId: string) => void;
  compact?: boolean;
}

function PlayerCard({ cardId, player, recruit, isDragging, onDragStart, onContextMenu, onRemoveRecruit, compact }: PlayerCardProps) {
  const isRecruit = cardId.startsWith('recruit|');
  const name = player
    ? `${player.first_name} ${player.last_name}`
    : recruit?.name ?? '—';
  const position = player?.position ?? recruit?.position ?? '';
  const number = player?.number;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, cardId)}
      onContextMenu={(e) => onContextMenu(e, cardId)}
      className={`
        group relative select-none cursor-grab active:cursor-grabbing
        bg-white border rounded-lg shadow-sm
        ${isDragging ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5'}
        transition-all duration-150
        ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}
      `}
    >
      <div className="flex items-center gap-2">
        {number !== undefined && number !== null && (
          <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">
            {number}
          </span>
        )}
        <span className={`font-medium text-gray-800 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
          {name}
        </span>
        {position && (
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${positionColor(position)}`}>
            {position.substring(0, 3).toUpperCase()}
          </span>
        )}
        {isRecruit && (
          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-300">
            RECRUE
          </span>
        )}
      </div>
      {isRecruit && onRemoveRecruit && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemoveRecruit(cardId); }}
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface DropZoneProps {
  zoneId: string;
  isOver: boolean;
  onDragOver: (e: React.DragEvent, zoneId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, zoneId: string) => void;
  children: React.ReactNode;
  className?: string;
  emptyLabel?: string;
}

function DropZone({ zoneId, isOver, onDragOver, onDragLeave, onDrop, children, className, emptyLabel }: DropZoneProps) {
  const hasChildren = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  return (
    <div
      onDragOver={(e) => onDragOver(e, zoneId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, zoneId)}
      className={`
        min-h-[48px] rounded-lg border-2 border-dashed transition-all duration-150 p-1.5
        ${isOver ? 'border-blue-400 bg-blue-50 scale-[1.01]' : 'border-transparent'}
        ${className ?? ''}
      `}
    >
      {hasChildren ? (
        <div className="flex flex-wrap gap-1.5">{children}</div>
      ) : (
        <div className={`flex items-center justify-center h-10 text-xs text-gray-400 italic ${isOver ? 'text-blue-500' : ''}`}>
          {emptyLabel ?? 'Déposer ici'}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function SeasonPlanningPage() {
  const { club } = useUserClub();
  const { teams } = useActiveTeam();

  const [season, setSeason] = useState(currentSeason());
  const [seasons, setSeasons] = useState<string[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  // player id → team ids in the club (for filtering)
  const [playerTeamMap, setPlayerTeamMap] = useState<Map<string, string[]>>(new Map());
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);

  // Recruit creation
  const [showRecruitForm, setShowRecruitForm] = useState(false);
  const [recruitForm, setRecruitForm] = useState({ name: '', position: 'Meneur' });

  // Filters for unassigned pool
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterFoot, setFilterFoot] = useState('');

  // Editable hierarchy label: { teamId, h } | null
  const [editingLabel, setEditingLabel] = useState<{ teamId: string; h: number } | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');

  // Context menu
  interface CtxMenu { cardId: string; x: number; y: number }
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // ── init planning from teams + players ─────────────────────────────────────
  const initPlanning = useCallback((players: Player[], teamList: Team[]): PlanningData => {
    const teamSlots: PlanningData['teams'] = {};
    for (const t of teamList) {
      teamSlots[t.id] = { hierarchyCount: 2, slots: { 1: [], 2: [] } };
    }
    return {
      teams: teamSlots,
      departures: [],
      unassigned: players.map((p) => p.id),
      recruits: {},
    };
  }, []);

  // ── ensure teams present in planning ──────────────────────────────────────
  const syncTeams = useCallback((data: PlanningData, teamList: Team[]): PlanningData => {
    const next = deepClone(data);
    for (const t of teamList) {
      if (!next.teams[t.id]) {
        next.teams[t.id] = { hierarchyCount: 2, slots: { 1: [], 2: [] } };
      }
    }
    return next;
  }, []);

  // stable key so the effect re-runs only when team IDs actually change
  const teamsKey = teams.map((t) => t.id).sort().join(',');

  // ── load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!club?.id || !teams.length) return;

    const load = async () => {
      setLoading(true);
      try {
        const [playerRows, savedSeasons] = await Promise.all([
          playersService.getPlayersByClubWithTeams(club.id),
          seasonPlanningService.listSeasons(club.id),
        ]);
        const players = playerRows.map((r) => r.player);
        setAllPlayers(players);

        // store team membership for filtering
        const map = new Map<string, string[]>();
        for (const row of playerRows) map.set(row.player.id, row.teamIds);
        setPlayerTeamMap(map);

        // use most recently saved season, or current calendar season as fallback
        const activeSeason = savedSeasons[0] ?? season;
        const uniqueSeasons = savedSeasons.includes(activeSeason)
          ? savedSeasons
          : [activeSeason, ...savedSeasons];
        setSeasons(uniqueSeasons);
        setSeason(activeSeason);

        const savedData = await seasonPlanningService.load(club.id, activeSeason);
        if (savedData) {
          setPlanning(syncTeams(savedData, teams));
          setLastSavedAt(new Date());
        } else {
          setPlanning(initPlanning(players, teams));
          setLastSavedAt(null);
        }
      } catch (err) {
        console.error('Season planning load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [club?.id, season, teamsKey]); // eslint-disable-line

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!club?.id || !planning) return;
    setSaving(true);
    try {
      await seasonPlanningService.save(club.id, season, planning);
      setSaved(true);
      setLastSavedAt(new Date());
      setTimeout(() => setSaved(false), 2500);
      if (!seasons.includes(season)) setSeasons((s) => [season, ...s]);
    } catch (err) {
      console.error('Season planning save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── DnD handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('cardId', cardId);
    setDraggingId(cardId);
  };

  const handleDragOver = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverZone(zoneId);
  };

  const handleDragLeave = () => setOverZone(null);

  const handleDrop = (e: React.DragEvent, zoneId: string) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (!cardId || !planning) return;
    setPlanning((prev) => {
      if (!prev) return prev;
      const cleaned = removeCardFromAll(prev, cardId);
      return addCardToZone(cleaned, cardId, zoneId);
    });
    setDraggingId(null);
    setOverZone(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverZone(null);
  };

  // ── hierarchy controls ────────────────────────────────────────────────────
  const changeHierarchy = (teamId: string, delta: number) => {
    if (!planning) return;
    setPlanning((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const team = next.teams[teamId];
      const newCount = Math.max(1, Math.min(5, team.hierarchyCount + delta));

      if (delta > 0) {
        for (let h = team.hierarchyCount + 1; h <= newCount; h++) {
          if (!team.slots[h]) team.slots[h] = [];
        }
      } else {
        // move cards from removed levels back to unassigned
        for (let h = newCount + 1; h <= team.hierarchyCount; h++) {
          const cards = team.slots[h] || [];
          next.unassigned.push(...cards);
          delete team.slots[h];
        }
      }
      team.hierarchyCount = newCount;
      return next;
    });
  };

  // ── recruit creation ──────────────────────────────────────────────────────
  const handleCreateRecruit = () => {
    if (!recruitForm.name.trim() || !planning) return;
    const id = `recruit|${Date.now()}`;
    setPlanning((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      next.recruits[id] = { id, name: recruitForm.name.trim(), position: recruitForm.position, notes: '' };
      next.unassigned.push(id);
      return next;
    });
    setRecruitForm({ name: '', position: 'Meneur' });
    setShowRecruitForm(false);
  };

  const handleRemoveRecruit = (recruitId: string) => {
    setPlanning((prev) => {
      if (!prev) return prev;
      const next = removeCardFromAll(prev, recruitId);
      delete next.recruits[recruitId];
      return next;
    });
  };

  // ── hierarchy label editing ───────────────────────────────────────────────
  const startEditLabel = (teamId: string, h: number, current: string) => {
    setEditingLabel({ teamId, h });
    setEditingLabelValue(current);
  };

  const commitLabel = () => {
    if (!editingLabel || !planning) return;
    const { teamId, h } = editingLabel;
    setPlanning((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      if (!next.teams[teamId].hierarchyNames) next.teams[teamId].hierarchyNames = {};
      next.teams[teamId].hierarchyNames![h] = editingLabelValue.trim() || hierarchyStyle(h).label;
      return next;
    });
    setEditingLabel(null);
  };

  // ── context menu ──────────────────────────────────────────────────────────
  const handleContextMenu = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault();
    setCtxMenu({ cardId, x: e.clientX, y: e.clientY });
  };

  const closeCtxMenu = () => setCtxMenu(null);

  const ctxMoveToUnassigned = () => {
    if (!ctxMenu) return;
    setPlanning((prev) => {
      if (!prev) return prev;
      const cleaned = removeCardFromAll(prev, ctxMenu.cardId);
      return addCardToZone(cleaned, ctxMenu.cardId, zoneUnassigned);
    });
    closeCtxMenu();
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const getPlayer = (id: string): Player | undefined => allPlayers.find((p) => p.id === id);
  const getRecruit = (id: string): RecruitData | undefined => planning?.recruits[id];

  const getCardPosition = (cardId: string): string => {
    const p = getPlayer(cardId);
    if (p) return p.position;
    return planning?.recruits[cardId]?.position ?? '';
  };

  const getTeamStats = (teamState: PlanningData['teams'][string]) => {
    const allCards = Object.values(teamState.slots).flat();
    const goalkeepers = allCards.filter((id) => getCardPosition(id) === 'Gardien').length;
    const fieldPlayers = allCards.length - goalkeepers;
    return { fieldPlayers, goalkeepers };
  };

  const renderCard = (cardId: string, onRemoveRecruit?: (id: string) => void) => (
    <PlayerCard
      key={cardId}
      cardId={cardId}
      player={getPlayer(cardId)}
      recruit={getRecruit(cardId)}
      isDragging={draggingId === cardId}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      onRemoveRecruit={onRemoveRecruit}
      compact
    />
  );

  const filteredUnassigned = (planning?.unassigned ?? []).filter((id) => {
    const p = getPlayer(id);
    const r = getRecruit(id);
    const name = p ? `${p.first_name} ${p.last_name}` : r?.name ?? '';
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPosition) {
      const pos = p?.position ?? r?.position ?? '';
      if (pos !== filterPosition) return false;
    }
    if (filterFoot) {
      if (!p || p.strong_foot !== filterFoot) return false;
    }
    if (filterTeam) {
      if (!p) return false; // recruits have no team yet
      const tids = playerTeamMap.get(p.id) ?? [];
      if (!tids.includes(filterTeam)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Chargement…</span>
      </div>
    );
  }

  if (!planning) return null;

  const teamList = teams.filter((t) => planning.teams[t.id]);

  const ctxPlayer = ctxMenu ? getPlayer(ctxMenu.cardId) : null;

  return (
    <div className="flex flex-col h-full" onDragEnd={handleDragEnd} onClick={closeCtxMenu}>
      {/* ── Context menu ── */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxPlayer && (
            <Link
              href={`/webapp/manager/squad/${ctxPlayer.id}`}
              onClick={closeCtxMenu}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
              Voir la fiche joueur
            </Link>
          )}
          <button
            onClick={ctxMoveToUnassigned}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
          >
            <RotateCcw className="h-4 w-4 text-gray-400" />
            Retirer vers non assignés
          </button>
        </div>
      )}
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planification de saison</h1>
          <p className="text-sm text-gray-500 mt-0.5">Positionnez les joueurs par équipe et hiérarchie</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Season selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Saison</label>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              {/* Allow typing a new season via a custom option trick */}
            </select>
            {/* New season shortcut */}
            <button
              onClick={() => {
                const [a, b] = season.split('-').map(Number);
                const next = `${a + 1}-${b + 1}`;
                setSeason(next);
                if (!seasons.includes(next)) setSeasons((s) => [next, ...s]);
              }}
              className="text-xs text-blue-600 hover:underline"
            >
              +1 an
            </button>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${saved
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                }
              `}
            >
              {saved ? (
                <><CheckCircle className="h-4 w-4" /> Sauvegardé</>
              ) : (
                <><Save className="h-4 w-4" /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}</>
              )}
            </button>
            {lastSavedAt && (
              <span className="text-[10px] text-gray-400">
                Dernière sauvegarde : {lastSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: unassigned pool ── */}
        <div className="w-64 shrink-0 flex flex-col border-r border-gray-200 bg-gray-50">
          <div className="px-3 py-3 border-b border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Non assignés{' '}
                <span className="text-xs font-normal text-gray-400">
                  ({filteredUnassigned.length}/{planning.unassigned.length})
                </span>
              </span>
              <button
                onClick={() => setShowRecruitForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Recrue
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
            </div>
            {/* Filters */}
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600"
            >
              <option value="">Tous les postes</option>
              {['Gardien', 'Meneur', 'Ailier', 'Pivot'].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={filterFoot}
              onChange={(e) => setFilterFoot(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600"
            >
              <option value="">Tous les pieds</option>
              {['Droit', 'Gauche', 'Ambidextre'].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600"
            >
              <option value="">Toutes les équipes</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {(filterPosition || filterFoot || filterTeam) && (
              <button
                onClick={() => { setFilterPosition(''); setFilterFoot(''); setFilterTeam(''); }}
                className="w-full text-[10px] text-gray-400 hover:text-gray-600 text-center"
              >
                Effacer les filtres
              </button>
            )}
            {/* Recruit form */}
            {showRecruitForm && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 space-y-1.5">
                <input
                  type="text"
                  placeholder="Nom prénom"
                  value={recruitForm.name}
                  onChange={(e) => setRecruitForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full text-xs border border-purple-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRecruit()}
                />
                <select
                  value={recruitForm.position}
                  onChange={(e) => setRecruitForm((f) => ({ ...f, position: e.target.value }))}
                  className="w-full text-xs border border-purple-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
                >
                  {['Gardien', 'Meneur', 'Ailier', 'Pivot'].map((pos) => (
                    <option key={pos}>{pos}</option>
                  ))}
                </select>
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateRecruit}
                    className="flex-1 text-xs bg-purple-600 text-white rounded py-1 hover:bg-purple-700"
                  >
                    Ajouter
                  </button>
                  <button
                    onClick={() => setShowRecruitForm(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 px-2"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Unassigned drop zone */}
          <div className="flex-1 overflow-y-auto p-2">
            <DropZone
              zoneId={zoneUnassigned}
              isOver={overZone === zoneUnassigned}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="flex flex-col gap-1.5"
              emptyLabel="Tous assignés !"
            >
              {filteredUnassigned.map((id) =>
                renderCard(id, id.startsWith('recruit|') ? handleRemoveRecruit : undefined)
              )}
            </DropZone>
          </div>
        </div>

        {/* ── Right: planning board ── */}
        <div className="flex-1 overflow-auto p-4 space-y-4">

          {/* Départs */}
          <div className="bg-white border border-red-200 rounded-xl shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-100">
              <LogOut className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-red-700 text-sm">Départs du club</span>
              <span className="text-xs text-red-400">({planning.departures.length})</span>
            </div>
            <div className="p-2">
              <DropZone
                zoneId={zoneDepartures}
                isOver={overZone === zoneDepartures}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                emptyLabel="Déposer les joueurs qui quittent le club"
              >
                {planning.departures.map((id) => renderCard(id))}
              </DropZone>
            </div>
          </div>

          {/* Team grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {teamList.map((team) => {
              const teamState = planning.teams[team.id];
              if (!teamState) return null;
              const { fieldPlayers, goalkeepers } = getTeamStats(teamState);
              return (
                <div
                  key={team.id}
                  className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
                >
                  {/* Team header */}
                  <div
                    className="px-4 pt-2.5 pb-2"
                    style={{ borderBottom: `3px solid ${team.color || '#6366f1'}` }}
                  >
                    {/* Row 1 : nom + contrôles */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: team.color || '#6366f1' }}
                        />
                        <span className="font-semibold text-gray-900 text-sm truncate">{team.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{team.category}</span>
                      </div>
                      {/* Hierarchy count control */}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className="text-xs text-gray-500">Niveaux</span>
                        <button
                          onClick={() => changeHierarchy(team.id, -1)}
                          disabled={teamState.hierarchyCount <= 1}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4 text-gray-600" />
                        </button>
                        <span className="text-sm font-bold text-gray-700 w-5 text-center">
                          {teamState.hierarchyCount}
                        </span>
                        <button
                          onClick={() => changeHierarchy(team.id, +1)}
                          disabled={teamState.hierarchyCount >= 5}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4 text-gray-600" />
                        </button>
                      </div>
                    </div>
                    {/* Row 2 : stats */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2 py-0.5">
                        {fieldPlayers} joueur{fieldPlayers !== 1 ? 's' : ''} de champ
                      </span>
                      <span className="text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full px-2 py-0.5">
                        {goalkeepers} GK
                      </span>
                    </div>
                  </div>

                  {/* Hierarchy slots */}
                  <div className="divide-y divide-gray-100">
                    {Array.from({ length: teamState.hierarchyCount }, (_, i) => i + 1).map((h) => {
                      const style = hierarchyStyle(h);
                      const zoneId = zoneTeam(team.id, h);
                      const cards = teamState.slots[h] ?? [];
                      const labelName = teamState.hierarchyNames?.[h] ?? style.label;
                      const isEditingThis = editingLabel?.teamId === team.id && editingLabel?.h === h;
                      return (
                        <div key={h} className={`${style.bg}`}>
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <span className={`w-4 h-4 rounded-full ${style.badge} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>
                              {h}
                            </span>
                            {isEditingThis ? (
                              <input
                                autoFocus
                                value={editingLabelValue}
                                onChange={(e) => setEditingLabelValue(e.target.value)}
                                onBlur={commitLabel}
                                onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingLabel(null); }}
                                className="text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            ) : (
                              <button
                                onClick={() => startEditLabel(team.id, h, labelName)}
                                className="group flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 text-left"
                              >
                                {labelName}
                                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 shrink-0" />
                              </button>
                            )}
                            <span className="text-[10px] text-gray-400 ml-auto shrink-0">({cards.length})</span>
                          </div>
                          <div className="px-2 pb-2">
                            <DropZone
                              zoneId={zoneId}
                              isOver={overZone === zoneId}
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              className={`border-2 ${style.border} rounded-lg`}
                              emptyLabel="Déposer un joueur"
                            >
                              {cards.map((id) => renderCard(id, id.startsWith('recruit|') ? handleRemoveRecruit : undefined))}
                            </DropZone>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {teamList.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p>Aucune équipe trouvée. Créez des équipes depuis la section <strong>Équipes</strong>.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
