'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  ExternalLink,
  Layout,
  Link2,
  Link2Off,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { schematicsService, type SchematicRecord, type SchematicData } from '@/lib/services/schematicsService';
import { trainingsService } from '@/lib/services/trainingsService';
import { SchematicPreview } from './components/SchematicPreview';

// ─── Theme FM light ───────────────────────────────────────────────────────────
const T = {
  pageBg: '#EEF0F5',
  cardBg: '#FFFFFF',
  border: '#DDE1EA',
  text: '#1A2332',
  textMuted: '#697585',
  accent: '#3B82F6',
  accentAmber: '#FFB020',
};

// ─── Taxonomie pédagogique ────────────────────────────────────────────────────
const BLOCS = [
  { value: 'Échauffement',      color: '#ea580c', bg: '#FFF7ED', label: 'Éch.'  },
  { value: 'Problématisation',  color: '#2563eb', bg: '#EFF6FF', label: 'Prob.' },
  { value: 'Situation isolée',  color: '#16a34a', bg: '#F0FDF4', label: 'Sit.'  },
  { value: 'Analytique',        color: '#6b7280', bg: '#F9FAFB', label: 'Anal.' },
  { value: 'Jeu orienté',       color: '#7c3aed', bg: '#F5F3FF', label: 'Jeu'   },
  { value: 'Match libre',       color: '#d97706', bg: '#FFFBEB', label: 'Match' },
] as const;

type BlocValue = (typeof BLOCS)[number]['value'];

interface BlocStyle { value: string; color: string; bg: string; label: string }
function getBlocStyle(bloc?: string | null): BlocStyle {
  const found = BLOCS.find((b) => b.value === bloc);
  if (!found) return { value: bloc || '—', color: T.textMuted, bg: '#F1F2F5', label: bloc || '—' };
  return { ...found };
}

// ─── Types ────────────────────────────────────────────────────────────────────
type TrainingTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA';
type TrainingType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu';

interface TrainingProcedure {
  id: string;
  title: string;
  objectives: string;
  instructions: string;
  variants?: string | null;
  corrections?: string | null;
  // Legacy (kept for compat, not displayed)
  theme?: TrainingTheme;
  type?: TrainingType;
  // New fields
  bloc?: string | null;
  principe?: string | null;
  phase?: string | null;
  rapport_numerique?: string | null;
  share_code?: string | null;
  // Misc
  min_players?: number | null;
  field_dimensions?: string | null;
  duration_minutes?: number | null;
  image_url?: string | null;
  schematic_id?: string | null;
  created_at?: string;
}

interface ProcedureForm {
  title: string;
  objectives: string;
  instructions: string;
  variants: string;
  corrections: string;
  bloc: string;
  principe: string;
  phase: string;
  rapport_numerique: string;
  min_players: string;
  field_dimensions: string;
  duration_minutes: string;
  image_url: string;
  schematic_id: string;
}

const DEFAULT_FORM: ProcedureForm = {
  title: '',
  objectives: '',
  instructions: '',
  variants: '',
  corrections: '',
  bloc: '',
  principe: '',
  phase: '',
  rapport_numerique: '',
  min_players: '',
  field_dimensions: '',
  duration_minutes: '',
  image_url: '',
  schematic_id: '',
};

