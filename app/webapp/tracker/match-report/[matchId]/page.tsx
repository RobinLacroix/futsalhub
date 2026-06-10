'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Printer, MapPin, Calendar } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalsByType {
  offensive: number
  transition: number
  cpa: number
  superiority: number
}

interface MatchPlayer {
  id: string
  goals: number
  yellow_cards: number
  red_cards: number
  time_played: number
}

interface MatchRow {
  id: string
  title: string
  date: string
  competition: string
  location: string
  score_team: number
  score_opponent: number
  opponent_team: string | null
  goals_by_type: GoalsByType | null
  conceded_by_type: GoalsByType | null
  players: MatchPlayer[] | null
  team_id: string | null
}

interface EventRow {
  id: string
  match_id: string
  event_type: string
  match_time_seconds: number
  half: number
  player_id: string | null
  players_on_field: string[] | null
}

interface PlayerRow {
  id: string
  first_name: string
  last_name: string
  number: number
  position: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GOAL_TYPE_LABELS: Record<string, string> = {
  offensive: 'Offensif',
  transition: 'Transition',
  cpa: 'CPA',
  superiority: 'Supériorité',
}

const GOAL_TYPE_COLORS: Record<string, string> = {
  offensive: '#FFB020',
  transition: '#3B82F6',
  cpa: '#10B981',
  superiority: '#8B5CF6',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function getResult(scoreTeam: number, scoreOpponent: number) {
  if (scoreTeam > scoreOpponent) return { label: 'VICTOIRE', color: '#10B981', bg: '#D1FAE5' }
  if (scoreTeam < scoreOpponent) return { label: 'DÉFAITE', color: '#EF4444', bg: '#FEE2E2' }
  return { label: 'NUL', color: '#6B7280', bg: '#F3F4F6' }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MatchReportPage() {
  const params = useParams()
  const matchId = params.matchId as string

  const [match, setMatch] = useState<MatchRow | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [teamName, setTeamName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single()

      if (!matchData) {
        setLoading(false)
        return
      }
      setMatch(matchData)

      if (matchData.team_id) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('name')
          .eq('id', matchData.team_id)
          .single()
        if (teamData) setTeamName(teamData.name)
      }

      const { data: eventsData } = await supabase
        .from('match_events')
        .select('id, match_id, event_type, match_time_seconds, half, player_id, players_on_field')
        .eq('match_id', matchId)
        .order('half', { ascending: true })
        .order('match_time_seconds', { ascending: true })

      const eventsArr: EventRow[] = eventsData || []
      setEvents(eventsArr)

      const fromEvents = eventsArr.filter(e => e.player_id).map(e => e.player_id as string)
      const fromMatch = (matchData.players || []).map((p: MatchPlayer) => p.id)
      const allIds = [...new Set([...fromEvents, ...fromMatch])]

      if (allIds.length > 0) {
        const { data: playersData } = await supabase
          .from('players')
          .select('id, first_name, last_name, number, position')
          .in('id', allIds)
        setPlayers(playersData || [])
      }

      setLoading(false)
    }
    load()
  }, [matchId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-400">Match introuvable.</p>
      </div>
    )
  }

  // ── Computed stats ────────────────────────────────────────────────────────

  const result = getResult(match.score_team, match.score_opponent)

  const h1 = events.filter(e => e.half === 1)
  const h2 = events.filter(e => e.half === 2)

  const count = (arr: EventRow[], ...types: string[]) => arr.filter(e => types.includes(e.event_type)).length

  const ourShotsOnTarget = count(events, 'shot_on_target')
  const ourShotsOff = count(events, 'shot')
  const ourTotalShots = ourShotsOnTarget + ourShotsOff + match.score_team
  const oppShotsOnTarget = count(events, 'opponent_shot_on_target')
  const oppShotsOff = count(events, 'opponent_shot')
  const oppTotalShots = oppShotsOnTarget + oppShotsOff + match.score_opponent

  const recoveries = count(events, 'recovery', 'ball_recovery')
  const shotsCadres = ourShotsOnTarget + match.score_team
  const efficiency = shotsCadres > 0 ? Math.round((match.score_team / shotsCadres) * 100) : 0

  const shotsChartData = [
    {
      name: '1ère MT',
      'Cadrés': count(h1, 'shot_on_target') + count(h1, 'goal'),
      'Non cadrés': count(h1, 'shot'),
      'Cadrés adv.': count(h1, 'opponent_shot_on_target') + count(h1, 'opponent_goal'),
      'Non cadrés adv.': count(h1, 'opponent_shot'),
    },
    {
      name: '2ème MT',
      'Cadrés': count(h2, 'shot_on_target') + count(h2, 'goal'),
      'Non cadrés': count(h2, 'shot'),
      'Cadrés adv.': count(h2, 'opponent_shot_on_target') + count(h2, 'opponent_goal'),
      'Non cadrés adv.': count(h2, 'opponent_shot'),
    },
  ]

