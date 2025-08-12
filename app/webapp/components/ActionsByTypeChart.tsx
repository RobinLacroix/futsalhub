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
  // Créer des séquences de 5 minutes (300 secondes)
  const TIME_SEQUENCE_SECONDS = 300
  
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
    
    // Trouver le temps maximum parmi tous les matchs
    const maxTime = Math.max(...filteredEvents.map(e => e.match_time_seconds || 0))
    const maxHalf = Math.max(...filteredEvents.map(e => e.half || 1))
    
    console.log('Time sequences debug:', { maxTime, maxHalf, filteredEventsLength: filteredEvents.length })
    
    const sequences: Array<{
      label: string
      startTime: number
      endTime: number
      half: number
    }> = []
    
    // Créer les séquences pour chaque mi-temps
    for (let half = 1; half <= maxHalf; half++) {
      const halfMaxTime = half === 1 ? 45 * 60 : maxTime
      
      for (let time = 0; time < halfMaxTime; time += TIME_SEQUENCE_SECONDS) {
        const endTime = Math.min(time + TIME_SEQUENCE_SECONDS, halfMaxTime)
        const startMinutes = Math.floor(time / 60)
        const startSeconds = time % 60
        const endMinutes = Math.floor(endTime / 60)
        const endSeconds = endTime % 60
        
        sequences.push({
          label: `M${half} ${startMinutes.toString().padStart(2, '0')}:${startSeconds.toString().padStart(2, '0')}-${endMinutes.toString().padStart(2, '0')}:${endSeconds.toString().padStart(2, '0')}`,
          startTime: time,
          endTime: endTime,
          half: half
        })
      }
    }
    
    console.log('Generated sequences:', sequences.length)
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
      counts[seq.label] = {
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
        switch (event.event_type) {
          case 'goal':
            counts[sequence.label].goal += 1
            // Un but ajoute aussi 1 tir cadré et 1 tir
            counts[sequence.label].shot_on_target += 1
            counts[sequence.label].shot += 1
            break
          case 'shot_on_target':
            counts[sequence.label].shot_on_target += 1
            // Un tir cadré ajoute aussi 1 tir
            counts[sequence.label].shot += 1
            break
          case 'shot':
            counts[sequence.label].shot += 1
            break
          case 'opponent_goal':
            counts[sequence.label].opponent_goal += 1
            // Un but encaissé ajoute aussi 1 tir cadré concédé et 1 tir concédé
            counts[sequence.label].opponent_shot_on_target += 1
            counts[sequence.label].opponent_shot += 1
            break
          case 'opponent_shot_on_target':
            counts[sequence.label].opponent_shot_on_target += 1
            // Un tir cadré concédé ajoute aussi 1 tir concédé
            counts[sequence.label].opponent_shot += 1
            break
          case 'opponent_shot':
            counts[sequence.label].opponent_shot += 1
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
          data: labels.map(label => eventCountsBySequence[label]?.goal || 0),
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
          data: labels.map(label => eventCountsBySequence[label]?.shot_on_target || 0),
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
          data: labels.map(label => eventCountsBySequence[label]?.shot || 0),
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
          data: labels.map(label => eventCountsBySequence[label]?.opponent_goal || 0),
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
          data: labels.map(label => eventCountsBySequence[label]?.opponent_shot_on_target || 0),
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
          data: labels.map(label => eventCountsBySequence[label]?.opponent_shot || 0),
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
        text: 'Courbes de relevé des actions - Séquences de 5 minutes',
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
          afterBody: function(context: { label: string }[]) {
            const label = context[0].label
            const totalTeam = (eventCountsBySequence[label]?.goal || 0) + 
                             (eventCountsBySequence[label]?.shot_on_target || 0) + 
                             (eventCountsBySequence[label]?.shot || 0)
            const totalOpponent = (eventCountsBySequence[label]?.opponent_goal || 0) + 
                                 (eventCountsBySequence[label]?.opponent_shot_on_target || 0) + 
                                 (eventCountsBySequence[label]?.opponent_shot || 0)
            
            return [
              '',
              `Total équipe: ${totalTeam}`,
              `Total adversaire: ${totalOpponent}`,
              `Différence: ${totalTeam - totalOpponent > 0 ? '+' : ''}${totalTeam - totalOpponent}`
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
