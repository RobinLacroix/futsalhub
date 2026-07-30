import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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

function toStrMap(w: RatingWeights): StrMap {
  const out = {} as StrMap;
  (Object.keys(w) as (keyof RatingWeights)[]).forEach(k => { out[k] = String(w[k]); });
  return out;
}
function toWeights(m: StrMap): RatingWeights {
  const out = {} as RatingWeights;
  (Object.keys(m) as (keyof RatingWeights)[]).forEach(k => {
    const v = parseFloat(m[k]);
    out[k] = Number.isFinite(v) ? v : 0;
  });
  return out;
}

export function RatingScaleEditor() {
  const [values, setValues] = useState<StrMap>(toStrMap(DEFAULT_RATING_WEIGHTS));
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getRatingWeights();
        setValues(toStrMap(res));
        setIsCustom(res.is_custom);
      } catch {
        setValues(toStrMap(DEFAULT_RATING_WEIGHTS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (key: keyof RatingWeights, raw: string) => {
    setValues(prev => ({ ...prev, [key]: raw }));
    setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await setRatingWeights(toWeights(values));
      setIsCustom(true);
      setFeedback('Échelle enregistrée.');
    } catch {
      setFeedback("Échec de l'enregistrement.");
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
      setFeedback('Réinitialisée aux valeurs par défaut.');
    } catch {
      setFeedback('Échec de la réinitialisation.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f: { key: keyof RatingWeights; label: string }) => (
    <View key={f.key} style={st.row}>
      <Text style={st.rowLabel}>{f.label}</Text>
      <TextInput
        value={values[f.key]}
        onChangeText={t => setField(f.key, t)}
        keyboardType="numbers-and-punctuation"
        style={st.input}
      />
    </View>
  );

  return (
    <View style={st.card}>
      <View style={st.cardHeader}>
        <View style={st.accent} />
        <Ionicons name="options-outline" size={18} color="#1e3a5f" />
        <Text style={st.cardTitle}>Échelle de notation</Text>
      </View>
      <View style={st.cardBody}>
        <Text style={st.intro}>
          Chaque joueur de champ part de 5,0. Ces poids ajustent sa note selon les événements du match
          (individuel = joueur concerné, collectif = tous les présents). Gardiens non notés.
        </Text>
        <Text style={[st.status, { color: isCustom ? '#059669' : '#64748b' }]}>
          {loading ? 'Chargement…' : isCustom ? 'Échelle personnalisée active' : 'Échelle par défaut'}
        </Text>

        {loading ? (
          <ActivityIndicator color="#1e3a5f" style={{ marginVertical: 16 }} />
        ) : (
          <>
            <Text style={st.groupLabel}>Individuel</Text>
            {INDIV_FIELDS.map(renderField)}
            <Text style={st.groupLabel}>Collectif (présents sur le terrain)</Text>
            {COLL_FIELDS.map(renderField)}

            <View style={st.actions}>
              <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                <Text style={st.saveBtnText}>{saving ? 'Enregistrement…' : "Enregistrer l'échelle"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.resetBtn, (!isCustom || saving) && { opacity: 0.4 }]}
                onPress={reset}
                disabled={!isCustom || saving}
              >
                <Text style={st.resetBtnText}>Réinitialiser</Text>
              </TouchableOpacity>
            </View>
            {feedback ? <Text style={st.feedback}>{feedback}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  accent: { width: 3, height: 16, borderRadius: 2, backgroundColor: '#1e3a5f' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardBody: { padding: 14 },
  intro: { fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 6 },
  status: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  groupLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: '#334155', flex: 1 },
  input: { width: 84, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 13, color: '#0f172a', textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  saveBtn: { backgroundColor: '#1e3a5f', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  resetBtn: { borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  resetBtnText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  feedback: { fontSize: 12, color: '#64748b', marginTop: 10 },
});
