'use client';

import { useEffect, useState } from 'react';
import { Clock, Users, X } from 'lucide-react';
import { schematicsService, type SchematicRecord } from '@/lib/services/schematicsService';
import type { TrainingProcedureRecord } from '@/lib/services/trainingProceduresService';
import { SchematicAnimatedPlayer } from '../../components/SchematicAnimatedPlayer';
import { BlocBadge, TaxoBadge, FORMATS, PHASES_DE_JEU, INTENSITES } from '../../components/taxonomy';

const T = {
  pageBg: '#EEF0F5',
  cardBg: '#FFFFFF',
  border: '#DDE1EA',
  text: '#1A2332',
  textMuted: '#697585',
};

/**
 * Détail complet (lecture seule) d'un procédé, ouvert depuis l'assembleur de
 * séances — avant, la seule chose visible depuis un bloc de séance était le
 * schéma (via SessionBlockCard "Schéma"), jamais les règles/objectifs/
 * mécanismes. Demande explicite de Robin (2026-09-27) : "je puisse voir les
 * règles etc, pas seulement le schéma".
 *
 * Volontairement SANS édition/suppression/partage (contrairement à
 * ProcedureDetailModal de app/webapp/library/page.tsx) : réassigner le
 * procédé d'un bloc se fait déjà via ProcedurePickerDialog, et modifier la
 * fiche elle-même reste une tâche de la bibliothèque — ce dialogue ne fait
 * que montrer ce qui est déjà écrit, pour relire un procédé sans quitter
 * l'assembleur.
 */
