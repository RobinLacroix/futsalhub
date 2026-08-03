/**
 * Bandeau de contrôle du match recorder (P1-3)
 *
 * Chrono, score, fautes, actions adverses, micro. Le bloc que le coach regarde
 * en diagonale entre deux actions, donc celui où chaque défaut de lisibilité
 * coûte une donnée.
 *
 * ## Ce qui change par rapport aux deux versions précédentes
 *
 * - **Le score n'était modifiable que par appui long**, annoncé par une ligne
 *   de 9 px. Un geste invisible sur la seule correction possible d'une erreur
 *   de saisie. Il y a maintenant un bouton.
 * - **Le compteur de fautes se décrémentait par appui long**, expliqué par une
 *   autre ligne de 10 px. Un « −1 » explicite le remplace : le coach qui compte
 *   une faute de trop a besoin de la retirer tout de suite, pas de se souvenir
 *   d'un geste.
 * - **Les tailles montaient à 8 px** sur les libellés. Rien ne descend sous
 *   `caption` (12 px).
 * - Le bandeau était bleu en dur (`#2563eb`) : illisible en thème sombre, et
 *   surtout aveuglant dans un gymnase le soir.
 */

import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { FOUL_LIMIT, OPPONENT_ACTIONS, type IoniconName } from './recorderModel';
import type { MatchEventType } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────

export interface ClockBarProps {
  seconds: number;
  half: 1 | 2;
  isRunning: boolean;
  onToggle: () => void;
  scoreUs: number;
  scoreOpponent: number;
  onEditScore: () => void;
  compact?: boolean;
}

