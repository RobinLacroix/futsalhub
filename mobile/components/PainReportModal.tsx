import { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import BodyMap, { type PainSelection } from './BodyMap';
import { toPayload } from '../lib/painMap';
import { reportMyPain } from '../lib/services/painReports';

type Onset = 'aigu' | 'chronique' | null;

const C = {
  bg: '#edf0f5', surface: '#ffffff', surface2: '#f4f6fa', border: '#dde3ec',
  navy: '#1a2744', green: '#059669', greenLt: '#ecfdf5', red: '#dc2626',
  text1: '#0f172a', text2: '#475569', text3: '#94a3b8',
} as const;

/**
 * Modale "Signaler une douleur" (spontané), réutilisable : fiche joueur, onglet
 * questionnaires. Contrôlée par `visible` / `onClose`. `onSubmitted` permet de
 * rafraîchir une liste après envoi.
 */
export default function PainReportModal({
  visible, onClose, onSubmitted,
}: {
  visible: boolean; onClose: () => void; onSubmitted?: () => void;
}) {
  const [pain, setPain] = useState<PainSelection>({});
  const [onset, setOnset] = useState<Onset>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => { setPain({}); setOnset(null); setNote(''); setSubmitted(false); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    const zones = toPayload(pain);
    if (zones.length === 0) return;
    setSubmitting(true);
    try {
      const res = await reportMyPain(zones, note.trim() || null, onset, null);
      if (!res.success) { Alert.alert('Erreur', res.error || 'Impossible d\'envoyer.'); return; }
      setSubmitted(true);
      onSubmitted?.();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'envoyer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <KeyboardAvoidingView style={m.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={m.header}>
          <View style={m.headerLeft}>
            <View style={m.accentBar} />
            <Text style={m.headerTitle}>SIGNALER UNE DOULEUR</Text>
          </View>
          <TouchableOpacity style={m.closeBtn} onPress={close} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={m.scroll} showsVerticalScrollIndicator={false}>
          {submitted ? (
            <View style={m.centered}>
              <View style={m.successIcon}><Ionicons name="checkmark" size={32} color="#fff" /></View>
              <Text style={m.successTitle}>Signalement envoyé !</Text>
              <Text style={m.successSub}>Ton staff a été alerté.</Text>
              <TouchableOpacity style={m.closeTextBtn} onPress={close}>
                <Text style={m.closeTextBtnLabel}>Fermer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={m.introCard}>
                <Text style={m.introTitle}>Où as-tu mal ?</Text>
                <Text style={m.introSub}>Touche une zone : 1 fois modérée, 2 fois assez intense, 3 fois très intense. Bascule Face / Dos en haut.</Text>
              </View>

              <View style={m.card}>
                <BodyMap value={pain} onChange={setPain} />
                {Object.keys(pain).length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={m.label}>DEPUIS QUAND ?</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([['aigu', 'Récent / aigu'], ['chronique', 'Qui traîne']] as const).map(([v, lbl]) => {
                        const active = onset === v;
                        return (
                          <TouchableOpacity key={v} onPress={() => setOnset(active ? null : v)}
                            style={[m.onsetBtn, active && m.onsetBtnActive]} activeOpacity={0.8}>
                            <Text style={[m.onsetTxt, active && m.onsetTxtActive]}>{lbl}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              <View style={m.card}>
                <View style={m.cardHead}>
                  <Ionicons name="chatbubble-outline" size={13} color={C.green} />
                  <Text style={[m.label, { flex: 1, color: C.green }]}>PRÉCISION</Text>
                  <View style={m.optionalBadge}><Text style={m.optionalText}>optionnel</Text></View>
                </View>
                <TextInput
                  style={m.noteInput}
                  placeholder="Contexte, type de douleur, à l'effort ou au repos..."
                  placeholderTextColor={C.text3}
                  value={note} onChangeText={setNote}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[m.submitBtn, (Object.keys(pain).length === 0 || submitting) && m.submitBtnDisabled]}
                onPress={submit}
                disabled={Object.keys(pain).length === 0 || submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <>
                      <Ionicons name="send-outline" size={16} color="#fff" />
                      <Text style={m.submitBtnText}>Envoyer au staff</Text>
                    </>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.navy, paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accentBar: { width: 3, height: 14, borderRadius: 2, backgroundColor: C.red },
  headerTitle: { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  scroll: { padding: 16, paddingBottom: 60, gap: 16 },
  centered: { minHeight: 300, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 40 },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  successTitle: { fontSize: 18, fontWeight: '800', color: C.text1 },
  successSub: { fontSize: 14, color: C.text2 },
  closeTextBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  closeTextBtnLabel: { fontSize: 14, fontWeight: '700', color: C.navy },

  introCard: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 4, borderLeftColor: C.red, padding: 14, gap: 4 },
  introTitle: { fontSize: 18, fontWeight: '800', color: C.text1 },
  introSub: { fontSize: 13, color: C.text2, lineHeight: 18 },

  card: { backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 1, marginBottom: 6 },

  onsetBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', borderColor: C.border, backgroundColor: C.surface2 },
  onsetBtnActive: { borderColor: C.navy, backgroundColor: C.navy },
  onsetTxt: { fontSize: 12, fontWeight: '700', color: C.text2 },
  onsetTxtActive: { color: '#fff' },

  optionalBadge: { backgroundColor: C.greenLt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  optionalText: { fontSize: 9, fontWeight: '700', color: C.green },
  noteInput: { backgroundColor: C.surface2, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.text1, minHeight: 72 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.navy, paddingVertical: 14, borderRadius: 10 },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