  const gbt = match.goals_by_type || { offensive: 0, transition: 0, cpa: 0, superiority: 0 }
  const cbt = match.conceded_by_type || { offensive: 0, transition: 0, cpa: 0, superiority: 0 }

  const goalsPieData = Object.entries(gbt)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: GOAL_TYPE_LABELS[k] ?? k, value: v, color: GOAL_TYPE_COLORS[k] }))

  const concededPieData = Object.entries(cbt)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: GOAL_TYPE_LABELS[k] ?? k, value: v, color: GOAL_TYPE_COLORS[k] }))

  const goalEvents = events.filter(
    e => e.event_type === 'goal' || e.event_type === 'opponent_goal',
  )

  const playerStats = players
    .map(p => {
      const pe = events.filter(e => e.player_id === p.id)
      const mp = (match.players || []).find(x => x.id === p.id)
      const plusMinus = goalEvents.reduce((acc, e) => {
        const onField = e.players_on_field ?? []
        if (onField.includes(p.id)) {
          return acc + (e.event_type === 'goal' ? 1 : -1)
        }
        return acc
      }, 0)
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        number: p.number,
        timePlayed: mp?.time_played ?? 0,
        goals: count(pe, 'goal'),
        shotsOnTarget: count(pe, 'shot_on_target'),
        shotsOff: count(pe, 'shot'),
        recovery: count(pe, 'recovery', 'ball_recovery'),
        ballLoss: count(pe, 'ball_loss'),
        yellowCards: count(pe, 'yellow_card'),
        redCards: count(pe, 'red_card'),
        plusMinus,
      }
    })
    .filter(p => p.timePlayed > 0 || p.goals > 0 || p.shotsOnTarget > 0 || p.recovery > 0)
    .sort((a, b) => b.timePlayed - a.timePlayed)

  const goalTimeline = events
    .filter(e => e.event_type === 'goal' || e.event_type === 'opponent_goal')
    .map(e => ({
      ...e,
      isOurs: e.event_type === 'goal',
      minute: Math.ceil((e.half === 1 ? 0 : 20) + e.match_time_seconds / 60),
      pct: Math.min(99, ((e.half === 1 ? 0 : 20) + e.match_time_seconds / 60) / 40 * 100),
    }))

  const hasEvents = events.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Print button */}
      <div className="print:hidden fixed top-4 right-4 z-20">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold shadow-lg transition-colors"
        >
          <Printer size={16} />
          Télécharger PDF
        </button>
      </div>

      <div className="w-full px-0 py-0 print:px-6 print:py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <span className="text-xl font-black text-amber-500 tracking-tight">FutsalHub</span>
          <div className="text-right text-sm text-gray-400">
            <div className="font-medium text-gray-600">{match.competition}</div>
            <div>{formatDate(match.date)}</div>
          </div>
        </div>

        {/* ── Score block ── */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-6 text-center">
          <div className="grid grid-cols-3 items-center gap-6">
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900 leading-tight">{teamName || 'Notre équipe'}</div>
              <div className="text-xs text-gray-400 mt-1">Domicile</div>
            </div>
            <div>
              <div className="text-6xl font-black tracking-tight text-gray-900">
                {match.score_team}&nbsp;—&nbsp;{match.score_opponent}
              </div>
              <div className="mt-3">
                <span
                  className="px-4 py-1.5 rounded-full text-sm font-bold"
                  style={{ color: result.color, backgroundColor: result.bg }}
                >
                  {result.label}
                </span>
              </div>
            </div>
            <div className="text-left">
              <div className="text-xl font-bold text-gray-500 leading-tight">
                {match.opponent_team || 'Adversaire'}
              </div>
              <div className="text-xs text-gray-400 mt-1">Extérieur</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 mt-6 text-sm text-gray-400 flex-wrap">
            {match.location && (
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {match.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={13} />
              {new Date(match.date).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>

        {/* ── Summary stat cards ── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { icon: '🎯', label: 'Tirs', value: ourTotalShots, sub: `${oppTotalShots} adv.` },
            { icon: '⚽', label: 'Cadrés', value: shotsCadres, sub: `${oppShotsOnTarget + match.score_opponent} adv.` },
            { icon: '💪', label: 'Récupérations', value: recoveries, sub: '' },
            { icon: '📊', label: 'Efficacité', value: efficiency > 0 ? `${efficiency}%` : '—', sub: 'buts / tirs cadrés' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs font-semibold text-gray-500 mt-0.5">{s.label}</div>
              {s.sub && <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* ── Buts par type ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <GoalTypeCard
            title={`Nos buts par type (${match.score_team})`}
            data={goalsPieData}
            emptyLabel="Aucun but marqué"
          />
          <GoalTypeCard
            title={`Buts concédés par type (${match.score_opponent})`}
            data={concededPieData}
            emptyLabel="Aucun but concédé"
          />
        </div>

        {/* ── Shots bar chart ── */}
        {hasEvents && (
          <div className="bg-gray-50 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              Comparaison des tirs par mi-temps
            </h3>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={shotsChartData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Cadrés" stackId="nous" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Non cadrés" stackId="nous" fill="#A7F3D0" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Cadrés adv." stackId="adv" fill="#EF4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Non cadrés adv." stackId="adv" fill="#FECACA" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Goal timeline ── */}
        {goalTimeline.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5 mb-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">
              Chronologie des buts
            </h3>
            <div className="relative mx-4" style={{ height: 72 }}>
              {/* Axis labels */}
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0&apos;</div>
              <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-xs text-gray-400 font-medium">Mi-temps</div>
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">40&apos;</div>

              {/* Main bar */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-gray-200 rounded-full">
                {/* Halftime marker */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-5 bg-gray-300 rounded" />
              </div>

              {/* Goal markers */}
              {goalTimeline.map((g, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-x-1/2"
                  style={{ left: `${g.pct}%` }}
                >
                  {g.isOurs ? (
                    <div className="flex flex-col items-center" style={{ transform: 'translateY(-100%)' }}>
                      <span className="text-xs font-bold text-green-600 mb-0.5 whitespace-nowrap">{g.minute}&apos;</span>
                      <div className="w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow" />
                      <div className="w-px h-4 bg-green-400" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center" style={{ transform: 'translateY(0%)' }}>
                      <div className="w-px h-4 bg-red-400" />
                      <div className="w-3.5 h-3.5 bg-red-400 rounded-full border-2 border-white shadow" />
                      <span className="text-xs font-bold text-red-500 mt-0.5 whitespace-nowrap">{g.minute}&apos;</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-green-500 rounded-full inline-block" />
                Buts marqués
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-400 rounded-full inline-block" />
                Buts concédés
              </span>
            </div>
          </div>
        )}

        {/* ── Player stats table ── */}
        {playerStats.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">
              Statistiques joueurs
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {['#', 'Joueur', 'Min.', '+/-', 'Buts', 'Cadrés', 'Tirs', 'Récup.', 'Pertes', '🟨', '🟥'].map(h => (
                    <th key={h} className={`pb-2 text-xs font-semibold text-gray-400 ${h === '#' || h === 'Joueur' ? 'text-left' : 'text-center'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerStats.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? '' : 'bg-white/60'}>
                    <td className="py-2 text-gray-400 font-mono text-xs">{p.number}</td>
                    <td className="py-2 font-semibold text-gray-800">{p.name}</td>
                    <td className="py-2 text-center text-gray-600 tabular-nums">
                      {p.timePlayed > 0 ? `${Math.floor(p.timePlayed / 60)}'` : '—'}
                    </td>
                    <td className="py-2 text-center font-bold tabular-nums"
                      style={{ color: p.plusMinus > 0 ? '#10B981' : p.plusMinus < 0 ? '#EF4444' : '#9CA3AF' }}>
                      {p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus === 0 ? '0' : p.plusMinus}
                    </td>
                    <td className="py-2 text-center font-bold text-gray-900">{p.goals || '—'}</td>
                    <td className="py-2 text-center text-gray-600">{p.shotsOnTarget || '—'}</td>
                    <td className="py-2 text-center text-gray-600">{p.shotsOff || '—'}</td>
                    <td className="py-2 text-center text-gray-600">{p.recovery || '—'}</td>
                    <td className="py-2 text-center text-gray-600">{p.ballLoss || '—'}</td>
                    <td className="py-2 text-center">
                      {p.yellowCards > 0
                        ? <span className="inline-block w-3 h-4 bg-yellow-400 rounded-sm" />
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 text-center">
                      {p.redCards > 0
                        ? <span className="inline-block w-3 h-4 bg-red-500 rounded-sm" />
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-8 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-300">
          <span>FutsalHub — Rapport de match</span>
          <span>Généré le {new Date().toLocaleDateString('fr-FR')}</span>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1.2cm; size: A4 portrait; }
        }
      `}</style>
    </div>
  )
}

// ─── Sub-component: GoalTypeCard ──────────────────────────────────────────────

function GoalTypeCard({
  title,
  data,
  emptyLabel,
}: {
  title: string
  data: { name: string; value: number; color: string }[]
  emptyLabel: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">{title}</h3>
      {data.length > 0 ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={110} height={110}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={50}
                dataKey="value"
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2">
            {data.map(d => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-sm text-gray-700">
                  {d.name}: <strong>{d.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-[110px] text-sm text-gray-300">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}
