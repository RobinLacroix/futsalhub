import { View, StyleSheet } from 'react-native';
import { makeStyles } from '../../contexts/ThemeContext';
import { Text } from '../ui';
import { blockMeta } from '../../lib/tactics/sessionBlocks';
import type { SessionBlock } from '../../lib/services/sessionsService';

/** Barre segmentée proportionnelle aux blocs réellement présents — pas 6 cases fixes, une séance de veille de match n'a que 4 blocs. */
export function SessionTimeline({ blocks }: { blocks: SessionBlock[] }) {
  const s = useStyles();
  const total = blocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  if (blocks.length === 0) {
    return (
      <Text variant="caption" tone="tertiary">
        Ajoute un premier bloc pour voir la timeline de la séance.
      </Text>
    );
  }

  return (
    <View>
      <View style={s.track}>
        {blocks.map((b) => {
          const meta = blockMeta(b.type);
          const pct = total > 0 ? (b.duration / total) * 100 : 0;
          return (
            <View key={b.id} style={[s.segment, { flex: b.duration || 0.001, backgroundColor: meta.color }]}>
              {pct > 12 ? (
                <Text variant="caption" tone="onFill" weight="700" numberOfLines={1}>
                  {b.duration}&apos;
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text variant="caption" tone="tertiary" style={s.caption}>
        {total} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    height: 22,
    borderRadius: t.radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border.subtle,
  },
  segment: { alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: t.space.xs },
}));
