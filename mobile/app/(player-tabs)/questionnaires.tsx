import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../../lib/supabase';
import { getMyPendingFeedbackTokens, type MyPendingFeedbackRow } from '../../lib/services/playerConvocations';


// ─── Design tokens ─────────────────────────────────────────────────────────

const C = {
  bg:      '#edf0f5',
  surface: '#ffffff',
  surface2:'#f4f6fa',
  border:  '#dde3ec',
  navy:    '#1a2744',
  amber:   '#d97706',
  amberLt: '#fef3c7',
  green:   '#059669',
  greenLt: '#ecfdf5',
  red:     '#dc2626',
  text1:   '#0f172a',
  text2:   '#475569',
  text3:   '#94a3b8',
  divider: '#e8edf4',
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

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

const METRICS: { key: keyof FormValues; label: string; desc: string; lowLabel: string; highLabel: string }[] = [
  { key: 'auto_evaluation', label: 'Auto-évaluation',    desc: 'Comment as-tu joué ?',              lowLabel: 'Très mal',   highLabel: 'Excellent'  },
  { key: 'rpe',             label: 'Intensité (RPE)',     desc: "Intensité perçue de l'effort",       lowLabel: 'Très légère',highLabel: 'Maximale'   },
  { key: 'physical_form',   label: 'Forme physique',      desc: 'Comment tu te sentais physiquement', lowLabel: 'Très faible',highLabel: 'Parfaite'   },
  { key: 'pleasure',        label: 'Plaisir',             desc: 'As-tu apprécié la séance ?',         lowLabel: 'Aucun',      highLabel: 'Maximum'    },
];

// ─── Screen ────────────────────────────────────────────────────────────────

export default function PlayerQuestionnairesScreen() {
  const [items, setItems]           = useState<MyPendingFeedbackRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Modal state
  const [activeItem, setActiveItem]       = useState<MyPendingFeedbackRow | null>(null);
  const [sessionInfo, setSessionInfo]     = useState<SessionInfo | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError]   = useState<string | null>(null);
  const [form, setForm]                   = useState<FormValues>({ auto_evaluation: null, rpe: null, physical_form: null, pleasure: null });
  const [comment, setComment]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getMyPendingFeedbackTokens();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setItems([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const openForm = useCallback(async (item: MyPendingFeedbackRow) => {
    setActiveItem(item);
    setSessionInfo(null);
    setSessionError(null);
    setSessionLoading(true);
    setSubmitted(false);
    setForm({ auto_evaluation: null, rpe: null, physical_form: null, pleasure: null });
    setComment('');

    try {
      const { data, error: rpcError } = await supabase.rpc('get_feedback_session_by_token', { p_token: item.token });
      if (rpcError) throw rpcError;
      const result = data as { error?: string } & SessionInfo | null;
      if (!result) throw new Error('Token introuvable');
      if ('error' in result && result.error) {
        setSessionError(result.error === 'already_used' ? 'Ce questionnaire a déjà été rempli.'
          : result.error === 'expired' ? 'Ce questionnaire a expiré.'
          : 'Lien invalide.');
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
    if (auto_evaluation == null || rpe == null || physical_form == null || pleasure == null) {
      Alert.alert('Incomplet', 'Réponds à toutes les questions avant de valider.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('submit_training_feedback', {
        p_token:           activeItem.token,
        p_auto_evaluation: auto_evaluation,
        p_rpe:             rpe,
        p_physical_form:   physical_form,
        p_pleasure:        pleasure,
        p_comment:         comment.trim() || null,
      });
      if (rpcError) throw rpcError;
      const result = data as { success: boolean; error?: string } | null;
      if (!result?.success) {
        const msg = result?.error === 'already_used' ? 'Déjà rempli.'
          : result?.error === 'expired' ? 'Le questionnaire a expiré.'
          : 'Erreur lors de la soumission.';
        Alert.alert('Erreur', msg);
        return;
      }
      setSubmitted(true);
      setItems(prev => prev.filter(i => i.token !== activeItem.token));
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'envoyer.');
    } finally {
      setSubmitting(false);
    }
  }, [activeItem, form, comment]);

  const allAnswered = Object.values(form).every(v => v !== null);

  if (loading && items.length === 0) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.navy} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {error && (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle-outline" size={15} color={C.red} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={item => item.training_id + item.token}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={s.listHeader}>
              <View style={s.accentBar} />
              <Text style={s.listHeaderText}>{items.length} questionnaire{items.length > 1 ? 's' : ''} en attente</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={40} color={C.green} style={{ marginBottom: 12 }} />
            <Text style={s.emptyTitle}>Tout est à jour</Text>
            <Text style={s.emptyText}>Aucun questionnaire en attente. Beau travail !</Text>
          </View>
        }
        renderItem={({ item }) => {
          let dateLabel = '';
          try { dateLabel = format(parseISO(item.training_date), 'EEEE d MMMM yyyy', { locale: fr }); }
          catch { dateLabel = item.training_date; }

          return (
            <TouchableOpacity style={s.card} onPress={() => openForm(item)} activeOpacity={0.75}>
              <View style={s.cardTop}>
                <View style={s.cardBadge}>
                  <Ionicons name="document-text-outline" size={12} color={C.amber} />
                  <Text style={s.cardBadgeText}>QUESTIONNAIRE</Text>
                </View>
                <Text style={s.cardDate}>{dateLabel}</Text>
              </View>
              <Text style={s.cardTheme}>{item.theme || "Séance d'entraînement"}</Text>
              <View style={s.cardCta}>
                <Text style={s.cardCtaText}>Remplir le questionnaire</Text>
                <View style={s.cardCtaArrow}>
                  <Ionicons name="arrow-forward" size={13} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Modale formulaire natif ── */}
      <Modal
        visible={activeItem !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView style={m.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header modale */}
          <View style={m.header}>
            <View style={m.headerLeft}>
              <View style={m.accentBar} />
              <Text style={m.headerTitle}>QUESTIONNAIRE</Text>
            </View>
            <TouchableOpacity style={m.closeBtn} onPress={closeModal} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={C.text2} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={m.scroll} showsVerticalScrollIndicator={false}>

            {/* États de chargement / erreur / succès */}
            {sessionLoading && (
              <View style={m.centered}>
                <ActivityIndicator size="large" color={C.navy} />
                <Text style={m.hint}>Chargement…</Text>
              </View>
            )}

            {!sessionLoading && sessionError && (
              <View style={m.centered}>
                <Ionicons name="warning-outline" size={36} color={C.amber} style={{ marginBottom: 12 }} />
                <Text style={m.errorTitle}>{sessionError}</Text>
                <TouchableOpacity style={m.closeTextBtn} onPress={closeModal}>
                  <Text style={m.closeTextBtnLabel}>Fermer</Text>
                </TouchableOpacity>
              </View>
            )}

            {!sessionLoading && submitted && (
              <View style={m.centered}>
                <View style={m.successIcon}>
                  <Ionicons name="checkmark" size={32} color="#fff" />
                </View>
                <Text style={m.successTitle}>Questionnaire envoyé !</Text>
                <Text style={m.successSub}>Merci pour ton retour.</Text>
                <TouchableOpacity style={m.closeTextBtn} onPress={closeModal}>
                  <Text style={m.closeTextBtnLabel}>Fermer</Text>
                </TouchableOpacity>
              </View>
            )}

            {!sessionLoading && !sessionError && !submitted && sessionInfo && (
              <>
                {/* Infos séance */}
                <View style={m.sessionCard}>
                  <Text style={m.sessionTheme}>{sessionInfo.theme || "Séance d'entraînement"}</Text>
                  <View style={m.sessionMeta}>
                    <Ionicons name="calendar-outline" size={13} color={C.text3} />
                    <Text style={m.sessionDate}>
                      {format(parseISO(sessionInfo.training_date), 'EEEE d MMMM yyyy', { locale: fr })}
                    </Text>
                  </View>
                </View>

                {/* Métriques */}
                {METRICS.map(metric => (
                  <MetricRow
                    key={metric.key}
                    label={metric.label}
                    desc={metric.desc}
                    lowLabel={metric.lowLabel}
                    highLabel={metric.highLabel}
                    value={form[metric.key]}
                    onChange={v => setForm(prev => ({ ...prev, [metric.key]: v }))}
                  />
                ))}

                {/* Commentaire libre */}
                <View style={m.commentCard}>
                  <View style={m.commentHeader}>
                    <Ionicons name="chatbubble-outline" size={13} color={C.green} />
                    <Text style={m.commentLabel}>COMMENTAIRE LIBRE</Text>
                    <View style={m.optionalBadge}><Text style={m.optionalText}>optionnel</Text></View>
                  </View>
                  <TextInput
                    style={m.commentInput}
                    placeholder="Un mot pour ton coach : ressenti, douleur, motivation..."
                    placeholderTextColor={C.text3}
                    value={comment}
                    onChangeText={setComment}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Bouton submit */}
                <TouchableOpacity
                  style={[m.submitBtn, (!allAnswered || submitting) && m.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!allAnswered || submitting}
                  activeOpacity={0.85}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="send-outline" size={16} color="#fff" />
                        <Text style={m.submitBtnText}>Envoyer le questionnaire</Text>
                      </>
                  }
                </TouchableOpacity>

                {!allAnswered && (
                  <Text style={m.hint}>Réponds aux {METRICS.length} questions pour valider</Text>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── MetricRow ──────────────────────────────────────────────────────────────

function MetricRow({
  label, desc, lowLabel, highLabel, value, onChange,
}: {
  label: string; desc: string; lowLabel: string; highLabel: string;
  value: number | null; onChange: (v: number) => void;
}) {
  return (
    <View style={mr.wrap}>
      <Text style={mr.label}>{label.toUpperCase()}</Text>
      <Text style={mr.desc}>{desc}</Text>
      <View style={mr.grid}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => {
          const active = value === n;
          const color  = n <= 3 ? C.green : n <= 6 ? C.amber : n <= 8 ? '#ea580c' : C.red;
          return (
            <TouchableOpacity
              key={n}
              style={[mr.btn, active && { backgroundColor: color, borderColor: color }]}
              onPress={() => onChange(n)}
              activeOpacity={0.7}
            >
              <Text style={[mr.btnText, active && { color: '#fff', fontWeight: '800' }]}>{n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={mr.labels}>
        <Text style={mr.lowLbl}>{lowLabel}</Text>
        {value !== null && (
          <Text style={[mr.selectedLbl]}>
            {value}/10
          </Text>
        )}
        <Text style={mr.highLbl}>{highLabel}</Text>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  list:     { padding: 14, paddingBottom: 40, gap: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#fee2e2' },
  errorText:   { flex: 1, fontSize: 13, color: C.red },

  listHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  accentBar:      { width: 3, height: 14, borderRadius: 2, backgroundColor: C.amber },
  listHeaderText: { fontSize: 11, fontWeight: '800', color: C.navy, textTransform: 'uppercase', letterSpacing: 0.8 },

  emptyWrap:  { paddingTop: 80, alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text1, marginBottom: 6 },
  emptyText:  { fontSize: 14, color: C.text2, textAlign: 'center', lineHeight: 20 },

  card:      { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.amber, padding: 14, gap: 10 },
  cardTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.amberLt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: C.amber + '44' },
  cardBadgeText: { fontSize: 9, fontWeight: '800', color: C.amber, letterSpacing: 0.8 },
  cardDate:  { fontSize: 11, color: C.text3 },
  cardTheme: { fontSize: 16, fontWeight: '700', color: C.text1, lineHeight: 22 },
  cardCta:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider },
  cardCtaText:  { fontSize: 13, fontWeight: '700', color: C.navy },
  cardCtaArrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center' },
});

// Modale
const m = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.navy, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accentBar:   { width: 3, height: 14, borderRadius: 2, backgroundColor: C.amber },
  headerTitle: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  scroll:  { padding: 16, paddingBottom: 60, gap: 16 },
  centered:{ minHeight: 300, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 40 },

  errorTitle: { fontSize: 15, fontWeight: '700', color: C.text1, textAlign: 'center', paddingHorizontal: 24 },
  hint:       { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 4 },

  successIcon:  { width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  successTitle: { fontSize: 18, fontWeight: '800', color: C.text1 },
  successSub:   { fontSize: 14, color: C.text2 },

  closeTextBtn:      { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  closeTextBtnLabel: { fontSize: 14, fontWeight: '700', color: C.navy },

  sessionCard: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.navy, padding: 14, gap: 6 },
  sessionTheme:{ fontSize: 18, fontWeight: '800', color: C.text1 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionDate: { fontSize: 13, color: C.text2 },

  commentCard:   { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: C.green, padding: 14, gap: 10 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentLabel:  { fontSize: 10, fontWeight: '800', color: C.green, letterSpacing: 1, flex: 1 },
  optionalBadge: { backgroundColor: C.greenLt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  optionalText:  { fontSize: 9, fontWeight: '700', color: C.green },
  commentInput:  { backgroundColor: C.surface2, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.text1, minHeight: 72 },

  submitBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.navy, paddingVertical: 14, borderRadius: 10, marginTop: 8 },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText:     { color: '#fff', fontSize: 15, fontWeight: '800' },
});

// Metric row
const mr = StyleSheet.create({
  wrap:  { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  label: { fontSize: 10, fontWeight: '800', color: C.navy, letterSpacing: 1 },
  desc:  { fontSize: 13, color: C.text2 },
  grid:  { flexDirection: 'row', gap: 5, flexWrap: 'nowrap' },
  btn:   { flex: 1, aspectRatio: 1, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface2, justifyContent: 'center', alignItems: 'center' },
  btnText:  { fontSize: 12, fontWeight: '600', color: C.text2 },
  labels:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lowLbl:   { fontSize: 10, color: C.text3, flex: 1 },
  highLbl:  { fontSize: 10, color: C.text3, textAlign: 'right', flex: 1 },
  selectedLbl: { fontSize: 11, fontWeight: '800', color: C.navy, textAlign: 'center' },
});
