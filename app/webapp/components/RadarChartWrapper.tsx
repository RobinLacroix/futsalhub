'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { ChartData, ChartOptions } from 'chart.js'

// Import dynamique du composant Radar
const Radar = dynamic(() => import('react-chartjs-2').then(mod => ({ default: mod.Radar })), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Chargement du graphique...</div>
})

interface RadarChartWrapperProps {
  data: ChartData<'radar'>
  options: ChartOptions<'radar'>
}

export default function RadarChartWrapper({ data, options }: RadarChartWrapperProps) {
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    const initChart = async () => {
      try {
        // Importer et initialiser Chart.js
        const { Chart: ChartJS } = await import('chart.js/auto')
        ChartJS.register()
        setChartReady(true)
      } catch (error) {
        console.error('Erreur lors de l\'initialisation de Chart.js:', error)
      }
    }

    if (typeof window !== 'undefined') {
      initChart()
    }
  }, [])

  if (!chartReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Initialisation de Chart.js...</div>
        </div>
      </div>
    )
  }

  return <Radar data={data} options={options} />
}
