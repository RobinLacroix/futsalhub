import { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Sheet, Card, Text, Badge, EmptyState, Input } from '../ui';
import { FilterChip } from '../tactics/FilterChip';
import { FORMATS, PHASES_DE_JEU, INTENSITES } from '../../lib/tactics/procedureTaxonomy';
import type {
  TrainingProcedureRecord,
  TrainingProcedureType,
  TrainingProcedureTheme,
  TrainingProcedureIntensite,
} from '../../lib/services/trainingProceduresService';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Choix d'un procédé (fiche pédagogique) pour un bloc de séance — miroir de
 * ProcedurePickerDialog.tsx côté web : recherche texte + filtres à facettes
 * (type/thème/intensité/principes) repliés par défaut.
 */
export function ProcedurePickerSheet({
  visible,
  onClose,
  procedures,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  procedures: TrainingProcedureRecord[];
  onSelect: (procedureId: string) => void;
}) {
  const { theme } = useTheme();
  const s = useStyles();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [types, setTypes] = useState<TrainingProcedureType[]>([]);
  const [themes, setThemes] = useState<TrainingProcedureTheme[]>([]);
  const [intensites, setIntensites] = useState<TrainingProcedureIntensite[]>([]);
  const [principes, setPrincipes] = useState<string[]>([]);

  const availablePrincipes = useMemo(() => {
    const set = new Set<string>();
    procedures.forEach((p) => (p.principes || []).forEach((x) => x && set.add(x)));
    return Array.from(set).sort();
  }, [procedures]);

  const activeFilterCount = types.length + themes.length + intensites.length + principes.length;

  const filtered = useMemo(() => {
    const q = norm(search);
    return procedures.filter((p) => {
      if (types.length && !types.includes(p.type)) return false;
      if (themes.length && !themes.includes(p.theme)) return false;
      if (intensites.length && (!p.intensite || !intensites.includes(p.intensite))) return false;
      if (principes.length && !(p.principes || []).some((x) => principes.includes(x))) return false;
      if (q && !norm(p.title).includes(q) && !norm(p.theme || '').includes(q)) return false;
      return true;
    });
  }, [procedures, search, types, themes, intensites, principes]);

  const resetFilters = () => {
    setTypes([]);
    setThemes([]);
    setIntensites([]);
    setPrincipes([]);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Choisir un procédé" maxHeight="85%">
      <View style={s.searchRow}>
        <Input label="Rechercher" value={search} onChangeText={setSearch} placeholder="Titre, phase de jeu…" containerStyle={s.searchField} />
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Filtres"
          style={[s.filterBtn, { borderColor: theme.colors.border.subtle, backgroundColor: theme.colors.bg.surface }]}
        >
          <Ionicons name="options-outline" size={18} color={theme.colors.text.secondary} />
          {activeFilterCount > 0 && (
            <View style={[s.filterBadge, { backgroundColor: theme.colors.accent.fill }]}>
              <Text variant="caption" tone="onFill" numeric>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {showFilters && (
        <View style={[s.filterPanel, { backgroundColor: theme.colors.bg.sunken, borderColor: theme.colors.border.subtle }]}>
          <Text variant="caption" tone="tertiary" weight="600">TYPE</Text>
          <View style={s.chipRow}>
            {FORMATS.map((t) => (
              <FilterChip key={t} label={t} active={types.includes(t)} onPress={() => setTypes(toggle(types, t))} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">PHASE DE JEU</Text>
          <View style={s.chipRow}>
            {PHASES_DE_JEU.map((t) => (
              <FilterChip key={t} label={t} active={themes.includes(t)} onPress={() => setThemes(toggle(themes, t))} />
            ))}
          </View>
          <Text variant="caption" tone="tertiary" weight="600">INTENSITÉ</Text>
          <View style={s.chipRow}>
            {INTENSITES.map((t) => (
              <FilterChip key={t} label={t} active={intensites.includes(t)} onPress={() => setIntensites(toggle(intensites, t))} />
            ))}
          </View>
          {availablePrincipes.length > 0 && (
            <>
              <Text variant="caption" tone="tertiary" weight="600">PRINCIPES</Text>
              <View style={s.chipRow}>
                {availablePrincipes.map((p) => (
                  <FilterChip key={p} label={p} active={principes.includes(p)} onPress={() => setPrincipes(toggle(principes, p))} />
                ))}
              </View>
            </>
          )}
          {activeFilterCount > 0 && (
            <Pressable onPress={resetFilters}>
              <Text variant="caption" tone="accent">Réinitialiser les filtres</Text>
            </Pressable>
          )}
        </View>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Aucun procédé" description="Essaie un autre titre ou élargis les filtres." compact />
      ) : (
        <View style={{ gap: theme.space.sm }}>
          {filtered.map((p) => (
            <Card
              key={p.id}
              variant="flat"
              padding="md"
              onPress={() => {
                onSelect(p.id);
                onClose();
              }}
              accessibilityLabel={p.title || 'Sans titre'}
              style={{ gap: theme.space.xs }}
            >
              <Text variant="headline" numberOfLines={1}>{p.title || 'Sans titre'}</Text>
              <View style={{ flexDirection: 'row', gap: theme.space.xs, flexWrap: 'wrap' }}>
                <Badge label={p.type} tone="neutral" size="sm" />
                <Badge label={p.theme} tone="neutral" size="sm" />
                {p.intensite && <Badge label={p.intensite} tone="neutral" size="sm" />}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((t) => ({
  searchRow: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.sm, marginBottom: t.space.md },
  searchField: { flex: 1 },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterPanel: {
    borderWidth: 1,
    borderRadius: t.radius.md,
    padding: t.space.md,
    gap: t.space.sm,
    marginBottom: t.space.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
