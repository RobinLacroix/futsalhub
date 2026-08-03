/**
 * RatingScaleEditor — poids du barème de note joueur (P0-7)
 *
 * BUG CORRIGÉ, et il touchait la donnée, pas l'affichage.
 *
 * Les poids étaient lus avec `parseFloat(m[k])` et repliés sur `0` en cas
 * d'échec, silencieusement. Or `parseFloat("0,5")` vaut **0** : une application
 * en français, avec un clavier qui propose la virgule, transformait donc
 * « 0,5 » en « 0 » sans le dire. Le coach croyait pondérer un événement, la
 * note ne bougeait pas, et rien ne le signalait.
 *
 * La saisie accepte maintenant la virgule comme séparateur décimal, et une
 * valeur illisible est signalée sous le champ au lieu d'être remplacée par 0.
 *
 * Corrigé aussi : les champs faisaient 30 pt de haut (`paddingVertical: 6` +
 * 13 px de texte), et le retour d'enregistrement était un texte gris de 12 px
 * en bas de carte, à peu près invisible.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Card, Text, Button, Badge, SkeletonList } from './ui';
import { getRatingWeights, setRatingWeights, resetRatingWeights } from '../lib/services/matchRatings';
import { DEFAULT_RATING_WEIGHTS, type RatingWeights } from '../types';

const INDIV_FIELDS: { key: keyof RatingWeights; label: string }[] = [
  { key: 'w_goal', label: 'But' },
  { key: 'w_assist', label: 'Passe décisive' },
  { key: 'w_recovery', label: 'Récupération' },
  { key: 'w_shot_on_target', label: 'Tir cadré' },
  { key: 'w_shot', label: 'Tir non cadré' },
  { key: 'w_ball_loss', label: 'Perte (transition)' },
  { key: 'w_yellow_card', label: 'Carton jaune' },
  { key: 'w_red_card', label: 'Carton rouge' },
];

const COLL_FIELDS: { key: keyof RatingWeights; label: string }[] = [
  { key: 'cw_goal', label: 'But marqué (équipe)' },
  { key: 'cw_shot', label: 'Tir équipe' },
  { key: 'cw_opponent_shot', label: 'Tir concédé' },
  { key: 'cw_opponent_goal', label: 'But concédé' },
];

type StrMap = Record<keyof RatingWeights, string>;

const toStrMap = (w: RatingWeights): StrMap => {
  const out = {} as StrMap;
  (Object.keys(w) as (keyof RatingWeights)[]).forEach((k) => {
    out[k] = String(w[k]).replace('.', ',');
  });
  return out;
};

/** Accepte la virgule décimale. `null` = saisie illisible, à signaler. */
function parseWeight(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

export function RatingScaleEditor() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [values, setValues] = useState<StrMap>(toStrMap(DEFAULT_RATING_WEIGHTS));
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'positive' | 'negative'; text: string } | null>(
    null
  );

  useEffect(() => {
    getRatingWeights()
      .then((res) => {
        setValues(toStrMap(res));
        setIsCustom(res.is_custom);
      })
      .catch(() => setValues(toStrMap(DEFAULT_RATING_WEIGHTS)))
      .finally(() => setLoading(false));
  }, []);

  const invalidKeys = useMemo(
    () =>
      (Object.keys(values) as (keyof RatingWeights)[]).filter(
        (k) => parseWeight(values[k]) === null
      ),
    [values]
  );

  const setField = (key: keyof RatingWeights, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
    setFeedback(null);
  };

  const save = async () => {
    if (invalidKeys.length > 0) {
      haptics.error();
      setFeedback({
        tone: 'negative',
        text: `${invalidKeys.length} valeur(s) illisible(s). Corrigez-les avant d'enregistrer.`,
      });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const out = {} as RatingWeights;
      (Object.keys(values) as (keyof RatingWeights)[]).forEach((k) => {
        out[k] = parseWeight(values[k]) ?? 0;
      });
      await setRatingWeights(out);
      setIsCustom(true);
      haptics.success();
      setFeedback({ tone: 'positive', text: 'Échelle enregistrée.' });
    } catch {
      haptics.error();
      setFeedback({ tone: 'negative', text: "Échec de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await resetRatingWeights();
      setValues(toStrMap(DEFAULT_RATING_WEIGHTS));
      setIsCustom(false);
      haptics.success();
      setFeedback({ tone: 'positive', text: 'Réinitialisée aux valeurs par défaut.' });
    } catch {
      haptics.error();
      setFeedback({ tone: 'negative', text: 'Échec de la réinitialisation.' });
    } finally {
      setSaving(false);
    }
  };

  const field = (f: { key: keyof RatingWeights; label: string }) => {
    const invalid = parseWeight(values[f.key]) === null;
    return (
      <View key={f.key} style={[styles.row, { gap: theme.space.md }]}>
        <Text variant="body" style={styles.flex}>
          {f.label}
        </Text>
        <TextInput
          value={values[f.key]}
          onChangeText={(t) => setField(f.key, t)}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={`Poids : ${f.label}`}
          placeholderTextColor={c.text.tertiary}
          style={[
            styles.input,
            {
              backgroundColor: c.bg.sunken,
              borderRadius: theme.radius.sm,
              borderColor: invalid ? c.negative.default : c.border.subtle,
              color: invalid ? c.negative.default : c.text.primary,
            },
          ]}
        />
      </View>
    );
  };

  return (
    <Card variant="raised" padding="lg" style={{ gap: theme.space.md }}>
      <View style={styles.header}>
        <Ionicons name="options-outline" size={18} color={c.text.secondary} />
        <Text variant="headline" style={styles.flex}>
          Échelle de notation
        </Text>
        {!loading && (
          <Badge
            label={isCustom ? 'Personnalisée' : 'Par défaut'}
            tone={isCustom ? 'accent' : 'neutral'}
            size="sm"
          />
        )}
      </View>

      <Text variant="callout" tone="secondary">
        Chaque joueur de champ part de 5,0. Ces poids ajustent sa note selon les événements du
        match : individuel pour le joueur concerné, collectif pour tous les présents. Les gardiens
        ne sont pas notés.
      </Text>

      {loading ? (
        <SkeletonList rows={6} />
      ) : (
        <>
          <Text variant="callout" tone="tertiary" weight="600" style={styles.group}>
            Individuel
          </Text>
          {INDIV_FIELDS.map(field)}

          <Text variant="callout" tone="tertiary" weight="600" style={styles.group}>
            Collectif, présents sur le terrain
          </Text>
          {COLL_FIELDS.map(field)}

          {feedback && (
            <View style={[styles.feedback, { gap: theme.space.sm }]}>
              <Ionicons
                name={feedback.tone === 'positive' ? 'checkmark-circle' : 'alert-circle'}
                size={15}
                color={feedback.tone === 'positive' ? c.positive.default : c.negative.default}
              />
              <Text variant="callout" tone={feedback.tone} style={styles.flex}>
                {feedback.text}
              </Text>
            </View>
          )}

          <View style={[styles.actions, { gap: theme.space.md }]}>
            <Button
              label={saving ? 'Enregistrement…' : "Enregistrer l'échelle"}
              onPress={save}
              loading={saving}
              disabled={saving}
              style={styles.flex}
            />
            <Button
              label="Réinitialiser"
              variant="ghost"
              onPress={reset}
              disabled={!isCustom || saving}
            />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  group: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  input: {
    width: 96,
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
  feedback: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
});
