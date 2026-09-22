'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, ReferenceLine, Tooltip, XAxis } from 'recharts'
import { buildMomentumSeries, type MomentumEvent } from '@/lib/matchMomentum'

/**
 * Graphique de momentum, partagé entre le bilan post-match
 * (`tracker/match-report/[matchId]/page.tsx`) et le récap live du recorder
 * (`tracker/matchrecorder/components/LiveSummary.tsx`). Un seul composant :
 * pas de style de carte imposé (chaque appelant a sa propre charte — report en
 * clair façon PDF, recorder en clair/sombre) donc le composant ne rend que le
 * graphique + légende, pas de wrapper `bg-*`.
 *
 * En live, la normalisation se refait à chaque render sur le max observé
 * jusqu'ici : les premières minutes peuvent donc paraître "au maximum" puis se
 * retasser une fois le match plus fourni en événements. C'est attendu — c'est
 * un indice relatif au match, pas une échelle absolue calibrée entre matchs.
 *
 * La durée de mi-temps n'est plus une prop nominale : elle vient de
 * `buildMomentumSeries` (temps coulé réel, voir `lib/matchMomentum.ts`). Pas
 * de repère de mi-temps tant qu'aucun event de 2ème MT n'existe — sinon,
 * pendant la 1ère MT, `halfDurations.h1` bouge à chaque event et positionnerait
 * un repère qui recule sans arrêt au lieu de n'apparaître qu'une fois la
 * mi-temps réellement passée.
 */

interface MatchMomentumChartProps {
  events: MomentumEvent[]
  /** Minute jusqu'à laquelle calculer/afficher. Omis = match entier (post-match). */
  upToMinute?: number
  teamName?: string
  opponentName?: string
  usColor?: string
  opponentColor?: string
  gridColor?: string
  textColor?: string
  height?: number
  /** Affiche un badge "en direct" à côté de la légende. */
  live?: boolean
}

export function MatchMomentumChart({
  events,
  upToMinute,
  teamName = 'Nous',
  opponentName = 'Adversaire',
  usColor = '#10B981',
  opponentColor = '#EF4444',
  gridColor = '#E5E7EB',
  textColor = '#9CA3AF',
  height = 150,
  live = false,
}: MatchMomentumChartProps) {
  const { points, dominantSpans, halfDurations } = buildMomentumSeries(events, upToMinute)
  const half2Started = events.some(e => e.half === 2)

  if (points.length === 0 || points.every(p => p.value === 0)) {
    return (
      <p className="text-xs italic" style={{ color: textColor }}>
        Pas encore assez d&apos;événements pour calculer le momentum.
      </p>
    )
  }

  const data = points.map(p => ({ minute: p.minute, momentum: p.value }))
  const topSpans = dominantSpans.slice(0, 2)
  const tickStep = Math.max(1, Math.round(data.length / 10))

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap="10%" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="minute"
            tick={{ fontSize: 10, fill: textColor }}
            axisLine={false}
            tickLine={false}
            interval={tickStep - 1}
            tickFormatter={(m: number) => `${m}'`}
          />
          <ReferenceLine y={0} stroke={gridColor} />
          <Tooltip
            formatter={(value: number) => [
              `${Math.round(Math.abs(value) * 100)}%`,
              value >= 0 ? teamName : opponentName,
            ]}
            labelFormatter={(m: number) => `${m}e minute`}
            contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 12 }}
          />
          <Bar dataKey="momentum" radius={[2, 2, 2, 2]} isAnimationActive={!live}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.momentum >= 0 ? usColor : opponentColor} />
            ))}
          </Bar>
          {/* Après le Bar, pas avant : Recharts peint dans l'ordre du JSX, une
              ReferenceLine placée avant le Bar se retrouve sous des barres
              opaques et devient invisible pile à la minute qui l'intéresse. */}
          {half2Started && (
            <ReferenceLine
              x={Math.round(halfDurations.h1)}
              stroke={textColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              label={{ value: 'MT', position: 'insideTopRight', fontSize: 10, fill: textColor }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-6 mt-2 text-xs" style={{ color: textColor }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: usColor }} />
          {teamName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: opponentColor }} />
          {opponentName}
        </span>
        {live && (
          <span className="flex items-center gap-1 text-amber-500 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            en direct
          </span>
        )}
      </div>

      {topSpans.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-center" style={{ color: textColor }}>
          {topSpans.map((s, i) => (
            <li key={i}>
              Domination {s.team === 'us' ? teamName : opponentName} : {Math.floor(s.startMinute)}&apos;–{Math.ceil(s.endMinute)}&apos;
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
