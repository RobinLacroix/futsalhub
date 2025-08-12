'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

// Enregistrer les composants Chart.js nécessaires
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface MatchEvent {
  id: string
  match_id: string
  event_type: string
  match_time_seconds: number
  half: number
  player_id: string | null
  players_on_field: string[]
  created_at: string
}

interface Props {
  selectedMatchIds?: string[]
}

// Types d'événements à afficher avec leurs couleurs
const EVENT_TYPES = [
  { key: 'goal', label: 'But', color: '#10B981' }, // Vert
  { key: 'shot_on_target', label: 'Tir cadré', color: '#3B82F6' }, // Bleu
  { key: 'shot', label: 'Tir', color: '#6B7280' }, // Gris
  { key: 'opponent_goal', label: 'But concédé', color: '#EF4444' }, // Rouge
  { key: 'opponent_shot_on_target', label: 'Tir cadré concédé', color: '#F97316' }, // Orange
  { key: 'opponent_shot', label: 'Tir concédé', color: '#EC4899' }, // Rose
]

export default function EventsTimelineChart({ selectedMatchIds = [] }: Props) {
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Récupérer les événements depuis Supabase
  useEffect(() => {
    async function fetchEvents() {
      try {
        setLoading(true)
        setError(null)

        let query = supabase
          .from('match_events')
          .select('*')
          .order('match_time_seconds', { ascending: true })

        // Filtrer par match si des IDs sont sélectionnés
        if (selectedMatchIds.length > 0) {
          query = query.in('match_id', selectedMatchIds)
        }

        const { data, error } = await query

        if (error) {
          throw error
        }

        setEvents(data || [])
      } catch (err) {
        console.error('Erreur lors de la récupération des événements:', err)
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [selectedMatchIds])

  // Traiter les données pour créer les segments de 5 minutes
  const chartData = useMemo(() => {
    if (events.length === 0) return null

    // Trouver le temps maximum du match
    const maxTime = Math.max(...events.map(e => e.match_time_seconds))
    
    // Créer des segments de 5 minutes (300 secondes)
    const segmentCount = Math.ceil(maxTime / 300)
    const segments = Array.from({ length: segmentCount }, (_, i) => i)
    
    // Créer les labels pour l'axe X
    const labels = segments.map(segment => {
      const startMin = segment * 5
      const endMin = (segment + 1) * 5
      return `${startMin}-${endMin}`
    })

    // Initialiser les données cumulatives pour chaque type d'événement
    const cumulativeData: { [key: string]: number[] } = {}
    EVENT_TYPES.forEach(({ key }) => {
      cumulativeData[key] = new Array(segmentCount).fill(0)
    })

    // Remplir les données cumulatives
    events.forEach(event => {
      const segmentIndex = Math.floor(event.match_time_seconds / 300)
      if (segmentIndex < segmentCount && cumulativeData[event.event_type]) {
        // Incrémenter le segment actuel et tous les suivants (cumulatif)
        for (let i = segmentIndex; i < segmentCount; i++) {
          cumulativeData[event.event_type][i]++
        }
      }
    })

    // Créer les datasets pour Chart.js
    const datasets = EVENT_TYPES.map(({ key, label, color }) => ({
      label,
      data: cumulativeData[key],
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      pointBackgroundColor: color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
      tension: 0.4, // Courbes lissées
      fill: false,
    }))

    return {
      labels,
      datasets,
    }
  }, [events])

  // Options du graphique
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 14,
            weight: 'bold',
          },
        },
      },
      title: {
        display: true,
        text: 'Évolution des événements par type - Segments de 5 minutes',
        font: {
          size: 18,
          weight: 'bold',
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#ffffff',
        borderWidth: 1,
        callbacks: {
          title: (tooltipItems) => {
            const segmentIndex = tooltipItems[0].dataIndex
            const startMin = segmentIndex * 5
            const endMin = (segmentIndex + 1) * 5
            return `Segment ${startMin}-${endMin} min`
          },
          label: (context) => {
            return `${context.dataset.label}: ${context.parsed.y}`
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Segments de 5 minutes',
          font: {
            size: 14,
            weight: 'bold',
          },
        },
        ticks: {
          font: {
            size: 12,
          },
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Nombre cumulé d\'événements',
          font: {
            size: 14,
            weight: 'bold',
          },
        },
        ticks: {
          font: {
            size: 12,
          },
          stepSize: 1,
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        beginAtZero: true,
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
    elements: {
      point: {
        hoverRadius: 8,
      },
    },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des données...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <p className="text-red-600 font-medium mb-2">Erreur lors du chargement</p>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!chartData || events.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="text-gray-400 text-6xl mb-4">📊</div>
          <p className="text-gray-600 font-medium mb-2">Aucune donnée disponible</p>
          <p className="text-gray-500 text-sm">
            {selectedMatchIds.length > 0 
              ? 'Aucun événement trouvé pour les matches sélectionnés'
              : 'Aucun événement de match enregistré'
            }
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <Line data={chartData} options={chartOptions} />
    </div>
  )
}
