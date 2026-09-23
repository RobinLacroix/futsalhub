/**
 * MomentumChart — barres divergentes par minute, sur flexbox pur (P1-2)
 *
 * Pas de `react-native-svg` ici, volontairement, malgré `LineChart.tsx` juste
 * à côté : une barre par minute avec une hauteur proportionnelle est un cas
 * flexbox natif (deux moitiés de colonne, `justifyContent: 'flex-end'` /
 * `'flex-start'` de part et d'autre d'une ligne médiane) — ajouter du SVG pour
 * ça serait de la complexité gratuite. `LineChart` en a besoin parce qu'une
 * courbe lissée (Catmull-Rom → Bézier) n'a pas d'équivalent flexbox.
 *
 * Composant volontairement sans couleurs de thème imposées (contrairement au
 * reste de `components/charts`) : ses deux appelants ont des chartes visuelles
 * différentes — le bilan post-match (`app/(tabs)/tracker/match-report`) est en
 * sombre codé en dur, le récap live du recorder est sur les tokens de
 * `ThemeContext`. Chacun passe ses propres couleurs plutôt que le composant
 * n'en impose une.
 *
 * La durée de mi-temps n'est plus une prop nominale : elle vient de
 * `buildMomentumSeries` (temps coulé réel, voir `lib/matchMomentum.ts`). Pas
 * de repère de mi-temps tant qu'aucun event de 2ème MT n'existe — sinon,
 * pendant la 1ère MT, la durée déduite bouge à chaque event et positionnerait
 * un repère qui recule sans arrêt au lieu de n'apparaître qu'une fois la
 * mi-temps réellement passée.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { buildMomentumSeries, type MomentumEvent } from '../../lib/matchMomentum';

export interface MomentumChartProps {
  events: MomentumEvent[];
  /** Minute jusqu'à laquelle calculer/afficher. Omis = match entier (post-match). */
  upToMinute?: number;
  teamName?: string;
  opponentName?: string;
  usColor?: string;
  opponentColor?: string;
  gridColor?: string;
  textColor?: string;
  /** Hauteur totale (les deux moitiés, au-dessus et en-dessous de l'axe). */
  height?: number;
  /** Affiche un badge « en direct » à côté de la légende. */
  live?: boolean;
}

export function MomentumChart({
  events,
  upToMinute,
  teamName = 'Nous',
  opponentName = 'Adversaire',
  usColor = '#10B981',
  opponentColor = '#EF4444',
  gridColor = 'rgba(255,255,255,0.12)',
  textColor = '#9CA3AF',
  height = 100,
  live = false,
}: MomentumChartProps) {
  const [width, setWidth] = useState(0);

  const { points, dominantSpans, halfDurations } = buildMomentumSeries(events, upToMinute);
  const half2Started = events.some((e) => e.half === 2);

  if (points.length === 0 || points.every((p) => p.value === 0)) {
    return (
      <Text style={[styles.empty, { color: textColor }]}>
        Pas encore assez d&apos;événements pour calculer le momentum.
      </Text>
    );
  }

  const half = height / 2;
  const barW = width > 0 ? width / points.length : 0;
  const halfTimeX = (halfDurations.h1 / points.length) * width;
  const topSpans = dominantSpans.slice(0, 2);

  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.chart, { height }]}
      >
        {/* Axe zéro : peu de recouvrement possible (les barres partent de là),
            peut rester sous les barres. */}
        <View style={[styles.zeroLine, { top: half, backgroundColor: gridColor }]} />

        {width > 0 &&
          points.map((p) => (
            <View key={p.minute} style={{ width: barW, height }}>
              <View style={[styles.halfCell, styles.halfCellTop]}>
                {p.value > 0 && (
                  <View
                    style={[
                      styles.bar,
                      { height: p.value * half, backgroundColor: usColor },
                    ]}
                  />
                )}
              </View>
              <View style={[styles.halfCell, styles.halfCellBottom]}>
                {p.value < 0 && (
                  <View
                    style={[
                      styles.bar,
                      { height: -p.value * half, backgroundColor: opponentColor },
                    ]}
                  />
                )}
              </View>
            </View>
          ))}

        {/* Repère mi-temps : rendu APRÈS les barres, pas avant — une vue
            absolue placée avant ses frères peint dessous en React Native
            comme sur le web, et se retrouvait invisible pile sous la barre de
            la minute qui l'intéresse. */}
        {width > 0 && half2Started && (
          <>
            <View
              pointerEvents="none"
              style={[styles.halfLine, { left: halfTimeX - 1, backgroundColor: textColor }]}
            />
            <Text
              pointerEvents="none"
              style={[styles.halfLabel, { left: Math.min(halfTimeX + 3, width - 20), color: textColor }]}
            >
              MT
            </Text>
          </>
        )}
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: usColor }]} />
          <Text style={[styles.legendText, { color: textColor }]}>{teamName}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: opponentColor }]} />
          <Text style={[styles.legendText, { color: textColor }]}>{opponentName}</Text>
        </View>
        {live && (
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.liveDot]} />
            <Text style={[styles.legendText, styles.liveText]}>en direct</Text>
          </View>
        )}
      </View>

      {topSpans.length > 0 && (
        <View style={styles.spans}>
          {topSpans.map((s, i) => (
            <Text key={i} style={[styles.spanText, { color: textColor }]}>
              Domination {s.team === 'us' ? teamName : opponentName} : {Math.floor(s.startMinute)}&apos;–{Math.ceil(s.endMinute)}&apos;
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', width: '100%' },
  zeroLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  // Trait plein, pas pointillé : `borderStyle: 'dashed'` sur un seul côté est
  // connu pour ne pas se rendre de façon fiable sur Android selon la version
  // de RN. Un trait plein et plus épais reste une démarcation nette.
  halfLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  halfLabel: { position: 'absolute', top: 1, fontSize: 9, fontWeight: '700' },
  halfCell: { flex: 1, paddingHorizontal: 1 },
  halfCellTop: { justifyContent: 'flex-end' },
  halfCellBottom: { justifyContent: 'flex-start' },
  bar: { width: '100%', borderRadius: 2, minHeight: 1 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  liveDot: { backgroundColor: '#FFB020' },
  liveText: { fontSize: 11, color: '#FFB020', fontWeight: '700' },
  spans: { marginTop: 6, alignItems: 'center', gap: 2 },
  spanText: { fontSize: 11 },
  empty: { fontSize: 11, fontStyle: 'italic' },
});
