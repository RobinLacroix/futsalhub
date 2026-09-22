'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import {
  Check,
  Clock,
  Copy,
  Edit,
  ExternalLink,
  Folder,
  FolderPlus,
  Layout,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { schematicsService, type SchematicRecord } from '@/lib/services/schematicsService';
import { schematicFoldersService, type SchematicFolderRecord } from '@/lib/services/schematicFoldersService';
import { trainingsService } from '@/lib/services/trainingsService';
import {
  trainingProceduresService,
  type TrainingProcedureType,
  type TrainingProcedureTheme,
  type TrainingProcedureIntensite,
  type MecanismeInducteur,
  type ProcedureLibraryItem,
  type LibraryCard,
} from '@/lib/services/trainingProceduresService';

declare global {
  interface Window {
    DrillRender?: {
      renderStatic: (svg: SVGSVGElement, drill: unknown, kfIndex: number) => { W: number; H: number };
    };
  }
}

/**
 * Vignette de schéma — même moteur de rendu que l'éditeur (render-core.js,
 * chargé une fois pour toute la page), pour que les cartes ici et dans le
 * panneau "Bibliothèque" de l'éditeur affichent EXACTEMENT le même rendu
 * (cf recadrage 2026-09-22 : un seul format de carte, pas une réimplémentation
 * React approximative qui diverge de l'original).
 */
function SchematicThumb({ drill, ready }: { drill: unknown; ready: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !svgRef.current || !drill || !window.DrillRender) return;
    try {
      const copy = JSON.parse(JSON.stringify(drill));
      const svg = svgRef.current;
      svg.innerHTML = '';
      const g = window.DrillRender.renderStatic(svg, copy, 0);
      svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [ready, drill]);

  if (!drill) {
    return (
      <div className="w-full h-full flex items-center justify-center text-center px-3" style={{ color: T.textMuted }}>
        <span className="text-xs">Pas de schéma — clique pour dessiner</span>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ color: T.textMuted }}>
        <span className="text-xs">Aperçu indisponible</span>
      </div>
    );
  }
  return <svg ref={svgRef} className="w-full h-full" preserveAspectRatio="xMidYMid meet" />;
}

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

// Format (ex-"type" legacy) : forme de l'exercice, axe distinct du bloc
// (place dans la séance) — décidé avec Robin le 2026-09-22, cf conversation.
// Colonne DB toujours `type`, enum `training_type` + "Rondo/Toro" (migration
// 20260922110000).
const FORMATS = [
  { value: 'Echauffement', color: '#d97706', bg: '#FFFBEB', label: 'Éch.' },
  { value: 'Exercice',     color: '#64748b', bg: '#F8FAFC', label: 'Exo'  },
  { value: 'Situation',    color: '#059669', bg: '#ECFDF5', label: 'Sit.' },
  { value: 'Jeu',          color: '#7c3aed', bg: '#F5F3FF', label: 'Jeu'  },
  { value: 'Rondo/Toro',   color: '#0891b2', bg: '#ECFEFF', label: 'Rondo' },
] as const;

// Phase de jeu (ex-"theme" legacy) : moment de jeu, remplace l'ancienne
// "phase" d'apprentissage (1/2/Mix, sortie des formulaires). Colonne DB
// toujours `theme`, enum `training_theme` + "Powerplay".
const PHASES_DE_JEU = [
  { value: 'Offensif',  color: '#dc2626', bg: '#FEF2F2', label: 'Off.'  },
  { value: 'Transition', color: '#d97706', bg: '#FFFBEB', label: 'Trans.' },
  { value: 'Defensif',  color: '#2563eb', bg: '#EFF6FF', label: 'Déf.'  },
  { value: 'CPA',        color: '#7c3aed', bg: '#F5F3FF', label: 'CPA'   },
  { value: 'Powerplay',  color: '#db2777', bg: '#FDF2F8', label: 'PP'    },
] as const;

const INTENSITES = [
  { value: 'Légère',  color: '#059669', bg: '#ECFDF5', label: 'Légère'  },
  { value: 'Modérée', color: '#d97706', bg: '#FFFBEB', label: 'Modérée' },
  { value: 'Haute',   color: '#dc2626', bg: '#FEF2F2', label: 'Haute'   },
] as const;

interface TaxoStyle { value: string; color: string; bg: string; label: string }
function getTaxoStyle(list: readonly TaxoStyle[], value?: string | null): TaxoStyle {
  const found = list.find((b) => b.value === value);
  if (found) return found;
  return { value: value || '—', color: T.textMuted, bg: '#F1F2F5', label: value || '—' };
}
function getBlocStyle(bloc?: string | null): BlocStyle {
  return getTaxoStyle(BLOCS as unknown as TaxoStyle[], bloc);
}
type BlocStyle = TaxoStyle;

