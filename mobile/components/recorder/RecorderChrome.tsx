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

import { useEffect, useState } from 'react';
import { View, Pressable, AccessibilityInfo } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
  /**
   * Micro de dictée, posé à côté du play/pause.
   *
   * Il vivait dans l'onglet Saisie : pour dicter une action il fallait donc
   * d'abord changer d'onglet, ce qui annule l'intérêt de la dictée — parler
   * sans regarder l'écran. Ici il suit le chrono, donc il est sur tous les
   * onglets.
   *
   * **Le bouton reste visible même quand le module natif manque**, en barré et
   * atténué. Le masquer était pire que la panne : rien ne distinguait « la
   * dictée n'existe pas » de « la dictée a disparu ». L'appui explique alors
   * au lieu d'appeler le natif.
   */
  voice?: { isListening: boolean; onPress: () => void; available: boolean };
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
  voice,
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

      {voice && (
        <Pressable
          onPress={voice.onPress}
          style={({ pressed }) => [
            s.micBtn,
            voice.isListening && s.micBtnOn,
            !voice.available && s.micBtnOff,
            pressed && s.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: voice.isListening, disabled: !voice.available }}
          accessibilityLabel={
            !voice.available
              ? 'Dictée indisponible sur cette version de l’application'
              : voice.isListening
                ? "Arrêter l'écoute vocale"
                : 'Dicter une action'
          }
        >
          <Ionicons
            name={
              !voice.available ? 'mic-off-outline' : voice.isListening ? 'mic' : 'mic-outline'
            }
            size={22}
            color="#FFFFFF"
          />
        </Pressable>
      )}

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

export interface ClockAlertProps {
  /** Le bandeau ne s'affiche que si le match est réellement en cours. */
  visible: boolean;
  onStart: () => void;
  /** Le chrono n'a jamais tourné : le message change. */
  neverStarted: boolean;
}

/**
 * Rappel « chrono à l'arrêt ».
 *
 * Le scénario est banal et coûteux : coup de sifflet, le coach note une action,
 * et le chrono n'a jamais démarré. Ou temps mort, reprise, et personne ne l'a
 * relancé. Les temps de jeu de la séquence sont perdus, et c'est la donnée que
 * ce recorder existe pour produire.
 *
 * Trois précautions pour que ce ne soit pas du harcèlement visuel :
 *
 * - **Il n'apparaît qu'après un délai de grâce** et seulement si le match est
 *   déjà vivant (chrono entamé ou action saisie). Une pause volontaire de
 *   quelques secondes ne déclenche rien.
 * - **Le clignotement n'est jamais le seul signal** : le texte le dit, et
 *   `accessibilityRole="alert"` le fait annoncer par VoiceOver.
 * - **Il est actionnable.** Toucher le bandeau relance le chrono : le rappel et
 *   sa correction sont le même geste, sinon il ne fait que culpabiliser.
 */
