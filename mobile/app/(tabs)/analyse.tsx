/**
 * Analyse — destination unique des données (P0-5)
 *
 * Fusionne `Dashboard`, `Analytics` et `Tracker`, qui occupaient trois places de
 * premier niveau pour une seule intention : voir ses données. Pour un coach,
 * « Dashboard » et « Analytics » sont des synonymes, et rien dans les libellés
 * ne disait que l'un portait l'assiduité et l'autre les stats de match.
 *
 * Les trois vues sont montées via un segmented control, sans changement de
 * route : l'état de chaque vue est conservé pendant la session, on ne recharge
 * pas en changeant de segment.
 *
 * Les anciennes routes `/dashboard`, `/analytics` et `/tracker` subsistent pour
 * ne casser aucun lien profond.
 */

import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { useIsTablet } from '../../hooks/useIsTablet';
import { Text } from '../../components/ui';
import { TeamDashboardView } from '../../components/TeamDashboardView';
import { AnalyticsView } from '../../components/AnalyticsView';
import { TrackerAnalyticsView } from '../../components/TrackerAnalyticsView';

type Segment = 'equipe' | 'joueurs' | 'matchs';

const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: 'equipe', label: 'Équipe', hint: "Vue d'ensemble, assiduité, dynamique" },
  { key: 'joueurs', label: 'Joueurs', hint: 'Statistiques individuelles et classements' },
  { key: 'matchs', label: 'Matchs', hint: 'Matchs enregistrés au tracker' },
];

export default function AnalyseScreen() {
  const { theme } = useTheme();
  const isTablet = useIsTablet();
  const [segment, setSegment] = useState<Segment>('equipe');
  const c = theme.colors;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg.canvas }}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: c.bg.sunken,
            borderRadius: theme.radius.md,
            padding: theme.space.xs,
            gap: theme.space.xs,
            marginHorizontal: theme.space.lg,
            marginTop: isTablet ? theme.space.md : theme.space.sm,
            marginBottom: theme.space.sm,
          },
        ]}
        accessibilityRole="tablist"
      >
        {SEGMENTS.map((seg) => {
          const active = seg.key === segment;
          return (
            <View key={seg.key} style={{ flex: 1 }}>
              <SegmentButton
                label={seg.label}
                hint={seg.hint}
                active={active}
                onPress={() => {
                  if (active) return;
                  haptics.select();
                  setSegment(seg.key);
                }}
              />
            </View>
          );
        })}
      </View>

      {/* Les trois vues restent montées : changer de segment ne recharge rien. */}
      <View style={{ flex: 1 }}>
        <Pane visible={segment === 'equipe'}><TeamDashboardView /></Pane>
        <Pane visible={segment === 'joueurs'}><AnalyticsView /></Pane>
        <Pane visible={segment === 'matchs'}>
          <TrackerAnalyticsView title="Matchs enregistrés" showRecordButton />
        </Pane>
      </View>
    </View>
  );
}

/**
 * Conserve la vue montée mais hors flux quand elle est masquée, afin de garder
 * son scroll, ses filtres et ses données sans refetch au retour.
 */
function Pane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <View
      style={[StyleSheet.absoluteFill, !visible && styles.hidden]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

function SegmentButton({
  label, hint, active, onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onTouchEnd={onPress}
      style={{
        borderRadius: theme.radius.sm,
        paddingVertical: theme.space.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? c.bg.surface : 'transparent',
        borderWidth: 1,
        borderColor: active ? c.border.subtle : 'transparent',
      }}
    >
      <Text variant="caption" tone={active ? 'primary' : 'secondary'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
  },
  hidden: {
    opacity: 0,
    zIndex: -1,
  },
});
