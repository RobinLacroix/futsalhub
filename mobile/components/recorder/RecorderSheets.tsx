/**
 * Feuilles modales du match recorder (P1-3)
 *
 * Les trois versions précédentes étaient des `Modal` montés à la main avec un
 * `TouchableWithoutFeedback` imbriqué pour bloquer la propagation. La tablette
 * avait dû ajouter un `modalOpenedAtRef` pour ignorer le « ghost tap » — le
 * doigt levé du bouton d'ouverture qui traversait l'overlay et refermait la
 * feuille aussitôt. C'est un symptôme, pas un bug isolé : la primitive `Sheet`
 * gère déjà ça, et le glisser-pour-fermer avec.
 */


import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text, Sheet, EmptyState, Button } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { GOAL_TYPES, isGoalkeeper, playerDisplayName, type PlayerState } from './recorderModel';
import type { GoalType } from '../../lib/services/matchEvents';
import type { Player } from '../../types';

// ─── Choix du remplaçant ─────────────────────────────────────────────────────

export interface SubstitutionSheetProps {
  /** Joueur sortant. `null` ferme la feuille. */
  outgoing: Player | null;
  bench: Player[];
  playerStates: Record<string, PlayerState>;
  onSubstitute: (outId: string, inId: string) => void;
  onClose: () => void;
}