export function ClockAlert({ visible, onStart, neverStarted }: ClockAlertProps) {
  const s = useStyles();
  const pulse = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.35, { duration: 620 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [visible, reduceMotion, pulse]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!visible) return null;

  return (
    <Pressable
      onPress={() => {
        haptics.tapMedium();
        onStart();
      }}
      accessibilityRole="alert"
      accessibilityLabel={
        neverStarted
          ? "Le chronomètre n'a pas démarré. Toucher pour le lancer."
          : 'Le chronomètre est à l’arrêt. Toucher pour le relancer.'
      }
      style={({ pressed }) => [s.clockAlert, pressed && s.pressed]}
    >
      <Animated.View style={animated}>
        <Ionicons name="alert-circle" size={17} color="#FFFFFF" />
      </Animated.View>
      <Text variant="caption" weight="700" style={s.onBrand}>
        {neverStarted ? 'Chrono non démarré' : 'Chrono à l’arrêt'}
      </Text>
      <View style={s.clockAlertCta}>
        <Ionicons name="play" size={13} color="#FFFFFF" />
        <Text variant="caption" weight="700" style={s.onBrand}>
          {neverStarted ? 'Lancer' : 'Relancer'}
        </Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export interface FoulRowProps {
  foulsUs: number;
  foulsOpponent: number;
  onChangeUs: (n: number) => void;
  onChangeOpponent: (n: number) => void;
}

/**
 * Les deux compteurs de fautes sur une seule ligne.
 *
 * Ils occupaient deux blocs empilés d'une soixantaine de points de haut, pour
 * deux chiffres qui bougent une poignée de fois par mi-temps. La place libérée
 * accueille les actions adverses, qui étaient reléguées dans un onglet.
 *
 * Le seuil des 5 fautes reste l'information tactique la plus chère du match —
 * au-delà, chaque faute donne un jet franc de 10 m sans mur. Il était signalé
 * par un `Alert` bloquant au franchissement, puis plus rien. Ici l'état est
 * permanent : le compteur vire au plein dès la 5e, avec sa mention.
 */
export function FoulRow({ foulsUs, foulsOpponent, onChangeUs, onChangeOpponent }: FoulRowProps) {
  const s = useStyles();
  return (
    <View style={s.foulRow}>
      <Text variant="caption" style={s.onBrandMuted}>
        Fautes
      </Text>
      <FoulStepper label="équipe" short="Éq" value={foulsUs} onChange={onChangeUs} tone="us" />
      <FoulStepper
        label="adverses"
        short="Adv"
        value={foulsOpponent}
        onChange={onChangeOpponent}
        tone="opponent"
      />
    </View>
  );
}

function FoulStepper({
  label,
  short,
  value,
  onChange,
  tone,
}: {
  label: string;
  short: string;
  value: number;
  onChange: (n: number) => void;
  tone: 'us' | 'opponent';
}) {
  const s = useStyles();
  const critical = value >= FOUL_LIMIT;

  return (
    <View
      style={[
        s.foulBox,
        critical && (tone === 'us' ? s.foulBoxCriticalUs : s.foulBoxCriticalOpp),
      ]}
    >
      <Text variant="caption" weight="600" style={s.onBrandMuted}>
        {short}
      </Text>
      <Pressable
        onPress={() => {
          haptics.tapLight();
          onChange(Math.max(0, value - 1));
        }}
        disabled={value === 0}
        hitSlop={8}
        style={({ pressed }) => [s.foulStep, value === 0 && s.foulStepOff, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Retirer une faute ${label}`}
      >
        <Ionicons name="remove" size={16} color="#FFFFFF" />
      </Pressable>

      <Text
        variant="headline"
        numeric
        style={s.foulValue}
        accessibilityLabel={`${value} fautes ${label}${critical ? ', jet franc de 10 mètres' : ''}`}
      >
        {value}
      </Text>

      <Pressable
        onPress={() => {
          haptics.tapMedium();
          onChange(value + 1);
        }}
        hitSlop={8}
        style={({ pressed }) => [s.foulStep, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter une faute ${label}`}
      >
        <Ionicons name="add" size={16} color="#FFFFFF" />
      </Pressable>

      {critical && (
        <Text variant="caption" weight="700" style={s.onBrand}>
          10 m
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

/**
 * L'annulation est sur l'appui long, pas sur un bouton séparé.
 *
 * C'est le choix de Robin, et il tient sur le bandeau : la place y est comptée,
 * un second bouton par action doublerait la rangée. Le compteur affiché sur
 * chaque bouton rend le geste vérifiable — on voit tout de suite si l'annulation
 * a pris, ce qui est le vrai besoin derrière le bouton explicite.
 */
export function OpponentBar({ onRecord, onUndo, counts }: OpponentBarProps) {
  const s = useStyles();
  const available: Record<string, number> = {
    opponent_goal: counts.goals,
    opponent_shot_on_target: counts.onTarget,
    opponent_shot: Math.max(0, counts.total - counts.onTarget),
  };

  return (
    <View style={s.oppRow}>
      <Text variant="caption" style={s.onBrandMuted}>
        Adv.
      </Text>
      {OPPONENT_ACTIONS.map((a) => {
        const count = available[a.eventType] ?? 0;
        return (
          <Pressable
            key={a.eventType}
            onPress={() => onRecord(a.eventType)}
            onLongPress={() => count > 0 && onUndo(a.eventType)}
            delayLongPress={350}
            style={({ pressed }) => [s.oppBtn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${a.label}. ${count} enregistré${count > 1 ? 's' : ''}`}
            accessibilityHint="Appui long pour annuler le dernier"
          >
            <Ionicons name={a.icon} size={15} color="#FFFFFF" />
            <Text variant="caption" weight="600" style={s.onBrand} numberOfLines={1}>
              {a.short}
            </Text>
            {count > 0 && (
              <View style={s.oppCount}>
                <Text variant="caption" weight="700" style={s.onBrand} numeric>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
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

  micBtn: {
    width: HIT_SLOP_MIN,
    height: HIT_SLOP_MIN,
    borderRadius: HIT_SLOP_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  micBtnOn: { backgroundColor: t.colors.negative.fill, borderColor: '#FFFFFF' },
  micBtnOff: { opacity: 0.45, borderStyle: 'dashed' },

  clockAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.sm,
    height: 30,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.warning.fill,
  },
  clockAlertCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: t.space.sm,
    paddingVertical: 2,
    borderRadius: t.radius.pill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },

  scoreBox: { flex: 1, alignItems: 'flex-end', minHeight: HIT_SLOP_MIN, justifyContent: 'center' },
  scoreEditHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  foulRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  foulBox: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  foulBoxCriticalUs: { backgroundColor: t.colors.negative.fill, borderColor: '#FFFFFF' },
  foulBoxCriticalOpp: { backgroundColor: t.colors.positive.fill, borderColor: '#FFFFFF' },
  foulStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foulStepOff: { opacity: 0.3 },
  foulValue: { color: '#FFFFFF', minWidth: 18, textAlign: 'center' },

  oppRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  oppBtn: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  oppCount: {
    minWidth: 19,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },

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
    // `floating` porte un fond propre à chaque thème (blanc en clair) : il doit
    // être écrasé APRÈS le spread. Déclaré avant, il était annulé et la pastille
    // sortait blanche avec un texte blanc — donc vide à l'écran en thème clair.
    ...t.elevation.floating,
    backgroundColor: 'rgba(10,12,18,0.92)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  toastText: { color: '#FFFFFF', flexShrink: 1 },
}));
