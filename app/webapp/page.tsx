'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from './hooks/useActiveTeam';
import { usePlayerProfile } from './hooks/usePlayerProfile';
import { claimPlayerLinkCode } from '@/lib/services/playerConvocationsService';
import {
  Calendar, Users, BarChart3, Video, FileText, Layout,
  ChevronRight, Trophy, Target, TrendingUp, Activity,
  Dumbbell, Clock, Plus, UserCircle, Building2, Shield,
  Zap, AlertCircle,
} from 'lucide-react';
import { format, differenceInDays, parseISO, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── Design tokens (FM light) ─────────────────────────────────────────────────
const C = {
  navy:     '#1e3a5f',
  navyLt:   '#2a4f7c',
  bg:       '#EEF0F5',
  card:     '#FFFFFF',
  border:   '#DDE1EA',
  text:     '#1A2332',
  muted:    '#697585',
  light:    '#94a3b8',
  accent:   '#3B82F6',
  amber:    '#D97706',
  amberBg:  '#FEF3C7',
  green:    '#16A34A',
  greenBg:  '#DCFCE7',
  red:      '#DC2626',
  redBg:    '#FEE2E2',
  purple:   '#7C3AED',
  purpleBg: '#EDE9FE',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resultLetter(r: string) {
  if (r === 'Victoire') return 'V';
  if (r === 'Nul') return 'N';
  return 'D';
}

function resultStyle(r: string) {
  if (r === 'Victoire') return { bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' };
  if (r === 'Nul') return { bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' };
  return { bg: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' };
}

function parseFrDate(d: string): number {
  if (d.includes('/')) {
    const [day, month, year] = d.split('/');
    return new Date(+year, +month - 1, +day).getTime();
  }
  return new Date(d).getTime();
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(30,58,95,0.06)',
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-3">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: C.navy }} />
      <Icon size={14} style={{ color: C.navy }} />
      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}

// ─── Quick action tile ────────────────────────────────────────────────────────
function ActionTile({
  icon: Icon, label, sublabel, href, color,
}: { icon: React.ElementType; label: string; sublabel: string; href: string; color: string }) {
  const router = useRouter();
  const [hov, setHov] = useState(false);
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex flex-col gap-2 p-4 text-left transition-all"
      style={{
        backgroundColor: hov ? color + '10' : C.card,
        border: `1.5px solid ${hov ? color + '60' : C.border}`,
        borderRadius: 10,
        cursor: 'pointer',
        transform: hov ? 'translateY(-1px)' : 'none',
        boxShadow: hov ? `0 4px 16px ${color}18` : '0 1px 4px rgba(30,58,95,0.05)',
        transition: 'all 150ms ease',
      }}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ backgroundColor: color + '15' }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.text }}>{label}</div>
        <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: 2 }}>{sublabel}</div>
      </div>
    </button>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────
function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-3" style={{ minWidth: 60 }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.65rem', color: C.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WebApp() {
  const router = useRouter();
  const { player } = usePlayerProfile();
  const { activeTeam } = useActiveTeam();

  const [hasClub, setHasClub] = useState<boolean | null>(null);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkClaiming, setLinkClaiming] = useState(false);
  const [linkClaimError, setLinkClaimError] = useState<string | null>(null);

  // Match & training data
  const [matches, setMatches] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    supabase.rpc('get_user_club_id').then(({ data }) => setHasClub(!!data));
  }, []);

  useEffect(() => {
    if (!activeTeam?.id) { setDataLoading(false); return; }
    setDataLoading(true);
    Promise.all([
      supabase.from('matches').select('*').eq('team_id', activeTeam.id).order('date', { ascending: false }),
      supabase.from('trainings').select('id,date,theme,key_principle').eq('team_id', activeTeam.id).order('date', { ascending: false }),
      supabase.from('player_teams').select('players(id,first_name,last_name,position,status)').eq('team_id', activeTeam.id),
    ]).then(([m, t, p]) => {
      setMatches(m.data ?? []);
      setTrainings(t.data ?? []);
      setPlayers((p.data ?? []).map((x: any) => x.players).filter(Boolean));
      setDataLoading(false);
    });
  }, [activeTeam?.id]);

  const handleClaimCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = linkCode.trim().toUpperCase();
    if (!code) return;
    setLinkClaimError(null);
    setLinkClaiming(true);
    const result = await claimPlayerLinkCode(code);
    setLinkClaiming(false);
    if (result.ok) {
      setLinkCode('');
      window.location.reload();
    } else {
      const msg =
        result.error === 'code_not_found' ? 'Code invalide.' :
        result.error === 'code_expired' ? 'Ce code a expiré. Demandez un nouveau code à votre coach.' :
        result.error === 'already_linked_other' ? 'Votre compte est déjà lié à un autre joueur.' :
        result.error ?? 'Erreur';
      setLinkClaimError(msg);
    }
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCreateError('Vous devez être connecté.'); return; }
      const { data, error } = await supabase.rpc('create_user_club', {
        p_user_id: user.id, p_user_email: user.email ?? undefined,
      });
      if (error) { setCreateError(error.message); return; }
      const clubId = Array.isArray(data) ? data[0] : data;
      if (!clubId) { setCreateError('Impossible de créer le club.'); return; }
      await supabase.from('clubs').update({ name: newClubName, description: newClubDesc }).eq('id', clubId);
      setShowCreateClub(false);
      setNewClubName('');
      setNewClubDesc('');
      setHasClub(true);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreating(false);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const pastMatches = matches
      .filter(m => m.date && m.date <= today && m.score_team != null && m.score_opponent != null)
      .sort((a, b) => b.date.localeCompare(a.date));

    const wins   = pastMatches.filter(m => m.score_team > m.score_opponent).length;
    const draws  = pastMatches.filter(m => m.score_team === m.score_opponent).length;
    const losses = pastMatches.filter(m => m.score_team < m.score_opponent).length;
    const gf = pastMatches.reduce((s, m) => s + (m.score_team ?? 0), 0);
    const ga = pastMatches.reduce((s, m) => s + (m.score_opponent ?? 0), 0);
    const last5 = pastMatches.slice(0, 5).reverse();

    // Next event
    const futureMatches  = matches.filter(m => m.date > today).sort((a, b) => a.date.localeCompare(b.date));
    const futureTrainings = trainings.filter(t => t.date > today).sort((a, b) => a.date.localeCompare(b.date));
    const nextMatch    = futureMatches[0] ?? null;
    const nextTraining = futureTrainings[0] ?? null;

    // Determine next event (earliest)
    let nextEvent: { type: 'match' | 'training'; item: any } | null = null;
    if (nextMatch && nextTraining) {
      nextEvent = nextMatch.date <= nextTraining.date
        ? { type: 'match', item: nextMatch }
        : { type: 'training', item: nextTraining };
    } else if (nextMatch)    nextEvent = { type: 'match',    item: nextMatch };
    else if (nextTraining)   nextEvent = { type: 'training', item: nextTraining };

    // Days until next event
    const daysUntil = nextEvent
      ? differenceInDays(parseISO(nextEvent.item.date), new Date())
      : null;

    return { wins, draws, losses, gf, ga, last5, nextEvent, daysUntil, totalMatches: pastMatches.length };
  }, [matches, trainings]);

  // ── Onboarding guards ───────────────────────────────────────────────────────
  if (hasClub === false && !player) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 space-y-6">
        {/* No club */}
        <Card>
          <div className="p-6 flex gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: C.amberBg }}>
              <Building2 size={22} style={{ color: C.amber }} />
            </div>
            <div>
              <h2 style={{ fontWeight: 700, color: C.text, fontSize: '1rem', marginBottom: 6 }}>Aucun club associé</h2>
              <p style={{ color: C.muted, fontSize: '0.875rem', marginBottom: 14 }}>
                Créez un club pour accéder à vos équipes et données.
              </p>
              <button
                onClick={() => { setShowCreateClub(true); setCreateError(null); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: C.navy, color: '#fff' }}
              >
                <Plus size={15} /> Créer un club
              </button>
            </div>
          </div>
        </Card>

        {/* Join club */}
        <Card>
          <div className="p-6 flex gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: C.greenBg }}>
              <UserCircle size={22} style={{ color: C.green }} />
            </div>
            <div className="flex-1">
              <h2 style={{ fontWeight: 700, color: C.text, fontSize: '1rem', marginBottom: 6 }}>Rejoindre un club</h2>
              <p style={{ color: C.muted, fontSize: '0.875rem', marginBottom: 14 }}>
                Votre coach vous a donné un code d&apos;invitation ?
              </p>
              <form onSubmit={handleClaimCode} className="flex gap-2">
                <input
                  type="text"
                  value={linkCode}
                  onChange={e => setLinkCode(e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="ABC12XYZ"
                  maxLength={12}
                  className="flex-1 px-3 py-2 rounded-lg font-mono tracking-wider text-sm"
                  style={{ border: `2px solid ${C.border}`, color: C.text, background: '#F8FAFC' }}
                />
                <button
                  type="submit"
                  disabled={linkClaiming || !linkCode.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: C.green, color: '#fff' }}
                >
                  {linkClaiming ? '…' : 'Valider'}
                </button>
              </form>
              {linkClaimError && <p className="mt-2 text-sm" style={{ color: C.red }}>{linkClaimError}</p>}
            </div>
          </div>
        </Card>

        {showCreateClub && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <Card className="w-full max-w-md p-6">
              <h3 style={{ fontWeight: 700, color: C.text, fontSize: '1rem', marginBottom: 16 }}>Créer un club</h3>
              {createError && <p className="mb-3 text-sm p-3 rounded-lg" style={{ backgroundColor: C.redBg, color: C.red }}>{createError}</p>}
              <form onSubmit={handleCreateClub} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: C.text }}>Nom du club</label>
                  <input type="text" value={newClubName} onChange={e => setNewClubName(e.target.value)}
                    required className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: `1.5px solid ${C.border}`, color: C.text }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: C.text }}>Description</label>
                  <textarea value={newClubDesc} onChange={e => setNewClubDesc(e.target.value)}
                    rows={2} className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: `1.5px solid ${C.border}`, color: C.text }} />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowCreateClub(false)}
                    className="px-4 py-2 rounded-lg text-sm" style={{ color: C.muted }}>Annuler</button>
                  <button type="submit" disabled={creating}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: C.navy, color: '#fff' }}>
                    {creating ? 'Création…' : 'Créer'}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ── Main hub ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 w-full">

      {/* ── Team header banner ─────────────────────────────────────────────── */}
      {activeTeam && (
        <div
          className="rounded-xl p-5 flex items-center gap-5"
          style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLt} 100%)`,
            boxShadow: '0 4px 20px rgba(30,58,95,0.18)',
          }}
        >
          {/* Team badge */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 text-xl font-black"
            style={{
              backgroundColor: activeTeam.color || C.accent,
              color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {activeTeam.name?.[0]?.toUpperCase() ?? '?'}
          </div>

          <div className="flex-1 min-w-0">
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
              {activeTeam.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
              {[activeTeam.category, activeTeam.level].filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Season bilan */}
          {stats.totalMatches > 0 && (
            <div className="hidden sm:flex items-center gap-1 rounded-xl px-3 py-2"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)' }}>
              <StatChip label="V" value={stats.wins}   color="#4ade80" />
              <div style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <StatChip label="N" value={stats.draws}  color="#fbbf24" />
              <div style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <StatChip label="D" value={stats.losses} color="#f87171" />
              <div style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <StatChip label="BP" value={stats.gf}    color="rgba(255,255,255,0.9)" />
              <div style={{ width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.15)' }} />
              <StatChip label="BC" value={stats.ga}    color="rgba(255,255,255,0.6)" />
            </div>
          )}
        </div>
      )}

      {/* ── Mobile bilan (shown when team banner is collapsed) ─────────────── */}
      {activeTeam && stats.totalMatches > 0 && (
        <Card className="sm:hidden flex justify-around py-3">
          <StatChip label="Victoires"  value={stats.wins}   color={C.green} />
          <StatChip label="Nuls"       value={stats.draws}  color={C.amber} />
          <StatChip label="Défaites"   value={stats.losses} color={C.red} />
          <StatChip label="Buts"       value={stats.gf}     color={C.navy} />
        </Card>
      )}

      {/* ── Top row: Next event + Recent form ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Next event */}
        <Card>
          <SectionTitle icon={Clock} label="Prochain événement" />
          <div className="px-5 pb-5">
            {dataLoading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: C.border, borderTopColor: C.navy }} />
              </div>
            ) : stats.nextEvent ? (
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: stats.nextEvent.type === 'match' ? '#EFF6FF' : '#F0FDF4',
                    border: `2px solid ${stats.nextEvent.type === 'match' ? '#BFDBFE' : '#BBF7D0'}`,
                  }}
                >
                  {stats.nextEvent.type === 'match'
                    ? <Trophy size={24} style={{ color: C.accent }} />
                    : <Dumbbell size={24} style={{ color: C.green }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: C.text }}>
                    {stats.nextEvent.type === 'match'
                      ? (stats.nextEvent.item.title || stats.nextEvent.item.opponent_team || 'Match')
                      : (stats.nextEvent.item.theme || 'Entraînement')}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: C.muted, marginTop: 3 }}>
                    {format(parseISO(stats.nextEvent.item.date), 'EEEE d MMMM', { locale: fr })}
                    {stats.nextEvent.item.location && ` · ${stats.nextEvent.item.location}`}
                  </div>
                </div>
                <div
                  className="flex flex-col items-center px-3 py-2 rounded-lg flex-shrink-0"
                  style={{
                    backgroundColor: stats.daysUntil === 0 ? '#FEF3C7' : stats.daysUntil! <= 2 ? '#EFF6FF' : '#F8FAFC',
                    border: `1px solid ${stats.daysUntil === 0 ? '#FDE68A' : stats.daysUntil! <= 2 ? '#BFDBFE' : C.border}`,
                  }}
                >
                  <span style={{
                    fontSize: '1.5rem', fontWeight: 900, lineHeight: 1,
                    color: stats.daysUntil === 0 ? C.amber : stats.daysUntil! <= 2 ? C.accent : C.navy,
                  }}>
                    {stats.daysUntil === 0 ? 'Auj.' : stats.daysUntil}
                  </span>
                  {stats.daysUntil! > 0 && (
                    <span style={{ fontSize: '0.6rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {stats.daysUntil === 1 ? 'demain' : 'jours'}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ color: C.muted, fontSize: '0.875rem' }}>Aucun événement à venir</p>
            )}
          </div>
        </Card>

        {/* Recent form */}
        <Card>
          <SectionTitle icon={TrendingUp} label="Forme récente" />
          <div className="px-5 pb-5">
            {dataLoading ? (
              <div className="h-16 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: C.border, borderTopColor: C.navy }} />
              </div>
            ) : stats.last5.length === 0 ? (
              <p style={{ color: C.muted, fontSize: '0.875rem' }}>Aucun match disputé</p>
            ) : (
              <div className="flex items-center gap-2">
                {stats.last5.map((m, i) => {
                  const res = m.score_team > m.score_opponent ? 'Victoire'
                    : m.score_team < m.score_opponent ? 'Défaite' : 'Nul';
                  const s = resultStyle(res);
                  return (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm"
                        style={{ backgroundColor: s.bg, color: s.color, border: `1.5px solid ${s.border}` }}
                      >
                        {resultLetter(res)}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: C.muted, textAlign: 'center' }}>
                        {m.score_team}–{m.score_opponent}
                      </div>
                    </div>
                  );
                })}
                {/* Win rate pill */}
                <div className="ml-auto flex flex-col items-center pl-3"
                  style={{ borderLeft: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: C.navy, lineHeight: 1 }}>
                    {stats.totalMatches > 0
                      ? Math.round((stats.wins / stats.totalMatches) * 100)
                      : 0}%
                  </span>
                  <span style={{ fontSize: '0.65rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>win rate</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Squad snapshot ────────────────────────────────────────────────── */}
      {players.length > 0 && (
        <Card>
          <div className="flex items-center px-5 pt-5 pb-3">
            <div className="w-1 h-4 rounded-full mr-2" style={{ backgroundColor: C.navy }} />
            <Users size={14} style={{ color: C.navy }} />
            <span className="ml-2" style={{ fontSize: '0.8rem', fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Effectif
            </span>
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: '#EFF6FF', color: C.accent }}>
              {players.length}
            </span>
            <button
              onClick={() => router.push('/webapp/manager/squad')}
              className="ml-auto flex items-center gap-1 text-xs font-semibold"
              style={{ color: C.accent }}
            >
              Voir tout <ChevronRight size={13} />
            </button>
          </div>
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {players.slice(0, 18).map((p: any) => {
              const pos = p.position ?? '';
              const posColor =
                pos.toLowerCase().startsWith('gard')   ? '#EF4444' :
                pos.toLowerCase().startsWith('déf')    ? '#3B82F6' :
                pos.toLowerCase().startsWith('piv')    ? '#8B5CF6' :
                pos.toLowerCase().startsWith('att') || pos.toLowerCase().startsWith('ail') ? '#F97316' :
                C.green;
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/webapp/manager/squad/${p.id}`)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: posColor + '12',
                    border: `1px solid ${posColor}30`,
                    color: C.text,
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: posColor }} />
                  {p.first_name[0]}. {p.last_name}
                </button>
              );
            })}
            {players.length > 18 && (
              <span className="flex items-center px-2.5 py-1.5 text-xs" style={{ color: C.muted }}>
                +{players.length - 18} autres
              </span>
            )}
          </div>
        </Card>
      )}

      {/* ── Quick actions grid ─────────────────────────────────────────────── */}
      <Card>
        <SectionTitle icon={Zap} label="Accès rapide" />
        <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <ActionTile icon={Calendar}  label="Calendrier"        sublabel="Matchs & séances"        href="/webapp/manager/calendar"      color={C.accent} />
          <ActionTile icon={Users}     label="Effectif"          sublabel="Gestion joueurs"          href="/webapp/manager/squad"         color={C.navy} />
          <ActionTile icon={BarChart3} label="Dashboard"         sublabel="Bilan de saison"          href="/webapp/manager/dashboard"     color={C.purple} />
          <ActionTile icon={Activity}  label="Analytics"         sublabel="Statistiques avancées"    href="/webapp/manager/analytics"     color="#0891b2" />
          <ActionTile icon={Video}     label="Enregistrer"       sublabel="Live match tracker"       href="/webapp/tracker/matchrecorder" color={C.red} />
          <ActionTile icon={FileText}  label="Librairie"         sublabel="Exercices & ressources"   href="/webapp/library"               color={C.green} />
          <ActionTile icon={Layout}    label="Schémas tactiques" sublabel="Créer & partager"         href="/webapp/library/schematics"    color="#6366f1" />
        </div>
      </Card>

    </div>
  );
}
