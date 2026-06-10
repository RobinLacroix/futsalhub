'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '../../hooks/useActiveTeam';
import { supabase } from '@/lib/supabaseClient';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  pageBg:     '#EEF0F5',
  cardBg:     '#FFFFFF',
  border:     '#DDE1EA',
  text:       '#1A2332',
  textMuted:  '#697585',
  accent:     '#3B82F6',
  accentAmber:'#FFB020',
  green:      '#16A34A',
  red:        '#DC2626',
  amber:      '#D97706',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchRow {
  id: string;
  date: string | null;
  location: string | null;
  competition: string | null;
  score_team: number | null;
  score_opponent: number | null;
  players: unknown;
}

interface MatchEventRow {
  id: string;
  match_id: string;
  event_type: string;
  player_id: string | null;
  players_on_field: string[] | null;
  match_time_seconds: number;
  half: number;
  goal_type?: string | null;
}

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
}

type PlayerStats = {
  playerId: string;
  playerName: string;
  position: string | null;
  matchesPlayed: number;
  goals: number;
  shot_on_target: number;
  shot: number;
  ball_loss: number;
  recovery: number;
  assist: number;
  yellow_cards: number;
  red_cards: number;
  plusMinusGoals: number;
  plusMinusShots: number;
  totalTimeSeconds: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePlayingTime(events: MatchEventRow[]): Map<string, number> {
  const byPlayer = new Map<string, number>();
  const processHalf = (evs: MatchEventRow[]) => {
    if (!evs.length) return;
    const sorted = [...evs].sort((a, b) => a.match_time_seconds - b.match_time_seconds);
    const maxT = Math.max(...sorted.map(e => e.match_time_seconds));
    sorted.forEach((ev, i) => {
      const nextT = i + 1 < sorted.length ? sorted[i + 1].match_time_seconds : maxT;
      const dur = nextT - ev.match_time_seconds;
      if (dur <= 0) return;
      if (Array.isArray(ev.players_on_field))
        ev.players_on_field.forEach(pid => byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + dur));
    });
    const first = sorted[0];
    if (first.match_time_seconds > 0 && Array.isArray(first.players_on_field))
      first.players_on_field.forEach(pid => byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + first.match_time_seconds));
  };
  processHalf(events.filter(e => e.half === 1));
  processHalf(events.filter(e => e.half === 2));
  return byPlayer;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function abbrevName(full: string): string {
  const parts = full.trim().split(' ');
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const POSITION_COLORS: Record<string, string> = {
  gardien:    '#8B5CF6',
  pivot:      '#F59E0B',
  ailier:     '#3B82F6',
  fixo:       '#16A34A',
  universel:  '#6B7280',
};

function positionDot(position: string | null) {
  const key = (position ?? '').toLowerCase();
  const color = POSITION_COLORS[key] ?? '#9CA3AF';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

const LOCATION_OPTIONS    = ['all', 'Domicile', 'Extérieur'] as const;
const COMPETITION_OPTIONS = ['all', 'Championnat', 'Coupe', 'Amical'] as const;

const TABLE_COLS = [
  { key: 'playerName',       label: 'Joueur',  width: 140 },
  { key: 'matchesPlayed',    label: 'M',       width: 40  },
  { key: 'totalTimeSeconds', label: 'Tps',     width: 56  },
  { key: 'goals',            label: 'B',       width: 40  },
  { key: 'plusMinusGoals',   label: '+/-B',    width: 48  },
  { key: 'shot_on_target',   label: 'TC',      width: 40  },
  { key: 'totalShots',       label: 'TT',      width: 40  },
  { key: 'recovery',         label: 'Récup.',  width: 48  },
  { key: 'ball_loss',        label: 'Pertes',  width: 48  },
  { key: 'assist',           label: 'Pdec',    width: 40  },
  { key: 'yellow_cards',     label: '🟡',      width: 36  },
  { key: 'red_cards',        label: '🔴',      width: 36  },
] as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ display: 'block', width: 3, height: 14, backgroundColor: T.accent, borderRadius: 2 }} />
      <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </span>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      backgroundColor: T.cardBg,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function FilterPills<T extends string>({
  label,
  options,
  active,
  onSelect,
  displayMap,
}: {
  label: string;
  options: readonly T[];
  active: T;
  onSelect: (v: T) => void;
  displayMap: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 56 }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(v => {
          const isActive = active === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onSelect(v)}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${isActive ? T.accent : T.border}`,
                backgroundColor: isActive ? '#EFF6FF' : '#F8FAFC',
                color: isActive ? T.accent : T.textMuted,
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
            >
              {displayMap[v] ?? v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div style={{
      backgroundColor: T.cardBg,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minWidth: 0,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        backgroundColor: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, marginBottom: 2,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  );
}

function TopList({
  title,
  color,
  icon,
  items,
}: {
  title: string;
  color: string;
  icon: string;
  items: { name: string; value: string; valueColor?: string; sub?: string }[];
}) {
  const RANK_COLORS = ['#F59E0B', '#94A3B8', '#B45309', '#697585', '#697585'];
  return (
    <Card style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7,
          backgroundColor: color + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic', textAlign: 'center', paddingBlock: 8 }}>
          Pas encore de données
        </p>
      ) : (
        items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingBlock: 6,
            borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, width: 16, textAlign: 'center', color: RANK_COLORS[i] ?? '#94A3B8' }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              {item.sub && (
                <span style={{ display: 'block', fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                  {item.sub}
                </span>
              )}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: item.valueColor ?? color, flexShrink: 0 }}>
              {item.value}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

// ─── Coaching Analysis ───────────────────────────────────────────────────────

type InsightLevel = 'positive' | 'warning' | 'alert' | 'info';

interface Insight {
  level: InsightLevel;
  icon: string;
  title: string;
  body: string;
}

function generateInsights(
  stats: PlayerStats[],
  ts: { played: number; wins: number; losses: number; goalsFor: number; goalsAgainst: number; cleanSheets: number; form: string[] },
  goalsByType: { key: string; label: string; scored: number; conceded: number }[],
): Insight[] {
  const out: Insight[] = [];
  if (ts.played < 2) return out;

  // Forme récente
  if (ts.form.length >= 3) {
    const r = ts.form.slice(0, 3);
    if (r.filter(x => x === 'W').length >= 3)
      out.push({ level: 'positive', icon: '🔥', title: 'Série de victoires', body: `3 victoires consécutives — le momentum est excellent. Profitez-en pour renforcer la rigueur défensive et ne pas se relâcher.` });
    else if (r.filter(x => x === 'L').length >= 3)
      out.push({ level: 'alert', icon: '⚠️', title: 'Série difficile', body: `3 défaites consécutives. Recréez des situations de succès à l'entraînement pour restaurer la confiance du groupe avant le prochain match.` });
    else if (r.filter(x => x === 'W').length >= 2)
      out.push({ level: 'positive', icon: '📈', title: 'Bonne dynamique', body: `2 victoires sur les 3 derniers matchs. L'équipe est dans une phase positive — maintenez l'intensité à l'entraînement.` });
  }

  // Efficacité offensive
  const avgFor = ts.goalsFor / ts.played;
  if (avgFor >= 3)
    out.push({ level: 'positive', icon: '⚽', title: 'Attaque prolifique', body: `${avgFor.toFixed(1)} buts par match en moyenne — l'équipe produit offensivement. Veillez à ne pas négliger l'équilibre défensif.` });
  else if (avgFor < 1 && ts.played >= 3)
    out.push({ level: 'alert', icon: '🎯', title: 'Manque de réalisme', body: `Moins d'un but par match (${avgFor.toFixed(1)} moy.). Travaillez les situations de finition et la prise de décision en zone de conclusion.` });

  // Solidité défensive
  const avgAgainst = ts.goalsAgainst / ts.played;
  if (avgAgainst >= 3)
    out.push({ level: 'alert', icon: '🛡️', title: 'Défense à consolider', body: `${avgAgainst.toFixed(1)} buts encaissés par match. Analysez vos transitions défensives et la gestion des CPA concédés.` });
  else if (ts.cleanSheets / ts.played >= 0.4)
    out.push({ level: 'positive', icon: '🧱', title: 'Solidité défensive', body: `${ts.cleanSheets} clean sheet(s) sur ${ts.played} matchs (${Math.round(ts.cleanSheets / ts.played * 100)}%). La défense est le socle de cette équipe.` });

  // Dépendance à un buteur
  const withGoals = stats.filter(p => p.goals > 0);
  if (withGoals.length > 0 && ts.goalsFor >= 5) {
    const top = [...withGoals].sort((a, b) => b.goals - a.goals)[0];
    const share = Math.round((top.goals / ts.goalsFor) * 100);
    if (share >= 40)
      out.push({ level: 'warning', icon: '⚡', title: `Dépendance à ${abbrevName(top.playerName)}`, body: `${top.playerName} marque ${share}% des buts. Si ce joueur est absent ou verrouillé, l'attaque peut s'assécher — impliquez d'autres profils dans la finition.` });
  }

  // Presseur clé
  const active = stats.filter(p => p.matchesPlayed >= 2 && p.totalTimeSeconds > 0);
  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.recovery / b.matchesPlayed) - (a.recovery / a.matchesPlayed))[0];
    const rpm = top.recovery / top.matchesPlayed;
    if (rpm >= 2)
      out.push({ level: 'info', icon: '🔄', title: `${abbrevName(top.playerName)}, moteur du pressing`, body: `${top.recovery} récupérations en ${top.matchesPlayed} matchs (${rpm.toFixed(1)}/match). C'est un atout dans la phase de pressing — construisez votre animation défensive autour de son activité.` });
  }

  // Pertes de balle excessives
  if (active.length > 0) {
    const top = [...active].sort((a, b) => (b.ball_loss / b.matchesPlayed) - (a.ball_loss / a.matchesPlayed))[0];
    const lpm = top.ball_loss / top.matchesPlayed;
    if (lpm >= 3)
      out.push({ level: 'warning', icon: '📉', title: 'Pertes de balle à corriger', body: `${top.playerName} perd en moyenne ${lpm.toFixed(1)} ballons par match. Travaillez la conservation sous pression et la lecture des situations avec ce profil.` });
  }

  // Taux de conversion collectif
  const totalGoals = stats.reduce((s, p) => s + p.goals, 0);
  const totalShots = stats.reduce((s, p) => s + p.shot + p.shot_on_target + p.goals, 0);
  if (totalShots >= 10) {
    const conv = Math.round((totalGoals / totalShots) * 100);
    if (conv >= 35)
      out.push({ level: 'positive', icon: '🏹', title: 'Excellent taux de conversion', body: `${conv}% des tirs finissent au fond (${totalGoals}/${totalShots}). La finition est un point fort collectif à entretenir.` });
    else if (conv < 15)
      out.push({ level: 'warning', icon: '😤', title: 'Taux de conversion faible', body: `Seulement ${conv}% de conversion (${totalGoals} buts / ${totalShots} tirs). Priorisez des exercices de décision en zone de finition et la qualité de frappe.` });
  }

  // Vulnérabilité tactique
  const worstType = [...goalsByType].sort((a, b) => b.conceded - a.conceded)[0];
  if (worstType?.conceded >= 2)
    out.push({ level: 'warning', icon: '🔍', title: `Vulnérabilité en ${worstType.label}`, body: `${worstType.conceded} buts encaissés en ${worstType.label.toLowerCase()}. C'est le point défensif le plus exposé — prévoyez des séances dédiées à cette situation.` });

  // Joueur sous-utilisé avec bon impact
  const underused = stats.filter(p => p.plusMinusGoals >= 2 && p.matchesPlayed >= 2 && p.totalTimeSeconds < 600 * p.matchesPlayed);
  if (underused.length > 0) {
    const p = underused[0];
    out.push({ level: 'info', icon: '💡', title: `${abbrevName(p.playerName)} à valoriser`, body: `+/- de +${p.plusMinusGoals} sur ${p.matchesPlayed} matchs pour un temps de jeu limité. Sa présence sur le terrain est statistiquement bénéfique — envisagez de lui donner plus de responsabilités.` });
  }

  return out;
}

