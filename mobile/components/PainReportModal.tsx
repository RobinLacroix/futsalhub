/**
 * Signaler une douleur (spontané)
 *
 * Réutilisée par la fiche joueur (`PlayerDetailView`) et par l'onglet
 * Questionnaires de l'espace joueur. C'est le geste dont dépend tout le suivi
 * santé : ce qui n'est pas signalé ici n'existe nulle part.
 *
 * ## Sixième copie de l'objet `C`
 *
 * Cet écran portait la table de 14 couleurs figées (`navy: #1a2744`, `text3:
 * #94a3b8`…) recopiée à l'identique depuis l'espace joueur, dont les trois
 * exemplaires avaient été supprimés en août. Celui-ci avait survécu parce qu'il
 * vit dans `components/` et non dans `app/(player-tabs)/`.
 *
 * Conséquences réelles, pas cosmétiques :
 *
 * - **L'écran était entièrement calculé pour un fond clair.** Ouvert en thème
 *   sombre, il s'affichait en feuille blanche sur une app anthracite, avec le
 *   contraste d'un flash — sur un écran qu'un joueur ouvre le plus souvent le
 *   soir, en sortant du gymnase.
 * - **`#94a3b8` (2,56:1) servait à la fois de couleur de libellé et de
 *   `placeholderTextColor`.** L'un des trois contrastes nommés par l'audit,
 *   ici sur les instructions de saisie.
 * - **Les libellés étaient rendus à 9 et 10 px**, en capitales espacées, sous
 *   le plancher de 12 px de l'échelle typographique. « optionnel » à 9 px est
 *   la mention qui décide si un joueur remplit le champ ou non.
 * - **L'échec d'envoi passait par `Alert.alert`** : la boîte recouvre la
 *   sélection, se ferme, et ne laisse aucune trace de ce qui a échoué. Il
 *   devient un bandeau d'erreur annoncé aux lecteurs d'écran, au-dessus du
 *   bouton, la sélection intacte pour réessayer.
 * - **Le bouton de fermeture faisait 32 pt**, sous la cible tactile de 44.
 *
 * ## Ce qui reste figé, volontairement
 *
 * Les trois teintes d'intensité de `BodyMap` (jaune / orange / rouge) ne sont
 * pas des couleurs de thème : elles forment l'échelle que l'écran explique au
 * joueur en toutes lettres, et le staff les relit à l'identique sur sa vue. Les
 * dériver du thème casserait la correspondance entre la consigne et le rendu.
 */

import { useState } from 'react';
import {
  View,
  Modal,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import BodyMap, { type PainSelection } from './BodyMap';
import { toPayload } from '../lib/painMap';
import { reportMyPain } from '../lib/services/painReports';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Text, Button, Card, Field, IconButton } from './ui';

type Onset = 'aigu' | 'chronique' | null;

const ONSET_OPTIONS: readonly { value: Exclude<Onset, null>; label: string }[] = [
  { value: 'aigu', label: 'Récent / aigu' },
  { value: 'chronique', label: 'Qui traîne' },
];

