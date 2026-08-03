/**
 * Questionnaires de séance du joueur (P1-7)
 *
 * ## Le bug de sens sur le RPE
 *
 * L'échelle de 1 à 10 était colorée par un dégradé vert → rouge appliqué aux
 * quatre métriques, RPE compris. Pour l'auto-évaluation, le plaisir et la
 * forme, c'est juste. **Pour le RPE, c'est un contresens** : la mesure porte
 * l'intensité perçue de l'effort, un 9 n'est pas une mauvaise note, c'est une
 * séance dure.
 *
 * Ce n'est pas cosmétique. Le RPE sert à surveiller la charge : un joueur qui
 * lit « rouge = mauvais » apprend à sous-déclarer, et la charge mesurée devient
 * fausse dans le sens qui fait rater les pics — donc les blessures. Le détail
 * du barème est dans `components/player/ScaleSelector.tsx`.
 *
 * ## Le reste
 *
 * - **Les dix cases faisaient 30 pt de large** sur un iPhone, pour
 *   l'interaction principale du seul formulaire que remplissent les joueurs.
 *   Deux rangées de cinq, à 44 pt.
 * - Les libellés descendaient à **9 px** (`cardBadgeText`, `optionalText`).
 * - La modale était un `Modal` à en-tête maison sur `navy` en dur, sans thème.
 * - `borderColor: C.amber + '44'` : concaténation de chaîne pour obtenir une
 *   opacité, qui casse silencieusement si la teinte passe en `rgb()`.
 */

import { useCallback, useState, useEffect } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../../lib/design/tokens';
import { Text, Card, Button, Badge, EmptyState } from '../../components/ui';
import { SkeletonList } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Field';
import { ScaleSelector, type ScaleKind } from '../../components/player/ScaleSelector';
import { supabase } from '../../lib/supabase';
import { getMyPendingFeedbackTokens, type MyPendingFeedbackRow } from '../../lib/services/playerConvocations';
import { reportPainByToken } from '../../lib/services/painReports';
import BodyMap, { type PainSelection } from '../../components/BodyMap';
import PainReportModal from '../../components/PainReportModal';
import { toPayload } from '../../lib/painMap';

type Onset = 'aigu' | 'chronique' | null;

type SessionInfo = {
  training_id: string;
  player_id: string;
  training_date: string;
  theme: string | null;
  player_name: string | null;
};

type FormValues = {
  auto_evaluation: number | null;
  rpe: number | null;
  physical_form: number | null;
  pleasure: number | null;
};

/**
 * `kind` distingue ce qui se juge de ce qui se mesure. Seul le RPE est en
 * `intensity` : c'est la seule des quatre métriques dont une note haute n'est
 * pas un jugement.
 */
const METRICS: {
  key: keyof FormValues;
  label: string;
  desc: string;
  lowLabel: string;
  highLabel: string;
  kind: ScaleKind;
}[] = [
  {
    key: 'auto_evaluation',
    label: 'Auto-évaluation',
    desc: 'Comment as-tu joué ?',
    lowLabel: 'Très mal',
    highLabel: 'Excellent',
    kind: 'judgement',
  },
  {
    key: 'rpe',
    label: 'Intensité ressentie (RPE)',
    desc: "À quel point l'effort t'a paru dur ? Il n'y a pas de bonne réponse.",
    lowLabel: 'Très légère',
    highLabel: 'Maximale',
    kind: 'intensity',
  },
  {
    key: 'physical_form',
    label: 'Forme physique',
    desc: 'Comment tu te sentais physiquement',
    lowLabel: 'Très faible',
    highLabel: 'Parfaite',
    kind: 'judgement',
  },
  {
    key: 'pleasure',
    label: 'Plaisir',
    desc: 'As-tu apprécié la séance ?',
    lowLabel: 'Aucun',
    highLabel: 'Maximum',
    kind: 'judgement',
  },
];

const EMPTY_FORM: FormValues = {
  auto_evaluation: null,
  rpe: null,
  physical_form: null,
  pleasure: null,
};