export function ProcedureDetailsDialog({
  procedure,
  onClose,
  renderReady,
}: {
  procedure: TrainingProcedureRecord;
  onClose: () => void;
  renderReady: boolean;
}) {
  const [schematic, setSchematic] = useState<SchematicRecord | null>(null);
  const [loadingSchematic, setLoadingSchematic] = useState(!!procedure.schematic_id);

  useEffect(() => {
    let cancelled = false;
    if (!procedure.schematic_id) {
      setSchematic(null);
      setLoadingSchematic(false);
      return undefined;
    }
    setLoadingSchematic(true);
    schematicsService.getSchematicById(procedure.schematic_id)
      .then((record) => { if (!cancelled) setSchematic(record); })
      .catch(() => { if (!cancelled) setSchematic(null); })
      .finally(() => { if (!cancelled) setLoadingSchematic(false); });
    return () => { cancelled = true; };
  }, [procedure.schematic_id]);

  const principesList = procedure.principes && procedure.principes.length > 0
    ? procedure.principes
    : procedure.principe ? [procedure.principe] : [];

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
                {procedure.title || '(sans titre)'}
              </h2>
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <BlocBadge bloc={procedure.bloc} />
                <TaxoBadge list={FORMATS} value={procedure.type} />
                <TaxoBadge list={PHASES_DE_JEU} value={procedure.theme} />
                <TaxoBadge list={INTENSITES} value={procedure.intensite} />
                {principesList.map((p) => (
                  <span
                    key={p}
                    style={{ backgroundColor: '#F1F5F9', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                  >
                    {p}
                  </span>
                ))}
                {procedure.rapport_numerique && (
                  <span
                    style={{ backgroundColor: '#F9FAFB', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  >
                    <Users className="h-3 w-3" />
                    {procedure.rapport_numerique}
                  </span>
                )}
                {procedure.duration_minutes && (
                  <span
                    style={{ backgroundColor: '#F9FAFB', color: T.textMuted, border: `1px solid ${T.border}` }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  >
                    <Clock className="h-3 w-3" />
                    {procedure.duration_minutes} min
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ color: T.textMuted }} className="hover:opacity-70 ml-1 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {procedure.schematic_id && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-3">
                Schéma tactique
              </h3>
              {loadingSchematic ? (
                <div style={{ color: T.textMuted }} className="text-sm">Chargement du schéma…</div>
              ) : schematic ? (
                <SchematicAnimatedPlayer drill={schematic.data} ready={renderReady} />
              ) : (
                <div style={{ color: T.textMuted }} className="text-sm">Schéma introuvable.</div>
              )}
            </section>
          )}

          {procedure.instructions && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Description
              </h3>
              <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                {procedure.instructions}
              </p>
            </section>
          )}

          {procedure.objectives && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Objectifs
              </h3>
              <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                {procedure.objectives}
              </p>
            </section>
          )}

          {procedure.mecanismes && procedure.mecanismes.length > 0 && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Règles avec mécanisme inducteur
              </h3>
              <div className="space-y-1.5">
                {procedure.mecanismes.map((m, i) => (
                  <p key={i} style={{ color: T.text }} className="text-sm leading-relaxed">
                    {m.regle}
                    {m.induit && <span style={{ color: T.textMuted }}> → {m.induit}</span>}
                  </p>
                ))}
              </div>
            </section>
          )}

          {procedure.scoring && procedure.scoring.length > 0 && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Scoring
              </h3>
              <ul className="space-y-1 list-disc list-inside">
                {procedure.scoring.map((s, i) => (
                  <li key={i} style={{ color: T.text }} className="text-sm leading-relaxed">{s}</li>
                ))}
              </ul>
            </section>
          )}

          {(procedure.comportements && procedure.comportements.length > 0) || procedure.corrections ? (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Comportements attendus
              </h3>
              {procedure.comportements && procedure.comportements.length > 0 ? (
                <ul className="space-y-1 list-disc list-inside">
                  {procedure.comportements.map((c, i) => (
                    <li key={i} style={{ color: T.text }} className="text-sm leading-relaxed">{c}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                  {procedure.corrections}
                </p>
              )}
            </section>
          ) : null}

          {((procedure.variables_plus && procedure.variables_plus.length > 0) ||
            (procedure.variables_moins && procedure.variables_moins.length > 0) ||
            procedure.variants) && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Variantes
              </h3>
              {procedure.variables_plus && procedure.variables_plus.length > 0 && (
                <ul className="space-y-1 list-disc list-inside">
                  {procedure.variables_plus.map((v, i) => (
                    <li key={`p${i}`} style={{ color: T.text }} className="text-sm leading-relaxed">+ {v}</li>
                  ))}
                </ul>
              )}
              {procedure.variables_moins && procedure.variables_moins.length > 0 && (
                <ul className="space-y-1 list-disc list-inside">
                  {procedure.variables_moins.map((v, i) => (
                    <li key={`m${i}`} style={{ color: T.text }} className="text-sm leading-relaxed">− {v}</li>
                  ))}
                </ul>
              )}
              {procedure.variants && (
                <p style={{ color: T.text }} className="text-sm whitespace-pre-line leading-relaxed">
                  {procedure.variants}
                </p>
              )}
            </section>
          )}

          {(procedure.field_dimensions || procedure.duration_minutes || procedure.min_players) && (
            <section>
              <h3 style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wider mb-2">
                Informations pratiques
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {procedure.field_dimensions && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">Terrain</div>
                    <div style={{ color: T.text }} className="text-sm mt-1">{procedure.field_dimensions}</div>
                  </div>
                )}
                {procedure.duration_minutes && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">Durée</div>
                    <div style={{ color: T.text }} className="text-sm mt-1">{procedure.duration_minutes} min</div>
                  </div>
                )}
                {procedure.min_players && (
                  <div style={{ backgroundColor: T.cardBg, border: `1px solid ${T.border}` }} className="rounded-lg px-3 py-2">
                    <div style={{ color: T.textMuted }} className="text-xs font-semibold uppercase tracking-wide">Joueurs min.</div>
                    <div style={{ color: T.text }} className="text-sm mt-1">{procedure.min_players}</div>
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