export default function PainReportModal({
  visible,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const [pain, setPain] = useState<PainSelection>({});
  const [onset, setOnset] = useState<Onset>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSelection = Object.keys(pain).length > 0;

  const reset = () => {
    setPain({});
    setOnset(null);
    setNote('');
    setSubmitted(false);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const zones = toPayload(pain);
    if (zones.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await reportMyPain(zones, note.trim() || null, onset, null);
      if (!res.success) {
        haptics.error();
        setError(res.error || "Impossible d'envoyer le signalement.");
        return;
      }
      haptics.success();
      setSubmitted(true);
      onSubmitted?.();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : "Impossible d'envoyer le signalement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.accentBar} />
            <Text variant="headline">Signaler une douleur</Text>
          </View>
          <IconButton icon="close" label="Fermer" variant="surface" size="lg" onPress={close} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {submitted ? (
            <View style={s.centered}>
              <View style={[s.successIcon, { backgroundColor: c.positive.fill }]}>
                <Ionicons name="checkmark" size={32} color={c.text.onFill} />
              </View>
              <Text variant="title">Signalement envoyé</Text>
              <Text variant="callout" tone="secondary" style={s.center}>
                Ton staff a été alerté.
              </Text>
              <Button label="Fermer" variant="secondary" onPress={close} style={s.successBtn} />
            </View>
          ) : (
            <>
              <Card style={s.intro}>
                <Text variant="title">Où as-tu mal ?</Text>
                <Text variant="callout" tone="secondary">
                  Touche une zone : 1 fois modérée, 2 fois assez intense, 3 fois très
                  intense. Bascule Face / Dos en haut.
                </Text>
              </Card>

              <Card>
                <BodyMap value={pain} onChange={setPain} />
                {hasSelection && (
                  <Field label="Depuis quand ?" style={s.onsetField}>
                    <View
                      style={s.onsetRow}
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Depuis quand la douleur est-elle présente"
                    >
                      {ONSET_OPTIONS.map(({ value, label }) => {
                        const active = onset === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => {
                              haptics.select();
                              setOnset(active ? null : value);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active, checked: active }}
                            accessibilityLabel={label}
                            accessibilityHint={
                              active ? 'Appuyer à nouveau pour désélectionner' : undefined
                            }
                            style={({ pressed }) => [
                              s.onsetBtn,
                              {
                                backgroundColor: active ? c.accent.fill : c.bg.surface,
                                borderColor: active ? c.accent.fill : c.border.subtle,
                              },
                              pressed && s.pressed,
                            ]}
                          >
                            <Text
                              variant="callout"
                              weight="600"
                              tone={active ? 'onFill' : 'secondary'}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>
                )}
              </Card>

              <Card>
                <Field
                  label="Précision"
                  optional
                  hint="Contexte, type de douleur, à l'effort ou au repos."
                >
                  <TextInput
                    style={[
                      s.noteInput,
                      {
                        backgroundColor: c.bg.sunken,
                        borderColor: c.border.subtle,
                        color: c.text.primary,
                      },
                    ]}
                    accessibilityLabel="Précision sur la douleur"
                    placeholder="Ex. ça tire quand j'accélère, pas au repos."
                    placeholderTextColor={c.text.tertiary}
                    value={note}
                    onChangeText={setNote}
                    multiline
                    textAlignVertical="top"
                  />
                </Field>
              </Card>

              {error ? (
                <View
                  style={[
                    s.errorBox,
                    { backgroundColor: c.negative.subtle, borderColor: c.negative.default },
                  ]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                >
                  <Ionicons name="alert-circle" size={17} color={c.negative.default} />
                  <Text variant="callout" tone="negative" style={s.flex}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <Button
                label="Envoyer au staff"
                icon="send-outline"
                onPress={() => void submit()}
                loading={submitting}
                disabled={!hasSelection || submitting}
                accessibilityHint={
                  hasSelection ? undefined : "Sélectionne d'abord une zone sur la silhouette"
                }
                block
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.7 },

  root: { flex: 1, backgroundColor: t.colors.bg.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.colors.bg.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
    paddingVertical: t.space.md,
    paddingLeft: t.space.xl,
    paddingRight: t.space.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, flex: 1 },
  // Liseré rouge : la douleur est le seul sujet de cet écran.
  accentBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: t.colors.negative.default },

  scroll: { padding: t.space.lg, paddingBottom: t.space.giant, gap: t.space.lg },
  centered: {
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    gap: t.space.md,
    paddingTop: t.space.huge,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: t.space.sm,
  },
  successBtn: { marginTop: t.space.lg },

  intro: { gap: t.space.xs },

  onsetField: { marginTop: t.space.md },
  onsetRow: { flexDirection: 'row', gap: t.space.sm },
  onsetBtn: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },

  noteInput: {
    minHeight: 88,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    paddingHorizontal: t.space.md,
    paddingVertical: t.space.md,
    fontSize: 16,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.sm,
    padding: t.space.md,
    borderRadius: t.radius.sm,
    borderWidth: 1,
  },
}));