const INSIGHT_STYLES: Record<InsightLevel, { bg: string; border: string; tag: string; tagColor: string }> = {
  positive: { bg: '#F0FDF4', border: '#86EFAC', tag: 'Point fort',   tagColor: '#16A34A' },
  warning:  { bg: '#FFFBEB', border: '#FCD34D', tag: 'Attention',    tagColor: '#D97706' },
  alert:    { bg: '#FEF2F2', border: '#FCA5A5', tag: 'Alerte',       tagColor: '#DC2626' },
  info:     { bg: '#EFF6FF', border: '#BFDBFE', tag: 'Observation',  tagColor: '#3B82F6' },
};

function CoachInsightCard({ insight }: { insight: Insight }) {
  const s = INSIGHT_STYLES[insight.level];
  return (
    <div style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{insight.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 800, color: s.tagColor,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              border: `1px solid ${s.border}`, borderRadius: 4, padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}>
              {s.tag}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{insight.title}</span>
          </div>
          <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.65, margin: 0 }}>{insight.body}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Combo analysis ──────────────────────────────────────────────────────────

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, k - 1).map(c => [first, ...c]),
    ...getCombinations(rest, k),
  ];
}

interface ComboStats {
  playerIds:        string[];
  pmGoals:          number;
  pmShots:          number;
  sharedTimeSec:    number;
  pmGoalsPerMin:     number;
  pmShotsPerMin:     number;
}