export default function PlayerQuestionnairesScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const [items, setItems] = useState<MyPendingFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeItem, setActiveItem] = useState<MyPendingFeedbackRow | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [comment, setComment] = useState('');
  const [pain, setPain] = useState<PainSelection>({});
  const [onset, setOnset] = useState<Onset>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [spontOpen, setSpontOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await getMyPendingFeedbackTokens());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openForm = useCallback(async (item: MyPendingFeedbackRow) => {
    setActiveItem(item);
    setSessionInfo(null);
    setSessionError(null);
    setSessionLoading(true);
    setSubmitted(false);
    setForm(EMPTY_FORM);
    setComment('');
    setPain({});
    setOnset(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_feedback_session_by_token', {
        p_token: item.token,
      });
      if (rpcError) throw rpcError;
      const result = data as ({ error?: string } & SessionInfo) | null;
      if (!result) throw new Error('Questionnaire introuvable');
      if ('error' in result && result.error) {
        setSessionError(
          result.error === 'already_used'
            ? 'Ce questionnaire a déjà été rempli.'
            : result.error === 'expired'
              ? 'Ce questionnaire a expiré.'
              : 'Lien invalide.'
        );
      } else {
        setSessionInfo(result as SessionInfo);
      }
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Impossible de charger le questionnaire.');
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setActiveItem(null);
    setSessionInfo(null);
    setSessionError(null);
    setSubmitted(false);
    setComment('');
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!activeItem) return;
    const { auto_evaluation, rpe, physical_form, pleasure } = form;
    if (auto_evaluation == null || rpe == null || physical_form == null || pleasure == null) return;

    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_training_feedback', {
        p_token: activeItem.token,
        p_auto_evaluation: auto_evaluation,
        p_rpe: rpe,
        p_physical_form: physical_form,
        p_pleasure: pleasure,
        p_comment: comment.trim() || null,
      });
      if (rpcError) throw rpcError;
      const result = data as { success: boolean; error?: string } | null;
      if (!result?.success) {
        setSessionError(
          result?.error === 'already_used'
            ? 'Ce questionnaire a déjà été rempli.'
            : result?.error === 'expired'
              ? 'Ce questionnaire a expiré.'
              : "L'envoi a échoué. Réessaie dans un instant."
        );
        return;
      }
      const zones = toPayload(pain);
      if (zones.length > 0) {
        await reportPainByToken(activeItem.token, zones, null, onset);
      }
      setSubmitted(true);
      setItems((prev) => prev.filter((i) => i.token !== activeItem.token));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'envoyer.");
    } finally {
      setSubmitting(false);
    }
  }, [activeItem, form, comment, pain, onset]);

  const answered = Object.values(form).filter((v) => v !== null).length;
  const allAnswered = answered === METRICS.length;

  if (loading && items.length === 0) {
    return (
      <View style={s.loadingWrap}>
        <SkeletonList rows={3} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {error && (
        <View style={s.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={c.negative.default} />
          <Text variant="caption" color={c.negative.default} style={s.flex}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.training_id + item.token}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.positive.default}
          />
        }
        ListHeaderComponent={
          <View style={s.header}>
            {/*
              Le signalement de douleur n'est pas une entrée de liste parmi
              d'autres : c'est le seul moyen pour un joueur de remonter une
              blessure hors questionnaire. Il reste en tête, toujours visible.
            */}
            <Pressable
              onPress={() => setSpontOpen(true)}
              style={({ pressed }) => [s.painCta, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Signaler une douleur, à tout moment"
            >
              <View style={s.painIcon}>
                <Ionicons name="body" size={20} color={c.negative.default} />
              </View>
              <View style={s.flex}>
                <Text variant="headline">Signaler une douleur</Text>
                <Text variant="caption" tone="secondary">
                  À tout moment, sans attendre un questionnaire
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.text.tertiary} />
            </Pressable>

            {items.length > 0 && (
              <Text variant="caption" tone="secondary" weight="700">
                {items.length} questionnaire{items.length > 1 ? 's' : ''} en attente
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-circle-outline"
            title="Tout est à jour"
            description="Aucun questionnaire en attente. Tu peux quand même signaler une douleur ci-dessus."
          />
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        renderItem={({ item }) => {
          let dateLabel = item.training_date;
          try {
            dateLabel = format(parseISO(item.training_date), 'EEEE d MMMM', { locale: fr });
          } catch {
            // Une date illisible ne doit pas masquer le questionnaire.
          }
          return (
            <Pressable
              onPress={() => openForm(item)}
              style={({ pressed }) => [pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Remplir le questionnaire du ${dateLabel}`}
            >
              <Card variant="flat" padding="lg" style={s.card}>
                <View style={s.cardTop}>
                  <Badge label="À remplir" tone="warning" size="sm" />
                  <Text variant="caption" tone="tertiary" numberOfLines={1} style={s.flex}>
                    {dateLabel}
                  </Text>
                </View>
                <Text variant="headline">{item.theme || "Séance d'entraînement"}</Text>
                <View style={s.cardCta}>
                  <Text variant="callout" weight="700" tone="accent">
                    Remplir le questionnaire
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color={c.accent.default} />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={activeItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalHeader}>
            <View style={s.flex}>
              <Text variant="title">Questionnaire</Text>
              {sessionInfo && (
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {sessionInfo.theme || "Séance d'entraînement"}
                </Text>
              )}
            </View>
            <Pressable
              onPress={closeModal}
              style={({ pressed }) => [s.closeBtn, pressed && s.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Fermer le questionnaire"
            >
              <Ionicons name="close" size={20} color={c.text.primary} />
            </Pressable>
          </View>

          {/*
            La progression était absente : le joueur découvrait qu'il manquait
            une réponse en touchant « Envoyer », et recevait une alerte.
          */}
          {sessionInfo && !submitted && !sessionError && (
            <View style={s.progress}>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${(answered / METRICS.length) * 100}%`,
                      backgroundColor: allAnswered ? c.positive.default : c.accent.default,
                    },
                  ]}
                />
              </View>
              <Text variant="caption" tone="secondary" numeric>
                {answered}/{METRICS.length}
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={s.modalScroll} showsVerticalScrollIndicator={false}>
            {sessionLoading && <SkeletonList rows={3} />}

            {!sessionLoading && sessionError && (
              <EmptyState
                icon="warning-outline"
                title={sessionError}
                description="Tu peux fermer cette fenêtre."
                action={{ label: 'Fermer', onPress: closeModal }}
                tone="negative"
              />
            )}

            {!sessionLoading && submitted && (
              <EmptyState
                icon="checkmark-circle"
                title="Questionnaire envoyé"
                description="Merci pour ton retour, il est transmis au staff."
                action={{ label: 'Fermer', onPress: closeModal }}
              />
            )}

            {!sessionLoading && !sessionError && !submitted && sessionInfo && (
              <>
                <Card variant="flat" padding="lg" style={s.sessionCard}>
                  <Text variant="title">{sessionInfo.theme || "Séance d'entraînement"}</Text>
                  <View style={s.sessionMeta}>
                    <Ionicons name="calendar-outline" size={14} color={c.text.tertiary} />
                    <Text variant="callout" tone="secondary">
                      {format(parseISO(sessionInfo.training_date), 'EEEE d MMMM yyyy', {
                        locale: fr,
                      })}
                    </Text>
                  </View>
                </Card>

                {METRICS.map((metric) => (
                  <ScaleSelector
                    key={metric.key}
                    label={metric.label}
                    description={metric.desc}
                    lowLabel={metric.lowLabel}
                    highLabel={metric.highLabel}
                    kind={metric.kind}
                    value={form[metric.key]}
                    onChange={(v) => setForm((prev) => ({ ...prev, [metric.key]: v }))}
                  />
                ))}

                <Card variant="flat" padding="lg" style={s.block}>
                  <View style={s.blockHead}>
                    <Ionicons name="chatbubble-outline" size={16} color={c.text.secondary} />
                    <Text variant="headline" style={s.flex}>
                      Commentaire
                    </Text>
                    <Badge label="Optionnel" tone="neutral" size="sm" />
                  </View>
                  <Input
                    label="Un mot pour le staff"
                    optional
                    placeholder="Ressenti, douleur, motivation…"
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    inputStyle={s.commentInput}
                  />
                </Card>

                <Card variant="flat" padding="lg" style={s.block}>
                  <View style={s.blockHead}>
                    <Ionicons name="body-outline" size={16} color={c.negative.default} />
                    <Text variant="headline" style={s.flex}>
                      Une douleur ?
                    </Text>
                    <Badge label="Optionnel" tone="neutral" size="sm" />
                  </View>
                  <BodyMap value={pain} onChange={setPain} />
                  {Object.keys(pain).length > 0 && <OnsetPicker value={onset} onChange={setOnset} />}
                </Card>

                <Button
                  label={allAnswered ? 'Envoyer le questionnaire' : `Encore ${METRICS.length - answered} question${METRICS.length - answered > 1 ? 's' : ''}`}
                  onPress={handleSubmit}
                  disabled={!allAnswered}
                  loading={submitting}
                  icon="send-outline"
                  block
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <PainReportModal visible={spontOpen} onClose={() => setSpontOpen(false)} />
    </View>
  );
}

function OnsetPicker({ value, onChange }: { value: Onset; onChange: (v: Onset) => void }) {
  const s = useStyles();
  const { theme } = useTheme();
  const options: { value: Exclude<Onset, null>; label: string }[] = [
    { value: 'aigu', label: 'Récent, apparu d’un coup' },
    { value: 'chronique', label: 'Qui traîne depuis un moment' },
  ];

  return (
    <View style={s.onsetWrap} accessibilityRole="radiogroup">
      <Text variant="caption" tone="secondary" weight="700">
        Depuis quand ?
      </Text>
      <View style={s.onsetRow}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(active ? null : o.value)}
              style={({ pressed }) => [s.onsetBtn, active && s.onsetBtnOn, pressed && s.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={o.label}
            >
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={active ? theme.colors.accent.default : theme.colors.text.tertiary}
              />
              <Text
                variant="caption"
                weight={active ? '700' : '500'}
                tone={active ? 'accent' : 'secondary'}
                style={s.flex}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  loadingWrap: { flex: 1, padding: t.space.lg, backgroundColor: t.colors.bg.canvas },
  list: { padding: t.space.lg, paddingBottom: t.space.huge },
  separator: { height: t.space.md },
  header: { gap: t.space.md, marginBottom: t.space.md },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.md,
    backgroundColor: t.colors.negative.subtle,
  },

  painCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    padding: t.space.lg,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
    borderLeftWidth: 4,
    borderLeftColor: t.colors.negative.default,
  },
  painIcon: {
    width: 42,
    height: 42,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.negative.subtle,
  },

  card: { gap: t.space.sm, borderLeftWidth: 4, borderLeftColor: t.colors.warning.default },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  cardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: t.space.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
  },

  modalRoot: { flex: 1, backgroundColor: t.colors.bg.canvas },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    paddingTop: t.space.lg,
    paddingBottom: t.space.md,
    backgroundColor: t.colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  closeBtn: {
    width: HIT_SLOP_MIN,
    height: HIT_SLOP_MIN,
    borderRadius: HIT_SLOP_MIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bg.sunken,
  },

  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.sm,
    backgroundColor: t.colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.bg.sunken,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: t.radius.pill },

  modalScroll: { padding: t.space.lg, paddingBottom: t.space.giant, gap: t.space.md },
  sessionCard: { gap: t.space.xs },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },

  block: { gap: t.space.md },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  commentInput: { minHeight: 88, textAlignVertical: 'top' },

  onsetWrap: { gap: t.space.sm },
  onsetRow: { gap: t.space.sm },
  onsetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: HIT_SLOP_MIN,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    borderWidth: 1.5,
    borderColor: t.colors.border.subtle,
    backgroundColor: t.colors.bg.canvas,
  },
  onsetBtnOn: { borderColor: t.colors.accent.default, backgroundColor: t.colors.accent.subtle },
}));
