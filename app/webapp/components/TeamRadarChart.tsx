'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import RadarChartWrapper from './RadarChartWrapper'
import { useActiveTeam } from '../hooks/useActiveTeam'
import type { ChartOptions } from 'chart.js'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

// Enregistrer les composants Chart.js nécessaires
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend
)

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

const TEAM_LABELS: Record<keyof TeamEventCounts, string> = {
  goal: 'Buts',
  shot_on_target: 'Tirs Cadrés',
  shot: 'Total Tirs',  // ← Clarifier que c'est le total
  recovery: 'Récupérations',
  ball_loss: 'Pertes de balle',
  dribble: 'Dribbles',
  opponent_goal: 'Buts encaissés',
  opponent_shot_on_target: 'Tirs Cadrés Concédés',
  opponent_shot: 'Total Tirs Concédés',  // ← Clarifier que c'est le total
}

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

type Props = {
  matchId?: string
  selectedMatchIds?: string[]
}

export default function TeamRadarChart({ matchId, selectedMatchIds: initialSelectedMatchIds = [] }: Props) {
  const { activeTeam } = useActiveTeam();
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>(matchId ? [matchId] : initialSelectedMatchIds)
  const [maxSelectedMatches] = useState(3)

  // Fetch matches and events
  useEffect(() => {
    let isMounted = true
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        // Vérifier qu'une équipe est active
        if (!activeTeam) {
          console.log('TeamRadarChart - Aucune équipe active, chargement impossible');
          setMatches([]);
          setEvents([]);
          return;
        }

        console.log('TeamRadarChart - Chargement des données pour l\'équipe:', activeTeam.name);

        // Fetch matches filtrés par équipe active
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select('id, title, date')
          .eq('team_id', activeTeam.id)
          .order('date', { ascending: false })

        if (matchesError) throw matchesError

        // Fetch events uniquement pour les matchs de l'équipe active
        let eventsData = [];
        if (matchesData && matchesData.length > 0) {
          const matchIds = matchesData.map(m => m.id);
          const { data: eventsForTeam, error: eventsError } = await supabase
            .from('match_events')
            .select('*')
            .in('match_id', matchIds)
            .order('created_at', { ascending: true })

          if (eventsError) throw eventsError
          eventsData = eventsForTeam || [];
        }

        if (!isMounted) return

        console.log('TeamRadarChart - Matches chargés pour l\'équipe', activeTeam.name, ':', matchesData);
        console.log('TeamRadarChart - Événements chargés pour l\'équipe:', eventsData?.length);
        console.log('TeamRadarChart - Premier événement:', eventsData?.[0]);

        setMatches(matchesData || [])
        setEvents(eventsData || [])

        // Auto-select first match if none selected
        if (selectedMatchIds.length === 0 && matchesData && matchesData.length > 0) {
          // Sélectionner le premier match qui a des statistiques
          const matchWithStats = matchesData.find(() => {
            // Vérifier si ce match a des événements (sera calculé plus tard)
            return true; // Pour l'instant, sélectionner le premier
          });
          
          if (matchWithStats) {
            setSelectedMatchIds([matchWithStats.id]);
            console.log('TeamRadarChart - Match auto-sélectionné:', matchWithStats.title);
          }
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
  }, [selectedMatchIds, activeTeam])

  // Calculate team stats by match
  const teamStatsByMatch = useMemo(() => {
    const stats: Record<string, TeamEventCounts> = {}
    
    // D'abord, compter tous les événements individuels
    for (const evt of events) {
      const matchId = evt.match_id
      if (!stats[matchId]) {
        stats[matchId] = createEmptyTeamCounts()
      }

      switch (evt.event_type) {
        case 'goal':
          stats[matchId].goal += 1
          break
        case 'shot_on_target':
          stats[matchId].shot_on_target += 1
          break
        case 'shot_off_target':  // ← Ajouter le support pour les tirs non cadrés
          // Ces événements seront comptés dans le total des tirs
          break
        case 'shot':
          stats[matchId].shot += 1
          break
        case 'recovery':
          stats[matchId].recovery += 1
          break
        case 'ball_loss':
          stats[matchId].ball_loss += 1
          break
        case 'dribble':
          stats[matchId].dribble += 1
          break
        case 'opponent_goal':
          stats[matchId].opponent_goal += 1
          break
        case 'opponent_shot_on_target':
          stats[matchId].opponent_shot_on_target += 1
          break
        case 'opponent_shot_off_target':  // ← Ajouter le support pour les tirs non cadrés concédés
          // Ces événements seront comptés dans le total des tirs concédés
          break
        case 'opponent_shot':
          stats[matchId].opponent_shot += 1
          break
      }
    }

    // Ensuite, appliquer la logique hiérarchique pour les tirs
    for (const matchStats of Object.values(stats)) {
      // Pour mon équipe : 
      // shot_on_target = tirs cadrés uniquement (inchangé)
      // shot = total des tirs (cadrés + non cadrés)
      // Si on a des événements shot_off_target, ils sont déjà comptés dans shot
      // Sinon, shot représente les tirs non cadrés et on fait le total
      matchStats.shot = matchStats.shot_on_target + matchStats.shot

      // Pour l'adversaire :
      // opponent_shot_on_target = tirs cadrés concédés uniquement (inchangé)
      // opponent_shot = total des tirs concédés (cadrés + non cadrés)
      // Si on a des événements opponent_shot_off_target, ils sont déjà comptés dans opponent_shot
      // Sinon, opponent_shot représente les tirs non cadrés concédés et on fait le total
      matchStats.opponent_shot = matchStats.opponent_shot_on_target + matchStats.opponent_shot
    }

    return stats
  }, [events])

  // Calculate season averages per match
  const seasonAverages = useMemo(() => {
    const matchIds = Object.keys(teamStatsByMatch)
    if (matchIds.length === 0) return createEmptyTeamCounts()

    const totals = createEmptyTeamCounts()
    for (const matchStats of Object.values(teamStatsByMatch)) {
      for (const key of TEAM_EVENT_KEYS_ORDER) {
        totals[key] += matchStats[key]
      }
    }

    const averages: TeamEventCounts = {} as TeamEventCounts
    for (const key of TEAM_EVENT_KEYS_ORDER) {
      averages[key] = Math.round((totals[key] / matchIds.length) * 10) / 10
    }

    return averages
  }, [teamStatsByMatch])

  // Calculate max values for each stat across all matches
  const maxValuesPerStat = useMemo(() => {
    const matchIds = Object.keys(teamStatsByMatch)
    if (matchIds.length === 0) return createEmptyTeamCounts()

    const maxValues = createEmptyTeamCounts()
    for (const key of TEAM_EVENT_KEYS_ORDER) {
      maxValues[key] = Math.max(...Object.values(teamStatsByMatch).map(stats => stats[key]))
    }

    return maxValues
  }, [teamStatsByMatch])

  // Get selected matches stats
  const selectedMatchesStats = useMemo(() => {
    console.log('TeamRadarChart - selectedMatchIds:', selectedMatchIds);
    console.log('TeamRadarChart - teamStatsByMatch:', teamStatsByMatch);
    console.log('TeamRadarChart - matches:', matches);
    
    const result = selectedMatchIds
      .map(matchId => {
        const stats = teamStatsByMatch[matchId]
        const match = matches.find(m => m.id === matchId)
        console.log(`TeamRadarChart - Match ${matchId}:`, { stats, match });
        return stats && match ? { matchId, stats, match } : null
      })
      .filter(Boolean) as Array<{ matchId: string; stats: TeamEventCounts; match: MatchRow }>
    
    console.log('TeamRadarChart - selectedMatchesStats result:', result);
    return result
  }, [selectedMatchIds, teamStatsByMatch, matches])

  // Auto-select a match with stats if current selection has no stats
  useEffect(() => {
    if (selectedMatchIds.length > 0 && selectedMatchesStats.length === 0 && Object.keys(teamStatsByMatch).length > 0) {
      // Trouver le premier match qui a des statistiques
      const matchWithStats = Object.keys(teamStatsByMatch)[0];
      if (matchWithStats) {
        console.log('TeamRadarChart - Auto-sélection d\'un match avec stats:', matchWithStats);
        setSelectedMatchIds([matchWithStats]);
      }
    }
  }, [selectedMatchIds, selectedMatchesStats.length, teamStatsByMatch]);

  // Chart colors for multiple matches
  const matchColors = [
    { border: 'rgb(59, 130, 246)', background: 'rgba(59, 130, 246, 0.1)', point: 'rgb(59, 130, 246)' }, // Bleu
    { border: 'rgb(34, 197, 94)', background: 'rgba(34, 197, 94, 0.1)', point: 'rgb(34, 197, 94)' }, // Vert
    { border: 'rgb(147, 51, 234)', background: 'rgba(147, 51, 234, 0.1)', point: 'rgb(147, 51, 234)' }, // Violet
  ]

  // Prepare chart data
  const chartData = useMemo(() => {
    if (selectedMatchesStats.length === 0) return null

    // Normalize data to 0-1 scale for each axis based on max values
    const normalizeValue = (value: number, statKey: string) => {
      const maxForThisStat = maxValuesPerStat[statKey as keyof TeamEventCounts]
      return maxForThisStat > 0 ? value / maxForThisStat : 0
    }

    const datasets = selectedMatchesStats.map((matchData, index) => {
      const color = matchColors[index % matchColors.length]
      const matchTitle = matchData.match.title || 'Match'
      const matchDate = matchData.match.date ? 
        new Date(matchData.match.date).toLocaleDateString('fr-FR') : ''

      return {
        label: `${matchTitle} ${matchDate ? `(${matchDate})` : ''}`,
        data: TEAM_EVENT_KEYS_ORDER.map(key => normalizeValue(matchData.stats[key], key)),
        borderColor: color.border,
        backgroundColor: color.background,
        borderWidth: 3,
        pointBackgroundColor: color.point,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        fill: true,
      }
    })

    // Add season average dataset
    datasets.push({
      label: 'Moyenne match',
      data: TEAM_EVENT_KEYS_ORDER.map(key => normalizeValue(seasonAverages[key], key)),
      borderColor: 'rgb(239, 68, 68)',
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgb(239, 68, 68)',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
    })

    return {
      labels: TEAM_EVENT_KEYS_ORDER.map(key => TEAM_LABELS[key]),
      datasets
    }
  }, [selectedMatchesStats, seasonAverages, maxValuesPerStat])

  // Chart options
  const chartOptions: ChartOptions<'radar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        beginAtZero: true,
        max: 1,
        min: 0,
        ticks: {
          display: false
        },
        grid: {
          color: '#d1d5db',
          lineWidth: 1
        },
        angleLines: {
          color: '#d1d5db',
          lineWidth: 1
        },
        pointLabels: {
          font: {
            size: 12,
            weight: 'bold'
          },
          color: '#374151',
          padding: 20,
          callback: function(value, index) {
            const label = value as string
            const statKey = TEAM_EVENT_KEYS_ORDER[index]
            const maxForThisStat = maxValuesPerStat[statKey as keyof TeamEventCounts]
            return `${label}\n(Max: ${maxForThisStat})`
          }
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 14,
            weight: 'bold'
          },
          color: '#374151',
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 12
        },
        padding: 12,
        callbacks: {
          title: function(context: unknown) {
            return (context as { label: string }[])[0].label
          },
          label: function(context: unknown) {
            const ctx = context as { dataset: { label: string }; parsed: { r: number }; datasetIndex: number; dataIndex: number }
            const label = ctx.dataset.label || ''
            const normalizedValue = ctx.parsed.r
            const datasetIndex = ctx.datasetIndex
            const eventKey = TEAM_EVENT_KEYS_ORDER[ctx.dataIndex]
            const maxForThisStat = maxValuesPerStat[eventKey as keyof TeamEventCounts]
            
            // Convert normalized value back to real value
            const realValue = Math.round(normalizedValue * maxForThisStat)
            
            if (datasetIndex < selectedMatchesStats.length) {
              // Match stats
              const average = seasonAverages[eventKey as keyof TeamEventCounts]
              const difference = realValue - average
              return [
                `${label}: ${realValue}`,
                `Moyenne saisonnière: ${average}`,
                `Différence: ${difference > 0 ? '+' : ''}${difference.toFixed(1)}`
              ]
            } else {
              // Season average
              return `${label}: ${realValue}`
            }
          }
        }
      }
    }
  }

  // Handle match selection/deselection
  const handleMatchSelection = (matchId: string) => {
    setSelectedMatchIds(prev => {
      if (prev.includes(matchId)) {
        // Remove match
        return prev.filter(id => id !== matchId)
      } else if (prev.length < maxSelectedMatches) {
        // Add match
        return [...prev, matchId]
      }
      return prev
    })
  }

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-blue-500 text-6xl mb-4">🏆</div>
          <div className="text-lg text-gray-600 mb-2">Aucune équipe sélectionnée</div>
          <div className="text-sm text-gray-500">Veuillez sélectionner une équipe dans la sidebar pour voir les statistiques</div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Chargement des statistiques...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <div className="text-lg text-red-600">Erreur: {error}</div>
        </div>
      </div>
    )
  }

  if (!chartData || selectedMatchesStats.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-lg text-gray-600">Aucune donnée disponible</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Match selector */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-base font-bold text-gray-800">
            📅 Sélectionner des matchs (max {maxSelectedMatches})
          </label>
          <div className="text-sm text-gray-500">
            {selectedMatchIds.length}/{maxSelectedMatches} sélectionnés
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {matches.map((match) => {
            const isSelected = selectedMatchIds.includes(match.id)
            const hasStats = teamStatsByMatch[match.id]
            const selectionIndex = selectedMatchIds.indexOf(match.id)
            
            return (
              <button
                key={match.id}
                onClick={() => handleMatchSelection(match.id)}
                disabled={!hasStats}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200
                  transform hover:scale-105 active:scale-95
                  ${isSelected 
                    ? `text-white shadow-lg ring-2 ${
                        selectionIndex === 0 ? 'bg-blue-600 ring-blue-300' :
                        selectionIndex === 1 ? 'bg-green-600 ring-green-300' :
                        'bg-purple-600 ring-purple-300'
                      }` 
                    : hasStats 
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-2 border-gray-300 hover:border-gray-400' 
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed border-2 border-gray-200'
                  }
                `}
              >
                <div className="text-center">
                  <div className="font-bold text-sm">
                    {match.title || 'Match'} 
                  </div>
                  {match.date && (
                    <div className="text-xs opacity-75 mt-0.5">
                      {new Date(match.date).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                  {hasStats && (
                    <div className="text-xs mt-0.5 opacity-75">
                      {teamStatsByMatch[match.id].goal}-{teamStatsByMatch[match.id].opponent_goal}
                    </div>
                  )}
                  {isSelected && (
                    <div className="text-xs mt-0.5 font-bold">
                      Match {selectionIndex + 1}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chart container */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div style={{ height: '500px' }}>
          <RadarChartWrapper data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Stats summary */}
      {selectedMatchesStats.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
          <h4 className="text-base font-bold text-gray-700 mb-3">
            📈 Résumé des statistiques
          </h4>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            {TEAM_EVENT_KEYS_ORDER.map((key) => {
              const averageValue = seasonAverages[key]
              
              return (
                <div key={key} className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                    {TEAM_LABELS[key]}
                  </div>
                  {selectedMatchesStats.map((matchData, index) => {
                    const value = matchData.stats[key]
                    const difference = value - averageValue
                    const color = matchColors[index % matchColors.length]
                    
                    return (
                      <div key={matchData.matchId} className="mb-2">
                        <div className="text-lg font-bold" style={{ color: color.border }}>
                          {value}
                        </div>
                        <div className="text-xs text-gray-600">
                          {difference > 0 ? '+' : ''}{difference.toFixed(1)}
                        </div>
                      </div>
                    )
                  })}
                  <div className="text-xs text-red-500 border-t pt-2">
                    Moy: {averageValue}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend explanation */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
        <div className="flex items-center justify-center space-x-4 text-xs text-blue-800">
          {selectedMatchesStats.map((matchData, index) => {
            const color = matchColors[index % matchColors.length]
            return (
              <div key={matchData.matchId} className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.border }}></div>
                <span className="font-semibold">Match {index + 1}:</span>
                <span>{matchData.match.title || 'Match'}</span>
              </div>
            )
          })}
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-red-500 border-dashed"></div>
            <span className="font-semibold">Moyenne saisonnière</span>
          </div>
        </div>
      </div>
    </div>
  )
}
