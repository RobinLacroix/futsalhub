/**
 * Échelle de 1 à 10 du questionnaire de séance (P1-7)
 *
 * ## Le bug de sens que ça corrige
 *
 * L'ancienne version colorait les dix cases d'un dégradé vert → rouge, et
 * l'appliquait **aussi au RPE** :
 *
 *     const s = reverse ? 11 - n : n;
 *     const color = s <= 3 ? green : s <= 6 ? amber : s <= 8 ? orange : red;
 *
 * Pour l'auto-évaluation, le plaisir et la forme, c'est juste : 10 est bon,
 * 1 est mauvais. **Pour le RPE, c'est un contresens.** Le RPE mesure
 * l'intensité perçue de l'effort — un 9 n'est pas une mauvaise note, c'est une
 * séance dure. L'afficher en rouge dit au joueur qu'il a mal fait.
 *
 * Ce n'est pas cosmétique : le RPE sert à surveiller la charge. Un joueur qui
 * lit « rouge = mauvais » apprend à sous-déclarer, et la charge d'entraînement
 * mesurée devient fausse dans le sens qui fait rater les pics — donc le sens
 * qui fait rater les blessures.
 *
 * Deux barèmes distincts, donc :
 *
 * - `judgement` : dégradé négatif → positif. Une note basse est un problème.
 * - `intensity` : dégradé neutre → soutenu, sans jugement. Une note haute est
 *   une information, pas un reproche.
 *
 * ## Le reste
 *
 * Les dix cases faisaient 30 pt de large sur un iPhone, pour l'interaction
 * principale du seul formulaire que remplissent les joueurs. Elles passent sur
 * deux rangées de cinq, à ~62 × 44 pt.
 */

import { View, Pressable } from 'react-native';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import type { ThemeColors } from '../../lib/design/tokens';

export type ScaleKind = 'judgement' | 'intensity';

export interface ScaleSelectorProps {
  label: string;
  description: string;
  lowLabel: string;
  highLabel: string;
  value: number | null;
  onChange: (n: number) => void;
  kind: ScaleKind;
}

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function toneFor(kind: ScaleKind, n: number, c: ThemeColors): string {
  if (kind === 'intensity') {
    // Rampe neutre → accent : plus c'est soutenu, plus c'est marqué. Aucun
    // pôle n'est « bon » ou « mauvais ».
    if (n <= 3) return c.neutralData;
    if (n <= 7) return c.accent.default;
    return c.accent.fill;
  }
  if (n <= 3) return c.negative.default;
  if (n <= 6) return c.warning.default;
  return c.positive.default;
}

export function ScaleSelector({
  label,
  description,
  lowLabel,
  highLabel,
  value,
  onChange,
  kind,
}: ScaleSelectorProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="headline">{label}</Text>
      <Text variant="callout" tone="secondary">
        {description}
      </Text>

      <View style={s.grid}>
        {VALUES.map((n) => {
          const active = value === n;
          const tone = toneFor(kind, n, c);
          return (
            <Pressable
              key={n}
              onPress={() => {
                haptics.select();
                onChange(n);
              }}
              style={({ pressed }) => [
                s.cell,
                active && { backgroundColor: tone, borderColor: tone },
                pressed && s.pressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={`${n} sur 10${n === 1 ? `, ${lowLabel}` : n === 10 ? `, ${highLabel}` : ''}`}
            >
              <Text
                variant="headline"
                numeric
                color={active ? c.bg.canvas : c.text.secondary}
                weight={active ? '700' : '500'}
              >
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.legend}>
        <Text variant="caption" tone="tertiary" numberOfLines={1} style={s.flex}>
          1 · {lowLabel}
        </Text>
        <Text variant="caption" tone="tertiary" numberOfLines={1} style={s.legendRight}>
          {highLabel} · 10
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },

  wrap: {
    gap: t.space.sm,
    padding: t.space.lg,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
  },

  // Deux rangées de cinq : dix cases sur une ligne donnaient 30 pt de large.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginTop: t.space.xs },
  cell: {
    flexGrow: 1,
    flexBasis: '17%',
    minHeight: HIT_SLOP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.sm,
    borderWidth: 1.5,
    borderColor: t.colors.border.subtle,
    backgroundColor: t.colors.bg.canvas,
  },

  legend: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  legendRight: { flex: 1, textAlign: 'right' },
}));