// ─── Types ────────────────────────────────────────────────────────────────────
type TrainingTheme = 'Offensif' | 'Defensif' | 'Transition' | 'CPA' | 'Powerplay';
type TrainingType = 'Echauffement' | 'Exercice' | 'Situation' | 'Jeu' | 'Rondo/Toro';

interface TrainingProcedure {
  id: string;
  title: string;
  objectives: string;
  /** Texte libre d'introduction — champ "Description", cf recadrage 2026-09-22. */
  instructions: string;
  /** @deprecated remplacé par variables_plus/variables_moins */
  variants?: string | null;
  /** @deprecated remplacé par comportements */
  corrections?: string | null;
  // "Format" et "Phase de jeu" à l'affichage (cf recadrage 2026-09-22) —
  // colonnes toujours type/theme en base.
  theme?: TrainingTheme;
  type?: TrainingType;
  bloc?: string | null;
  /** @deprecated remplacé par principes (tags) */
  principe?: string | null;
  principes?: string[] | null;
  /** @deprecated ancienne phase d'apprentissage (1/2/Mix), sortie des formulaires */
  phase?: string | null;
  rapport_numerique?: string | null;
  intensite?: string | null;
  scoring?: string[] | null;
  comportements?: string[] | null;
  mecanismes?: MecanismeInducteur[] | null;
  variables_plus?: string[] | null;
  variables_moins?: string[] | null;
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
  scoring: string[];
  comportements: string[];
  mecanismes: MecanismeInducteur[];
  variables_plus: string[];
  variables_moins: string[];
  bloc: string;
  type: string;
  theme: string;
  intensite: string;
  principes: string[];
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
  scoring: [],
  comportements: [],
  mecanismes: [],
  variables_plus: [],
  variables_moins: [],
  bloc: '',
  type: '',
  theme: '',
  intensite: '',
  principes: [],
  rapport_numerique: '',
  min_players: '',
  field_dimensions: '',
  duration_minutes: '',
  image_url: '',
  schematic_id: '',
};

