/**
 * SeasonHeaderButton — sélecteur de saison des barres de navigation (P0-7)
 *
 * Avant la refonte, ce composant supposait toujours un header à aplat coloré :
 * texte `#fff` sur `rgba(255,255,255,0.15)`. Depuis que `(tabs)/_layout` rend un
 * header natif sur `bg.canvas`, cette combinaison est invisible en thème clair
 * (rapport de contraste ~1.05:1). D'où deux tons explicites, plutôt qu'un ton
 * implicite qui casse dès que son hôte change :
 *
 *   - `surface`  : par défaut. Lit le thème, tient sur canvas comme sur surface.
 *   - `onColor`  : réservé aux headers encore à aplat coloré, non migrés
 *                  (calendar, squad, player-tabs, en-tête navy de PlayerDetailView).
 *                  À supprimer quand ces quatre écrans passeront sur les tokens.
 *
 * Corrections d'usage apportées au passage :
 *   - une seule saison disponible => rendu non tactile, sans chevron. Avant, le
 *     bouton restait pressable et n'ouvrait rien : affordance mensongère.
 *   - saison passée signalée en `warning` (et non en ambre littéral) : c'est
 *     exactement le rôle sémantique du ton, « tu regardes des données qui ne
 *     sont pas celles de la saison en cours ».
 *   - zone tactile portée à 44 pt (HIG), et libellé d'accessibilité renseigné.
 *   - la modale roulée à la main est remplacée par `Sheet`.
 */

import { useState } from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useTheme } from '../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';
import { Text, Sheet, Badge } from './ui';

export type SeasonHeaderButtonTone = 'surface' | 'onColor';

export interface SeasonHeaderButtonProps {
  /** Fond sur lequel le bouton est posé. Voir l'en-tête de fichier. */
  tone?: SeasonHeaderButtonTone;
  style?: ViewStyle;
}

/** Hauteur de la pastille, et compensation pour atteindre les 44 pt HIG. */
const PILL_HEIGHT = 30;
const SLOP = Math.max(0, Math.round((HIT_SLOP_MIN - PILL_HEIGHT) / 2));

export function SeasonHeaderButton({ tone = 'surface', style }: SeasonHeaderButtonProps) {
  const { activeSeason, clubSeason, availableSeasons, changeActiveSeason } = useActiveSeason();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  const c = theme.colors;
  const isPast = activeSeason !== clubSeason;
  const canSwitch = availableSeasons.length > 1;

  // Le ton `onColor` ne peut pas lire le thème : son hôte est un aplat opaque
  // qui ne suit pas le mode clair/sombre. Valeurs figées, assumées, temporaires.
  const palette =
    tone === 'onColor'
      ? {
          bg: isPast ? 'rgba(251,191,36,0.28)' : 'rgba(255,255,255,0.18)',
          border: isPast ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.28)',
          fg: isPast ? '#FDE68A' : '#FFFFFF',
        }
      : {
          bg: isPast ? c.warning.subtle : c.accent.subtle,
          border: isPast ? c.warning.default : c.accent.border,
          fg: isPast ? c.warning.default : c.accent.default,
        };

  const openPicker = () => {
    haptics.tapLight();
    setOpen(true);
  };

  const pick = (season: string) => {
    haptics.select();
    changeActiveSeason(season);
    setOpen(false);
  };

  const pillStyle: ViewStyle = {
    backgroundColor: palette.bg,
    borderColor: palette.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.md,
    gap: theme.space.xs,
  };

  const content = (
    <>
      <Ionicons name="calendar-outline" size={13} color={palette.fg} />
      <Text variant="caption" color={palette.fg} weight="700" numeric>
        {activeSeason}
      </Text>
      {canSwitch && <Ionicons name="chevron-down" size={12} color={palette.fg} />}
    </>
  );

  // Une seule saison : information, pas commande. Pas de rôle bouton.
  if (!canSwitch) {
    return (
      <View
        style={[styles.pill, pillStyle, style]}
        accessible
        accessibilityLabel={`Saison ${activeSeason}`}
      >
        {content}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={openPicker}
        hitSlop={{ top: SLOP, bottom: SLOP, left: SLOP, right: SLOP }}
        accessibilityRole="button"
        accessibilityLabel={`Saison ${activeSeason}${isPast ? ', saison passée' : ''}`}
        accessibilityHint="Ouvre la liste des saisons disponibles"
        style={({ pressed }) => [styles.pill, pillStyle, pressed && styles.pressed, style]}
      >
        {content}
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Choisir une saison"
        subtitle="Les données affichées suivent la saison sélectionnée."
      >
        {availableSeasons.map((s) => {
          const selected = s === activeSeason;
          return (
            <Pressable
              key={s}
              onPress={() => pick(s)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Saison ${s}${s === clubSeason ? ', saison en cours du club' : ''}`}
              style={({ pressed }) => [
                styles.row,
                {
                  borderRadius: theme.radius.md,
                  paddingHorizontal: theme.space.lg,
                  paddingVertical: theme.space.md,
                  gap: theme.space.md,
                  backgroundColor: selected ? c.accent.subtle : 'transparent',
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={selected ? c.accent.default : c.text.tertiary}
              />
              <Text
                variant="body"
                tone={selected ? 'accent' : 'primary'}
                weight={selected ? '600' : '400'}
                numeric
                style={styles.rowLabel}
              >
                {s}
              </Text>
              {s === clubSeason && <Badge label="En cours" tone="positive" size="sm" />}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    height: PILL_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: { flex: 1 },
});
