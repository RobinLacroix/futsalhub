import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByTeam, createPlayersBulk } from '../../../lib/services/players';
import { parsePlayersWorkbook, markExistingDuplicates, ImportTemplateError, type ParsedPlayerRow } from '../../../lib/importPlayers';

const POSITION_COLORS: Record<string, { color: string; bg: string; abbr: string }> = {
  Gardien: { color: '#d97706', bg: 'rgba(217,119,6,0.12)', abbr: 'GB' },
  Meneur:  { color: '#059669', bg: 'rgba(5,150,105,0.10)', abbr: 'MEN' },
  Ailier:  { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', abbr: 'AIL' },
  Pivot:   { color: '#ea580c', bg: 'rgba(234,88,12,0.10)', abbr: 'PIV' },
};

const REQUIRED_FIELDS = ['Prénom', 'Nom', 'Date de naissance', 'Poste', 'Pied fort'];

type Step = 1 | 2 | 3 | 4;

export default function ImportPlayersScreen() {
  const router = useRouter();
  const { activeTeamId, activeTeam } = useActiveTeam();

  const [step, setStep] = useState<Step>(1);
  const [existingPlayers, setExistingPlayers] = useState<Array<{ first_name: string; last_name: string }>>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedPlayerRow[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    if (!activeTeamId) return;
    getPlayersByTeam(activeTeamId)
      .then(players => setExistingPlayers(players.map(p => ({ first_name: p.first_name, last_name: p.last_name }))))
      .catch(() => setExistingPlayers([]));
  }, [activeTeamId]);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setIncluded(new Set());
    setParseError(null);
    setStep(1);
  };

  const handleShareTemplate = async () => {
    try {
      const asset = Asset.fromModule(require('../../../assets/templates/modele_import_effectif.xlsx'));
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Fichier modèle introuvable');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(asset.localUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Modèle import effectif',
        });
      } else {
        Alert.alert('Partage indisponible', "Le partage de fichiers n'est pas disponible sur cet appareil.");
      }
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir le modèle.");
    }
  };

  const handlePickFile = async () => {
    setParseError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const file = result.assets[0];
    setIsParsing(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const parsed = markExistingDuplicates(parsePlayersWorkbook(base64), existingPlayers);
      setFileName(file.name);
      setRows(parsed);
      setIncluded(new Set(parsed.filter(r => r.status === 'ok').map(r => r.rowNumber)));
    } catch (err) {
      setFileName(null);
      setRows([]);
      setParseError(err instanceof ImportTemplateError ? err.message : "Impossible de lire ce fichier. Vérifiez qu'il s'agit bien d'un .xlsx basé sur le modèle.");
    } finally {
      setIsParsing(false);
    }
  };

  const toggleRow = (rowNumber: number) => {
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const okCount = rows.filter(r => r.status === 'ok').length;
  const dupCount = rows.filter(r => r.status === 'duplicate').length;
  const errCount = rows.filter(r => r.status === 'error').length;
  const selectedCount = included.size;

  const handleConfirmImport = async () => {
    if (!activeTeamId) return;
    setIsImporting(true);
    try {
      const toCreate = rows
        .filter(r => included.has(r.rowNumber) && r.data)
        .map(r => r.data!);
      const created = await createPlayersBulk(activeTeamId, toCreate);
      setImportedCount(created.length);
      setStep(4);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setIsImporting(false);
    }
  };

  if (!activeTeamId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Choisissez une équipe dans l&apos;onglet Accueil</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Étape 1 : modèle ────────────────────────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={styles.title}>1. Téléchargez le modèle</Text>
            <Text style={styles.subtitle}>
              Partagez-vous le modèle (Fichiers, e-mail…), remplissez une ligne par joueur, puis réimportez-le à l&apos;étape suivante.
            </Text>
            <View style={styles.chipRow}>
              {REQUIRED_FIELDS.map(f => (
                <View key={f} style={styles.fieldChip}>
                  <Text style={styles.fieldChipText}>{f} <Text style={styles.req}>*</Text></Text>
                </View>
              ))}
              <View style={styles.fieldChip}>
                <Text style={[styles.fieldChipText, { color: '#94a3b8' }]}>Numéro (optionnel)</Text>
              </View>
            </View>
            <Text style={styles.hint}><Text style={styles.req}>*</Text> obligatoire — une ligne incomplète sera signalée en erreur.</Text>

            <TouchableOpacity style={styles.templateRow} onPress={handleShareTemplate} activeOpacity={0.8}>
              <View style={styles.xlsIcon}>
                <Ionicons name="document-text-outline" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.templateName}>modele_import_effectif.xlsx</Text>
                <Text style={styles.templateMeta}>Toucher pour partager / enregistrer</Text>
              </View>
              <Ionicons name="share-outline" size={20} color="#3b82f6" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep(2)} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>J&apos;ai rempli mon fichier</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Étape 2 : upload ────────────────────────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={styles.title}>2. Importez votre fichier rempli</Text>

            {!fileName && (
              <TouchableOpacity style={styles.dropzone} onPress={handlePickFile} activeOpacity={0.85} disabled={isParsing}>
                {isParsing ? (
                  <ActivityIndicator color="#3b82f6" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={30} color="#3b82f6" />
                    <Text style={styles.dropzoneTitle}>Choisir votre fichier rempli</Text>
                    <Text style={styles.dropzoneHint}>Format accepté : .xlsx — basé sur le modèle</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {parseError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.errorBoxText}>{parseError}</Text>
              </View>
            )}

            {fileName && (
              <View style={styles.templateRow}>
                <View style={styles.xlsIcon}>
                  <Ionicons name="document-text-outline" size={17} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateName}>{fileName}</Text>
                  <Text style={styles.templateMeta}>{rows.length} ligne{rows.length !== 1 ? 's' : ''} détectée{rows.length !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => { setFileName(null); setRows([]); setIncluded(new Set()); }}>
                  <Ionicons name="close-circle" size={22} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.textBtn} onPress={() => setStep(1)}>
                <Ionicons name="arrow-back" size={15} color="#64748b" />
                <Text style={styles.textBtnText}>Retour</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, !fileName && styles.primaryBtnDisabled]}
                onPress={() => fileName && setStep(3)}
                disabled={!fileName}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Analyser le fichier</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Étape 3 : vérification ──────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Text style={styles.title}>3. Vérifiez avant d&apos;importer</Text>
            <View style={styles.statRow}>
              <StatPill label="lignes" value={rows.length} tone="neutral" />
              <StatPill label="OK" value={okCount} tone="ok" />
              <StatPill label="doublons" value={dupCount} tone="warn" />
              <StatPill label="erreurs" value={errCount} tone="err" />
            </View>

            {rows.map(r => {
              const posInfo = r.data ? POSITION_COLORS[r.data.position] : null;
              const isErr = r.status === 'error';
              return (
                <TouchableOpacity
                  key={r.rowNumber}
                  style={[styles.rowCard, r.status === 'duplicate' && styles.rowCardDup, isErr && styles.rowCardErr]}
                  onPress={() => !isErr && toggleRow(r.rowNumber)}
                  disabled={isErr}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={included.has(r.rowNumber) ? 'checkbox' : isErr ? 'close-circle-outline' : 'square-outline'}
                    size={22}
                    color={isErr ? '#cbd5e1' : included.has(r.rowNumber) ? '#3b82f6' : '#94a3b8'}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.rowName, isErr && styles.rowNameErr]}>
                      {r.input.first_name || '—'} {r.input.last_name || '—'}
                    </Text>
                    <View style={styles.rowMetaLine}>
                      {posInfo && (
                        <View style={[styles.posBadge, { backgroundColor: posInfo.bg }]}>
                          <Text style={[styles.posBadgeText, { color: posInfo.color }]}>{posInfo.abbr}</Text>
                        </View>
                      )}
                      <Text style={styles.rowMeta}>
                        {r.data ? `${r.data.birth_date} · ${r.data.strong_foot}${r.data.number ? ` · #${r.data.number}` : ''}` : r.input.birth_date || '—'}
                      </Text>
                    </View>
                    {r.status === 'ok' && <Text style={styles.statusOk}>Prêt</Text>}
                    {r.status === 'duplicate' && (
                      <Text style={styles.statusWarn}>{r.duplicateOf === 'file' ? 'Doublon dans le fichier' : "Déjà dans l'effectif"}</Text>
                    )}
                    {r.status === 'error' && <Text style={styles.statusErr}>{r.errorMessage}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.footerRow}>
              <Text style={styles.footerMsg}>
                <Text style={{ fontWeight: '700', color: '#0f172a' }}>{selectedCount}</Text> joueur{selectedCount !== 1 ? 's' : ''} seront ajoutés à {activeTeam?.name}
              </Text>
            </View>
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.textBtn} onPress={() => router.back()}>
                <Text style={styles.textBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, (selectedCount === 0 || isImporting) && styles.primaryBtnDisabled]}
                onPress={handleConfirmImport}
                disabled={selectedCount === 0 || isImporting}
                activeOpacity={0.85}
              >
                {isImporting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="people-outline" size={16} color="#fff" />}
                <Text style={styles.primaryBtnText}>Importer {selectedCount} joueur{selectedCount !== 1 ? 's' : ''}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Étape 4 : confirmation ──────────────────────────────────── */}
        {step === 4 && (
          <View style={styles.successWrap}>
            <View style={styles.checkRing}>
              <Ionicons name="checkmark" size={34} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>
              {importedCount} joueur{importedCount !== 1 ? 's' : ''} ajouté{importedCount !== 1 ? 's' : ''} à l&apos;effectif
            </Text>
            <Text style={styles.successSubtitle}>
              Ils apparaissent dans {activeTeam?.name}. Complétez les fiches quand vous aurez un moment.
            </Text>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 20 }]} onPress={() => router.replace('/(tabs)/squad')} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Voir l&apos;effectif</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.textBtn} onPress={reset}>
              <Text style={styles.textBtnText}>Importer un autre fichier</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'ok' | 'warn' | 'err' }) {
  const styles2: Record<string, { bg: string; color: string }> = {
    neutral: { bg: '#f8fafc', color: '#64748b' },
    ok: { bg: 'rgba(22,163,74,0.10)', color: '#16a34a' },
    warn: { bg: 'rgba(217,119,6,0.10)', color: '#d97706' },
    err: { bg: 'rgba(220,38,38,0.10)', color: '#dc2626' },
  };
  const s = styles2[tone];
  return (
    <View style={[styles.statPill, { backgroundColor: s.bg }]}>
      <Text style={[styles.statPillValue, { color: s.color }]}>{value}</Text>
      <Text style={[styles.statPillLabel, { color: s.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 13.5, color: '#64748b', lineHeight: 19, marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  fieldChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  fieldChipText: { fontSize: 11.5, fontWeight: '700', color: '#0f172a' },
  req: { color: '#dc2626', fontWeight: '800' },
  hint: { fontSize: 11.5, color: '#94a3b8', marginBottom: 18 },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', borderRadius: 12, padding: 14, marginBottom: 20 },
  xlsIcon: { width: 38, height: 38, borderRadius: 9, backgroundColor: '#1D6F42', justifyContent: 'center', alignItems: 'center' },
  templateName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  templateMeta: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  dropzone: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 40, marginBottom: 16, gap: 8 },
  dropzoneTitle: { fontSize: 14.5, fontWeight: '700', color: '#0f172a' },
  dropzoneHint: { fontSize: 12, color: '#64748b' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)', borderRadius: 10, padding: 12, marginBottom: 16 },
  errorBoxText: { flex: 1, fontSize: 12.5, color: '#991b1b' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
  textBtnText: { fontSize: 13.5, fontWeight: '600', color: '#64748b' },
  footerMsg: { fontSize: 13, color: '#64748b' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statPill: { flexDirection: 'row', alignItems: 'baseline', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  statPillValue: { fontSize: 15, fontWeight: '800' },
  statPillLabel: { fontSize: 11.5, fontWeight: '700' },
  rowCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 8 },
  rowCardDup: { backgroundColor: 'rgba(217,119,6,0.04)', borderColor: 'rgba(217,119,6,0.25)' },
  rowCardErr: { backgroundColor: '#f8fafc', opacity: 0.75 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowNameErr: { color: '#94a3b8' },
  rowMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  posBadge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 },
  posBadgeText: { fontSize: 9.5, fontWeight: '800' },
  rowMeta: { fontSize: 12, color: '#64748b' },
  statusOk: { fontSize: 11.5, fontWeight: '700', color: '#16a34a', marginTop: 4 },
  statusWarn: { fontSize: 11.5, fontWeight: '700', color: '#d97706', marginTop: 4 },
  statusErr: { fontSize: 11.5, fontWeight: '700', color: '#dc2626', marginTop: 4 },
  successWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 12 },
  checkRing: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(22,163,74,0.10)', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  successTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 6 },
  successSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19 },
});