// ─── BlocBadge / TaxoBadge ─────────────────────────────────────────────────────
function TaxoBadge({ list, value, short = false }: { list: readonly TaxoStyle[]; value?: string | null; short?: boolean }) {
  if (!value) return null;
  const style = getTaxoStyle(list, value);
  return (
    <span
      style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.color}22` }}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
    >
      {short ? style.label : style.value}
    </span>
  );
}
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
/** Liste de chaînes éditable (scoring / comportements / variables +/-) — même
 * pattern que renderList() dans editor.js (public/tools/tactics/editor.js),
 * pour que les deux formulaires manipulent les données de la même façon. */
function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
  inputCls,
  inputStyle,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  inputCls: string;
  inputStyle: CSSProperties;
}) {
  return (
    <div>
      <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className={inputCls}
              style={inputStyle}
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              style={{ color: T.textMuted }}
              className="shrink-0 hover:opacity-70 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        style={{ color: T.accent }}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:opacity-70"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter
      </button>
    </div>
  );
}

/** Liste de mécanismes inducteurs (règle → ce que ça induit) — même champ que
 * #mecanismesList dans le panneau "Séance & données" de l'éditeur tactique. */
function MecanismesEditor({
  label,
  values,
  onChange,
  inputCls,
  inputStyle,
}: {
  label: string;
  values: MecanismeInducteur[];
  onChange: (v: MecanismeInducteur[]) => void;
  inputCls: string;
  inputStyle: CSSProperties;
}) {
  return (
    <div>
      <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <div className="space-y-2">
        {values.map((m, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={m.regle}
              onChange={(e) => {
                const next = [...values];
                next[i] = { ...next[i], regle: e.target.value };
                onChange(next);
              }}
              className={inputCls}
              style={inputStyle}
              placeholder="règle"
            />
            <span style={{ color: T.textMuted }} className="text-xs shrink-0">
              →
            </span>
            <input
              type="text"
              value={m.induit}
              onChange={(e) => {
                const next = [...values];
                next[i] = { ...next[i], induit: e.target.value };
                onChange(next);
              }}
              className={inputCls}
              style={inputStyle}
              placeholder="ce que ça induit"
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              style={{ color: T.textMuted }}
              className="shrink-0 hover:opacity-70 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...values, { regle: '', induit: '' }])}
        style={{ color: T.accent }}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:opacity-70"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter un mécanisme
      </button>
    </div>
  );
}

function ProcedureDrawer({
  editing,
  onClose,
  onSaved,
  activeClubId,
}: {
  editing: TrainingProcedure | null;
  onClose: () => void;
  onSaved: (p: TrainingProcedure) => void;
  activeClubId?: string;
}) {
  const [form, setForm] = useState<ProcedureForm>(
    editing
      ? {
          title: editing.title,
          objectives: editing.objectives,
          instructions: editing.instructions || '',
          scoring: editing.scoring && editing.scoring.length > 0 ? editing.scoring : [],
          comportements:
            editing.comportements && editing.comportements.length > 0
              ? editing.comportements
              // Fiche pré-migration (comportements jamais rempli) : on récupère le
              // texte des "Correctifs" pour ne pas le perdre à la première réédition.
              : editing.corrections
                ? [editing.corrections]
                : [],
          mecanismes:
            editing.mecanismes && editing.mecanismes.length > 0
              ? editing.mecanismes
              // Fiche pré-migration : la "Règle avec mécanisme inducteur" vivait en
              // texte libre dans `instructions`. On la reprend telle quelle dans la
              // première ligne du tableau structuré pour qu'elle reste visible et
              // éditable ici ET dans le panneau "Séance & données" de l'éditeur
              // (cf bug signalé 2026-09-22 : le contenu était invisible côté éditeur).
              : editing.instructions?.trim()
                ? [{ regle: editing.instructions.trim(), induit: '' }]
                : [],
          variables_plus: editing.variables_plus && editing.variables_plus.length > 0 ? editing.variables_plus : [],
          variables_moins:
            editing.variables_moins && editing.variables_moins.length > 0
              ? editing.variables_moins
              : editing.variants
                ? [editing.variants]
                : [],
          bloc: editing.bloc || '',
          type: editing.type || '',
          theme: editing.theme || '',
          intensite: editing.intensite || '',
          principes: editing.principes && editing.principes.length > 0 ? editing.principes : editing.principe ? [editing.principe] : [],
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
  const [principeDraft, setPrincipeDraft] = useState('');

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
    const hasMeca = form.mecanismes.some((m) => m.regle.trim());
    if (!form.title.trim() || !form.objectives.trim() || !hasMeca) {
      setSaveError('Renseignez le titre, les objectifs et au moins une règle avec mécanisme inducteur.');
      return;
    }
    if (!form.type || !form.theme) {
      setSaveError('Renseignez le format et la phase de jeu.');
      return;
    }
    if (!activeClubId) {
      setSaveError('Équipe active introuvable — réessaie dans un instant.');
      return;
    }
    setSaving(true);
    setSaveError(null);

    // Même fonction de sauvegarde que le panneau "Séance & données" de
    // l'éditeur tactique (sendProcedureSave côté editor.js) — un seul chemin
    // d'écriture vers training_procedures, cf recadrage 2026-09-22.
    try {
      const saved = await trainingProceduresService.createOrUpdateProcedure({
        id: editing?.id,
        club_id: activeClubId,
        title: form.title.trim(),
        objectives: form.objectives.trim(),
        instructions: form.instructions.trim(),
        scoring: form.scoring.filter((s) => s.trim()),
        comportements: form.comportements.filter((c) => c.trim()),
        mecanismes: form.mecanismes
          .filter((m) => m.regle.trim() || m.induit.trim())
          .map((m) => ({ regle: m.regle.trim(), induit: m.induit.trim() })),
        variables_plus: form.variables_plus.filter((v) => v.trim()),
        variables_moins: form.variables_moins.filter((v) => v.trim()),
        type: form.type as TrainingProcedureType,
        theme: form.theme as TrainingProcedureTheme,
        bloc: form.bloc || null,
        principe: form.principes[0] || null, // compat lecture des fiches pré-migration
        principes: form.principes,
        rapport_numerique: form.rapport_numerique.trim() || null,
        intensite: (form.intensite || null) as TrainingProcedureIntensite | null,
        min_players: form.min_players ? Number(form.min_players) : null,
        field_dimensions: form.field_dimensions.trim() || null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        image_url: form.image_url.trim() || null,
        schematic_id: form.schematic_id.trim() || null,
      });
      onSaved(saved as unknown as TrainingProcedure);
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

          {/* Format */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Format *
            </label>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => {
                const active = form.type === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => set('type', f.value)}
                    style={{
                      backgroundColor: active ? f.bg : T.cardBg,
                      color: active ? f.color : T.textMuted,
                      border: `1.5px solid ${active ? f.color : T.border}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    className="px-3 py-1 rounded-full text-xs transition-all hover:opacity-80"
                  >
                    {f.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phase de jeu */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Phase de jeu *
            </label>
            <div className="flex flex-wrap gap-2">
              {PHASES_DE_JEU.map((p) => {
                const active = form.theme === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set('theme', p.value)}
                    style={{
                      backgroundColor: active ? p.bg : T.cardBg,
                      color: active ? p.color : T.textMuted,
                      border: `1.5px solid ${active ? p.color : T.border}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    className="px-3 py-1 rounded-full text-xs transition-all hover:opacity-80"
                  >
                    {p.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensité */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-2">
              Niveau d'intensité
            </label>
            <div className="flex flex-wrap gap-2">
              {INTENSITES.map((i) => {
                const active = form.intensite === i.value;
                return (
                  <button
                    key={i.value}
                    type="button"
                    onClick={() => set('intensite', active ? '' : i.value)}
                    style={{
                      backgroundColor: active ? i.bg : T.cardBg,
                      color: active ? i.color : T.textMuted,
                      border: `1.5px solid ${active ? i.color : T.border}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    className="px-3 py-1 rounded-full text-xs transition-all hover:opacity-80"
                  >
                    {i.value}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Principes associés */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Principes associés
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.principes.map((p) => (
                <span
                  key={p}
                  style={{ backgroundColor: '#EFF6FF', color: T.accent, border: `1px solid #BFDBFE` }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => set('principes', form.principes.filter((x) => x !== p))}
                    className="hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={principeDraft}
              onChange={(e) => setPrincipeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ',') return;
                e.preventDefault();
                const v = principeDraft.trim();
                if (v && !form.principes.includes(v)) set('principes', [...form.principes, v]);
                setPrincipeDraft('');
              }}
              className={inputCls}
              style={inputStyle}
              placeholder="Déséquilibre collectif, Pressing… (Entrée pour ajouter)"
              list="principes-list"
            />
            <datalist id="principes-list">
              {['Déséquilibre collectif', 'Conservation', 'Transition', 'Pressing', 'CPA', 'Supériorité'].map(
                (p) => <option key={p} value={p} />
              )}
            </datalist>
          </div>

          {/* Rapport numérique */}
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

          {/* Description — texte libre d'introduction (ancien champ "Règles"). */}
          <div>
            <label style={{ color: T.text }} className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              rows={3}
              className={inputCls}
              style={inputStyle}
              placeholder="Présentation libre du procédé, contexte, intro…"
            />
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

          {/* Mécanismes inducteurs — même champ que le panneau "Séance & données"
              de l'éditeur tactique (mecanismesList), cf bug signalé 2026-09-22. */}
          <MecanismesEditor
            label="Règles avec mécanisme inducteur *"
            values={form.mecanismes}
            onChange={(v) => set('mecanismes', v)}
            inputCls={inputCls}
            inputStyle={inputStyle}
          />

          {/* Scoring */}
          <StringListEditor
            label="Scoring"
            values={form.scoring}
            onChange={(v) => set('scoring', v)}
            placeholder="Ex : Home : conserve 4 passes = 1 pt"
            inputCls={inputCls}
            inputStyle={inputStyle}
          />

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

          {/* Comportements attendus */}
          <StringListEditor
            label="Comportements attendus"
            values={form.comportements}
            onChange={(v) => set('comportements', v)}
            placeholder="Ex : Ressortir par appuis-soutiens et renversement"
            inputCls={inputCls}
            inputStyle={inputStyle}
          />

          {/* Variables + / - */}
          <StringListEditor
            label="Variables +"
            values={form.variables_plus}
            onChange={(v) => set('variables_plus', v)}
            placeholder="Ex : Retirer un soutien"
            inputCls={inputCls}
            inputStyle={inputStyle}
          />
          <StringListEditor
            label="Variables -"
            values={form.variables_moins}
            onChange={(v) => set('variables_moins', v)}
            placeholder="Ex : Ajouter un appui neutre au centre"
            inputCls={inputCls}
            inputStyle={inputStyle}
          />

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

// ─── Card ───────────────────────────────────────────────────────────────────
function ProcedureCard({
  item,
  folders,
  renderReady,
  onOpen,
  onSetFolder,
}: {
  item: LibraryCard;
  folders: SchematicFolderRecord[];
  renderReady: boolean;
  onOpen: () => void;
  onSetFolder: (folderId: string | null) => void;
}) {
  const p = item.procedure;
  const bits = p
    ? [p.principes?.[0] || p.principe || '', p.rapport_numerique || '', p.duration_minutes ? `${p.duration_minutes} min` : ''].filter(Boolean)
    : [];

  return (
    <div
      style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }}
      className="rounded-xl overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5"
    >
      <button
        type="button"
        onClick={onOpen}
        title={`Ouvrir « ${item.title || 'sans titre'} »`}
        style={{ backgroundColor: T.pageBg, borderBottom: `1px solid ${T.border}` }}
        className="block w-full aspect-[4/3]"
      >
        <SchematicThumb drill={item.schematic?.data ?? null} ready={renderReady} />
      </button>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="text-sm font-semibold truncate" style={{ color: T.text }} title={item.title || ''}>
          {item.title || '(sans titre)'}
        </div>
        {bits.length > 0 && (
          <div className="text-xs truncate" style={{ color: T.textMuted }}>
            {bits.join(' · ')}
          </div>
        )}
        {item.kind === 'procedure' ? (
          <div className="flex flex-wrap gap-1 mt-0.5">
            <BlocBadge bloc={item.bloc} short />
            <TaxoBadge list={PHASES_DE_JEU} value={item.theme} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 mt-0.5">
            <span
              style={{ backgroundColor: '#FFF7ED', color: '#c2410c', border: '1px solid #FED7AA' }}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            >
              Sans fiche
            </span>
          </div>
        )}

        <select
          value={item.folder_id || ''}
          onChange={(e) => onSetFolder(e.target.value || null)}
          onClick={(e) => e.stopPropagation()}
          style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}`, color: T.textMuted }}
          className="mt-2 w-full text-xs rounded-lg px-2 py-1.5"
        >
          <option value="">— sans dossier —</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Detail Modal ───────────────────────────────────────────────────────────
function ProcedureDetailModal({
  procedure,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
  onDrawSchematic,
  usageCount,
  renderReady,
}: {
  procedure: ProcedureLibraryItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onDrawSchematic: () => void;
  usageCount: number | null;
  renderReady: boolean;
}) {
  const router = useRouter();
  const [showSharePopover, setShowSharePopover] = useState(false);
  const [proc, setProc] = useState<TrainingProcedure>(procedure as unknown as TrainingProcedure);

  const principesList = proc.principes && proc.principes.length > 0 ? proc.principes : proc.principe ? [proc.principe] : [];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        style={{ backgroundColor: T.pageBg }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl flex flex-col shadow-2xl overflow-y-auto"
      >
        <div style={{ backgroundColor: T.cardBg, borderBottom: `1px solid ${T.border}` }} className="px-6 py-5 sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 style={{ color: T.text }} className="text-xl font-bold leading-tight">
                {proc.title}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <BlocBadge bloc={proc.bloc} />
                <TaxoBadge list={FORMATS} value={proc.type} />
                <TaxoBadge list={PHASES_DE_JEU} value={proc.theme} />
                <TaxoBadge list={INTENSITES} value={proc.intensite} />
                {principesList.map((p) => (
                  <span
                    key={p}
                    style={{ backgroundColor: '#F1F5F9', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                  >
                    {p}
                  </span>
                ))}
                {proc.rapport_numerique && (
                  <span
                    style={{ backgroundColor: '#F9FAFB', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  >
                    <Users className="h-3 w-3" />
                    {proc.rapport_numerique}
                  </span>
                )}
                {proc.duration_minutes && (
                  <span
                    style={{ backgroundColor: '#F9FAFB', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  >
                    <Clock className="h-3 w-3" />
                    {proc.duration_minutes} min
                  </span>
                )}
                {usageCount !== null && (
                  <span
                    style={{ backgroundColor: '#F0FDF4', color: '#16a34a', border: '1px solid #bbf7d0' }}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                  >
                    Utilisé {usageCount} fois en séance
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 relative">
              <button
                onClick={onEdit}
                style={{ color: T.text, border: `1.5px solid ${T.border}`, backgroundColor: T.cardBg }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
              >
                <Edit className="h-3.5 w-3.5" />
                Modifier
              </button>
              <button
                onClick={() => setShowSharePopover((v) => !v)}
                style={{
                  color: proc.share_code ? T.accent : T.text,
                  border: `1.5px solid ${proc.share_code ? T.accent : T.border}`,
                  backgroundColor: proc.share_code ? '#EFF6FF' : T.cardBg,
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
              >
                <Link2 className="h-3.5 w-3.5" />
                Partager
              </button>
              <button
                onClick={onDelete}
                disabled={isDeleting}
                style={{ color: '#dc2626', border: '1.5px solid #fca5a5', backgroundColor: '#FFF5F5' }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Supprimer</span>
              </button>
              <button onClick={onClose} style={{ color: T.textMuted }} className="hover:opacity-70 ml-1">
                <X className="h-5 w-5" />
              </button>

              {showSharePopover && (
                <SharePopover
                  procedure={proc}
                  onUpdate={(updated) => setProc(updated)}
                  onClose={() => setShowSharePopover(false)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-3">
              Schéma tactique
            </h3>
            {procedure.schematic ? (
              <>
                <div style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}` }} className="rounded-lg overflow-hidden" >
                  <div style={{ aspectRatio: '16/9' }}>
                    <SchematicThumb drill={procedure.schematic.data} ready={renderReady} />
                  </div>
                </div>
                <button
                  onClick={() => router.push(`/webapp/library/schematics?schematic=${procedure.schematic!.id}`)}
                  style={{ color: T.accent, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:opacity-80 transition-opacity"
                >
                  <Layout className="h-3.5 w-3.5" />
                  Ouvrir dans l'éditeur
                  <ExternalLink className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                onClick={onDrawSchematic}
                style={{ color: T.accent, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }}
                className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 hover:opacity-80 transition-opacity"
              >
                <Layout className="h-3.5 w-3.5" />
                Dessiner un schéma pour ce procédé
              </button>
            )}
          </section>

          {proc.instructions && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Description
              </h3>
              <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                {proc.instructions}
              </p>
            </section>
          )}

          <section>
            <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
              Objectifs
            </h3>
            <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
              {proc.objectives}
            </p>
          </section>

          {/* Mécanismes inducteurs — même champ que #mecanismesList dans le
              panneau "Séance & données" de l'éditeur (cf bug signalé 2026-09-22). */}
          {proc.mecanismes && proc.mecanismes.length > 0 && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Règles avec mécanisme inducteur
              </h3>
              <div className="space-y-1.5">
                {proc.mecanismes.map((m, i) => (
                  <p key={i} style={{ color: T.text }} className="text-sm leading-relaxed">
                    {m.regle}
                    {m.induit && <span style={{ color: T.textMuted }}> → {m.induit}</span>}
                  </p>
                ))}
              </div>
            </section>
          )}

          {proc.scoring && proc.scoring.length > 0 && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Scoring
              </h3>
              <ul className="space-y-1 list-disc list-inside">
                {proc.scoring.map((s, i) => (
                  <li key={i} style={{ color: T.text }} className="text-sm leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(proc.comportements && proc.comportements.length > 0) || proc.corrections ? (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Comportements attendus
              </h3>
              {proc.comportements && proc.comportements.length > 0 ? (
                <ul className="space-y-1 list-disc list-inside">
                  {proc.comportements.map((c, i) => (
                    <li key={i} style={{ color: T.text }} className="text-sm leading-relaxed">
                      {c}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                  {proc.corrections}
                </p>
              )}
            </section>
          ) : null}

          {((proc.variables_plus && proc.variables_plus.length > 0) ||
            (proc.variables_moins && proc.variables_moins.length > 0) ||
            proc.variants) && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Variantes
              </h3>
              {proc.variables_plus && proc.variables_plus.length > 0 && (
                <ul className="space-y-1 list-disc list-inside">
                  {proc.variables_plus.map((v, i) => (
                    <li key={`p${i}`} style={{ color: T.text }} className="text-sm leading-relaxed">
                      + {v}
                    </li>
                  ))}
                </ul>
              )}
              {proc.variables_moins && proc.variables_moins.length > 0 && (
                <ul className="space-y-1 list-disc list-inside">
                  {proc.variables_moins.map((v, i) => (
                    <li key={`m${i}`} style={{ color: T.text }} className="text-sm leading-relaxed">
                      − {v}
                    </li>
                  ))}
                </ul>
              )}
              {proc.variants && (
                <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                  {proc.variants}
                </p>
              )}
            </section>
          )}

          {(proc.field_dimensions || proc.duration_minutes || proc.min_players) && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Informations pratiques
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {proc.field_dimensions && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                      Terrain
                    </div>
                    <div style={{ color: T.text }} className="text-sm mt-1">
                      {proc.field_dimensions}
                    </div>
                  </div>
                )}
                {proc.duration_minutes && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                      Durée
                    </div>
                    <div style={{ color: T.text }} className="text-sm mt-1">
                      {proc.duration_minutes} min
                    </div>
                  </div>
                )}
                {proc.min_players && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">
                      Joueurs min.
                    </div>
                    <div style={{ color: T.text }} className="text-sm mt-1">
                      {proc.min_players}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();

  const [items, setItems] = useState<LibraryCard[]>([]);
  const [folders, setFolders] = useState<SchematicFolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderReady, setRenderReady] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBlocs, setSelectedBlocs] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null | 'all'>('all');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<TrainingProcedure | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [procedureUsageCount, setProcedureUsageCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!activeTeam?.club_id) return;
    setLoading(true);
    setError(null);
    try {
      const [libItems, libFolders] = await Promise.all([
        trainingProceduresService.getFullLibraryByClub(activeTeam.club_id),
        schematicFoldersService.getFoldersByClub(activeTeam.club_id),
      ]);
      setItems(libItems);
      setFolders(libFolders);
    } catch {
      setError('Impossible de charger la bibliothèque.');
    } finally {
      setLoading(false);
    }
  }, [activeTeam?.club_id]);

  useEffect(() => {
    load();
  }, [load]);

  // Le détail ne s'ouvre que pour un procédé (contenu pédagogique à montrer) —
  // une carte "Sans fiche" ouvre directement l'éditeur, cf ProcedureCard onOpen.
  const selectedCard = useMemo(() => items.find((i) => i.key === selectedKey) ?? null, [items, selectedKey]);
  const selectedProcedure = selectedCard?.procedure ?? null;

  useEffect(() => {
    if (!selectedProcedure?.id) {
      setProcedureUsageCount(null);
      return;
    }
    trainingsService
      .getProcedureUsageCount(selectedProcedure.id)
      .then(setProcedureUsageCount)
      .catch(() => setProcedureUsageCount(0));
  }, [selectedProcedure?.id]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        (item.procedure?.objectives.toLowerCase().includes(q) ?? false) ||
        (item.procedure?.principes || []).some((x) => x.toLowerCase().includes(q));
      const matchBloc = selectedBlocs.length === 0 || selectedBlocs.includes(item.bloc ?? '');
      const matchFolder = activeFolder === 'all' ? true : activeFolder === null ? item.folder_id == null : item.folder_id === activeFolder;
      return matchSearch && matchBloc && matchFolder;
    });
  }, [items, searchTerm, selectedBlocs, activeFolder]);

  const toggleBloc = (v: string) => setSelectedBlocs((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const folderCount = (folderId: string) => items.filter((i) => i.folder_id === folderId).length;

  const handleCreateFolder = async () => {
    if (!activeTeam?.id || !newFolderName.trim()) return;
    try {
      await schematicFoldersService.createFolder(activeTeam.id, newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
      load();
    } catch {
      alert('Impossible de créer le dossier.');
    }
  };

  const handleRenameFolder = async (folder: SchematicFolderRecord) => {
    const name = window.prompt('Renommer le dossier', folder.name);
    if (!name || !name.trim()) return;
    await schematicFoldersService.renameFolder(folder.id, name.trim());
    load();
  };

  const handleDeleteFolder = async (folder: SchematicFolderRecord) => {
    if (!window.confirm(`Supprimer le dossier « ${folder.name} » ?\nLes procédés qu'il contient sont conservés et retournent dans « Sans dossier ».`)) return;
    if (activeFolder === folder.id) setActiveFolder('all');
    await schematicFoldersService.deleteFolder(folder.id);
    load();
  };

  // Un dossier reste porté par schematic_folders quel que soit le type de
  // carte — seule la colonne qui range diffère (training_procedures.folder_id
  // vs schematics.folder_id, cf migration 20260922130000).
  const handleSetFolder = async (item: LibraryCard, folderId: string | null) => {
    setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, folder_id: folderId } : i)));
    try {
      if (item.kind === 'procedure' && item.procedure) {
        await trainingProceduresService.setProcedureFolder(item.procedure.id, folderId);
      } else if (item.schematic) {
        await schematicsService.setSchematicFolder(item.schematic.id, folderId);
      }
    } catch {
      load();
    }
  };

  const handleDelete = async () => {
    if (!selectedProcedure) return;
    if (!confirm('Archiver ce procédé ? Il disparaîtra de la bibliothèque. Le schéma dessiné, s\'il y en a un, n\'est pas supprimé.')) return;
    setIsDeleting(true);
    try {
      await trainingProceduresService.archiveProcedure(selectedProcedure.id);
      setItems((prev) => prev.filter((i) => i.key !== selectedKey));
      setSelectedKey(null);
    } catch {
      alert('Impossible de supprimer ce procédé.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaved = () => {
    setShowDrawer(false);
    setEditingProcedure(null);
    load();
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: T.pageBg }} className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: T.accent }} />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: T.pageBg, color: T.text, minHeight: '100%' }} className="flex flex-col">
      {/* Charge le moteur de rendu des schémas une seule fois pour toute la
          page — même script que l'éditeur (public/tools/tactics/render-core.js),
          pour un rendu de vignette identique (cf SchematicThumb). */}
      <Script src="/tools/tactics/render-core.js" strategy="afterInteractive" onReady={() => setRenderReady(true)} />

      {/* Top bar */}
      <div style={{ backgroundColor: T.cardBg, borderBottom: `1px solid ${T.border}` }} className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 flex-wrap">
        <h1 style={{ color: T.text }} className="text-base font-semibold">
          Bibliothèque
        </h1>
        <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: T.textMuted }} />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher…"
              style={{ backgroundColor: T.pageBg, border: `1px solid ${T.border}`, color: T.text }}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={() => window.open('/webapp/library/sessions', '_blank')}
            style={{ backgroundColor: T.cardBg, color: T.text, border: `1px solid ${T.border}` }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg hover:opacity-80 transition-opacity shrink-0"
          >
            <span className="hidden sm:inline">Séances</span>
          </button>
          <button
            onClick={() => { setEditingProcedure(null); setShowDrawer(true); }}
            style={{ backgroundColor: T.accent, color: '#fff' }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg hover:opacity-90 transition-opacity shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau procédé</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Filtre par bloc */}
        <div className="flex flex-wrap gap-1.5">
          {BLOCS.map((b) => {
            const active = selectedBlocs.includes(b.value);
            return (
              <button
                key={b.value}
                onClick={() => toggleBloc(b.value)}
                style={{
                  backgroundColor: active ? b.bg : T.cardBg,
                  color: active ? b.color : T.textMuted,
                  border: `1px solid ${active ? b.color : T.border}`,
                  fontWeight: active ? 600 : 400,
                }}
                className="px-2.5 py-1 rounded-full text-xs transition-all hover:opacity-80"
              >
                {b.value}
              </button>
            );
          })}
          {selectedBlocs.length > 0 && (
            <button onClick={() => setSelectedBlocs([])} style={{ color: T.textMuted }} className="px-2 py-1 rounded-full text-xs flex items-center gap-0.5 hover:opacity-70">
              <X className="h-3 w-3" /> Tout
            </button>
          )}
        </div>

        {/* Dossiers */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setActiveFolder('all')}
            style={{
              backgroundColor: activeFolder === 'all' ? '#EFF6FF' : T.cardBg,
              color: activeFolder === 'all' ? T.accent : T.text,
              border: `1px solid ${activeFolder === 'all' ? T.accent : T.border}`,
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
          >
            Tous ({items.length})
          </button>
          <button
            onClick={() => setActiveFolder(null)}
            style={{
              backgroundColor: activeFolder === null ? '#EFF6FF' : T.cardBg,
              color: activeFolder === null ? T.accent : T.text,
              border: `1px solid ${activeFolder === null ? T.accent : T.border}`,
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
          >
            Sans dossier
          </button>
          {folders.map((f) => (
            <div
              key={f.id}
              style={{
                backgroundColor: activeFolder === f.id ? '#EFF6FF' : T.cardBg,
                color: activeFolder === f.id ? T.accent : T.text,
                border: `1px solid ${activeFolder === f.id ? T.accent : T.border}`,
              }}
              className="group inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-lg text-xs font-medium"
            >
              <button onClick={() => setActiveFolder(f.id)} className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <Folder className="h-3.5 w-3.5" />
                {f.name}
                <span style={{ color: T.textMuted }}>{folderCount(f.id)}</span>
              </button>
              <button onClick={() => handleRenameFolder(f)} title="Renommer" className="opacity-0 group-hover:opacity-100 hover:opacity-70 transition-opacity p-0.5">
                <Pencil className="h-3 w-3" />
              </button>
              <button onClick={() => handleDeleteFolder(f)} title="Supprimer le dossier" className="opacity-0 group-hover:opacity-100 hover:opacity-70 transition-opacity p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {showNewFolder ? (
            <div className="inline-flex items-center gap-1.5">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
                placeholder="Nom du dossier"
                style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}`, color: T.text }}
                className="px-2.5 py-1.5 rounded-lg text-xs w-36"
              />
              <button onClick={handleCreateFolder} style={{ color: T.accent }} className="text-xs font-medium hover:opacity-70">
                Créer
              </button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={{ color: T.textMuted }} className="hover:opacity-70">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFolder(true)}
              style={{ color: T.textMuted, border: `1px dashed ${T.border}` }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Nouveau dossier
            </button>
          )}
        </div>

        {/* Grille de cartes */}
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center">
            <p style={{ color: T.textMuted }} className="text-sm">
              {items.length === 0 ? 'Aucun procédé — crée le premier avec "Nouveau procédé".' : 'Aucun procédé ne correspond à ce filtre.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {filteredItems.map((item) => (
              <ProcedureCard
                key={item.key}
                item={item}
                folders={folders}
                renderReady={renderReady}
                onOpen={() => {
                  if (item.kind === 'procedure') setSelectedKey(item.key);
                  else if (item.schematic) router.push(`/webapp/library/schematics?schematic=${item.schematic.id}`);
                }}
                onSetFolder={(folderId) => handleSetFolder(item, folderId)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedProcedure && (
        <ProcedureDetailModal
          procedure={selectedProcedure}
          onClose={() => setSelectedKey(null)}
          onEdit={() => { setEditingProcedure(selectedProcedure as unknown as TrainingProcedure); setShowDrawer(true); }}
          onDelete={handleDelete}
          isDeleting={isDeleting}
          onDrawSchematic={() => router.push(`/webapp/library/schematics?procedure=${selectedProcedure.id}`)}
          usageCount={procedureUsageCount}
          renderReady={renderReady}
        />
      )}

      {showDrawer && (
        <ProcedureDrawer
          editing={editingProcedure}
          onClose={() => { setShowDrawer(false); setEditingProcedure(null); }}
          onSaved={handleSaved}
          activeClubId={activeTeam?.club_id}
        />
      )}
    </div>
  );
}
