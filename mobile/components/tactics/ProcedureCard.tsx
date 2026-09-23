import { View, StyleSheet } from 'react-native';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Card, Text, Badge } from '../ui';
import { SchematicThumbnail } from './SchematicThumbnail';
import { phaseTone } from '../../lib/tactics/procedureTaxonomy';
import type { LibraryCard } from '../../lib/services/trainingProceduresService';

/**
 * Carte de la grille bibliothèque — même densité d'info que ProcedureCard/
 * .lib-card côté web (app/webapp/library/page.tsx) : vignette + titre + Bloc/
 * Phase de jeu si c'est un procédé avec fiche, badge "Sans fiche" sinon (cf
 * LibraryCard, qui unifie les deux cas — recadrage 2026-09-22).
 */
export function ProcedureCard({ card, onPress }: { card: LibraryCard; onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.colors;
  const s = useStyles();
  const proc = card.procedure;
  const sch = card.schematic;

  const bits = [
    proc?.rapport_numerique || '',
    proc?.duration_minutes ? `${proc.duration_minutes} min` : '',
  ].filter(Boolean);

  return (
    <Card variant="raised" padding="none" style={s.card} onPress={onPress} accessibilityLabel={card.title || 'Sans titre'}>
      <View style={[s.thumb, { backgroundColor: c.bg.sunken, borderBottomColor: c.border.subtle }]}>
        {sch ? (
          <SchematicThumbnail drill={sch.data} />
        ) : (
          <View style={s.noThumb}>
            <Text variant="caption" tone="tertiary">
              Pas de schéma
            </Text>
          </View>
        )}
      </View>
      <View style={s.meta}>
        <Text variant="callout" weight="600" numberOfLines={1}>
          {card.title || 'Sans titre'}
        </Text>
        {bits.length > 0 && (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {bits.join(' · ')}
          </Text>
        )}
        <View style={s.badgeRow}>
          {card.kind === 'schematic' ? (
            <Badge label="Sans fiche" tone="warning" size="sm" />
          ) : (
            <>
              {card.bloc && <Badge label={card.bloc} tone="neutral" size="sm" />}
              {card.theme && <Badge label={card.theme} tone={phaseTone(card.theme)} size="sm" />}
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { width: '47%', overflow: 'hidden' },
  thumb: { borderBottomWidth: StyleSheet.hairlineWidth },
  noThumb: { width: '100%', aspectRatio: 1.8, alignItems: 'center', justifyContent: 'center' },
  meta: { padding: t.space.md, gap: 3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginTop: 2 },
}));
