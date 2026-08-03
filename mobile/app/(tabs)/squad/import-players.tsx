import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { format, isValid, parse } from 'date-fns';
import { useTheme } from '../../../contexts/ThemeContext';
import { useActiveTeam } from '../../../contexts/ActiveTeamContext';
import { getPlayersByTeam, createPlayersBulk } from '../../../lib/services/players';
import {
  parsePlayersWorkbook,
  markExistingDuplicates,
  ImportTemplateError,
  type ParsedPlayerRow,
} from '../../../lib/importPlayers';
import { haptics } from '../../../lib/design/haptics';
import { Text, Card, Button, Badge, EmptyState } from '../../../components/ui';
import { positionStyle } from '../../../components/players/positions';

const REQUIRED_FIELDS = ['Prénom', 'Nom', 'Date de naissance', 'Poste', 'Pied fort'];

/**
 * Vert et blanc d'Excel. Seules couleurs figées de l'écran, et volontairement :
 * elles identifient le FORMAT de fichier, pas l'application. Les faire suivre le
 * thème rendrait l'icône méconnaissable, ce qui est exactement l'inverse du but.
 */
const XLSX_BRAND = { bg: '#1D6F42', fg: '#FFFFFF' } as const;

type Step = 1 | 2 | 3 | 4;

const STEPS: { value: Step; label: string }[] = [
  { value: 1, label: 'Modèle' },
  { value: 2, label: 'Fichier' },
  { value: 3, label: 'Vérification' },
  { value: 4, label: 'Terminé' },
];

/** Le parseur renvoie de l'ISO ; on l'affiche au format français. */
function fmtBirthDate(iso: string): string {
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd/MM/yyyy') : iso;
}

