/**
 * Barre de contrôle tablette (P1-3)
 *
 * ## Pourquoi elle ne réutilise pas `ClockBar`
 *
 * `ClockBar` est dessinée pour un téléphone : elle s'étale en largeur et laisse
 * son chrono occuper la place disponible. Insérée dans une rangée horizontale
 * de cinq cellules sur iPad, elle se retrouvait comprimée à ~180 pt et le
 * chrono se coupait **caractère par caractère** — « 0 / 7: / 1 / 2 » sur quatre
 * lignes. Le score et « 1re mi-temps » subissaient le même sort.
 *
 * Un composant qui suppose de la place ne se répare pas en lui en donnant
 * moins : il se remplace.
 *
 * ## Le principe de mise en page
 *
 * Cinq panneaux de hauteur égale, chacun avec son intitulé en capitales
 * discrètes et ses commandes en dessous. Ça se lit comme un tableau de bord,
 * qui est la bonne métaphore pour une surface posée à plat sur un banc.
 *
 * Les largeurs sont **fixes, pas proportionnelles** : un `flex` fait varier la
 * taille du chrono selon le nombre de boutons voisins, ce qui est exactement
 * la cause du défaut précédent. Le chrono a la place dont il a besoin, point.
 */

import { View, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { haptics } from '../../lib/design/haptics';
import { Text } from '../ui';
import { formatSeconds } from '../../utils/matchUtils';
import { FOUL_LIMIT, OPPONENT_ACTIONS } from './recorderModel';
import type { MatchEventType } from '../../types';

export interface TabletControlBarProps {
  seconds: number;
  half: 1 | 2;
  isRunning: boolean;
  onToggleClock: () => void;
  onNextHalf: () => void;

  scoreUs: number;
  scoreOpponent: number;
  onEditScore: () => void;

  foulsUs: number;
  foulsOpponent: number;
  onChangeFoulsUs: (n: number) => void;
  onChangeFoulsOpponent: (n: number) => void;

  onOpponentAction: (e: MatchEventType) => void;
  onOpponentUndo: (e: MatchEventType) => void;
  opponentCounts: { goals: number; onTarget: number; total: number };

  timeoutUs: boolean;
  timeoutOpponent: boolean;
  onToggleTimeoutUs: () => void;
  onToggleTimeoutOpponent: () => void;

  voice: { isListening: boolean; available: boolean; onPress: () => void };
}

export function TabletControlBar(p: TabletControlBarProps) {
  const s = useStyles();
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.row}
      // Le défilement n'est qu'un filet de sécurité pour un iPad en Split View :
      // à pleine largeur les cinq panneaux tiennent sans déborder.
      bounces={false}
    >
      {/* ── Chrono ── */}
      <Panel label="Chronomètre" width={286}>
        <View style={s.chronoRow}>
          <View style={s.chronoText}>
            <Text variant="hero" numeric style={s.onBrand} numberOfLines={1} adjustsFontSizeToFit>
              {formatSeconds(p.seconds)}
            </Text>
            <Text variant="caption" style={s.onBrandMuted} numberOfLines={1}>
              {p.half === 1 ? '1re' : '2e'} mi-temps
            </Text>
          </View>

          <Pressable
            onPress={p.voice.onPress}
            style={({ pressed }) => [
              s.iconBtn,
              p.voice.isListening && s.iconBtnAlert,
              !p.voice.available && s.iconBtnOff,
              pressed && s.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: p.voice.isListening, disabled: !p.voice.available }}
            accessibilityLabel={
              !p.voice.available
                ? 'Dictée indisponible sur cette version de l’application'
                : p.voice.isListening
                  ? "Arrêter l'écoute vocale"
                  : 'Dicter une action'
            }
          >
            <Ionicons
              name={
                !p.voice.available
                  ? 'mic-off-outline'
                  : p.voice.isListening
                    ? 'mic'
                    : 'mic-outline'
              }
              size={22}
              color="#FFFFFF"
            />
          </Pressable>

          <Pressable
            onPress={p.onToggleClock}
            style={({ pressed }) => [s.playBtn, p.isRunning && s.playBtnOn, pressed && s.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: p.isRunning }}
            accessibilityLabel={p.isRunning ? 'Mettre le chrono en pause' : 'Démarrer le chrono'}
          >
            <Ionicons
              name={p.isRunning ? 'pause' : 'play'}
              size={28}
              color={p.isRunning ? theme.colors.accent.default : '#FFFFFF'}
            />
          </Pressable>
        </View>
      </Panel>

      {/* ── Score ── */}
      <Panel label="Score" width={150}>
        <Pressable
          onPress={p.onEditScore}
          style={({ pressed }) => [s.scoreBox, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Score ${p.scoreUs} à ${p.scoreOpponent}. Corriger`}
        >
          <Text variant="display" numeric style={s.onBrand} numberOfLines={1}>
            {p.scoreUs} – {p.scoreOpponent}
          </Text>
          <View style={s.inlineHint}>
            <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text variant="caption" style={s.onBrandMuted}>
              Corriger
            </Text>
          </View>
        </Pressable>
      </Panel>

      {/* ── Fautes ── */}
      <Panel label="Fautes cumulées" width={206}>
        <View style={s.pairRow}>
          <FoulStepper short="Éq" label="équipe" value={p.foulsUs} onChange={p.onChangeFoulsUs} tone="us" />
          <FoulStepper
            short="Adv"
            label="adverses"
            value={p.foulsOpponent}
            onChange={p.onChangeFoulsOpponent}
            tone="opponent"
          />
        </View>
      </Panel>

      {/* ── Actions adverses ── */}
      <Panel label="Actions adverses" width={252}>
        <View style={s.pairRow}>
          {OPPONENT_ACTIONS.map((a) => {
            const count =
              a.eventType === 'opponent_goal'
                ? p.opponentCounts.goals
                : a.eventType === 'opponent_shot_on_target'
                  ? p.opponentCounts.onTarget
                  : Math.max(0, p.opponentCounts.total - p.opponentCounts.onTarget);
            return (
              <Pressable
                key={a.eventType}
                onPress={() => p.onOpponentAction(a.eventType)}
                onLongPress={() => count > 0 && p.onOpponentUndo(a.eventType)}
                delayLongPress={350}
                style={({ pressed }) => [s.oppBtn, pressed && s.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${a.label}. ${count} enregistré${count > 1 ? 's' : ''}`}
                accessibilityHint="Appui long pour annuler le dernier"
              >
                <Ionicons name={a.icon} size={16} color="#FFFFFF" />
                <Text variant="caption" weight="600" style={s.onBrand} numberOfLines={1}>
                  {a.short}
                </Text>
                <Text variant="caption" weight="700" numeric style={s.badge}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Panel>

      {/* ── Temps morts et période ── */}
      <Panel label="Temps morts" width={210}>
        <View style={s.pairRow}>
          <TimeoutChip
            label="équipe"
            short="Éq"
            used={p.timeoutUs}
            onToggle={p.onToggleTimeoutUs}
          />
          <TimeoutChip
            label="adverse"
            short="Adv"
            used={p.timeoutOpponent}
            onToggle={p.onToggleTimeoutOpponent}
          />
          {p.half === 1 && (
            <Pressable
              onPress={p.onNextHalf}
              style={({ pressed }) => [s.halfBtn, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Passer en seconde mi-temps"
            >
              <Ionicons name="play-forward" size={15} color="#FFFFFF" />
              <Text variant="caption" weight="700" style={s.onBrand}>
                2e MT
              </Text>
            </Pressable>
          )}
        </View>
      </Panel>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: React.ReactNode;
}) {
  const s = useStyles();
  return (
    <View style={[s.panel, { width }]}>
      <Text variant="caption" style={s.panelLabel} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function FoulStepper({
  short,
  label,
  value,
  onChange,
  tone,
}: {
  short: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  tone: 'us' | 'opponent';
}) {
  const s = useStyles();
  const critical = value >= FOUL_LIMIT;
  return (
    <View
      style={[s.foulBox, critical && (tone === 'us' ? s.foulCriticalUs : s.foulCriticalOpp)]}
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
        style={({ pressed }) => [s.step, value === 0 && s.stepOff, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Retirer une faute ${label}`}
      >
        <Ionicons name="remove" size={15} color="#FFFFFF" />
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
        style={({ pressed }) => [s.step, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter une faute ${label}`}
      >
        <Ionicons name="add" size={15} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function TimeoutChip({
  short,
  label,
  used,
  onToggle,
}: {
  short: string;
  label: string;
  used: boolean;
  onToggle: () => void;
}) {
  const s = useStyles();
  return (
    <Pressable
      onPress={() => {
        haptics.select();
        onToggle();
      }}
      style={({ pressed }) => [s.timeout, used && s.timeoutUsed, pressed && s.pressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: used }}
      accessibilityLabel={`Temps mort ${label}, ${used ? 'utilisé' : 'disponible'}`}
    >
      <Ionicons name={used ? 'checkmark-circle' : 'time-outline'} size={14} color="#FFFFFF" />
      <Text variant="caption" weight="600" style={s.onBrand}>
        {short}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  onBrand: { color: '#FFFFFF' },
  onBrandMuted: { color: 'rgba(255,255,255,0.72)' },
  pressed: { opacity: 0.72 },

  row: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.sm },

  panel: {
    gap: t.space.xs,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.sm,
    borderRadius: t.radius.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'space-between',
  },
  panelLabel: { color: 'rgba(255,255,255,0.6)' },

  chronoRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  chronoText: { flex: 1, minWidth: 0 },

  iconBtn: {
    width: HIT_SLOP_MIN,
    height: HIT_SLOP_MIN,
    borderRadius: HIT_SLOP_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  iconBtnAlert: { backgroundColor: t.colors.negative.fill, borderColor: '#FFFFFF' },
  iconBtnOff: { opacity: 0.45, borderStyle: 'dashed' },

  playBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  playBtnOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  scoreBox: { justifyContent: 'center' },
  inlineHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  pairRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  foulBox: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  foulCriticalUs: { backgroundColor: t.colors.negative.fill },
  foulCriticalOpp: { backgroundColor: t.colors.positive.fill },
  step: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  stepOff: { opacity: 0.3 },
  foulValue: { color: '#FFFFFF', minWidth: 16, textAlign: 'center' },

  oppBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 2,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  badge: { color: 'rgba(255,255,255,0.85)' },

  timeout: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  timeoutUsed: { backgroundColor: 'rgba(255,255,255,0.32)', borderColor: '#FFFFFF' },

  halfBtn: {
    flex: 1.1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radius.sm,
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
}));