// ─── BlocBadge ────────────────────────────────────────────────────────────────
function BlocBadge({ bloc, short = false }: { bloc?: string | null; short?: boolean }) {
  if (!bloc) return null;
  const style = getBlocStyle(bloc);
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.color}22` }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      {short ? style.label : style.value}
    </span>
  );
}

// ─── SharePopover ─────────────────────────────────────────────────────────────
function SharePopover({
  procedure,
  onUpdate,
  onClose,
}: {
  procedure: TrainingProcedure;
  onUpdate: (updated: TrainingProcedure) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const shareUrl = procedure.share_code
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${procedure.share_code}`
    : null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const code = Math.random().toString(36).substring(2, 10);
      const { error: err } = await supabase
        .from('training_procedures')
        .update({ share_code: code } as any)
        .eq('id', procedure.id);
      if (err) throw err;
      onUpdate({ ...procedure, share_code: code });
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la génération du lien.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('training_procedures')
        .update({ share_code: null } as any)
        .eq('id', procedure.id);
      if (err) throw err;
      onUpdate({ ...procedure, share_code: null });
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la révocation.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      style={{
        backgroundColor: T.cardBg,
        border: `1px solid ${T.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}
      className="absolute right-0 top-10 z-50 w-80 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span style={{ color: T.text }} className="text-sm font-semibold">
          Partager le procédé
        </span>
        <button onClick={onClose} style={{ color: T.textMuted }} className="hover:opacity-70">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{error}</p>
      )}

      {shareUrl ? (
        <>
          <div
            style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}` }}
            className="rounded-lg px-3 py-2 flex items-center gap-2"
          >
            <span style={{ color: T.text }} className="text-xs flex-1 truncate font-mono">
              {shareUrl}
            </span>
            <button
              onClick={handleCopy}
              style={{ color: T.accent }}
              className="shrink-0 hover:opacity-70 transition-opacity"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p style={{ color: T.textMuted }} className="text-xs">
            Ce lien est public — tout le monde peut consulter cette fiche sans se connecter.
          </p>
          <button
            onClick={handleRevoke}
            disabled={loading}
            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
            Révoquer le lien
          </button>
        </>
      ) : (
        <>
          <p style={{ color: T.textMuted }} className="text-xs">
            Générez un lien public pour partager cette fiche sans compte.
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{ backgroundColor: T.accent, color: '#fff' }}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Générer un lien de partage
          </button>
        </>
      )}
    </div>
  );
}

