/**
 * Grille de saisie des actions joueur (P1-3)
 *
 * ## Le compromis sur l'annulation
 *
 * L'annulation revient sur l'appui long, sans bouton dédié : c'est le choix de
 * Robin, et il est défendable ici parce que la contrepartie est payée
 * autrement. Le risque de l'appui long, c'est qu'un appui long raté devient un
 * ajout — l'inverse de ce qu'on voulait. Deux garde-fous :
 *
 * - **Chaque bouton porte son compteur pour le joueur sélectionné.** Le geste
 *   est donc vérifiable d'un coup d'œil : le chiffre descend, ou il monte. Sans
 *   ce compteur, l'appui long était un geste aveugle, et c'était ça le vrai
 *   défaut de la version d'origine.
 * - **Le retour haptique diffère** entre saisie et annulation, donc le doigt
 *   sait avant l'œil.
 *
 * Le mode `requiresPlayer` (but, cartons) désactive visiblement le bouton tant
 * qu'aucun joueur n'est choisi, au lieu d'ouvrir une alerte après coup.
 */

import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import { PLAYER_ACTIONS, type PlayerState, type RecorderAction } from './recorderModel';

export interface ActionPadProps {
  /** `null` = aucun joueur choisi : les actions nominatives sont bloquées. */
  selectedPlayerId: string | null;
  selectedPlayerName?: string;
  state?: PlayerState;
  onRecord: (action: RecorderAction) => void;
  onUndo: (action: RecorderAction) => void;
}

function countFor(action: RecorderAction, state?: PlayerState): number {
  if (!state) return 0;
  if (action.eventType === 'yellow_card') return state.yellowCards;
  if (action.eventType === 'red_card') return state.redCards;
  return state.stats[action.statKey] ?? 0;
}

export function ActionPad({
  selectedPlayerId,
  selectedPlayerName,
  state,
  onRecord,
  onUndo,
}: ActionPadProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <View style={s.grid}>
      {PLAYER_ACTIONS.map((a) => {
        const blocked = a.requiresPlayer && !selectedPlayerId;
        const count = countFor(a, state);
        const tone = a.tone(c);
        return (
          <Pressable
            key={a.eventType}
            onPress={() => onRecord(a)}
            onLongPress={() => {
              if (count > 0) {
                haptics.tapMedium();
                onUndo(a);
              }
            }}
            delayLongPress={350}
            disabled={blocked}
            style={({ pressed }) => [
              s.action,
              { borderColor: tone },
              count > 0 && { backgroundColor: c.bg.surface },
              blocked && s.blocked,
              pressed && s.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            accessibilityLabel={
              blocked
                ? `${a.label}, indisponible : sélectionnez d'abord un joueur`
                : `${a.label}${selectedPlayerName ? ` pour ${selectedPlayerName}` : ''}. ${count} enregistré${count > 1 ? 's' : ''}`
            }
            accessibilityHint="Appui long pour annuler la dernière"
          >
            <Ionicons name={a.icon} size={19} color={tone} />
            <Text variant="caption" weight="600" numberOfLines={1} style={s.label}>
              {a.short}
            </Text>
            <View style={[s.count, count > 0 && { backgroundColor: tone }]}>
              <Text
                variant="caption"
                weight="700"
                numeric
                color={count > 0 ? c.bg.canvas : c.text.tertiary}
              >
                {count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },

  /**
   * Quatre par ligne sur un iPhone standard : `flexBasis: 22%` laisse jouer les
   * `gap`, et `flexGrow` absorbe le reliquat. Une cible de ~80 × 58 pt, bien
   * au-delà des 44 pt de la HIG.
   */
  action: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: t.space.xs,
    paddingHorizontal: 2,
    borderRadius: t.radius.md,
    borderWidth: 1.5,
    backgroundColor: t.colors.bg.canvas,
  },
  label: { textAlign: 'center', maxWidth: '100%' },
  count: {
    minWidth: 20,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bg.sunken,
  },

  blocked: { opacity: 0.32 },
  pressed: { opacity: 0.65 },
}));