export function SubstitutionSheet({
  outgoing,
  bench,
  playerStates,
  onSubstitute,
  onClose,
}: SubstitutionSheetProps) {
  const s = useStyles();
  const { theme } = useTheme();

  // Le banc est trié par temps de jeu croissant : la question du coach est
  // « qui a le moins joué », pas « qui vient en premier dans la liste ».
  const sorted = [...bench].sort(
    (a, b) => (playerStates[a.id]?.totalTime ?? 0) - (playerStates[b.id]?.totalTime ?? 0)
  );

  return (
    <Sheet
      visible={!!outgoing}
      onClose={onClose}
      title={outgoing ? `Remplacer ${outgoing.first_name} ${outgoing.last_name}` : ''}
      subtitle="Banc trié par temps de jeu, le moins utilisé en premier"
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Banc vide"
          description="Tous les joueurs convoqués sont sur le terrain."
          compact
        />
      ) : (
        sorted.map((p) => {
          const st = playerStates[p.id];
          const gk = isGoalkeeper(p.position);
          return (
            <Pressable
              key={p.id}
              onPress={() => outgoing && onSubstitute(outgoing.id, p.id)}
              style={({ pressed }) => [s.row, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Faire entrer ${p.first_name} ${p.last_name}, ${formatSeconds(st?.totalTime ?? 0)} joué`}
            >
              <View style={s.rowMain}>
                <View style={s.rowTitle}>
                  {gk && <Ionicons name="hand-left" size={14} color={theme.colors.warning.default} />}
                  <Text variant="body" weight="600" numberOfLines={1}>
                    {p.first_name} {p.last_name}
                  </Text>
                </View>
                <Text variant="caption" tone="secondary" numeric>
                  {formatSeconds(st?.totalTime ?? 0)} de jeu
                </Text>
              </View>
              <Ionicons name="swap-horizontal" size={22} color={theme.colors.accent.default} />
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}

// ─── Type de but ─────────────────────────────────────────────────────────────

export interface GoalTypeSheetProps {
  visible: boolean;
  conceded: boolean;
  scorerName?: string | null;
  onSelect: (type: GoalType) => void;
  onClose: () => void;
}

export function GoalTypeSheet({
  visible,
  conceded,
  scorerName,
  onSelect,
  onClose,
}: GoalTypeSheetProps) {
  const s = useStyles();
  const { theme } = useTheme();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={conceded ? 'But encaissé' : 'But marqué'}
      subtitle={
        conceded
          ? "Dans quelle phase l'adversaire a-t-il marqué ?"
          : scorerName
            ? `Buteur : ${scorerName}. Dans quelle phase ?`
            : 'Dans quelle phase le but a-t-il été marqué ?'
      }
    >
      {GOAL_TYPES.map((g) => (
        <Pressable
          key={g.value}
          onPress={() => onSelect(g.value)}
          style={({ pressed }) => [s.row, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={g.label}
        >
          <View style={s.goalIcon}>
            <Ionicons name={g.icon} size={18} color={theme.colors.accent.default} />
          </View>
          <Text variant="body" weight="600" style={s.flex}>
            {g.label}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
        </Pressable>
      ))}
    </Sheet>
  );
}

// ─── Correction du score ─────────────────────────────────────────────────────

export interface ScoreSheetProps {
  visible: boolean;
  scoreUs: number;
  scoreOpponent: number;
  onChangeUs: (n: number) => void;
  onChangeOpponent: (n: number) => void;
  onClose: () => void;
}

/**
 * Corriger le score ici ne touche PAS aux événements : c'est une correction
 * d'affichage, l'historique des buts reste ce qu'il est. La feuille le dit,
 * parce que rien ne l'indiquait avant et que les deux chiffres finissaient par
 * diverger sans explication.
 */
export function ScoreSheet({
  visible,
  scoreUs,
  scoreOpponent,
  onChangeUs,
  onChangeOpponent,
  onClose,
}: ScoreSheetProps) {
  const s = useStyles();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Corriger le score"
      subtitle="Ajuste l'affichage sans modifier les buts déjà enregistrés"
    >
      <View style={s.scoreRow}>
        <ScoreStepper label="Notre équipe" value={scoreUs} onChange={onChangeUs} />
        <ScoreStepper label="Adversaire" value={scoreOpponent} onChange={onChangeOpponent} />
      </View>
      <Button label="Terminé" onPress={onClose} block />
    </Sheet>
  );
}

function ScoreStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  return (
    <View style={s.scoreCol}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <View style={s.scoreControls}>
        <Pressable
          onPress={() => {
            haptics.tapLight();
            onChange(Math.max(0, value - 1));
          }}
          disabled={value === 0}
          style={({ pressed }) => [s.stepper, value === 0 && s.disabled, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Retirer un but, ${label}`}
        >
          <Ionicons name="remove" size={22} color={theme.colors.text.primary} />
        </Pressable>
        <Text variant="display" numeric style={s.scoreValue}>
          {value}
        </Text>
        <Pressable
          onPress={() => {
            haptics.tapLight();
            onChange(value + 1);
          }}
          style={({ pressed }) => [s.stepper, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter un but, ${label}`}
        >
          <Ionicons name="add" size={22} color={theme.colors.text.primary} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Sélection du joueur pour une action ─────────────────────────────────────

export interface PlayerPickerProps {
  players: Player[];
  /** Effectif complet, pour désambiguïser les homonymes. */
  squad: Player[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  playerStates: Record<string, PlayerState>;
}

/**
 * Cinq joueurs sur une seule ligne, toujours.
 *
 * La version précédente donnait `minWidth: 78` à chaque pastille : sur un
 * iPhone standard, cinq ne tenaient pas, le gardien passait à la ligne suivante
 * et s'y étalait sur toute la largeur. Le cinq de départ se lisait comme
 * quatre joueurs plus un intrus.
 *
 * `flexBasis: 0` + `flexGrow: 1` sans largeur minimale : les cinq se partagent
 * la ligne à parts égales, quelle que soit la largeur d'écran. Le nom est
 * tronqué plutôt que de casser la rangée — le coach connaît son effectif, le
 * repère utile est la position dans la rangée et l'état de sélection.
 *
 * La sélection reste active après une action : on saisit souvent plusieurs
 * actions du même joueur d'affilée. Retoucher la pastille désélectionne.
 */
export function PlayerPicker({ players, squad, selectedId, onSelect, playerStates }: PlayerPickerProps) {
  const s = useStyles();
  const { theme } = useTheme();

  return (
    <View style={s.pickerRow}>
      {players.map((p) => {
        const active = selectedId === p.id;
        const gk = isGoalkeeper(p.position);
        const st = playerStates[p.id];
        return (
          <Pressable
            key={p.id}
            onPress={() => {
              haptics.select();
              onSelect(active ? null : p.id);
            }}
            style={({ pressed }) => [
              s.chip,
              gk && s.chipGk,
              active && s.chipActive,
              pressed && s.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${p.first_name} ${p.last_name}${gk ? ', gardien' : ''}`}
          >
            <View style={s.chipHead}>
              {active ? (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={theme.colors.accent.default}
                />
              ) : gk ? (
                <Ionicons name="hand-left" size={12} color={theme.colors.warning.default} />
              ) : null}
              <Text
                variant="caption"
                weight={active ? '700' : '600'}
                numberOfLines={1}
                style={s.chipText}
              >
                {playerDisplayName(p, squad)}
              </Text>
            </View>
            <Text variant="caption" tone="tertiary" numeric>
              {formatSeconds(st?.currentSequenceTime ?? 0)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    minHeight: HIT_SLOP_MIN + 8,
    paddingVertical: t.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  goalIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accent.subtle,
  },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: t.space.lg },
  scoreCol: { alignItems: 'center', gap: t.space.md },
  scoreControls: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
  scoreValue: { minWidth: 48, textAlign: 'center' },
  stepper: {
    width: HIT_SLOP_MIN,
    height: HIT_SLOP_MIN,
    borderRadius: HIT_SLOP_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bg.sunken,
    borderWidth: 1,
    borderColor: t.colors.border.strong,
  },

  // Pas de `flexWrap` ni de `minWidth` : la rangée ne doit jamais casser.
  pickerRow: { flexDirection: 'row', gap: t.space.xs },
  chip: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: HIT_SLOP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 2,
    borderColor: t.colors.border.subtle,
  },
  chipGk: { borderColor: t.colors.warning.default },
  chipActive: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },
  chipHead: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: '100%' },
  chipText: { textAlign: 'center', flexShrink: 1 },
}));