export function ClockBar({
  seconds,
  half,
  isRunning,
  onToggle,
  scoreUs,
  scoreOpponent,
  onEditScore,
  compact,
}: ClockBarProps) {
  const s = useStyles();
  const { theme } = useTheme();

  return (
    <View style={s.clockRow}>
      <View style={s.clockLeft}>
        <Text variant={compact ? 'display' : 'hero'} numeric style={s.onBrand}>
          {formatSeconds(seconds)}
        </Text>
        <Text variant="caption" style={s.onBrandMuted}>
          {half}
          <Text variant="caption" style={s.onBrandMuted}>
            {half === 1 ? 're' : 'e'}
          </Text>{' '}
          mi-temps
        </Text>
      </View>

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [s.playBtn, isRunning && s.playBtnRunning, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={isRunning ? 'Mettre le chrono en pause' : 'Démarrer le chrono'}
        accessibilityState={{ selected: isRunning }}
      >
        <Ionicons
          name={isRunning ? 'pause' : 'play'}
          size={26}
          color={isRunning ? theme.colors.accent.default : '#FFFFFF'}
        />
      </Pressable>

      <Pressable
        onPress={onEditScore}
        style={({ pressed }) => [s.scoreBox, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Score ${scoreUs} à ${scoreOpponent}. Corriger`}
      >
        <Text variant={compact ? 'title' : 'display'} numeric style={s.onBrand}>
          {scoreUs} – {scoreOpponent}
        </Text>
        <View style={s.scoreEditHint}>
          <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.75)" />
          <Text variant="caption" style={s.onBrandMuted}>
            Corriger
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface FoulCounterProps {
  label: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  tone: 'us' | 'opponent';
}

/**
 * Le seuil des 5 fautes est l'information tactique la plus chère du match : au
 * delà, chaque faute donne un jet franc de 10 m sans mur. Il était signalé par
 * un `Alert` bloquant au moment du franchissement, puis plus rien. Le compteur
 * porte maintenant son état en permanence.
 */
export function FoulCounter({ label, value, onIncrement, onDecrement, tone }: FoulCounterProps) {
  const s = useStyles();
  const critical = value >= FOUL_LIMIT;
  const warning = value === FOUL_LIMIT - 1;

  return (
    <View
      style={[s.foulBox, critical && (tone === 'us' ? s.foulBoxCriticalUs : s.foulBoxCriticalOpp)]}
    >
      <Text variant="caption" style={s.onBrandMuted} numberOfLines={1}>
        {label}
      </Text>
      <View style={s.foulControls}>
        <Pressable
          onPress={() => {
            haptics.tapLight();
            onDecrement();
          }}
          disabled={value === 0}
          hitSlop={6}
          style={({ pressed }) => [s.foulStep, value === 0 && s.foulStepOff, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Retirer une faute ${label}`}
        >
          <Ionicons name="remove" size={18} color="#FFFFFF" />
        </Pressable>

        <Text variant="title" numeric style={s.foulValue} accessibilityLabel={`${value} fautes`}>
          {value}
        </Text>

        <Pressable
          onPress={() => {
            haptics.tapMedium();
            onIncrement();
          }}
          hitSlop={6}
          style={({ pressed }) => [s.foulStep, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter une faute ${label}`}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      {(critical || warning) && (
        <Text variant="caption" style={s.onBrand} numberOfLines={1}>
          {critical ? 'Jet franc 10 m' : 'Prochaine = 5e'}
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface OpponentBarProps {
  onRecord: (eventType: MatchEventType) => void;
  onUndo: (eventType: MatchEventType) => void;
  counts: { goals: number; onTarget: number; total: number };
}

export function OpponentBar({ onRecord, onUndo, counts }: OpponentBarProps) {
  const s = useStyles();
  const available: Record<string, number> = {
    opponent_goal: counts.goals,
    opponent_shot_on_target: counts.onTarget,
    opponent_shot: Math.max(0, counts.total - counts.onTarget),
  };

  return (
    <View style={s.oppRow}>
      {OPPONENT_ACTIONS.map((a) => (
        <View key={a.eventType} style={s.oppCell}>
          <Pressable
            onPress={() => onRecord(a.eventType)}
            style={({ pressed }) => [s.oppBtn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <Ionicons name={a.icon} size={16} color="#FFFFFF" />
            <Text variant="caption" style={s.onBrand} numberOfLines={1}>
              {a.short}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onUndo(a.eventType)}
            disabled={(available[a.eventType] ?? 0) === 0}
            hitSlop={8}
            style={({ pressed }) => [
              s.oppUndo,
              (available[a.eventType] ?? 0) === 0 && s.foulStepOff,
              pressed && s.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Annuler : ${a.label}`}
          >
            <Ionicons name="arrow-undo" size={13} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface VoiceButtonProps {
  isListening: boolean;
  onPress: () => void;
}

export function VoiceButton({ isListening, onPress }: VoiceButtonProps) {
  const s = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.voiceBtn, isListening && s.voiceBtnOn, pressed && s.pressed]}
      accessibilityRole="button"
      accessibilityLabel={isListening ? "Arrêter l'écoute vocale" : 'Activer la commande vocale'}
      accessibilityState={{ selected: isListening }}
    >
      <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={18} color="#FFFFFF" />
      <Text variant="caption" style={s.onBrand} weight="600">
        {isListening ? 'Écoute en cours…' : 'Commande vocale'}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface SyncBadgeProps {
  pending: number;
}

export function SyncBadge({ pending }: SyncBadgeProps) {
  const s = useStyles();
  if (pending <= 0) return null;
  return (
    <View style={s.syncBadge} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={13} color="#FFFFFF" />
      <Text variant="caption" style={s.onBrand} weight="600">
        {pending} action{pending > 1 ? 's' : ''} en attente de synchronisation
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface VoiceOverlayProps {
  message: string | null;
  icon?: IoniconName;
}

export function VoiceOverlay({ message, icon = 'mic' }: VoiceOverlayProps) {
  const s = useStyles();
  if (!message) return null;
  return (
    <View style={s.toastLayer} pointerEvents="none">
      <View style={s.toast} accessibilityRole="alert" accessibilityLabel={message}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
        <Text variant="headline" style={s.toastText} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le bandeau est toujours posé sur `accent.fill`, dans les deux thèmes : c'est
 * la seule zone de l'application qui garde une teinte pleine, parce qu'elle
 * doit se distinguer du contenu défilant en vision périphérique. Le blanc
 * dessus est donc volontaire et vérifié sur les deux valeurs de `accent.fill`.
 */
const useStyles = makeStyles((t) => ({
  onBrand: { color: '#FFFFFF' },
  onBrandMuted: { color: 'rgba(255,255,255,0.78)' },
  pressed: { opacity: 0.75 },

  clockRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  clockLeft: { flex: 1 },

  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  playBtnRunning: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  scoreBox: { flex: 1, alignItems: 'flex-end', minHeight: HIT_SLOP_MIN, justifyContent: 'center' },
  scoreEditHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  foulBox: {
    flex: 1,
    gap: 2,
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
  },
  foulBoxCriticalUs: { backgroundColor: t.colors.negative.fill, borderColor: '#FFFFFF' },
  foulBoxCriticalOpp: { backgroundColor: t.colors.positive.fill, borderColor: '#FFFFFF' },
  foulControls: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  foulStep: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foulStepOff: { opacity: 0.3 },
  foulValue: { color: '#FFFFFF', minWidth: 24, textAlign: 'center' },

  oppRow: { flexDirection: 'row', gap: t.space.sm },
  oppCell: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 2 },
  oppBtn: {
    flex: 1,
    minHeight: HIT_SLOP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  oppUndo: {
    width: 32,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  voiceBtn: {
    minHeight: HIT_SLOP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.sm,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  voiceBtnOn: { backgroundColor: t.colors.negative.fill, borderColor: '#FFFFFF' },

  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    alignSelf: 'center',
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.xs,
    borderRadius: t.radius.pill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  toastLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    maxWidth: '86%',
    paddingHorizontal: t.space.xl,
    paddingVertical: t.space.lg,
    borderRadius: t.radius.lg,
    backgroundColor: 'rgba(10,12,18,0.92)',
    ...t.elevation.floating,
  },
  toastText: { color: '#FFFFFF', flexShrink: 1 },
}));
