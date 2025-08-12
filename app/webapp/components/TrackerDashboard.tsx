/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
  Tooltip,
  Legend,
} from 'recharts'

type Player = {
  id: string
  first_name: string | null
  last_name: string | null
}

type EventRow = {
  id: string
  match_id: string
  event_type: string
  match_time_seconds: number | null
  half: number | null
  player_id: string | null
  players_on_field: string[] | null
  created_at: string
}

type MatchRow = {
  id: string
  title: string | null
  date: string | null
}

const EVENT_KEYS_ORDER: Array<keyof EventCounts> = [
  'goal',
  'shot_on_target',
  'shot',
  'recovery',
  'ball_loss',
  'dribble',
]

type EventCounts = {
  goal: number
  shot_on_target: number
  shot: number
  recovery: number
  ball_loss: number
  dribble: number
}

function createEmptyCounts(): EventCounts {
  return {
    goal: 0,
    shot_on_target: 0,
    shot: 0,
    recovery: 0,
    ball_loss: 0,
    dribble: 0,
  }
}

// RadarDatum type removed as it's not used

type Props = { matchId?: string }

export default function TrackerDashboard({ matchId }: Props) {
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch players and matches once
  useEffect(() => {
    let isMounted = true
    async function fetchData() {
      try {
        setLoading(true)

        const [playersRes, matchesRes] = await Promise.all([
          supabase
            .from('players')
            .select('id, first_name, last_name')
            .order('last_name', { ascending: true }),
          supabase
            .from('matches')
            .select('id, title, date')
            .order('date', { ascending: false }),
        ])

        if (playersRes.error) throw playersRes.error
        if (matchesRes.error) throw matchesRes.error

        if (!isMounted) return
        setPlayers((playersRes.data ?? []) as Player[])
        setMatches((matchesRes.data ?? []) as MatchRow[])
        if (!matchId) {
          setSelectedMatchIds((matchesRes.data ?? []).map((m: MatchRow) => m.id))
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Erreur lors du chargement des données'
        setError(errorMessage)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => {
      isMounted = false
    }
  }, [])

  // Fetch events based on selected matches
  useEffect(() => {
    let isMounted = true
    async function fetchEvents() {
      try {
        if (matchId) {
          // If matchId is provided, load only that match's events
          const { data, error } = await supabase
            .from('match_events')
            .select('*')
            .eq('match_id', matchId)
            .order('created_at', { ascending: true })
          
          if (error) throw error
          if (!isMounted) return
          setEvents(data || [])
        } else if (selectedMatchIds.length > 0) {
          // Load events only for selected matches
          const { data, error } = await supabase
            .from('match_events')
            .select('*')
            .in('match_id', selectedMatchIds)
            .order('created_at', { ascending: true })
          
          if (error) throw error
          if (!isMounted) return
          setEvents(data || [])
        } else {
          // No matches selected, clear events
          setEvents([])
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Erreur lors du chargement des événements'
        setError(errorMessage)
      }
    }

    fetchEvents()
    return () => {
      isMounted = false
    }
  }, [matchId, selectedMatchIds])

  // Fetch all events for global maximum calculation (only once)
  const [allEventsForMax, setAllEventsForMax] = useState<EventRow[]>([])
  
  useEffect(() => {
    let isMounted = true
    async function fetchAllEventsForMax() {
      try {
        // Load all events for global maximum calculation
        const { data, error } = await supabase
          .from('match_events')
          .select('*')
          .order('created_at', { ascending: true })
        
        if (error) throw error
        if (!isMounted) return
        setAllEventsForMax(data || [])
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Erreur inconnue'
        console.warn('Erreur lors du chargement des événements pour le maximum global:', errorMessage)
        // Ne pas bloquer l'interface si cette requête échoue
      }
    }

    fetchAllEventsForMax()
    return () => {
      isMounted = false
    }
  }, [])

  // Events are already filtered by selected matches, no need for additional filtering
  const filteredEvents: EventRow[] = useMemo(() => {
    return events
  }, [events])

  const countsByPlayer: Record<string, EventCounts> = useMemo(() => {
    const acc: Record<string, EventCounts> = {}

    for (const evt of filteredEvents) {
      // Player-originated events
      if (evt.player_id) {
        const pid = evt.player_id
        if (!acc[pid]) acc[pid] = createEmptyCounts()

        switch (evt.event_type) {
          case 'goal':
            acc[pid].goal += 1
            break
          case 'shot':
            acc[pid].shot += 1
            break
          case 'shot_on_target':
            acc[pid].shot_on_target += 1
            break
          case 'recovery':
            acc[pid].recovery += 1
            break
          case 'ball_loss':
            acc[pid].ball_loss += 1
            break
          case 'dribble':
            acc[pid].dribble += 1
            break
          default:
            break
        }
      }
    }
    return acc
  }, [filteredEvents])

  // Apply hierarchical logic per player
  const normalizedCountsByPlayer: Record<string, EventCounts> = useMemo(() => {
    const result: Record<string, EventCounts> = {}
    for (const [pid, counts] of Object.entries(countsByPlayer)) {
      const c = { ...counts }
      // Hierarchy:
      // goal => shot_on_target and shot
      // shot_on_target => shot
      if (c.goal > 0) {
        c.shot_on_target = Math.max(c.shot_on_target, c.goal)
        c.shot = Math.max(c.shot, c.shot_on_target, c.goal)
      }
      if (c.shot_on_target > 0) {
        c.shot = Math.max(c.shot, c.shot_on_target)
      }
      result[pid] = c
    }
    return result
  }, [countsByPlayer])

  // Global max per key across all players (unique scale) - using all events for global maximum
  const globalMaxByKey: Record<keyof EventCounts, number> = useMemo(() => {
    const maxes: Record<keyof EventCounts, number> = createEmptyCounts()
    
    // Calculate global maximum from all events (not just filtered ones)
    const globalCountsByPlayer: Record<string, EventCounts> = {}
    
    for (const evt of allEventsForMax) {
      if (evt.player_id) {
        const pid = evt.player_id
        if (!globalCountsByPlayer[pid]) globalCountsByPlayer[pid] = createEmptyCounts()

        switch (evt.event_type) {
          case 'goal':
            globalCountsByPlayer[pid].goal += 1
            break
          case 'shot':
            globalCountsByPlayer[pid].shot += 1
            break
          case 'shot_on_target':
            globalCountsByPlayer[pid].shot_on_target += 1
            break
          case 'recovery':
            globalCountsByPlayer[pid].recovery += 1
            break
          case 'ball_loss':
            globalCountsByPlayer[pid].ball_loss += 1
            break
          case 'dribble':
            globalCountsByPlayer[pid].dribble += 1
            break
          default:
            break
        }
      }
    }
    
    // Apply hierarchical logic for global maximum calculation
    for (const counts of Object.values(globalCountsByPlayer)) {
      const c = { ...counts }
      // Hierarchy:
      // goal => shot_on_target and shot
      // shot_on_target => shot
      if (c.goal > 0) {
        c.shot_on_target = Math.max(c.shot_on_target, c.goal)
        c.shot = Math.max(c.shot, c.shot_on_target, c.goal)
      }
      if (c.shot_on_target > 0) {
        c.shot = Math.max(c.shot, c.shot_on_target)
      }
      
      // Update global maximum
      for (const key of EVENT_KEYS_ORDER) {
        maxes[key] = Math.max(maxes[key], c[key])
      }
    }
    
    // Avoid zero max which breaks dataMax domain
    for (const key of EVENT_KEYS_ORDER) {
      if (maxes[key] === 0) maxes[key] = 1
    }
    return maxes
  }, [allEventsForMax])

  const selectedCounts: EventCounts | null = useMemo(() => {
    if (!selectedPlayerId) return null
    return normalizedCountsByPlayer[selectedPlayerId] ?? createEmptyCounts()
  }, [selectedPlayerId, normalizedCountsByPlayer])

  const radarData = useMemo(() => {
    if (!selectedCounts) return [] as Array<{
      subject: string
      value: number
      axisMax: number
      valueNorm: number
      axisMaxNorm: number
    }>

    const LABELS: Record<keyof EventCounts, string> = {
      goal: 'nb But',
      shot_on_target: 'nb Tirs Cadrés',
      shot: 'nb Tirs',
      recovery: 'nb récupération',
      ball_loss: 'nb perte de balle',
      dribble: 'nb de dribble',
    }

    return EVENT_KEYS_ORDER.map((key) => {
      const axisMax = globalMaxByKey[key]
      const value = selectedCounts[key]
      const valueNorm = axisMax > 0 ? value / axisMax : 0
      return {
        subject: LABELS[key],
        value,
        axisMax,
        valueNorm,
        axisMaxNorm: 1,
      }
    })
  }, [selectedCounts, globalMaxByKey])

  // ==========================
  // Team per-match radar setup
  // ==========================
  type TeamEventCounts = {
    goal: number
    shot_on_target: number
    shot: number
    recovery: number
    ball_loss: number
    dribble: number
    opponent_goal: number
    opponent_shot_on_target: number
    opponent_shot: number
  }

  const TEAM_EVENT_KEYS_ORDER: Array<keyof TeamEventCounts> = [
    'goal',
    'shot_on_target',
    'shot',
    'recovery',
    'ball_loss',
    'dribble',
    'opponent_goal',
    'opponent_shot_on_target',
    'opponent_shot',
  ]

  function createEmptyTeamCounts(): TeamEventCounts {
    return {
      goal: 0,
      shot_on_target: 0,
      shot: 0,
      recovery: 0,
      ball_loss: 0,
      dribble: 0,
      opponent_goal: 0,
      opponent_shot_on_target: 0,
      opponent_shot: 0,
    }
  }

  // Use ALL events (ignore filters) for team per-match aggregation
  const teamCountsByMatchAll: Record<string, TeamEventCounts> = useMemo(() => {
    const byMatch: Record<string, TeamEventCounts> = {}
    for (const evt of allEventsForMax) {
      const mid = evt.match_id
      if (!byMatch[mid]) byMatch[mid] = createEmptyTeamCounts()

      // Own team events
      switch (evt.event_type) {
        case 'goal':
          byMatch[mid].goal += 1
          break
        case 'shot_on_target':
          byMatch[mid].shot_on_target += 1
          break
        case 'shot':
          byMatch[mid].shot += 1
          break
        case 'recovery':
          byMatch[mid].recovery += 1
          break
        case 'ball_loss':
          byMatch[mid].ball_loss += 1
          break
        case 'dribble':
          byMatch[mid].dribble += 1
          break
        case 'opponent_goal':
          byMatch[mid].opponent_goal += 1
          break
        case 'opponent_shot_on_target':
          byMatch[mid].opponent_shot_on_target += 1
          break
        case 'opponent_shot':
          byMatch[mid].opponent_shot += 1
          break
        default:
          break
      }
    }
    return byMatch
  }, [allEventsForMax])

  const normalizedTeamCountsByMatchAll: Record<string, TeamEventCounts> = useMemo(() => {
    const out: Record<string, TeamEventCounts> = {}
    for (const [mid, counts] of Object.entries(teamCountsByMatchAll)) {
      const c = { ...counts }
      // Hierarchy for own stats
      if (c.goal > 0) {
        c.shot_on_target = Math.max(c.shot_on_target, c.goal)
        c.shot = Math.max(c.shot, c.shot_on_target, c.goal)
      }
      if (c.shot_on_target > 0) {
        c.shot = Math.max(c.shot, c.shot_on_target)
      }
      out[mid] = c
    }
    return out
  }, [teamCountsByMatchAll])

  const globalTeamMaxByKeyAll: Record<keyof TeamEventCounts, number> = useMemo(() => {
    const maxes: Record<keyof TeamEventCounts, number> = createEmptyTeamCounts()
    for (const counts of Object.values(normalizedTeamCountsByMatchAll)) {
      for (const key of TEAM_EVENT_KEYS_ORDER) {
        maxes[key] = Math.max(maxes[key], counts[key])
      }
    }
    for (const key of TEAM_EVENT_KEYS_ORDER) {
      if (maxes[key] === 0) maxes[key] = 1
    }
    return maxes
  }, [normalizedTeamCountsByMatchAll])

  const TEAM_LABELS: Record<keyof TeamEventCounts, string> = {
    goal: 'nb But',
    shot_on_target: 'nb Tirs Cadrés',
    shot: 'nb Tirs',
    recovery: 'nb récupération',
    ball_loss: 'nb perte de balle',
    dribble: 'nb de dribble',
    opponent_goal: 'nb buts encaissés',
    opponent_shot_on_target: 'nb tirs cadrés concédés',
    opponent_shot: 'nb tirs concédés',
  }

  const teamRadarDataByMatch: Record<string, Array<{ subject: string; value: number; axisMax: number; valueNorm: number; axisMaxNorm: number }>> =
    useMemo(() => {
      const result: Record<string, Array<{ subject: string; value: number; axisMax: number; valueNorm: number; axisMaxNorm: number }>> = {}
      for (const [mid, counts] of Object.entries(normalizedTeamCountsByMatchAll)) {
        result[mid] = TEAM_EVENT_KEYS_ORDER.map((key) => {
          const axisMax = globalTeamMaxByKeyAll[key]
          const value = counts[key]
          const valueNorm = axisMax > 0 ? value / axisMax : 0
          return {
            subject: TEAM_LABELS[key],
            value,
            axisMax,
            valueNorm,
            axisMaxNorm: 1,
          }
        })
      }
      return result
    }, [normalizedTeamCountsByMatchAll, globalTeamMaxByKeyAll])

  return (
    <div className="w-full grid grid-cols-1 gap-4 sm:gap-6 md:gap-8">
      <div className="bg-white rounded-lg shadow p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Joueur</label>
            <select
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              disabled={loading || !!error || players.length === 0}
            >
              <option value="">Sélectionner un joueur</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.first_name ?? '') + ' ' + (p.last_name ?? '')}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-500">
            {loading ? 'Chargement…' : error ? `Erreur: ${error}` : `${events.length} événements chargés`}
            {allEventsForMax.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                (Max global: {allEventsForMax.length} événements)
              </span>
            )}
          </div>
        </div>

        {/* Sélection multi-matches (désactivée si matchId fixé par la page) */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Matches</label>
          {matchId ? (
            <div className="text-sm text-gray-500">Filtré sur le match sélectionné dans la page.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matches.map((m) => {
                const active = selectedMatchIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      setSelectedMatchIds((prev) =>
                        prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                      )
                    }
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {(m.title ?? 'Match')} {m.date ? `(${new Date(m.date).toLocaleDateString('fr-FR')})` : ''}
                  </button>
                )
              })}
            </div>
          )}
          {!matchId && (
            <div className="mt-2 text-xs text-gray-500">
              Sélectionnez au moins un match pour charger les événements
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 sm:p-5 md:p-6">
        <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Radar des actions du joueur
        </h2>

        {selectedPlayerId ? (
          <div className="w-full" style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                {/* Domaine commun en valeurs normalisées (0..1) */}
                <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(val: unknown, _name: unknown, props: unknown) => {
                    const p = (props as any)?.payload ?? {}
                    if ((props as any)?.dataKey === 'valueNorm') {
                      return [`${p.value}/${p.axisMax}`, p.subject]
                    }
                    if ((props as any)?.dataKey === 'axisMaxNorm') {
                      return [`${p.axisMax}`, 'Max']
                    }
                    return [val, p?.subject]
                  }}
                />
                <Legend />
                <RechartsRadar
                  name="Joueur"
                  dataKey="valueNorm"
                  stroke="hsl(217, 91%, 60%)"
                  fill="hsl(217, 91%, 60%)"
                  fillOpacity={0.25}
                />
                <RechartsRadar
                  name="Max"
                  dataKey="axisMaxNorm"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">Choisissez un joueur pour afficher le radar</div>
        )}
      </div>

      {/* Team per-match radar (single) */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-5 md:p-6">
        <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-3 sm:mb-4">
          Radar par match (équipe entière)
        </h2>
        {/* Sélecteur unique de match pour le radar équipe */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">Choisir un match</label>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedMatchIds[0] ?? ''}
            onChange={(e) => setSelectedMatchIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">— Sélectionner —</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.title ?? 'Match')} {m.date ? `(${new Date(m.date).toLocaleDateString('fr-FR')})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedMatchIds[0] ? (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={teamRadarDataByMatch[selectedMatchIds[0]]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                <Legend />
                <Tooltip
                  formatter={(val: unknown, _name: unknown, props: unknown) => {
                    const p = (props as any)?.payload ?? {}
                    if ((props as any)?.dataKey === 'valueNorm') {
                      return [`${p.value}/${p.axisMax}`, p.subject]
                    }
                    if ((props as any)?.dataKey === 'axisMaxNorm') {
                      return [`${p.axisMax}`, 'Max']
                    }
                    return [val, p?.subject]
                  }}
                />
                <RechartsRadar
                  name="Match"
                  dataKey="valueNorm"
                  stroke="hsl(142, 76%, 36%)"
                  fill="hsl(142, 76%, 36%)"
                  fillOpacity={0.25}
                />
                <RechartsRadar
                  name="Max"
                  dataKey="axisMaxNorm"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-6 text-center text-gray-500 text-sm">Sélectionnez un match pour afficher le radar</div>
        )}
      </div>
    </div>
  )
}

