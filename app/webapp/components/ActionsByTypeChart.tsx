'use client'

import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartData } from 'chart.js'

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

interface Props {
  events: EventRow[]
  selectedMatchIds: string[]
}

export default function ActionsByTypeChart({ events, selectedMatchIds }: Props) {
  // Filtrer les événements pour les matchs sélectionnés
  // Si selectedMatchIds est vide, on considère tous les matches comme sélectionnés
  const filteredEvents = selectedMatchIds.length === 0 
    ? events 
    : events.filter(event => selectedMatchIds.includes(event.match_id))
  
  // Debug: afficher les informations de débogage
  console.log('ActionsByTypeChart Debug:', {
    totalEvents: events.length,
    selectedMatchIds,
    selectedMatchIdsLength: selectedMatchIds.length,
    filteredEventsLength: filteredEvents.length,
    eventsWithTime: events.filter(e => e.match_time_seconds !== null).length,
    sampleEvent: events[0],
    useAllEvents: selectedMatchIds.length === 0
  })

  // Créer les séquences temporelles
  const timeSequences = useMemo(() => {
    if (filteredEvents.length === 0) return []

    const sequences: Array<{
      id: string
      label: string
      startTime: number
      endTime: number
      half: number
      quartile: number
    }> = []

    const eventsByHalf = filteredEvents.reduce<Record<number, EventRow[]>>((acc, event) => {
      const half = event.half || 1
      if (!acc[half]) {
        acc[half] = []
      }
      acc[half].push(event)
      return acc
    }, {})

    Object.entries(eventsByHalf)
      .sort(([halfA], [halfB]) => Number(halfA) - Number(halfB))
      .forEach(([halfKey, halfEvents]) => {
        const half = Number(halfKey)
        const adjustedDuration = Math.max(...halfEvents.map(e => e.match_time_seconds || 0)) + 1
        const quartileDuration = Math.max(1, Math.ceil(adjustedDuration / 4))

        for (let quartileIndex = 0; quartileIndex < 4; quartileIndex++) {
          const startTime = quartileIndex * quartileDuration
          let endTime = (quartileIndex + 1) * quartileDuration
          if (quartileIndex === 3) {
            endTime = adjustedDuration
          } else {
            endTime = Math.min(endTime, adjustedDuration)
          }

          if (endTime <= startTime) {
            endTime = startTime + 1
          }

          sequences.push({
            id: `H${half}-Q${quartileIndex + 1}`,
            label: `M${half}-Q${quartileIndex + 1}`,
            startTime,
            endTime,
            half,
            quartile: quartileIndex + 1
          })
        }
      })

    console.log('Generated aggregate quartile sequences:', sequences.length)
    return sequences
  }, [filteredEvents])
  
  // Compter les événements par séquence
  const eventCountsBySequence = useMemo(() => {
    const counts: Record<string, {
      goal: number
      shot_on_target: number
      shot: number
      opponent_goal: number
      opponent_shot_on_target: number
      opponent_shot: number
    }> = {}

    // Initialiser toutes les séquences avec des compteurs à 0
    timeSequences.forEach(seq => {
      counts[`${seq.half}-${seq.quartile}`] = {
        goal: 0,
        shot_on_target: 0,
        shot: 0,
        opponent_goal: 0,
        opponent_shot_on_target: 0,
        opponent_shot: 0
      }
    })

    // Compter les événements pour chaque séquence
    filteredEvents.forEach(event => {
      const eventTime = event.match_time_seconds || 0
      const eventHalf = event.half || 1

      // Trouver la séquence correspondante
      const sequence = timeSequences.find(seq => 
        seq.half === eventHalf && 
        eventTime >= seq.startTime && 
        eventTime < seq.endTime
      )

      if (sequence) {
        const key = `${sequence.half}-${sequence.quartile}`
        switch (event.event_type) {
          case 'goal':
            counts[key].goal += 1
            // Un but ajoute aussi 1 tir cadré et 1 tir
            counts[key].shot_on_target += 1
            counts[key].shot += 1
            break
          case 'shot_on_target':
            counts[key].shot_on_target += 1
            // Un tir cadré ajoute aussi 1 tir
            counts[key].shot += 1
            break
          case 'shot':
            counts[key].shot += 1
            break
          case 'opponent_goal':
            counts[key].opponent_goal += 1
            // Un but encaissé ajoute aussi 1 tir cadré concédé et 1 tir concédé
            counts[key].opponent_shot_on_target += 1
            counts[key].opponent_shot += 1
            break
          case 'opponent_shot_on_target':
            counts[key].opponent_shot_on_target += 1
            // Un tir cadré concédé ajoute aussi 1 tir concédé
            counts[key].opponent_shot += 1
            break
          case 'opponent_shot':
            counts[key].opponent_shot += 1
            break
        }
      }
    })
    
    return counts
  }, [filteredEvents, timeSequences])
  
  // Préparer les données pour le graphique
  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = timeSequences.map(seq => seq.label)
    
    return {
      labels,
      datasets: [
        {
          label: 'Buts',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.goal || 0),
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(34, 197, 94)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Tirs cadrés',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.shot_on_target || 0),
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(59, 130, 246)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Tirs',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.shot || 0),
          backgroundColor: 'rgba(147, 51, 234, 0.1)',
          borderColor: 'rgb(147, 51, 234)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(147, 51, 234)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Buts encaissés',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.opponent_goal || 0),
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(239, 68, 68)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Tirs cadrés concédés',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.opponent_shot_on_target || 0),
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderColor: 'rgb(245, 158, 11)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(245, 158, 11)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
        {
          label: 'Tirs concédés',
          data: timeSequences.map(seq => eventCountsBySequence[`${seq.half}-${seq.quartile}`]?.opponent_shot || 0),
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 3,
          pointBackgroundColor: 'rgb(168, 85, 247)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.4,
        },
      ],
    }
  }, [timeSequences, eventCountsBySequence])
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'Courbes de relevé des actions par quartile et mi-temps (agrégé)',
        font: {
          size: 16,
          weight: 'bold' as const
        },
        color: '#374151'
      },
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12,
            weight: 'bold' as const
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
          weight: 'bold' as const
        },
        bodyFont: {
          size: 12
        },
        padding: 12,
        callbacks: {
          afterBody: function(context: { dataIndex: number }[]) {
            const dataIndex = context[0].dataIndex
            const seq = timeSequences[dataIndex]
            if (!seq) {
              return []
            }
            const key = `${seq.half}-${seq.quartile}`
            const teamGoals = eventCountsBySequence[key]?.goal || 0
            const opponentGoals = eventCountsBySequence[key]?.opponent_goal || 0
            const goalsDiff = teamGoals - opponentGoals

            const teamShots = (eventCountsBySequence[key]?.shot_on_target || 0) + 
                             (eventCountsBySequence[key]?.shot || 0)
            const opponentShots = (eventCountsBySequence[key]?.opponent_shot_on_target || 0) + 
                                 (eventCountsBySequence[key]?.opponent_shot || 0)
            const shotsDiff = teamShots - opponentShots
            
            return [
              '',
              `Buts équipe: ${teamGoals}`,
              `Buts adversaire: ${opponentGoals}`,
              `Diff. buts: ${goalsDiff > 0 ? '+' : ''}${goalsDiff}`,
              '',
              `Tirs équipe: ${teamShots}`,
              `Tirs adversaire: ${opponentShots}`,
              `Diff. tirs: ${shotsDiff > 0 ? '+' : ''}${shotsDiff}`
            ]
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: '#d1d5db',
          lineWidth: 1
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 10
          },
          maxRotation: 45,
          minRotation: 45
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#d1d5db',
          lineWidth: 1
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 12
          },
          // Supprimer stepSize pour éviter le problème de trop de ticks
          // stepSize: 1,
          // Ajouter une logique pour limiter le nombre de ticks
          callback: function(value: unknown, index: number, values: unknown[]): string | number | undefined {
            // Limiter le nombre de ticks affichés
            if (index % Math.max(1, Math.ceil(values.length / 10)) === 0) {
              return value as number
            }
            return undefined
          }
        }
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  }
  
  if (timeSequences.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-lg text-gray-600">Aucune donnée temporelle disponible</div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div style={{ height: '500px' }}>
        <Line data={chartData} options={chartOptions} />
      </div>
      
      {/* Légende des couleurs */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-700 text-sm">Actions de l&apos;équipe</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Buts</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Tirs cadrés</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded"></div>
              <span>Tirs</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-gray-700 text-sm">Actions de l&apos;adversaire</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Buts encaissés</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-orange-500 rounded"></div>
              <span>Tirs cadrés concédés</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-violet-500 rounded"></div>
              <span>Tirs concédés</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
