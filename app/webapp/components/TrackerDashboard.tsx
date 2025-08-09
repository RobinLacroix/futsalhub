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
  match_time: number | null
  half: number | null
  player_id: string | null
  players_on_field: string[] | null
  created_at: string
}

const EVENT_KEYS_ORDER: Array<keyof EventCounts> = [
  'shot',
  'shot_on_target',
  'goal',
  'recovery',
  'ball_loss',
  'opponent_shot',
]

type EventCounts = {
  shot: number
  shot_on_target: number
  goal: number
  recovery: number
  ball_loss: number
  opponent_shot: number
}

function createEmptyCounts(): EventCounts {
  return {
    shot: 0,
    shot_on_target: 0,
    goal: 0,
    recovery: 0,
    ball_loss: 0,
    opponent_shot: 0,
  }
}

type RadarDatum = {
  subject: string
  value: number
  max: number
}

type Props = { matchId?: string }

export default function TrackerDashboard({ matchId }: Props) {
  const [players, setPlayers] = useState<Player[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch players and events once
  useEffect(() => {
    let isMounted = true
    async function fetchData() {
      try {
        setLoading(true)

        const [playersRes, eventsRes] = await Promise.all([
          supabase.from('players').select('id, first_name, last_name').order('last_name', { ascending: true }),
          matchId
            ? supabase.from('events').select('*').eq('match_id', matchId)
            : supabase.from('events').select('*'),
        ])

        if (playersRes.error) throw playersRes.error
        if (eventsRes.error) throw eventsRes.error

        if (!isMounted) return
        setPlayers((playersRes.data ?? []) as Player[])
        setEvents((eventsRes.data ?? []) as EventRow[])
      } catch (e: any) {
        setError(e?.message ?? 'Erreur lors du chargement des données')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => {
      isMounted = false
    }
  }, [matchId])

  // Compute raw counts per player
  const countsByPlayer: Record<string, EventCounts> = useMemo(() => {
    const acc: Record<string, EventCounts> = {}
    for (const evt of events) {
      const pid = evt.player_id
      if (!pid) continue
      if (!acc[pid]) acc[pid] = createEmptyCounts()

      // Only count keys we care about
      switch (evt.event_type) {
        case 'shot':
          acc[pid].shot += 1
          break
        case 'shot_on_target':
          acc[pid].shot_on_target += 1
          break
        case 'goal':
          acc[pid].goal += 1
          break
        case 'recovery':
          acc[pid].recovery += 1
          break
        case 'ball_loss':
          acc[pid].ball_loss += 1
          break
        case 'opponent_shot':
          acc[pid].opponent_shot += 1
          break
        default:
          break
      }
    }
    return acc
  }, [events])

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

  // Global max per key across all players (unique scale)
  const globalMaxByKey: Record<keyof EventCounts, number> = useMemo(() => {
    const maxes: Record<keyof EventCounts, number> = createEmptyCounts()
    for (const counts of Object.values(normalizedCountsByPlayer)) {
      for (const key of EVENT_KEYS_ORDER) {
        maxes[key] = Math.max(maxes[key], counts[key])
      }
    }
    // Avoid zero max which breaks dataMax domain
    for (const key of EVENT_KEYS_ORDER) {
      if (maxes[key] === 0) maxes[key] = 1
    }
    return maxes
  }, [normalizedCountsByPlayer])

  const selectedCounts: EventCounts | null = useMemo(() => {
    if (!selectedPlayerId) return null
    return normalizedCountsByPlayer[selectedPlayerId] ?? createEmptyCounts()
  }, [selectedPlayerId, normalizedCountsByPlayer])

  const radarData: RadarDatum[] = useMemo(() => {
    if (!selectedCounts) return []
    return EVENT_KEYS_ORDER.map((key) => ({
      subject: key,
      value: selectedCounts[key],
      max: globalMaxByKey[key],
    }))
  }, [selectedCounts, globalMaxByKey])

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
            {loading ? 'Chargement…' : error ? `Erreur: ${error}` : `${events.length} événements`}
          </div>
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
                <PolarRadiusAxis domain={[0, 'dataMax']} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any, _name: any, props: any) => {
                    return [`${value}/${props?.payload?.max ?? 0}`, props?.payload?.subject]
                  }}
                  labelStyle={{ color: '#111827' }}
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.97)',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    padding: 8,
                  }}
                />
                <RechartsRadar
                  name="Joueur"
                  dataKey="value"
                  stroke="hsl(217, 91%, 60%)"
                  fill="hsl(217, 91%, 60%)"
                  fillOpacity={0.25}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">Choisissez un joueur pour afficher le radar</div>
        )}
      </div>
    </div>
  )
}