/** Detects lineup windows from events sorted by time, returns { players, duration }[]. */
function buildLineupSegments(
  events: MatchEventRow[],
  half: number,
): { players: string[]; duration: number }[] {
  const halfEvs = events
    .filter(e => e.half === half && Array.isArray(e.players_on_field) && (e.players_on_field as string[]).length > 0)
    .sort((a, b) => a.match_time_seconds - b.match_time_seconds);
  if (halfEvs.length < 2) return [];

  const segs: { players: string[]; duration: number }[] = [];
  let winStart  = 0;
  let winPlayers = halfEvs[0].players_on_field as string[];
  let winKey     = [...winPlayers].sort().join('|');

  for (let i = 1; i < halfEvs.length; i++) {
    const next     = halfEvs[i];
    const nextPl   = next.players_on_field as string[];
    const nextKey  = [...nextPl].sort().join('|');
    if (nextKey !== winKey) {
      const dur = next.match_time_seconds - winStart;
      if (dur > 0) segs.push({ players: winPlayers, duration: dur });
      winPlayers = nextPl;
      winKey     = nextKey;
      winStart   = next.match_time_seconds;
    }
  }
  return segs; // last segment dropped — end of half unknown
}

function computeAllComboStats(
  eventsByMatch: Record<string, MatchEventRow[]>,
  filteredMatchIds: Set<string>,
  playerById: Map<string, PlayerRow>,
): Map<string, ComboStats> {
  const map = new Map<string, ComboStats>();

  const isOutfield = (pid: string) => {
    const p = playerById.get(pid);
    return !!p && (p.position ?? '').toLowerCase() !== 'gardien';
  };

  const ensure = (sorted: string[]): ComboStats => {
    const key = sorted.join('|');
    if (!map.has(key)) map.set(key, { playerIds: sorted, pmGoals: 0, pmShots: 0, sharedTimeSec: 0, pmGoalsPerMin: 0, pmShotsPerMin: 0 });
    return map.get(key)!;
  };

  const SCORING = new Set(['goal','opponent_goal','shot','shot_on_target','opponent_shot','opponent_shot_on_target']);

  Object.entries(eventsByMatch).forEach(([matchId, events]) => {
    if (!filteredMatchIds.has(matchId)) return;

    // 1. Shared time from lineup segments
    for (const half of [1, 2]) {
      for (const seg of buildLineupSegments(events, half)) {
        const outfield = seg.players.filter(isOutfield);
        for (const k of [2, 3, 4] as const) {
          for (const combo of getCombinations(outfield, k)) {
            ensure([...combo].sort()).sharedTimeSec += seg.duration;
          }
        }
      }
    }

    // 2. +/- from scoring events
    events.forEach(ev => {
      if (!SCORING.has(ev.event_type) || !Array.isArray(ev.players_on_field)) return;
      const outfield = (ev.players_on_field as string[]).filter(isOutfield);
      const pmG = ev.event_type === 'goal' ? 1 : ev.event_type === 'opponent_goal' ? -1 : 0;
      const pmS = (ev.event_type === 'shot' || ev.event_type === 'shot_on_target') ? 1
        : (ev.event_type === 'opponent_shot' || ev.event_type === 'opponent_shot_on_target') ? -1 : 0;
      for (const k of [2, 3, 4] as const) {
        for (const combo of getCombinations(outfield, k)) {
          const acc = ensure([...combo].sort());
          acc.pmGoals += pmG;
          acc.pmShots += pmS;
        }
      }
    });
  });

  // 3. Normalise per 90 min
  map.forEach(acc => {
    if (acc.sharedTimeSec > 0) {
      acc.pmGoalsPerMin = acc.pmGoals / (acc.sharedTimeSec / 60);
      acc.pmShotsPerMin = acc.pmShots / (acc.sharedTimeSec / 60);
    }
  });

  return map;
}

const MIN_COMBO_SEC = 300; // 5 min minimum together

function generateComboInsightCards(
  allStats: Map<string, ComboStats>,
  playerById: Map<string, PlayerRow>,
): Insight[] {
  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };
  const fmt = (ids: string[]) => ids.map(getName).join(' · ');
  const bySize = (size: number) =>
    Array.from(allStats.values())
      .filter(c => c.playerIds.length === size && c.sharedTimeSec >= MIN_COMBO_SEC)
      .sort((a, b) => b.pmGoalsPerMin - a.pmGoalsPerMin);

  const LABEL: Record<number, string> = { 2: 'Duo', 3: 'Trio', 4: 'Ligne' };
  const ICON:  Record<number, string> = { 2: '⚡', 3: '🔺', 4: '🔗' };
  const out: Insight[] = [];

  for (const size of [4, 3, 2]) {
    const best = bySize(size)[0];
    if (!best) continue;
    if (best.pmGoalsPerMin >= 0.08) {
      const shotNote = best.pmShotsPerMin >= 0.1 ? ` · +/-T/min : +${best.pmShotsPerMin.toFixed(2)}` : '';
      out.push({
        level: 'positive', icon: ICON[size],
        title: `${LABEL[size]} efficace : ${fmt(best.playerIds)}`,
        body: `+/-B/min de +${best.pmGoalsPerMin.toFixed(2)}${shotNote} — ${fmtTime(best.sharedTimeSec)} ensemble. Privilégiez cette combinaison dans les moments clés.`,
      });
    } else if (best.pmShotsPerMin >= 0.2 && best.pmGoalsPerMin >= 0) {
      out.push({
        level: 'info', icon: '🎯',
        title: `${LABEL[size]} dominant au tir : ${fmt(best.playerIds)}`,
        body: `+/-T/min de +${best.pmShotsPerMin.toFixed(2)} — ${fmtTime(best.sharedTimeSec)} ensemble. Ce groupe crée beaucoup de danger, la conversion suivra.`,
      });
    }
  }

  const worst = Array.from(allStats.values())
    .filter(c => c.playerIds.length === 2 && c.sharedTimeSec >= MIN_COMBO_SEC && c.pmGoalsPerMin <= -0.1)
    .sort((a, b) => a.pmGoalsPerMin - b.pmGoalsPerMin)[0];
  if (worst) {
    out.push({
      level: 'warning', icon: '⚠️',
      title: `Duo à surveiller : ${fmt(worst.playerIds)}`,
      body: `+/-B/min de ${worst.pmGoalsPerMin.toFixed(2)} (${fmtTime(worst.sharedTimeSec)} partagées). Analysez les situations défensives dans cette configuration.`,
    });
  }

  return out;
}

