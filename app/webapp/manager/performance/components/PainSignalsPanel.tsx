'use client';

/**
 * Signaux précoces — le panneau qui donne sa valeur au reste de la page.
 *
 * `pain_reports` accumule depuis fin juillet des déclarations zone + côté +
 * intensité + date, et personne ne les relit. Cette règle très simple (N
 * signalements sur la même zone et le même côté, sur une fenêtre glissante)
 * transforme une saisie que les joueurs font déjà en une alerte avant blessure.
 * C'est aussi ce qui donne au joueur une raison de continuer à déclarer.
 *
 * ## Trois garde-fous, non négociables
 *
 * 1. **Signal, jamais diagnostic.** L'écran écrit « 4 signalements ischio gauche
 *    en 18 jours », pas « risque de lésion ». Le premier est un fait vérifiable
 *    qui ouvre une conversation ; le second est une assertion médicale que ni
 *    l'application ni le coach ne sont en position de produire, et qui expose le
 *    club le jour où elle se trompe, dans un sens comme dans l'autre.
 * 2. **L'intensité n'est jamais colorée en vert / rouge.** C'est une mesure, pas
 *    une note. Une rampe sémantique pousse le joueur à sous-déclarer pour éviter
 *    le rouge, et détruit exactement la donnée qu'on cherche à récolter.
 * 3. **Le seuil est affiché.** « 3 joueurs en signal » ne veut rien dire sans
 *    « 3 signalements sur 21 jours ». Le réglage est visible, pas caché dans le
 *    code.
 */

import { AlertCircle } from 'lucide-react';
import { zoneLabel } from '@/lib/painMap';
import {
  daysBetween,
  SIDE_LABELS,
  type PainSignalRow,
} from '@/lib/availability';
import { T, INTENSITY_RAMP } from '../theme';

interface PainSignalsPanelProps {
  signals: PainSignalRow[];
  windowDays: number;
  minReports: number;
  onWindowChange: (days: number) => void;
  onMinReportsChange: (count: number) => void;
  onOpenPlayer: (playerId: string) => void;
}

const WINDOW_CHOICES = [14, 21, 30];
const MIN_CHOICES = [2, 3, 4];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export default function PainSignalsPanel({
  signals,
  windowDays,
  minReports,
  onWindowChange,
  onMinReportsChange,
  onOpenPlayer,
}: PainSignalsPanelProps) {
  return (
    <section
      className="rounded-lg border p-4"
      style={{ backgroundColor: T.cardBg, borderColor: T.border }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold" style={{ color: T.text }}>
          Signaux précoces
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: T.textMuted }}>
          <span className="flex items-center gap-1">
            Au moins
            <select
              value={minReports}
              onChange={(e) => onMinReportsChange(Number(e.target.value))}
              aria-label="Nombre minimum de signalements"
              className="rounded border px-1 py-0.5"
              style={{ borderColor: T.border, color: T.text }}
            >
              {MIN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            signalements
          </span>
          <span className="flex items-center gap-1">
            sur
            <select
              value={windowDays}
              onChange={(e) => onWindowChange(Number(e.target.value))}
              aria-label="Fenêtre en jours"
              className="rounded border px-1 py-0.5"
              style={{ borderColor: T.border, color: T.text }}
            >
              {WINDOW_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            jours
          </span>
        </div>
      </div>

      {signals.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: T.textMuted }}>
          Aucune zone ne dépasse le seuil sur la période. Baissez le seuil pour voir les
          répétitions plus faibles.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: T.border }}>
          {signals.map((signal) => {
            const span = daysBetween(signal.first_reported, signal.last_reported);
            return (
              <li key={`${signal.player_id}:${signal.zone}:${signal.side}`}>
                <button
                  type="button"
                  onClick={() => onOpenPlayer(signal.player_id)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" style={{ color: T.textMuted }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: T.text }}>
                      {signal.first_name} {signal.last_name}
                    </p>
                    {/* Le fait, et rien que le fait. */}
                    <p className="truncate text-sm" style={{ color: T.textMuted }}>
                      {signal.report_count} signalements {zoneLabel(signal.zone).toLowerCase()}
                      {signal.side !== 'C' ? ` (${SIDE_LABELS[signal.side]})` : ''}
                      {span <= 1 ? ' le même jour' : ` en ${span} jours`}
                      {' · '}
                      {fmtDate(signal.first_reported)} au {fmtDate(signal.last_reported)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor:
                          INTENSITY_RAMP[
                            Math.min(3, Math.max(1, Math.round(signal.avg_intensity))) as 1 | 2 | 3
                          ],
                      }}
                      title="Intensité moyenne déclarée. C'est une mesure, pas une note."
                    >
                      {signal.avg_intensity.toFixed(1)} / 3
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
