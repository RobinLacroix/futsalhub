'use client';

import { useRef, useState } from 'react';
import {
  X, Download, Upload, FileSpreadsheet, ArrowRight, ArrowLeft,
  CheckCircle2, AlertTriangle, AlertCircle, Loader2, Users,
} from 'lucide-react';
import { playersService } from '@/lib/services';
import { parsePlayersWorkbook, markExistingDuplicates, ImportTemplateError, type ParsedPlayerRow } from '@/lib/importPlayers';

const POSITION_COLORS: Record<string, { color: string; bg: string; abbr: string }> = {
  Gardien: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', abbr: 'GB' },
  Meneur:  { color: '#22C55E', bg: 'rgba(34,197,94,0.10)', abbr: 'MEN' },
  Ailier:  { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', abbr: 'AIL' },
  Pivot:   { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)', abbr: 'PIV' },
};

const REQUIRED_FIELDS = ['Prénom', 'Nom', 'Date de naissance', 'Poste', 'Pied fort'];

type Step = 1 | 2 | 3 | 4;

export default function ImportPlayersModal({
  teamId,
  teamName,
  existingPlayers,
  onClose,
  onImported,
}: {
  teamId: string;
  teamName: string;
  existingPlayers: Array<{ first_name: string; last_name: string }>;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedPlayerRow[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setIncluded(new Set());
    setParseError(null);
    setImportError(null);
    setStep(1);
  };

  const handleFileSelected = async (file: File) => {
    setParseError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = markExistingDuplicates(parsePlayersWorkbook(buffer), existingPlayers);
      setFileName(file.name);
      setRows(parsed);
      setIncluded(new Set(parsed.filter(r => r.status === 'ok').map(r => r.rowNumber)));
    } catch (err) {
      setFileName(null);
      setRows([]);
      setParseError(err instanceof ImportTemplateError ? err.message : 'Impossible de lire ce fichier. Vérifiez qu\'il s\'agit bien d\'un .xlsx basé sur le modèle.');
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
    setIsImporting(true);
    setImportError(null);
    try {
      const toCreate = rows
        .filter(r => included.has(r.rowNumber) && r.data)
        .map(r => r.data!);
      const created = await playersService.createPlayersBulk(teamId, toCreate);
      setImportedCount(created.length);
      setStep(4);
      onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur lors de l\'import.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fm-overlay">
      <div className="fm-modal" style={{ maxWidth: 860 }}>
        <div className="fm-modal-header">
          <div className="fm-modal-title">
            <div className="fm-modal-title-bar" />
            Importer un effectif depuis Excel
          </div>
          <button className="fm-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="fm-modal-body">
          {/* ── Étape 1 : modèle ─────────────────────────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: '#697585', lineHeight: 1.6 }}>
                Téléchargez le modèle, remplissez une ligne par joueur, puis réimportez-le. Les colonnes Poste et Pied fort ont des listes déroulantes intégrées pour éviter les fautes de saisie.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REQUIRED_FIELDS.map(f => (
                  <span key={f} style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 100, background: '#F9FAFB', border: '1px solid #DDE1EA', color: '#1A2332' }}>
                    {f}<span style={{ color: '#DC2626', marginLeft: 2, fontWeight: 800 }}>*</span>
                  </span>
                ))}
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 11px', borderRadius: 100, background: '#F9FAFB', border: '1px solid #DDE1EA', color: '#697585' }}>
                  Numéro (optionnel)
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: -10 }}>
                <b style={{ color: '#DC2626' }}>*</b> obligatoire — une ligne sans l&apos;un de ces champs sera signalée en erreur à l&apos;étape de vérification.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#F9FAFB', border: '1px dashed #DDE1EA', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg,#1D6F42,#2A9D5C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileSpreadsheet size={20} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13, fontWeight: 800, display: 'block' }}>modele_import_effectif.xlsx</b>
                  <span style={{ fontSize: 11.5, color: '#697585' }}>Colonnes pré-remplies · listes déroulantes Poste / Pied fort</span>
                </div>
                <a
                  href="/templates/modele_import_effectif.xlsx"
                  download="modele_import_effectif.xlsx"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold"
                  style={{ backgroundColor: '#FFB020', color: '#1A0A00', textDecoration: 'none' }}
                >
                  <Download size={15} /> Télécharger le modèle
                </a>
              </div>
            </div>
          )}

          {/* ── Étape 2 : upload ─────────────────────────────────────────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                  e.target.value = '';
                }}
              />
              {!fileName && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: '1.5px dashed #DDE1EA', borderRadius: 14, padding: '44px 24px', textAlign: 'center', background: '#F9FAFB', cursor: 'pointer' }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px', background: '#fff', border: '1px solid #DDE1EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Upload size={22} color="#3B82F6" />
                  </div>
                  <b style={{ fontSize: 14, fontWeight: 800, display: 'block', marginBottom: 4 }}>Cliquez pour choisir votre fichier rempli</b>
                  <span style={{ fontSize: 12, color: '#697585' }}>Format accepté : .xlsx — basé sur le modèle de l&apos;étape 1</span>
                </div>
              )}

              {parseError && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '12px 14px' }}>
                  <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#991B1B' }}>{parseError}</span>
                </div>
              )}

              {fileName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F9FAFB', border: '1px solid #DDE1EA', borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: 'linear-gradient(135deg,#1D6F42,#2A9D5C)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileSpreadsheet size={17} color="#fff" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 13, fontWeight: 800, display: 'block', fontFamily: 'monospace' }}>{fileName}</b>
                    <span style={{ fontSize: 11.5, color: '#697585' }}>{rows.length} ligne{rows.length !== 1 ? 's' : ''} détectée{rows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => { setFileName(null); setRows([]); setIncluded(new Set()); }}
                    style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #DDE1EA', background: '#fff', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Étape 3 : vérification ───────────────────────────────────── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <StatPill label="lignes" value={rows.length} tone="neutral" />
                <StatPill label="OK" value={okCount} tone="ok" />
                <StatPill label="déjà dans l'effectif" value={dupCount} tone="warn" />
                <StatPill label="erreurs" value={errCount} tone="err" />
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #DDE1EA', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
                  <thead>
                    <tr>
                      {['', 'Prénom', 'Nom', 'Naissance', 'Poste', 'Pied', 'N°', 'Statut'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94A3B8', background: '#F9FAFB', borderBottom: '1px solid #DDE1EA' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const posInfo = r.data ? POSITION_COLORS[r.data.position] : null;
                      return (
                        <tr key={r.rowNumber} style={{ background: r.status === 'duplicate' ? 'rgba(255,176,32,0.05)' : undefined }}>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }}>
                            <input
                              type="checkbox"
                              checked={included.has(r.rowNumber)}
                              disabled={r.status === 'error'}
                              onChange={() => toggleRow(r.rowNumber)}
                              style={{ width: 15, height: 15, accentColor: '#3B82F6' }}
                            />
                          </td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', fontWeight: 700, color: r.status === 'error' ? '#94A3B8' : '#1A2332' }}>
                            {r.input.first_name || <i style={{ color: '#DC2626' }}>manquant</i>}
                          </td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', fontWeight: 700, color: r.status === 'error' ? '#94A3B8' : '#1A2332' }}>
                            {r.input.last_name || <i style={{ color: '#DC2626' }}>manquant</i>}
                          </td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', color: '#697585' }}>{r.data?.birth_date ?? r.input.birth_date}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }}>
                            {posInfo ? (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 4, color: posInfo.color, background: posInfo.bg }}>{posInfo.abbr}</span>
                            ) : r.input.position || '—'}
                          </td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', color: '#697585' }}>{r.data?.strong_foot ?? r.input.strong_foot}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9', color: '#697585' }}>{r.data?.number || r.input.number || '—'}</td>
                          <td style={{ padding: '9px 12px', borderBottom: '1px solid #F1F5F9' }}>
                            {r.status === 'ok' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontWeight: 700 }}><CheckCircle2 size={14} />Prêt</span>}
                            {r.status === 'duplicate' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#D97706', fontWeight: 700 }}><AlertTriangle size={14} />{r.duplicateOf === 'file' ? 'Doublon dans le fichier' : 'Déjà dans l\'effectif'}</span>}
                            {r.status === 'error' && <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DC2626', fontWeight: 700 }}><AlertCircle size={14} />{r.errorMessage}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {importError && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '12px 14px' }}>
                  <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: '#991B1B' }}>{importError}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Étape 4 : confirmation ───────────────────────────────────── */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '32px 12px 12px' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 18px', background: 'rgba(22,163,74,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={32} color="#16A34A" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1A2332', marginBottom: 6 }}>
                {importedCount} joueur{importedCount !== 1 ? 's' : ''} ajouté{importedCount !== 1 ? 's' : ''} à l&apos;effectif
              </h3>
              <p style={{ fontSize: 13, color: '#697585', maxWidth: 380, margin: '0 auto' }}>
                Ils apparaissent dans {teamName}. Complétez les fiches (numéro, statut) quand vous aurez un moment.
              </p>
            </div>
          )}
        </div>

        <div className="fm-modal-footer" style={{ justifyContent: step === 1 ? 'flex-end' : 'space-between' }}>
          {step === 2 && (
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ color: '#697585', background: 'transparent', border: 'none' }} onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Retour
            </button>
          )}
          {step === 3 && (
            <span style={{ fontSize: 12.5, color: '#697585' }}>
              <b style={{ color: '#1A2332', fontFamily: 'monospace' }}>{selectedCount}</b> joueur{selectedCount !== 1 ? 's' : ''} seront ajoutés à <b style={{ color: '#1A2332' }}>{teamName}</b>
            </span>
          )}
          {step === 4 && <span />}

          <div style={{ display: 'flex', gap: 10 }}>
            {step === 1 && (
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: '#3B82F6', color: '#fff', border: 'none' }} onClick={() => setStep(2)}>
                J&apos;ai rempli mon fichier <ArrowRight size={15} />
              </button>
            )}
            {step === 2 && (
              <button
                disabled={!fileName}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: '#3B82F6', color: '#fff', border: 'none', cursor: fileName ? 'pointer' : 'not-allowed' }}
                onClick={() => setStep(3)}
              >
                Analyser le fichier <ArrowRight size={15} />
              </button>
            )}
            {step === 3 && (
              <>
                <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ color: '#697585', background: 'transparent', border: 'none' }} onClick={onClose}>
                  Annuler
                </button>
                <button
                  disabled={selectedCount === 0 || isImporting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: '#3B82F6', color: '#fff', border: 'none', cursor: selectedCount === 0 || isImporting ? 'not-allowed' : 'pointer' }}
                  onClick={handleConfirmImport}
                >
                  {isImporting ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
                  Importer {selectedCount} joueur{selectedCount !== 1 ? 's' : ''}
                </button>
              </>
            )}
            {step === 4 && (
              <>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: '#fff', color: '#1A2332', border: '1px solid #DDE1EA' }} onClick={reset}>
                  Importer un autre fichier
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold" style={{ backgroundColor: '#3B82F6', color: '#fff', border: 'none' }} onClick={onClose}>
                  Voir l&apos;effectif
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'ok' | 'warn' | 'err' }) {
  const styles: Record<string, { bg: string; color: string }> = {
    neutral: { bg: '#F9FAFB', color: '#697585' },
    ok: { bg: 'rgba(22,163,74,0.10)', color: '#16A34A' },
    warn: { bg: 'rgba(217,119,6,0.10)', color: '#D97706' },
    err: { bg: 'rgba(220,38,38,0.10)', color: '#DC2626' },
  };
  const s = styles[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '7px 13px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color }}>
      <b style={{ fontSize: 15, fontFamily: 'monospace' }}>{value}</b> {label}
    </div>
  );
}
