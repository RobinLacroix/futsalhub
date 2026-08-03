/**
 * Tableau de bilan joueur du match recorder (P1-3)
 *
 * Les deux recorders avaient chacun leur tableau, avec des colonnes et des
 * couleurs différentes pour les mêmes statistiques.
 *
 * ## Ce qui est corrigé, au-delà des couleurs
 *
 * - **Le tri était indiqué par une flèche Unicode collée au libellé** (`Buts ↓`),
 *   ce qui déplaçait le texte à chaque changement de colonne. Icône séparée,
 *   largeur réservée.
 * - **Les cartons étaient rendus en emoji** (`🟨×2`) en 8 px. Un emoji n'a pas
 *   de couleur garantie ni de nom accessible : c'est un pictogramme coloré.
 * - **Rien n'indiquait qu'un en-tête était cliquable.** `accessibilityRole` et
 *   l'état de tri sont annoncés.
 * - Les cellules n'étaient pas tabulaires : les chiffres sautaient d'une ligne
 *   à l'autre.
 */

import { useMemo, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { STAT_COLUMNS, type StatColumn, type StatRow } from './recorderModel';

export interface StatsTableProps {
  rows: StatRow[];
  /** Clés de `STAT_COLUMNS` à afficher, dans l'ordre. */
  columns?: string[];
}

const NAME_FLEX = 2.6;

export function StatsTable({ rows, columns }: StatsTableProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const [sortKey, setSortKey] = useState<string>('name');
  const [desc, setDesc] = useState(false);

  const shown: StatColumn[] = useMemo(
    () =>
      columns
        ? (columns.map((k) => STAT_COLUMNS.find((col) => col.key === k)).filter(Boolean) as StatColumn[])
        : STAT_COLUMNS,
    [columns]
  );

  const sorted = useMemo(() => {
    const dir = desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name, 'fr');
      const va = (a[sortKey as keyof StatRow] as number) ?? 0;
      const vb = (b[sortKey as keyof StatRow] as number) ?? 0;
      return dir * (va - vb);
    });
  }, [rows, sortKey, desc]);

  const toggleSort = (key: string) => {
    haptics.select();
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      // Une colonne chiffrée s'ouvre sur le meilleur en premier, un nom sur A.
      setDesc(key !== 'name');
    }
  };

  const SortIcon = ({ active }: { active: boolean }) =>
    active ? (
      <Ionicons
        name={desc ? 'arrow-down' : 'arrow-up'}
        size={11}
        color={c.accent.default}
        style={s.sortIcon}
      />
    ) : (
      <View style={s.sortIcon} />
    );

  return (
    <View>
      <View style={s.header}>
        <Pressable
          onPress={() => toggleSort('name')}
          style={[s.headerCell, { flex: NAME_FLEX }, s.headerCellName]}
          accessibilityRole="button"
          accessibilityLabel="Trier par nom"
          accessibilityState={{ selected: sortKey === 'name' }}
        >
          <Text variant="tableHeader" tone={sortKey === 'name' ? 'accent' : 'secondary'}>
            Joueur
          </Text>
          <SortIcon active={sortKey === 'name'} />
        </Pressable>

        {shown.map((col) => (
          <Pressable
            key={col.key}
            onPress={() => toggleSort(col.key)}
            style={s.headerCell}
            accessibilityRole="button"
            accessibilityLabel={`Trier par ${col.label}`}
            accessibilityState={{ selected: sortKey === col.key }}
          >
            <Text
              variant="tableHeader"
              color={sortKey === col.key ? c.accent.default : col.tone(c)}
              numberOfLines={1}
            >
              {col.short}
            </Text>
            <SortIcon active={sortKey === col.key} />
          </Pressable>
        ))}
      </View>

      {sorted.map((row, i) => (
        <View key={row.id} style={[s.row, i % 2 === 1 && s.rowAlt]}>
          <View style={[s.cell, { flex: NAME_FLEX }, s.cellName]}>
            <Text variant="tableCell" weight="600" numberOfLines={1}>
              {row.firstName.charAt(0)}. {row.lastName}
            </Text>
            {(row.yellowCards > 0 || row.redCards > 0) && (
              <View style={s.cards}>
                {row.yellowCards > 0 && (
                  <View
                    style={[s.cardChip, { backgroundColor: c.warning.default }]}
                    accessibilityLabel={`${row.yellowCards} carton jaune`}
                  >
                    <Text variant="caption" weight="700" color={c.bg.canvas} numeric>
                      {row.yellowCards}
                    </Text>
                  </View>
                )}
                {row.redCards > 0 && (
                  <View
                    style={[s.cardChip, { backgroundColor: c.negative.default }]}
                    accessibilityLabel={`${row.redCards} carton rouge`}
                  >
                    <Text variant="caption" weight="700" color={c.bg.canvas} numeric>
                      {row.redCards}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {shown.map((col) => {
            const raw = (row[col.key as keyof StatRow] as number) ?? 0;
            if (col.kind === 'time') {
              return (
                <Text key={col.key} variant="tableCell" numeric tone="secondary" style={s.cell}>
                  {formatSeconds(raw)}
                </Text>
              );
            }
            if (col.kind === 'plusminus') {
              const tone = raw > 0 ? c.positive.default : raw < 0 ? c.negative.default : c.text.tertiary;
              return (
                <Text key={col.key} variant="tableCell" numeric color={tone} style={s.cell}>
                  {raw > 0 ? `+${raw}` : raw}
                </Text>
              );
            }
            return (
              <Text
                key={col.key}
                variant="tableCell"
                numeric
                weight={raw > 0 ? '700' : '400'}
                color={raw > 0 ? col.tone(c) : c.text.tertiary}
                style={s.cell}
              >
                {raw}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Version défilante horizontalement, pour afficher toutes les colonnes sur téléphone. */
export function ScrollableStatsTable(props: StatsTableProps) {
  const s = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.scrollInner}>
      <View style={s.scrollWidth}>
        <StatsTable {...props} />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.xs,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.strong,
  },
  headerCell: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  headerCellName: { justifyContent: 'flex-start' },
  sortIcon: { width: 11 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radius.sm,
  },
  rowAlt: { backgroundColor: t.colors.bg.stripe },
  cell: { flex: 1, textAlign: 'center' },
  cellName: { gap: 2 },

  cards: { flexDirection: 'row', gap: t.space.xs },
  cardChip: {
    minWidth: 18,
    height: 16,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },

  scrollInner: { paddingBottom: t.space.sm },
  scrollWidth: { width: 620 },
}));