export default function ImportPlayersScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { activeTeamId, activeTeam } = useActiveTeam();

  const [step, setStep] = useState<Step>(1);
  const [existingPlayers, setExistingPlayers] = useState<
    Array<{ first_name: string; last_name: string }>
  >([]);

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
      .then((players) =>
        setExistingPlayers(players.map((p) => ({ first_name: p.first_name, last_name: p.last_name })))
      )
      .catch(() => setExistingPlayers([]));
  }, [activeTeamId]);

  const counts = useMemo(
    () => ({
      ok: rows.filter((r) => r.status === 'ok').length,
      dup: rows.filter((r) => r.status === 'duplicate').length,
      err: rows.filter((r) => r.status === 'error').length,
    }),
    [rows]
  );
  const selectedCount = included.size;

  // ── Actions ───────────────────────────────────────────────────────────────

  const reset = () => {
    setFileName(null);
    setRows([]);
    setIncluded(new Set());
    setParseError(null);
    setStep(1);
  };

  const clearFile = () => {
    setFileName(null);
    setRows([]);
    setIncluded(new Set());
  };

  const shareTemplate = async () => {
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
      haptics.error();
      Alert.alert('Erreur', "Impossible d'ouvrir le modèle.");
    }
  };

  const pickFile = async () => {
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
      setIncluded(new Set(parsed.filter((r) => r.status === 'ok').map((r) => r.rowNumber)));
      haptics.success();
    } catch (err) {
      haptics.error();
      clearFile();
      setParseError(
        err instanceof ImportTemplateError
          ? err.message
          : "Impossible de lire ce fichier. Vérifiez qu'il s'agit bien d'un .xlsx basé sur le modèle."
      );
    } finally {
      setIsParsing(false);
    }
  };

  const toggleRow = (rowNumber: number) => {
    haptics.select();
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const toggleAllSelectable = () => {
    const selectable = rows.filter((r) => r.status !== 'error').map((r) => r.rowNumber);
    haptics.tapMedium();
    setIncluded((prev) => (prev.size === selectable.length ? new Set() : new Set(selectable)));
  };

  const confirmImport = async () => {
    if (!activeTeamId) return;
    setIsImporting(true);
    try {
      const toCreate = rows.filter((r) => included.has(r.rowNumber) && r.data).map((r) => r.data!);
      const created = await createPlayersBulk(activeTeamId, toCreate);
      setImportedCount(created.length);
      haptics.success();
      setStep(4);
    } catch (err) {
      haptics.error();
      Alert.alert('Erreur', err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setIsImporting(false);
    }
  };

  // ── État non nominal ──────────────────────────────────────────────────────

  if (!activeTeamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
        <EmptyState
          icon="people-outline"
          title="Aucune équipe sélectionnée"
          description="Choisissez une équipe depuis l'accueil avant d'importer un effectif."
          action={{ label: "Aller à l'accueil", onPress: () => router.replace('/(tabs)') }}
        />
      </View>
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bg.canvas }]}>
      {/* Le parcours annonçait ses étapes dans le titre (« 1. », « 2. »…) sans
          jamais montrer où l'on en était ni combien il en restait. */}
      <View style={[styles.stepper, { backgroundColor: c.bg.surface, borderBottomColor: c.border.subtle }]}>
        {STEPS.map((s, i) => {
          const done = step > s.value;
          const current = step === s.value;
          return (
            <View key={s.value} style={styles.stepItem}>
              {i > 0 && (
                <View
                  style={[
                    styles.stepLine,
                    { backgroundColor: done || current ? c.accent.default : c.border.subtle },
                  ]}
                />
              )}
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: done ? c.accent.fill : current ? c.accent.subtle : c.bg.sunken,
                    borderColor: done || current ? c.accent.default : c.border.subtle,
                  },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={13} color={c.text.onFill} />
                ) : (
                  <Text variant="caption" tone={current ? 'accent' : 'tertiary'} weight="700" numeric>
                    {s.value}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                tone={current ? 'accent' : done ? 'secondary' : 'tertiary'}
                weight={current ? '700' : '500'}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { gap: theme.space.lg }]}>
        {/* ── 1. Modèle ─────────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <View style={styles.intro}>
              <Text variant="title">Téléchargez le modèle</Text>
              <Text variant="body" tone="secondary">
                Envoyez-vous le fichier (Fichiers, e-mail…), remplissez une ligne par joueur, puis
                réimportez-le à l'étape suivante.
              </Text>
            </View>

            <Card variant="flat" padding="lg" style={{ gap: theme.space.md }}>
              <Text variant="callout" tone="secondary" weight="700">
                Colonnes attendues
              </Text>
              <View style={styles.chipRow}>
                {REQUIRED_FIELDS.map((f) => (
                  <Badge key={f} label={f} tone="accent" size="sm" />
                ))}
                <Badge label="Numéro (optionnel)" size="sm" />
              </View>
              <Text variant="caption" tone="tertiary">
                Une ligne à laquelle il manque une colonne obligatoire sera signalée en erreur et
                ne sera pas importée.
              </Text>
            </Card>

            <Pressable
              onPress={shareTemplate}
              accessibilityRole="button"
              accessibilityLabel="Partager le modèle modele_import_effectif.xlsx"
              style={({ pressed }) => [
                styles.fileRow,
                {
                  backgroundColor: pressed ? c.bg.sunken : c.bg.surface,
                  borderColor: c.border.strong,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <View style={[styles.fileIcon, { backgroundColor: XLSX_BRAND.bg, borderRadius: theme.radius.sm }]}>
                <Ionicons name="document-text-outline" size={20} color={XLSX_BRAND.fg} />
              </View>
              <View style={styles.fileText}>
                <Text variant="body" weight="700" numberOfLines={1}>
                  modele_import_effectif.xlsx
                </Text>
                <Text variant="caption" tone="tertiary">
                  Toucher pour partager ou enregistrer
                </Text>
              </View>
              <Ionicons name="share-outline" size={20} color={c.accent.default} />
            </Pressable>

            <Button
              label="J'ai rempli mon fichier"
              icon="arrow-forward"
              iconAfter
              size="lg"
              block
              onPress={() => setStep(2)}
            />
          </>
        )}

        {/* ── 2. Fichier ────────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text variant="title">Importez votre fichier rempli</Text>

            {!fileName && (
              <Pressable
                onPress={pickFile}
                disabled={isParsing}
                accessibilityRole="button"
                accessibilityLabel="Choisir un fichier Excel à importer"
                style={({ pressed }) => [
                  styles.dropzone,
                  {
                    backgroundColor: pressed ? c.bg.sunken : c.bg.surface,
                    borderColor: c.border.strong,
                    borderRadius: theme.radius.lg,
                  },
                ]}
              >
                {isParsing ? (
                  <>
                    <ActivityIndicator color={c.accent.default} />
                    <Text variant="callout" tone="secondary">
                      Lecture du fichier…
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={32} color={c.accent.default} />
                    <Text variant="headline">Choisir votre fichier</Text>
                    <Text variant="callout" tone="tertiary">
                      Format accepté : .xlsx, basé sur le modèle
                    </Text>
                  </>
                )}
              </Pressable>
            )}

            {parseError && (
              <Card variant="flat" padding="sm" style={[styles.errorBox, { backgroundColor: c.negative.subtle }]}>
                <Ionicons name="alert-circle" size={18} color={c.negative.default} />
                <Text variant="callout" tone="negative" style={styles.flex}>
                  {parseError}
                </Text>
              </Card>
            )}

            {fileName && (
              <View
                style={[
                  styles.fileRow,
                  { backgroundColor: c.bg.surface, borderColor: c.border.subtle, borderRadius: theme.radius.md },
                ]}
              >
                <View style={[styles.fileIcon, { backgroundColor: XLSX_BRAND.bg, borderRadius: theme.radius.sm }]}>
                  <Ionicons name="document-text-outline" size={18} color={XLSX_BRAND.fg} />
                </View>
                <View style={styles.fileText}>
                  <Text variant="body" weight="700" numberOfLines={1}>
                    {fileName}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {rows.length} ligne{rows.length !== 1 ? 's' : ''} détectée
                    {rows.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={clearFile}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer ce fichier"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close-circle" size={22} color={c.text.tertiary} />
                </Pressable>
              </View>
            )}

            <View style={[styles.footerRow, { gap: theme.space.md }]}>
              <Button label="Retour" icon="arrow-back" variant="ghost" onPress={() => setStep(1)} />
              <Button
                label="Analyser le fichier"
                icon="arrow-forward"
                iconAfter
                disabled={!fileName}
                onPress={() => setStep(3)}
                style={styles.flex}
              />
            </View>
          </>
        )}

        {/* ── 3. Vérification ───────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <Text variant="title">Vérifiez avant d'importer</Text>

            <View style={styles.chipRow}>
              <Badge label={`${rows.length} lignes`} size="sm" />
              <Badge label={`${counts.ok} prêtes`} tone="positive" size="sm" />
              {counts.dup > 0 && <Badge label={`${counts.dup} doublons`} tone="warning" size="sm" />}
              {counts.err > 0 && <Badge label={`${counts.err} erreurs`} tone="negative" size="sm" />}
            </View>

            {rows.some((r) => r.status !== 'error') && (
              <Button
                label={
                  selectedCount === rows.filter((r) => r.status !== 'error').length
                    ? 'Tout décocher'
                    : 'Tout cocher'
                }
                variant="ghost"
                size="sm"
                onPress={toggleAllSelectable}
                style={styles.selfStart}
              />
            )}

            {rows.map((r) => {
              const isErr = r.status === 'error';
              const checked = included.has(r.rowNumber);
              const pos = r.data ? positionStyle(r.data.position, c) : null;
              const name = `${r.input.first_name || '—'} ${r.input.last_name || '—'}`;

              const statusText =
                r.status === 'ok'
                  ? 'Prêt à importer'
                  : r.status === 'duplicate'
                    ? r.duplicateOf === 'file'
                      ? 'Doublon dans le fichier'
                      : "Déjà dans l'effectif"
                    : r.errorMessage;

              return (
                <Pressable
                  key={r.rowNumber}
                  onPress={() => !isErr && toggleRow(r.rowNumber)}
                  disabled={isErr}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: isErr }}
                  accessibilityLabel={`${name}. ${statusText}`}
                  style={({ pressed }) => [
                    styles.rowCard,
                    {
                      borderRadius: theme.radius.md,
                      gap: theme.space.md,
                      backgroundColor: pressed ? c.bg.sunken : c.bg.surface,
                      borderColor:
                        r.status === 'duplicate'
                          ? c.warning.default
                          : isErr
                            ? c.negative.default
                            : checked
                              ? c.accent.default
                              : c.border.subtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={isErr ? 'close-circle' : checked ? 'checkbox' : 'square-outline'}
                    size={23}
                    color={isErr ? c.negative.default : checked ? c.accent.default : c.text.tertiary}
                  />
                  <View style={styles.rowBody}>
                    <Text variant="body" weight="700" tone={isErr ? 'tertiary' : 'primary'} numberOfLines={1}>
                      {name}
                    </Text>
                    <View style={styles.rowMeta}>
                      {pos && (
                        <View style={[styles.posBadge, { borderColor: pos.color }]}>
                          <Text variant="caption" color={pos.color} weight="700">
                            {pos.abbr}
                          </Text>
                        </View>
                      )}
                      <Text variant="caption" tone="tertiary" numberOfLines={1} style={styles.flex}>
                        {r.data
                          ? `${fmtBirthDate(r.data.birth_date)} · ${r.data.strong_foot}${
                              r.data.number ? ` · n° ${r.data.number}` : ''
                            }`
                          : r.input.birth_date || '—'}
                      </Text>
                    </View>
                    <Text
                      variant="caption"
                      tone={
                        r.status === 'ok' ? 'positive' : r.status === 'duplicate' ? 'warning' : 'negative'
                      }
                      weight="700"
                    >
                      {statusText}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <Card variant="flat" padding="sm">
              <Text variant="callout" tone="secondary">
                <Text variant="callout" weight="700" numeric>
                  {selectedCount}
                </Text>{' '}
                joueur{selectedCount !== 1 ? 's' : ''} {selectedCount !== 1 ? 'seront' : 'sera'}{' '}
                ajouté{selectedCount !== 1 ? 's' : ''} à {activeTeam?.name}.
              </Text>
            </Card>

            <View style={[styles.footerRow, { gap: theme.space.md }]}>
              <Button label="Annuler" variant="ghost" onPress={() => router.back()} />
              <Button
                label={`Importer ${selectedCount} joueur${selectedCount !== 1 ? 's' : ''}`}
                icon="people-outline"
                disabled={selectedCount === 0 || isImporting}
                loading={isImporting}
                onPress={confirmImport}
                style={styles.flex}
              />
            </View>
          </>
        )}

        {/* ── 4. Terminé ────────────────────────────────────────────────── */}
        {step === 4 && (
          <View style={styles.success}>
            <View style={[styles.checkRing, { backgroundColor: c.positive.subtle }]}>
              <Ionicons name="checkmark" size={36} color={c.positive.default} />
            </View>
            <Text variant="title" style={styles.center}>
              {importedCount} joueur{importedCount !== 1 ? 's' : ''} ajouté
              {importedCount !== 1 ? 's' : ''}
            </Text>
            <Text variant="body" tone="secondary" style={styles.center}>
              Ils apparaissent dans {activeTeam?.name}. Complétez leurs fiches quand vous aurez un
              moment.
            </Text>
            <Button
              label="Voir l'effectif"
              size="lg"
              block
              onPress={() => router.replace('/(tabs)/squad')}
              style={styles.successBtn}
            />
            <Button label="Importer un autre fichier" variant="ghost" block onPress={reset} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  selfStart: { alignSelf: 'flex-start' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { gap: 6 },

  stepper: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepLine: { position: 'absolute', top: 12, right: '50%', left: -50, height: 2 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  fileIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  fileText: { flex: 1, gap: 2 },

  dropzone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },

  rowCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderWidth: 1 },
  rowBody: { flex: 1, gap: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  posBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },

  footerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },

  success: { alignItems: 'center', paddingTop: 32, gap: 10 },
  checkRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  successBtn: { marginTop: 16 },
});
