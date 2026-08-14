'use client';

/**
 * Saisie d'une campagne de tests physiques — page de rattrapage.
 *
 * Orchestration seulement : l'état vit dans `useTestCapture`, la grille dans
 * `TestGrid`. La page choisit quoi afficher et ne parle jamais à Supabase.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ClipboardPaste, CloudOff, Loader2 } from 'lucide-react';
import { useTestCapture, type GridColumn } from '../hooks/useTestCapture';
import TestGrid, { UnreadableBanner } from '../components/TestGrid';
import { CATEGORY_LABELS } from '@/lib/physicalTests';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export default function PhysicalTestSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? '';

  const {
    session,
    catalogue,
    players,
    entries,
    selectedTypes,
    selectedTypeIds,
    columns,
    unreadableKeys,
    filledCountByType,
    loading,
    error,
    saveState,
    setCell,
    applyPaste,
    toggleType,
    retainedFor,
  } = useTestCapture(sessionId);

  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  const handlePasted = useCallback((cellCount: number) => {
    setPasteNotice(
      cellCount === 0
        ? "Rien n'a été collé : la zone visée est hors de la grille."
        : `${cellCount} valeur${cellCount > 1 ? 's' : ''} collée${cellCount > 1 ? 's' : ''}.`,
    );
  }, []);

  // Le message de collage s'efface seul : il informe d'une action déjà faite,
  // il n'appelle aucune décision et n'a donc pas à rester à l'écran.
  useEffect(() => {
    if (!pasteNotice) return;
    const timer = setTimeout(() => setPasteNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [pasteNotice]);

  const handlePaste = useCallback(
    (anchorRow: number, anchorCol: number, grid: string[][], cols: GridColumn[]) =>
      applyPaste(anchorRow, anchorCol, grid, cols),
    [applyPaste],
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de la campagne…
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
          {error ?? 'Campagne introuvable.'}
        </div>
        <Link
          href="/webapp/manager/tests"
          className="mt-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux campagnes
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link
        href="/webapp/manager/tests"
        className="mb-4 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Campagnes de tests
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {session.label || 'Campagne de tests'}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {fmtDate(session.date)} · {players.length} joueur{players.length > 1 ? 's' : ''}
            {session.conditions ? ` · ${session.conditions}` : ''}
          </p>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      {/* ── Colonnes affichées ─────────────────────────────────────────── */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-gray-900">Tests saisis sur cette campagne</p>
        <div className="flex flex-wrap gap-2">
          {catalogue.map((type) => {
            const active = selectedTypeIds.includes(type.id);
            const filled = filledCountByType[type.id] ?? 0;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleType(type.id)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title={`${CATEGORY_LABELS[type.category]} · ${type.unit}`}
              >
                {type.label}
                {filled > 0 && (
                  <span className="ml-1.5 tabular-nums text-xs text-gray-500">
                    {filled}/{players.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Un test décoché reste enregistré : il sort de l'affichage, pas de la
            base. Le dire évite qu'on décoche pour « effacer ». */}
        <p className="mt-3 text-xs text-gray-500">
          Décocher un test le retire de la grille sans supprimer les résultats déjà enregistrés.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <ClipboardPaste className="h-4 w-4 shrink-0" />
        <span>
          Collez directement depuis un tableur : la sélection se déverse vers la droite puis vers
          le bas à partir de la cellule choisie. Entrée descend d&apos;une ligne, Tab passe à la
          colonne suivante.
        </span>
      </div>

      <UnreadableBanner count={unreadableKeys.size} />

      {pasteNotice && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {pasteNotice}
        </div>
      )}

      <TestGrid
        players={players}
        selectedTypes={selectedTypes}
        columns={columns}
        entries={entries}
        unreadableKeys={unreadableKeys}
        onCellChange={setCell}
        onPaste={handlePaste}
        onPasted={handlePasted}
        retainedFor={retainedFor}
      />
    </div>
  );
}

/**
 * État d'enregistrement, toujours visible.
 *
 * L'enregistrement est automatique : sans témoin, le coach n'a aucun moyen de
 * savoir si sa saisie est partie, et il ferme l'onglet en croyant que oui. Un
 * échec doit se lire, pas se deviner.
 */
function SaveIndicator({ state }: { state: 'idle' | 'pending' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;

  const config = {
    pending: { text: 'Modifications non enregistrées', className: 'text-gray-500', icon: null },
    saving: {
      text: 'Enregistrement…',
      className: 'text-gray-500',
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
    },
    saved: {
      text: 'Enregistré',
      className: 'text-green-600',
      icon: <Check className="h-4 w-4" />,
    },
    error: {
      text: 'Échec de l’enregistrement, la prochaine saisie réessaiera',
      className: 'text-red-600',
      icon: <CloudOff className="h-4 w-4" />,
    },
  }[state];

  return (
    <div className={`flex items-center gap-2 text-sm ${config.className}`} role="status">
      {config.icon}
      {config.text}
    </div>
  );
}