// ─── Combo ranking section ────────────────────────────────────────────────────

type ComboSortKey = 'sharedTimeSec' | 'pmGoals' | 'pmShots' | 'pmGoalsPerMin' | 'pmShotsPerMin';

const COMBO_COLS: { label: string; sortKey?: ComboSortKey; w: number | 'auto'; center: boolean; accent?: boolean }[] = [
  { label: '#',        w: 28,     center: true  },
  { label: 'Joueurs',  w: 'auto', center: false },
  { label: 'Tps ens.', sortKey: 'sharedTimeSec',  w: 64,  center: true },
  { label: '+/-B',     sortKey: 'pmGoals',         w: 44,  center: true },
  { label: '+/-T',     sortKey: 'pmShots',          w: 44,  center: true },
  { label: '+/-B/min', sortKey: 'pmGoalsPerMin',   w: 76,  center: true, accent: true },
  { label: '+/-T/min', sortKey: 'pmShotsPerMin',   w: 76,  center: true },
];

function ComboRankingSection({
  allStats,
  playerById,
}: {
  allStats: Map<string, ComboStats>;
  playerById: Map<string, PlayerRow>;
}) {
  const [activeSize, setActiveSize] = useState<2 | 3 | 4>(3);
  const [sortKey, setSortKey]       = useState<ComboSortKey>('pmGoalsPerMin');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: ComboSortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const getName = (id: string) => {
    const p = playerById.get(id);
    return p ? abbrevName(`${p.first_name} ${p.last_name}`) : id.slice(0, 6);
  };

  const combosFor = (size: 2 | 3 | 4) =>
    Array.from(allStats.values())
      .filter(c => c.playerIds.length === size && c.sharedTimeSec >= MIN_COMBO_SEC);

  const SIZES: { size: 2 | 3 | 4; label: string; icon: string }[] = [
    { size: 4, label: 'Lignes', icon: '🔗' },
    { size: 3, label: 'Trios',  icon: '🔺' },
    { size: 2, label: 'Duos',   icon: '⚡' },
  ];

  const hasAny = SIZES.some(s => combosFor(s.size).length > 0);
  if (!hasAny) return null;

  const dir = sortDir === 'asc' ? 1 : -1;
  const rows = combosFor(activeSize)
    .sort((a, b) => dir * ((a[sortKey] as number) - (b[sortKey] as number)))
    .slice(0, 8);

  const fmtPm     = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  const fmtPerMin = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
  const pmColor   = (v: number) => v > 0 ? T.green : v < 0 ? T.red : T.textMuted;

  return (
    <section style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'block', width: 3, height: 14, backgroundColor: '#F59E0B', borderRadius: 2 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Classement des combinaisons
        </span>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Size tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, padding: '10px 14px', gap: 6 }}>
          {SIZES.map(s => {
            const count = combosFor(s.size).length;
            const isActive = activeSize === s.size;
            return (
              <button key={s.size} onClick={() => setActiveSize(s.size)} style={{
                padding: '4px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${isActive ? T.accent : T.border}`,
                backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                color: isActive ? T.accent : T.textMuted,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span>{s.icon}</span> {s.label}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: isActive ? T.accent : '#94A3B8',
                    backgroundColor: isActive ? '#DBEAFE' : '#F1F5F9',
                    borderRadius: 10, padding: '0 5px' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
            Pas assez de données — min. 5 min ensemble pour cette taille de combinaison.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${T.border}` }}>
                  {COMBO_COLS.map(col => {
                    const isActive = col.sortKey === sortKey;
                    const canSort  = !!col.sortKey;
                    return (
                      <th
                        key={col.label}
                        onClick={() => col.sortKey && handleSort(col.sortKey)}
                        style={{
                          padding: '8px 10px', fontSize: 9, fontWeight: 800,
                          color: isActive ? T.accent : col.accent ? T.accent : T.textMuted,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          textAlign: col.center ? 'center' : 'left',
                          whiteSpace: 'nowrap',
                          width: col.w === 'auto' ? undefined : col.w,
                          cursor: canSort ? 'pointer' : 'default',
                          userSelect: 'none',
                        }}
                      >
                        {col.label}
                        {isActive && (
                          <span style={{ marginLeft: 3, fontSize: 8 }}>
                            {sortDir === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.playerIds.join('|')} style={{
                    borderBottom: `1px solid ${T.border}`,
                    backgroundColor: i % 2 === 0 ? T.cardBg : '#F8FAFC',
                  }}>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, fontSize: 11,
                      color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#B45309' : T.textMuted }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '9px 10px', color: T.text, fontWeight: 500, minWidth: 160 }}>
                      {c.playerIds.map(getName).join(' · ')}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: sortKey === 'sharedTimeSec' ? T.accent : T.textMuted, fontWeight: sortKey === 'sharedTimeSec' ? 700 : 400 }}>
                      {fmtTime(c.sharedTimeSec)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: sortKey === 'pmGoals' ? T.accent : pmColor(c.pmGoals) }}>
                      {fmtPm(c.pmGoals)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: sortKey === 'pmShots' ? T.accent : pmColor(c.pmShots) }}>
                      {fmtPm(c.pmShots)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 900, fontSize: 13,
                      color: sortKey === 'pmGoalsPerMin' ? T.accent : pmColor(c.pmGoalsPerMin) }}>
                      {fmtPerMin(c.pmGoalsPerMin)}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700,
                      color: sortKey === 'pmShotsPerMin' ? T.accent : pmColor(c.pmShotsPerMin) }}>
                      {fmtPerMin(c.pmShotsPerMin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}`, backgroundColor: '#F8FAFC' }}>
          <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>
            +/-B/min = différentiel de buts par minute · +/-T/min = différentiel de tirs par minute · min. 5 min ensemble requis · gardien exclu
          </p>
        </div>
      </Card>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { activeTeam, activeTeamId } = useActiveTeam();
  const router = useRouter();

  const [loading, setLoading]             = useState(true);
  const [matches, setMatches]             = useState<MatchRow[]>([]);
  const [eventsByMatch, setEventsByMatch] = useState<Record<string, MatchEventRow[]>>({});
  const [allPlayers, setAllPlayers]       = useState<PlayerRow[]>([]);
  const [clubPlayerIds, setClubPlayerIds] = useState<Set<string>>(new Set());

  const [filterLoc,  setFilterLoc]  = useState<typeof LOCATION_OPTIONS[number]>('all');
  const [filterComp, setFilterComp] = useState<typeof COMPETITION_OPTIONS[number]>('all');

  const [sortCol, setSortCol] = useState<string>('playerName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!activeTeamId || !activeTeam?.id) {
      setLoading(false); return;
    }
    setLoading(true);
    try {
      // 1. Matches for team
      const { data: matchData } = await supabase
        .from('matches')
        .select('id, date, location, competition, score_team, score_opponent, players')
        .eq('team_id', activeTeamId)
        .order('date', { ascending: false });

      const mList: MatchRow[] = matchData ?? [];
      setMatches(mList);

      // 2. Club players via player_teams
      const { data: ptData } = await supabase
        .from('player_teams')
        .select('player_id, players(id, first_name, last_name, position)')
        .eq('team_id', activeTeamId);

      const playerList: PlayerRow[] = (ptData ?? []).map((pt: any) => pt.players).filter(Boolean);
      setAllPlayers(playerList);
      setClubPlayerIds(new Set(playerList.map(p => p.id)));

      // 3. Events for each match
      if (mList.length > 0) {
        const matchIds = mList.map(m => m.id);
        const { data: evData } = await supabase
          .from('match_events')
          .select('id, match_id, event_type, player_id, players_on_field, match_time_seconds, half, goal_type')
          .in('match_id', matchIds);

        const evMap: Record<string, MatchEventRow[]> = {};
        for (const ev of (evData ?? []) as MatchEventRow[]) {
          if (!evMap[ev.match_id]) evMap[ev.match_id] = [];
          evMap[ev.match_id].push(ev);
        }
        setEventsByMatch(evMap);
      }
    } catch (e) {
      console.error('Analytics load error', e);
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, activeTeam?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredMatchIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach(m => {
      const locOk  = filterLoc  === 'all' || norm(m.location    ?? '') === norm(filterLoc);
      const compOk = filterComp === 'all' || norm(m.competition ?? '') === norm(filterComp);
      if (locOk && compOk) ids.add(m.id);
    });
    return ids;
  }, [matches, filterLoc, filterComp]);

  const filteredMatches = useMemo(
    () => matches.filter(m => filteredMatchIds.has(m.id)),
    [matches, filteredMatchIds],
  );

  // ── Team stats ────────────────────────────────────────────────────────────
  const teamStats = useMemo(() => {
    const withScore = filteredMatches.filter(m => m.score_team != null && m.score_opponent != null);
    const wins    = withScore.filter(m => (m.score_team as number) > (m.score_opponent as number)).length;
    const draws   = withScore.filter(m => (m.score_team as number) === (m.score_opponent as number)).length;
    const losses  = withScore.length - wins - draws;
    const goalsFor     = withScore.reduce((s, m) => s + (m.score_team     as number), 0);
    const goalsAgainst = withScore.reduce((s, m) => s + (m.score_opponent as number), 0);
    const cleanSheets  = withScore.filter(m => (m.score_opponent as number) === 0).length;
    const winRate      = withScore.length > 0 ? Math.round((wins / withScore.length) * 100) : 0;

    const form = [...withScore]
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
      .slice(0, 5)
      .map(m => {
        const t = m.score_team as number, o = m.score_opponent as number;
        return t > o ? 'W' : t < o ? 'L' : 'D';
      });

    return { played: filteredMatches.length, wins, draws, losses, goalsFor, goalsAgainst, cleanSheets, winRate, form };
  }, [filteredMatches]);

  // ── Player stats ──────────────────────────────────────────────────────────
  const playerStatsList = useMemo(() => {
    const map    = new Map<string, PlayerStats>();
    const byId   = new Map(allPlayers.map(p => [p.id, p]));

    const ensure = (id: string): PlayerStats => {
      if (!map.has(id)) {
        const p    = byId.get(id);
        const full = p ? `${p.first_name} ${p.last_name}` : id.slice(0, 8);
        map.set(id, {
          playerId: id, playerName: full, position: p?.position ?? null,
          matchesPlayed: 0, goals: 0, shot_on_target: 0, shot: 0,
          ball_loss: 0, recovery: 0, assist: 0,
          yellow_cards: 0, red_cards: 0,
          plusMinusGoals: 0, plusMinusShots: 0, totalTimeSeconds: 0,
        });
      }
      return map.get(id)!;
    };

    // Event-based stats
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach(ev => {
        if (ev.player_id) {
          const cur = ensure(ev.player_id);
          if (ev.event_type === 'goal')           cur.goals++;
          if (ev.event_type === 'shot_on_target') cur.shot_on_target++;
          if (ev.event_type === 'shot')           cur.shot++;
          if (ev.event_type === 'ball_loss')      cur.ball_loss++;
          if (ev.event_type === 'recovery')       cur.recovery++;
          if (ev.event_type === 'assist')         cur.assist++;
          if (ev.event_type === 'yellow_card')    cur.yellow_cards++;
          if (ev.event_type === 'red_card')       cur.red_cards++;
        }
        if (Array.isArray(ev.players_on_field)) {
          ev.players_on_field.forEach(pid => {
            const cur = ensure(pid);
            if (ev.event_type === 'goal')                                                    cur.plusMinusGoals++;
            if (ev.event_type === 'opponent_goal')                                           cur.plusMinusGoals--;
            if (ev.event_type === 'shot' || ev.event_type === 'shot_on_target')              cur.plusMinusShots++;
            if (ev.event_type === 'opponent_shot' || ev.event_type === 'opponent_shot_on_target') cur.plusMinusShots--;
          });
        }
      });
    });

    // Playing time + matchesPlayed
    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      const m = matches.find(x => x.id === matchId);
      const mPlayers: Array<{ id: string; time_played: number }> = (() => {
        if (!m?.players) return [];
        try { return Array.isArray(m.players) ? m.players as any : JSON.parse(m.players as any); }
        catch { return []; }
      })();
      const fromMatch = new Map(
        mPlayers.filter(p => (p.time_played ?? 0) > 0).map(p => [p.id, p.time_played]),
      );
      const timeMap = fromMatch.size > 0 ? fromMatch : computePlayingTime(events);
      timeMap.forEach((sec, pid) => {
        if (!clubPlayerIds.has(pid)) return;
        const cur = ensure(pid);
        cur.totalTimeSeconds += sec;
        cur.matchesPlayed++;
      });
    });

    return Array.from(map.values()).filter(s => clubPlayerIds.has(s.playerId));
  }, [eventsByMatch, matches, allPlayers, clubPlayerIds, filteredMatchIds]);

  // ── Sorting ───────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: string) => {
    setSortCol(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  const sortedStats = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...playerStatsList].sort((a, b) => {
      if (sortCol === 'playerName') return dir * a.playerName.localeCompare(b.playerName);
      const va = sortCol === 'totalShots' ? a.shot + a.shot_on_target + a.goals : (a as any)[sortCol] ?? 0;
      const vb = sortCol === 'totalShots' ? b.shot + b.shot_on_target + b.goals : (b as any)[sortCol] ?? 0;
      return dir * (va - vb);
    });
  }, [playerStatsList, sortCol, sortDir]);

  // ── Top performers ────────────────────────────────────────────────────────
  const tops = useMemo(() => {
    const topN = (key: string, n = 3) =>
      [...playerStatsList]
        .sort((a, b) => {
          const va = key === 'totalShots' ? a.shot + a.shot_on_target + a.goals : (a as any)[key] ?? 0;
          const vb = key === 'totalShots' ? b.shot + b.shot_on_target + b.goals : (b as any)[key] ?? 0;
          return vb - va;
        })
        .slice(0, n)
        .filter(p => {
          const v = key === 'totalShots' ? p.shot + p.shot_on_target + p.goals : (p as any)[key] ?? 0;
          return v > 0;
        });
    // Efficacité au tir : goals / (shot + shot_on_target + goals) × 100
    const shooterEff = [...playerStatsList]
      .map(p => {
        const totalShots = p.shot + p.shot_on_target + p.goals;
        const eff = totalShots > 0 ? Math.round((p.goals / totalShots) * 100) : 0;
        return { ...p, shotEff: eff, totalShotsAll: totalShots };
      })
      .filter(p => p.totalShotsAll >= 3)   // au moins 3 tirs pour être pertinent
      .sort((a, b) => b.shotEff - a.shotEff)
      .slice(0, 5);

    return {
      scorers:    topN('goals', 5),
      recoveries: topN('recovery', 5),
      plusMinus:  topN('plusMinusGoals', 5),
      shooterEff,
    };
  }, [playerStatsList]);

  // ── Team totals ───────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    onTarget:   playerStatsList.reduce((s, p) => s + p.shot_on_target, 0),
    recoveries: playerStatsList.reduce((s, p) => s + p.recovery, 0),
  }), [playerStatsList]);

  // ── Goals by type (from match_events) ────────────────────────────────────
  const goalsByType = useMemo(() => {
    const types = ['offensive', 'transition', 'cpa', 'superiority'] as const;
    const labels: Record<string, string> = {
      offensive:  'Phase offensive',
      transition: 'Transition',
      cpa:        'CPA',
      superiority:'Supériorité',
    };
    const scored:   Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));
    const conceded: Record<string, number> = Object.fromEntries(types.map(t => [t, 0]));

    Object.entries(eventsByMatch).forEach(([matchId, events]) => {
      if (!filteredMatchIds.has(matchId)) return;
      events.forEach(ev => {
        if (ev.event_type === 'goal' && ev.goal_type) {
          if (scored[ev.goal_type] !== undefined) scored[ev.goal_type]++;
        }
        if (ev.event_type === 'opponent_goal' && ev.goal_type) {
          if (conceded[ev.goal_type] !== undefined) conceded[ev.goal_type]++;
        }
      });
    });

    return types.map(t => ({
      key: t,
      label: labels[t],
      scored: scored[t],
      conceded: conceded[t],
    }));
  }, [eventsByMatch, filteredMatchIds]);

  const maxGoalsByType = useMemo(
    () => Math.max(1, ...goalsByType.map(g => Math.max(g.scored, g.conceded))),
    [goalsByType],
  );

  // ── Coaching insights ─────────────────────────────────────────────────────
  const insights = useMemo(
    () => generateInsights(playerStatsList, teamStats, goalsByType),
    [playerStatsList, teamStats, goalsByType],
  );

  const allComboStats = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return computeAllComboStats(eventsByMatch, filteredMatchIds, playerById);
  }, [eventsByMatch, filteredMatchIds, allPlayers]);

  const comboInsightCards = useMemo(() => {
    const playerById = new Map(allPlayers.map(p => [p.id, p]));
    return generateComboInsightCards(allComboStats, playerById);
  }, [allComboStats, allPlayers]);

  const playerByIdForRanking = useMemo(
    () => new Map(allPlayers.map(p => [p.id, p])),
    [allPlayers],
  );

  // ─── KPI Items ────────────────────────────────────────────────────────────
  const KPI_ITEMS = [
    { label: 'Matchs joués',   value: teamStats.played,          color: T.accent,     icon: '⚽' },
    { label: 'Victoires',      value: teamStats.wins,            color: T.green,      icon: '🏆' },
    { label: 'Défaites',       value: teamStats.losses,          color: T.red,        icon: '❌' },
    { label: 'Taux de victoire',value: `${teamStats.winRate}%`,  color: T.amber,      icon: '📈' },
    { label: 'Buts marqués',   value: teamStats.goalsFor,        color: T.green,      icon: '🎯' },
    { label: 'Buts encaissés', value: teamStats.goalsAgainst,    color: T.red,        icon: '📉' },
    { label: 'Clean sheets',   value: teamStats.cleanSheets,     color: '#8B5CF6',    icon: '🛡️' },
    { label: 'Tirs cadrés',    value: totals.onTarget,           color: '#06B6D4',    icon: '🎯' },
  ];

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (!activeTeam) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: T.textMuted }}>
        <span style={{ fontSize: 40 }}>📊</span>
        <p style={{ fontWeight: 700, fontSize: 16, color: T.text }}>Aucune équipe sélectionnée</p>
        <p style={{ fontSize: 13 }}>Choisissez une équipe depuis le sélecteur en haut du menu.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
        <div style={{
          width: 36, height: 36,
          border: `3px solid ${T.accent}`,
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <span style={{ color: T.textMuted, fontSize: 14 }}>Chargement des statistiques…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const locDisplay: Record<string, string>  = { all: 'Tous', Domicile: 'Domicile', 'Extérieur': 'Extérieur' };
  const compDisplay: Record<string, string> = { all: 'Toutes', Championnat: 'Championnat', Coupe: 'Coupe', Amical: 'Amical' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>

      {/* ── 1. Hero header card ──────────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#1B3054',
        borderRadius: 12,
        padding: '20px 24px',
        color: '#fff',
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
              Analytics
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px', margin: 0 }}>
              {activeTeam.name}
            </h1>
            {(activeTeam.category || activeTeam.level) && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                {[activeTeam.category, activeTeam.level].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Form guide */}
          {teamStats.form.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Forme
              </p>
              <div style={{ display: 'flex', gap: 4 }}>
                {teamStats.form.map((r, i) => {
                  const bg = r === 'W' ? '#15803D' : r === 'L' ? '#B91C1C' : '#B45309';
                  return (
                    <span key={i} style={{
                      width: 24, height: 24, borderRadius: 4,
                      backgroundColor: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: '#fff',
                    }}>
                      {r === 'W' ? 'V' : r === 'L' ? 'D' : 'N'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* W / D / L pills + buts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { value: teamStats.wins,   label: 'Victoires', color: '#4ADE80' },
            { value: teamStats.draws,  label: 'Nuls',      color: '#FCD34D' },
            { value: teamStats.losses, label: 'Défaites',  color: '#F87171' },
          ].map((item, i) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {i > 0 && (
                <div style={{ width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)', marginInline: 16 }} />
              )}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            </div>
          ))}
          {/* Goals divider */}
          <div style={{ width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)', marginInline: 16 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              <span style={{ color: '#86EFAC' }}>{teamStats.goalsFor}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}> buts pour</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}> — </span>
              <span style={{ color: '#FCA5A5' }}>{teamStats.goalsAgainst}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}> buts contre</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Filters row ───────────────────────────────────────────────── */}
      <Card style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FilterPills
          label="Lieu"
          options={LOCATION_OPTIONS}
          active={filterLoc}
          onSelect={setFilterLoc}
          displayMap={locDisplay}
        />
        <FilterPills
          label="Compét."
          options={COMPETITION_OPTIONS}
          active={filterComp}
          onSelect={setFilterComp}
          displayMap={compDisplay}
        />
      </Card>

      {/* ── No matches empty state ───────────────────────────────────────── */}
      {matches.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>Aucun match enregistré</p>
          <p style={{ fontSize: 13, color: T.textMuted, maxWidth: 380, margin: '0 auto' }}>
            Créez un match dans le Calendrier et utilisez le Tracker pour générer des statistiques.
          </p>
        </Card>
      ) : (
        <>
          {/* ── 3. KPI Grid ─────────────────────────────────────────────── */}
          <section style={{ width: '100%' }}>
            <SectionHeader label="Vue d'ensemble" />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
            }}>
              {KPI_ITEMS.map(k => (
                <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />
              ))}
            </div>
          </section>

          {/* ── 4. Top performers ───────────────────────────────────────── */}
          {playerStatsList.length > 0 && (
            <section style={{ width: '100%' }}>
              <SectionHeader label="Meilleurs joueurs" />
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tops.shooterEff.length > 0 ? 4 : 3}, 1fr)`, gap: 10, width: '100%' }}>
                <TopList
                  title="Meilleurs buteurs"
                  color={T.green}
                  icon="⚽"
                  items={tops.scorers.map(p => ({ name: abbrevName(p.playerName), value: String(p.goals) }))}
                />
                <TopList
                  title="Meilleures récupérations"
                  color={T.accent}
                  icon="🔄"
                  items={tops.recoveries.map(p => ({ name: abbrevName(p.playerName), value: String(p.recovery) }))}
                />
                <TopList
                  title="Meilleur +/-"
                  color="#8B5CF6"
                  icon="📊"
                  items={tops.plusMinus.map(p => ({
                    name: abbrevName(p.playerName),
                    value: p.plusMinusGoals > 0 ? `+${p.plusMinusGoals}` : String(p.plusMinusGoals),
                    valueColor: p.plusMinusGoals > 0 ? T.green : p.plusMinusGoals < 0 ? T.red : T.textMuted,
                  }))}
                />
                {tops.shooterEff.length > 0 && (
                  <TopList
                    title="Efficacité au tir"
                    color="#F59E0B"
                    icon="🎯"
                    items={tops.shooterEff.map(p => ({
                      name: abbrevName(p.playerName),
                      value: `${p.shotEff}%`,
                      sub: `${p.goals}B / ${p.totalShotsAll}T`,
                      valueColor: p.shotEff >= 40 ? T.green : p.shotEff >= 20 ? '#D97706' : T.red,
                    }))}
                  />
                )}
              </div>
            </section>
          )}

          {/* ── 5. Coach adjoint ────────────────────────────────────────── */}
          {(insights.length > 0 || comboInsightCards.length > 0) && (
            <section style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ display: 'block', width: 3, height: 14, backgroundColor: '#8B5CF6', borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Analyse du coach adjoint
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#8B5CF6',
                  border: '1px solid #C4B5FD', borderRadius: 4,
                  padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Algorithme
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {insights.map((ins, i) => (
                  <CoachInsightCard key={`g-${i}`} insight={ins} />
                ))}
              </div>
              {comboInsightCards.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                      Combinaisons — résumé
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: T.border }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    {comboInsightCards.map((ins, i) => (
                      <CoachInsightCard key={`c-${i}`} insight={ins} />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* ── 5b. Combo ranking table ──────────────────────────────────── */}
          <ComboRankingSection allStats={allComboStats} playerById={playerByIdForRanking} />

          {/* ── 6. Goals by type ────────────────────────────────────────── */}
          <section style={{ width: '100%' }}>
            <SectionHeader label="Buts par type" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {/* Marqués */}
              <Card>
                <p style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Buts marqués
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {goalsByType.map(g => (
                    <div key={g.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{g.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.green }}>{g.scored}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, backgroundColor: '#F0FDF4', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(g.scored / maxGoalsByType) * 100}%`,
                          backgroundColor: T.green,
                          borderRadius: 3,
                          transition: 'width 400ms ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              {/* Encaissés */}
              <Card>
                <p style={{ fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Buts encaissés
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {goalsByType.map(g => (
                    <div key={g.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{g.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.red }}>{g.conceded}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, backgroundColor: '#FEF2F2', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(g.conceded / maxGoalsByType) * 100}%`,
                          backgroundColor: T.red,
                          borderRadius: 3,
                          transition: 'width 400ms ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Recharts stacked bar comparison */}
            {goalsByType.some(g => g.scored > 0 || g.conceded > 0) && (
              <Card style={{ marginTop: 10, padding: '16px 8px 8px 8px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingLeft: 8 }}>
                  Comparaison buts marqués / encaissés par type
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={goalsByType} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: T.textMuted }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: T.textMuted }}
                      axisLine={false}
                      tickLine={false}
                      width={24}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }}
                      formatter={(val, name) => [val, name === 'scored' ? 'Marqués' : 'Encaissés']}
                    />
                    <Bar dataKey="scored"   fill={T.green} radius={[4, 4, 0, 0]} name="scored" />
                    <Bar dataKey="conceded" fill={T.red}   radius={[4, 4, 0, 0]} name="conceded" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </section>

          {/* ── 6. Player stats table ────────────────────────────────────── */}
          {playerStatsList.length > 0 && (
            <section style={{ width: '100%' }}>
              <SectionHeader label="Statistiques joueurs" />
              <div style={{
                backgroundColor: T.cardBg,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                overflow: 'hidden',
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    minWidth: 760,
                    fontSize: 12,
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${T.border}` }}>
                        {TABLE_COLS.map(col => {
                          const isActive = sortCol === col.key;
                          return (
                            <th
                              key={col.key}
                              onClick={() => handleSort(col.key)}
                              style={{
                                padding: '9px 10px',
                                textAlign: col.key === 'playerName' ? 'left' : 'center',
                                fontWeight: 800,
                                fontSize: 10,
                                color: isActive ? T.accent : T.textMuted,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                cursor: 'pointer',
                                userSelect: 'none',
                                whiteSpace: 'nowrap',
                                width: col.width,
                              }}
                            >
                              {col.label}
                              {isActive && (
                                <span style={{ marginLeft: 3, fontSize: 9 }}>
                                  {sortDir === 'asc' ? '▲' : '▼'}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStats.map((row, i) => {
                        const totalShots = row.shot + row.shot_on_target + row.goals;
                        const isEven = i % 2 === 0;
                        return (
                          <tr
                            key={row.playerId}
                            onClick={() => router.push(`/webapp/manager/squad/${row.playerId}`)}
                            style={{
                              backgroundColor: isEven ? T.cardBg : '#F8FAFC',
                              borderBottom: `1px solid ${T.border}`,
                              cursor: 'pointer',
                              transition: 'background-color 100ms',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = isEven ? T.cardBg : '#F8FAFC')}
                          >
                            {TABLE_COLS.map(col => {
                              let content: string;
                              let cellColor: string | undefined;

                              switch (col.key) {
                                case 'playerName':
                                  content = abbrevName(row.playerName);
                                  break;
                                case 'totalTimeSeconds':
                                  content = fmtTime(row.totalTimeSeconds);
                                  break;
                                case 'totalShots':
                                  content = String(totalShots);
                                  break;
                                case 'plusMinusGoals':
                                  content = row.plusMinusGoals > 0 ? `+${row.plusMinusGoals}` : String(row.plusMinusGoals);
                                  cellColor = row.plusMinusGoals > 0 ? T.green : row.plusMinusGoals < 0 ? T.red : undefined;
                                  break;
                                case 'goals':
                                  content = String(row.goals);
                                  cellColor = row.goals > 0 ? T.green : undefined;
                                  break;
                                case 'recovery':
                                  content = String(row.recovery);
                                  cellColor = row.recovery > 0 ? T.accent : undefined;
                                  break;
                                case 'ball_loss':
                                  content = String(row.ball_loss);
                                  cellColor = row.ball_loss > 0 ? T.red : undefined;
                                  break;
                                case 'yellow_cards':
                                  content = String(row.yellow_cards);
                                  cellColor = row.yellow_cards > 0 ? T.amber : undefined;
                                  break;
                                case 'red_cards':
                                  content = String(row.red_cards);
                                  cellColor = row.red_cards > 0 ? T.red : undefined;
                                  break;
                                default:
                                  content = String((row as any)[col.key] ?? 0);
                              }

                              const isName = col.key === 'playerName';
                              return (
                                <td
                                  key={col.key}
                                  style={{
                                    padding: '8px 10px',
                                    textAlign: isName ? 'left' : 'center',
                                    color: cellColor ?? (isName ? T.text : '#475569'),
                                    fontWeight: cellColor ? 700 : isName ? 600 : 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: isName ? 140 : undefined,
                                  }}
                                >
                                  {isName ? (
                                    <span style={{ display: 'flex', alignItems: 'center' }}>
                                      {positionDot(row.position)}
                                      {content}
                                    </span>
                                  ) : content}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}`, backgroundColor: '#F8FAFC' }}>
                  <p style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.5 }}>
                    M = Matchs · Tps = Temps de jeu · B = Buts · +/-B = +/- buts · TC = Tirs cadrés · TT = Tirs totaux · Récup. = Récupérations · Pertes = Pertes de balle · Pdec = Passes déc.
                  </p>
                </div>
              </div>
            </section>
          )}

          {filteredMatchIds.size === 0 && matches.length > 0 && (
            <Card style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ fontSize: 14, color: T.textMuted }}>Aucun match ne correspond aux filtres sélectionnés.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