// ─── ProcedureDrawer (create/edit slide-over) ─────────────────────────────────
function ProcedureDrawer({
  editing,
  onClose,
  onSaved,
  activeTeamId,
}: {
  editing: TrainingProcedure | null;
  onClose: () => void;
  onSaved: (p: TrainingProcedure) => void;
  activeTeamId?: string;
}) {
  const [form, setForm] = useState<ProcedureForm>(
    editing
      ? {
          title: editing.title,
          objectives: editing.objectives,
          instructions: editing.instructions,
          variants: editing.variants || '',
          corrections: editing.corrections || '',
          bloc: editing.bloc || '',
          principe: editing.principe || '',
          phase: editing.phase || '',
          rapport_numerique: editing.rapport_numerique || '',
          min_players: editing.min_players?.toString() || '',
          field_dimensions: editing.field_dimensions || '',
          duration_minutes: editing.duration_minutes?.toString() || '',
          image_url: editing.image_url || '',
          schematic_id: editing.schematic_id || '',
        }
      : DEFAULT_FORM
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [availableSchematics, setAvailableSchematics] = useState<SchematicRecord[]>([]);
  const [selectedSchematic, setSelectedSchematic] = useState<SchematicRecord | null>(null);
  const [showSchematicPicker, setShowSchematicPicker] = useState(false);

  const set = <K extends keyof ProcedureForm>(k: K, v: ProcedureForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    schematicsService.getSchematicsByTeam().then(setAvailableSchematics).catch(console.error);
  }, []);

  useEffect(() => {
    if (editing?.schematic_id) {
      schematicsService
        .getSchematicById(editing.schematic_id)
        .then((s) => s && setSelectedSchematic(s))
        .catch(console.error);
    }
  }, [editing?.schematic_id]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.objectives.trim() || !form.instructions.trim()) {
      setSaveError('Renseignez le titre, les objectifs et les consignes.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    const base: any = {
      title: form.title.trim(),
      objectives: form.objectives.trim(),
      instructions: form.instructions.trim(),
      variants: form.variants.trim() || null,
      corrections: form.corrections.trim() || null,
      min_players: form.min_players ? Number(form.min_players) : null,
      field_dimensions: form.field_dimensions.trim() || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      image_url: form.image_url.trim() || null,
      schematic_id: form.schematic_id.trim() || null,
    };

    // New pedagogic fields — graceful fallback
    const extra: any = {
      bloc: form.bloc || null,
      principe: form.principe.trim() || null,
      phase: form.phase || null,
      rapport_numerique: form.rapport_numerique.trim() || null,
    };

    const tryWithExtra = async () => {
      if (editing) {
        return supabase
          .from('training_procedures')
          .update({ ...base, ...extra })
          .eq('id', editing.id)
          .select()
          .single();
      } else {
        return supabase
          .from('training_procedures')
          .insert([{ ...base, ...extra }])
          .select()
          .single();
      }
    };

    const tryWithoutExtra = async () => {
      if (editing) {
        return supabase
          .from('training_procedures')
          .update(base)
          .eq('id', editing.id)
          .select()
          .single();
      } else {
        return supabase
          .from('training_procedures')
          .insert([base])
          .select()
          .single();
      }
    };

    try {
      let result = await tryWithExtra();
      if (result.error && (result.error.message?.includes('column') || result.error.code === '42703')) {
        console.warn('[Library] Migration DB requise — colonnes pédagogiques manquantes. Sauvegarde sans ces champs.');
        result = await tryWithoutExtra();
      }
      if (result.error) throw result.error;
      onSaved(result.data as TrainingProcedure);
    } catch (e: any) {
      setSaveError(e?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const inputStyle = {
    backgroundColor: T.cardBg,
    border: `1.5px solid ${T.border}`,
    color: T.text,
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        style={{ backgroundColor: T.pageBg, borderLeft: `1px solid ${T.border}` }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div
          style={{ backgroundColor: T.cardBg, borderBottom: `1px solid ${T.border}` }}
          className="flex items-center justify-between px-5 py-4 shrink-0"
        >
          <h2 style={{ color: T.text }} className="text-base font-semibold">
            {editing ? 'Modifier le procédé' : 'Nouveau procédé'}
          </h2>
          <button onClick={onClose} style={{ color: T.textMuted }} className="hover:opacity-70">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}

          {/* Titre */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Titre *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="Nom du procédé"
            />
          </div>

          {/* Bloc */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Bloc
            </label>
            <div className="flex flex-wrap gap-2">
              {BLOCS.map((b) => {
                const active = form.bloc === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => set('bloc', active ? '' : b.value)}
                    style={{
                      backgroundColor: active ? b.bg : T.cardBg,
                      color: active ? b.color : T.textMuted,
                      border: `1.5px solid ${active ? b.color : T.border}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    className="px-3 py-1 rounded-full text-xs transition-all hover:opacity-80"
                  >
                    {b.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Principe + Phase + Rapport */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
                Principe servi
              </label>
              <input
                type="text"
                value={form.principe}
                onChange={(e) => set('principe', e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="Déséquilibre, Pressing…"
                list="principes-list"
              />
              <datalist id="principes-list">
                {['Déséquilibre collectif', 'Conservation', 'Transition', 'Pressing', 'CPA', 'Supériorité'].map(
                  (p) => <option key={p} value={p} />
                )}
              </datalist>
            </div>
            <div>
              <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
                Rapport numérique
              </label>
              <input
                type="text"
                value={form.rapport_numerique}
                onChange={(e) => set('rapport_numerique', e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="3v2, 4v3+GK…"
              />
            </div>
          </div>

          {/* Phase */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Phase
            </label>
            <div className="flex gap-2">
              {['1', '2', 'Mix'].map((p) => {
                const active = form.phase === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('phase', active ? '' : p)}
                    style={{
                      backgroundColor: active ? '#EFF6FF' : T.cardBg,
                      color: active ? T.accent : T.textMuted,
                      border: `1.5px solid ${active ? T.accent : T.border}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    className="px-4 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
                  >
                    Phase {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Objectifs */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Objectifs *
            </label>
            <textarea
              value={form.objectives}
              onChange={(e) => set('objectives', e.target.value)}
              rows={3}
              className={inputCls}
              style={inputStyle}
              placeholder="Décrire les objectifs principaux"
            />
          </div>

          {/* Consignes */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Consignes / Règles *
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              rows={4}
              className={inputCls}
              style={inputStyle}
              placeholder="Décrire précisément le déroulement et les règles"
            />
          </div>

          {/* Durée + Joueurs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
                Durée (min)
              </label>
              <input
                type="number"
                min={0}
                value={form.duration_minutes}
                onChange={(e) => set('duration_minutes', e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="15"
              />
            </div>
            <div>
              <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
                Nb joueurs min.
              </label>
              <input
                type="number"
                min={0}
                value={form.min_players}
                onChange={(e) => set('min_players', e.target.value)}
                className={inputCls}
                style={inputStyle}
                placeholder="8"
              />
            </div>
          </div>

          {/* Terrain */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Dimension du terrain
            </label>
            <input
              type="text"
              value={form.field_dimensions}
              onChange={(e) => set('field_dimensions', e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="20m x 15m"
            />
          </div>

          {/* Variantes */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Variantes
            </label>
            <textarea
              value={form.variants}
              onChange={(e) => set('variants', e.target.value)}
              rows={3}
              className={inputCls}
              style={inputStyle}
              placeholder="Variantes possibles du procédé"
            />
          </div>

          {/* Correctifs */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Correctifs / Comportements attendus
            </label>
            <textarea
              value={form.corrections}
              onChange={(e) => set('corrections', e.target.value)}
              rows={3}
              className={inputCls}
              style={inputStyle}
              placeholder="Points de coaching importants"
            />
          </div>

          {/* Schéma tactique */}
          <div style={{ borderTop: `1px solid ${T.border}` }} className="pt-4">
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Schéma tactique
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => window.open('/webapp/library/schematics', '_blank')}
                style={{ color: T.accent, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}
                className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
              >
                <Layout className="h-3.5 w-3.5" />
                Créer un schéma
              </button>
              <button
                type="button"
                onClick={() => setShowSchematicPicker(true)}
                style={{ color: T.text, borderColor: T.border, backgroundColor: T.cardBg }}
                className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-2 hover:opacity-80 transition-opacity"
              >
                Charger un schéma existant
              </button>
            </div>
            {selectedSchematic && (
              <div
                style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}` }}
                className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
              >
                <span style={{ color: T.text }} className="text-sm flex items-center gap-2">
                  <Layout className="h-3.5 w-3.5 shrink-0" />
                  {selectedSchematic.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSchematic(null);
                    set('schematic_id', '');
                  }}
                  style={{ color: T.textMuted }}
                  className="hover:opacity-70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{ backgroundColor: T.cardBg, borderTop: `1px solid ${T.border}` }}
          className="flex justify-end gap-3 px-5 py-4 shrink-0"
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{ color: T.text, border: `1.5px solid ${T.border}`, backgroundColor: T.cardBg }}
            className="px-4 py-2 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: T.accent, color: '#fff' }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? (editing ? 'Modification…' : 'Enregistrement…') : editing ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>

      {/* Schematic picker sub-drawer */}
      {showSchematicPicker && (
        <div
          style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
          className="fixed inset-y-0 right-[min(100vw,28rem)] z-50 w-80 flex flex-col shadow-2xl"
        >
          <div
            style={{ borderBottom: `1px solid ${T.border}` }}
            className="flex items-center justify-between px-4 py-3 shrink-0"
          >
            <span style={{ color: T.text }} className="text-sm font-semibold">
              Sélectionner un schéma
            </span>
            <button
              onClick={() => setShowSchematicPicker(false)}
              style={{ color: T.textMuted }}
              className="hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {availableSchematics.length === 0 ? (
              <p style={{ color: T.textMuted }} className="text-xs text-center py-8">
                Aucun schéma disponible.
              </p>
            ) : (
              availableSchematics.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSchematic(s);
                    set('schematic_id', s.id);
                    setShowSchematicPicker(false);
                  }}
                  style={{
                    backgroundColor: selectedSchematic?.id === s.id ? '#EFF6FF' : T.pageBg,
                    border: `1px solid ${selectedSchematic?.id === s.id ? T.accent : T.border}`,
                    color: T.text,
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:opacity-80 transition-opacity"
                >
                  <Layout className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="flex-1 truncate">{s.name}</span>
                  {selectedSchematic?.id === s.id && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: T.accent }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();

  const [procedures, setProcedures] = useState<TrainingProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBlocs, setSelectedBlocs] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [previewSchematicData, setPreviewSchematicData] = useState<SchematicData | null>(null);
  const [procedureUsageCount, setProcedureUsageCount] = useState<number | null>(null);

  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<TrainingProcedure | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSharePopover, setShowSharePopover] = useState(false);

  // Mobile: show list or detail
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Load procedures
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('training_procedures')
          .select('*')
          .is('archived_at', null)
          .order('created_at', { ascending: false });
        if (err) { setError('Impossible de charger la bibliothèque.'); }
        else { setProcedures((data || []) as TrainingProcedure[]); }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selectedProcedure = useMemo(
    () => procedures.find((p) => p.id === selectedId) ?? null,
    [procedures, selectedId]
  );

  // Load schematic for selected procedure
  useEffect(() => {
    if (!selectedProcedure?.schematic_id) { setPreviewSchematicData(null); return; }
    schematicsService
      .getSchematicById(selectedProcedure.schematic_id)
      .then((s) => setPreviewSchematicData(s?.data ?? null))
      .catch(() => setPreviewSchematicData(null));
  }, [selectedProcedure?.schematic_id]);

  // Load usage count
  useEffect(() => {
    if (!selectedProcedure?.id) { setProcedureUsageCount(null); return; }
    trainingsService
      .getProcedureUsageCount(selectedProcedure.id)
      .then(setProcedureUsageCount)
      .catch(() => setProcedureUsageCount(0));
  }, [selectedProcedure?.id]);

  const filteredProcedures = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return procedures.filter((p) => {
      const matchSearch =
        p.title.toLowerCase().includes(q) ||
        p.objectives.toLowerCase().includes(q) ||
        (p.principe?.toLowerCase().includes(q) ?? false);
      const matchBloc = selectedBlocs.length === 0 || selectedBlocs.includes(p.bloc ?? '');
      return matchSearch && matchBloc;
    });
  }, [procedures, searchTerm, selectedBlocs]);

  const toggleBloc = (v: string) =>
    setSelectedBlocs((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const selectProcedure = (id: string) => {
    setSelectedId(id);
    setShowSharePopover(false);
    setMobileView('detail');
  };

  const handleDelete = async () => {
    if (!selectedProcedure) return;
    if (!confirm('Archiver ce procédé ? Il disparaîtra de la bibliothèque.')) return;
    setIsDeleting(true);
    try {
      const { error: err } = await supabase
        .from('training_procedures')
        .update({ archived_at: new Date().toISOString() } as any)
        .eq('id', selectedProcedure.id);
      if (err) throw err;
      setProcedures((prev) => prev.filter((p) => p.id !== selectedProcedure.id));
      setSelectedId(null);
      setMobileView('list');
    } catch (e) {
      alert('Impossible de supprimer ce procédé.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaved = (saved: TrainingProcedure) => {
    setProcedures((prev) => {
      const exists = prev.find((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
    });
    setSelectedId(saved.id);
    setShowDrawer(false);
    setEditingProcedure(null);
  };

  const handleShareUpdate = (updated: TrainingProcedure) => {
    setProcedures((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ backgroundColor: T.pageBg, color: T.text, height: 'calc(100dvh - 2.75rem)' }}
      className="flex flex-col overflow-hidden -mx-4 md:-mx-5 -mt-4 md:-mt-5"
    >
      {/* Top bar */}
      <div
        style={{ backgroundColor: T.cardBg, borderBottom: `1px solid ${T.border}` }}
        className="flex items-center justify-between px-4 py-3 shrink-0"
      >
        <h1 style={{ color: T.text }} className="text-base font-semibold">
          Bibliothèque de procédés
        </h1>
        <button
          onClick={() => { setEditingProcedure(null); setShowDrawer(true); }}
          style={{ backgroundColor: T.accent, color: '#fff' }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nouveau procédé</span>
        </button>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 min-h-0">
        {/* ── LEFT PANEL ── */}
        <div
          style={{
            width: 320,
            minWidth: 320,
            backgroundColor: T.cardBg,
            borderRight: `1px solid ${T.border}`,
          }}
          className={`flex flex-col ${mobileView === 'detail' ? 'hidden md:flex' : 'flex'} md:flex`}
        >
          {/* Search */}
          <div style={{ borderBottom: `1px solid ${T.border}` }} className="px-3 py-3 shrink-0">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
                style={{ color: T.textMuted }}
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher…"
                style={{
                  backgroundColor: T.pageBg,
                  border: `1px solid ${T.border}`,
                  color: T.text,
                }}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Bloc filters */}
          <div style={{ borderBottom: `1px solid ${T.border}` }} className="px-3 py-2 shrink-0 flex flex-wrap gap-1.5">
            {BLOCS.map((b) => {
              const active = selectedBlocs.includes(b.value);
              return (
                <button
                  key={b.value}
                  onClick={() => toggleBloc(b.value)}
                  style={{
                    backgroundColor: active ? b.bg : 'transparent',
                    color: active ? b.color : T.textMuted,
                    border: `1px solid ${active ? b.color : T.border}`,
                    fontWeight: active ? 600 : 400,
                  }}
                  className="px-2 py-0.5 rounded-full text-xs transition-all hover:opacity-80"
                >
                  {b.label}
                </button>
              );
            })}
            {selectedBlocs.length > 0 && (
              <button
                onClick={() => setSelectedBlocs([])}
                style={{ color: T.textMuted }}
                className="px-2 py-0.5 rounded-full text-xs flex items-center gap-0.5 hover:opacity-70"
              >
                <X className="h-3 w-3" /> Tout
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} />
              </div>
            ) : error ? (
              <p className="text-xs text-red-600 px-4 py-6 text-center">{error}</p>
            ) : filteredProcedures.length === 0 ? (
              <p style={{ color: T.textMuted }} className="text-xs px-4 py-6 text-center">
                Aucun procédé ne correspond.
              </p>
            ) : (
              filteredProcedures.map((p) => {
                const isActive = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => selectProcedure(p.id)}
                    style={{
                      backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                      borderLeft: isActive ? `3px solid ${T.accent}` : '3px solid transparent',
                      borderBottom: `1px solid ${T.border}`,
                      color: T.text,
                    }}
                    className="w-full text-left px-3 py-3 flex flex-col gap-1 transition-colors hover:bg-blue-50/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{p.title}</span>
                      <BlocBadge bloc={p.bloc} short />
                    </div>
                    {p.principe && (
                      <span style={{ color: T.textMuted }} className="text-xs truncate">
                        {p.principe}
                      </span>
                    )}
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.rapport_numerique && (
                        <span
                          style={{ color: T.textMuted, fontSize: 11 }}
                          className="flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          {p.rapport_numerique}
                        </span>
                      )}
                      {p.duration_minutes && (
                        <span
                          style={{ color: T.textMuted, fontSize: 11 }}
                          className="flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          {p.duration_minutes} min
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div
          style={{ backgroundColor: T.pageBg }}
          className={`flex-1 min-w-0 flex flex-col ${mobileView === 'list' ? 'hidden md:flex' : 'flex'} md:flex`}
        >
          {selectedProcedure ? (
            <div className="flex-1 overflow-y-auto">
              {/* Mobile back button */}
              <div className="md:hidden px-4 pt-4">
                <button
                  onClick={() => { setMobileView('list'); setSelectedId(null); }}
                  style={{ color: T.accent }}
                  className="flex items-center gap-1 text-sm font-medium hover:opacity-70"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour
                </button>
              </div>

              {/* Detail header */}
              <div
                style={{ backgroundColor: T.cardBg, borderBottom: `1px solid ${T.border}` }}
                className="px-6 py-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 style={{ color: T.text }} className="text-xl font-bold leading-tight">
                      {selectedProcedure.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <BlocBadge bloc={selectedProcedure.bloc} />
                      {selectedProcedure.principe && (
                        <span
                          style={{
                            backgroundColor: '#F1F5F9',
                            color: T.textMuted,
                            border: `1px solid ${T.border}`,
                          }}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                        >
                          {selectedProcedure.principe}
                        </span>
                      )}
                      {selectedProcedure.phase && (
                        <span
                          style={{
                            backgroundColor: '#EFF6FF',
                            color: T.accent,
                            border: `1px solid #BFDBFE`,
                          }}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        >
                          Phase {selectedProcedure.phase}
                        </span>
                      )}
                      {selectedProcedure.rapport_numerique && (
                        <span
                          style={{
                            backgroundColor: '#F9FAFB',
                            color: T.textMuted,
                            border: `1px solid ${T.border}`,
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        >
                          <Users className="h-3 w-3" />
                          {selectedProcedure.rapport_numerique}
                        </span>
                      )}
                      {selectedProcedure.duration_minutes && (
                        <span
                          style={{
                            backgroundColor: '#F9FAFB',
                            color: T.textMuted,
                            border: `1px solid ${T.border}`,
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        >
                          <Clock className="h-3 w-3" />
                          {selectedProcedure.duration_minutes} min
                        </span>
                      )}
                      {procedureUsageCount !== null && (
                        <span
                          style={{
                            backgroundColor: '#F0FDF4',
                            color: '#16a34a',
                            border: '1px solid #bbf7d0',
                          }}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                        >
                          Utilisé {procedureUsageCount} fois en séance
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0 relative">
                    <button
                      onClick={() => { setEditingProcedure(selectedProcedure); setShowDrawer(true); }}
                      style={{ color: T.text, border: `1.5px solid ${T.border}`, backgroundColor: T.cardBg }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Modifier
                    </button>
                    <button
                      onClick={() => setShowSharePopover((v) => !v)}
                      style={{
                        color: selectedProcedure.share_code ? T.accent : T.text,
                        border: `1.5px solid ${selectedProcedure.share_code ? T.accent : T.border}`,
                        backgroundColor: selectedProcedure.share_code ? '#EFF6FF' : T.cardBg,
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Partager
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      style={{ color: '#dc2626', border: '1.5px solid #fca5a5', backgroundColor: '#FFF5F5' }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Supprimer</span>
                    </button>

                    {showSharePopover && selectedProcedure && (
                      <SharePopover
                        procedure={selectedProcedure}
                        onUpdate={handleShareUpdate}
                        onClose={() => setShowSharePopover(false)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Detail body */}
              <div className="px-6 py-5 space-y-6">
                {/* Schéma */}
                {selectedProcedure.schematic_id && previewSchematicData && (
                  <section>
                    <h3
                      style={{ color: T.textMuted }}
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                    >
                      Schéma tactique
                    </h3>
                    <div style={{ pointerEvents: 'none' }}>
                      <SchematicPreview
                        data={previewSchematicData}
                        scale={8}
                        svgWidth={800}
                        svgHeight={370}
                      />
                    </div>
                    <button
                      onClick={() =>
                        router.push(
                          `/webapp/library/schematics?schematic=${selectedProcedure.schematic_id}`
                        )
                      }
                      style={{ color: T.accent, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:opacity-80 transition-opacity"
                    >
                      <Layout className="h-3.5 w-3.5" />
                      Ouvrir dans l'éditeur
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </section>
                )}

                {/* Objectifs */}
                <section>
                  <h3
                    style={{ color: T.textMuted }}
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                  >
                    Objectifs
                  </h3>
                  <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                    {selectedProcedure.objectives}
                  </p>
                </section>

                {/* Consignes */}
                <section>
                  <h3
                    style={{ color: T.textMuted }}
                    className="text-xs font-semibold uppercase tracking-wider mb-2"
                  >
                    Consignes &amp; Règles
                  </h3>
                  <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                    {selectedProcedure.instructions}
                  </p>
                </section>

                {/* Variantes */}
                {selectedProcedure.variants && (
                  <section>
                    <h3
                      style={{ color: T.textMuted }}
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                    >
                      Variantes
                    </h3>
                    <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                      {selectedProcedure.variants}
                    </p>
                  </section>
                )}

                {/* Correctifs */}
                {selectedProcedure.corrections && (
                  <section>
                    <h3
                      style={{ color: T.textMuted }}
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                    >
                      Correctifs / Comportements attendus
                    </h3>
                    <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                      {selectedProcedure.corrections}
                    </p>
                  </section>
                )}

                {/* Méta-infos */}
                {(selectedProcedure.field_dimensions ||
                  selectedProcedure.duration_minutes ||
                  selectedProcedure.min_players) && (
                  <section>
                    <h3
                      style={{ color: T.textMuted }}
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                    >
                      Informations pratiques
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {selectedProcedure.field_dimensions && (
                        <div
                          style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
                          className="rounded-lg px-3 py-2"
                        >
                          <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                            Terrain
                          </div>
                          <div style={{ color: T.text }} className="text-sm mt-1">
                            {selectedProcedure.field_dimensions}
                          </div>
                        </div>
                      )}
                      {selectedProcedure.duration_minutes && (
                        <div
                          style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
                          className="rounded-lg px-3 py-2"
                        >
                          <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                            Durée
                          </div>
                          <div style={{ color: T.text }} className="text-sm mt-1">
                            {selectedProcedure.duration_minutes} min
                          </div>
                        </div>
                      )}
                      {selectedProcedure.min_players && (
                        <div
                          style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
                          className="rounded-lg px-3 py-2"
                        >
                          <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                            Joueurs min.
                          </div>
                          <div style={{ color: T.text }} className="text-sm mt-1">
                            {selectedProcedure.min_players}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <ChevronRight className="h-8 w-8 mx-auto" style={{ color: T.border }} />
                <p style={{ color: T.textMuted }} className="text-sm">
                  Sélectionnez un procédé pour consulter sa fiche
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Drawer */}
      {showDrawer && (
        <ProcedureDrawer
          editing={editingProcedure}
          onClose={() => { setShowDrawer(false); setEditingProcedure(null); }}
          onSaved={handleSaved}
          activeTeamId={activeTeam?.id}
        />
      )}
    </div>
  );
}
