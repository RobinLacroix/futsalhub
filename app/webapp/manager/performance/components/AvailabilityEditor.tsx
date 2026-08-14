'use client';

/**
 * Édition du statut de disponibilité d'un joueur.
 *
 * ## Ce que le formulaire refuse de faire
 *
 * Il n'écrit jamais la table. `set_player_availability` clôture l'état courant
 * et en ouvre un nouveau dans le même appel : l'index unique partiel refuse deux
 * lignes ouvertes pour un joueur, donc une insertion directe échouerait, et une
 * mise à jour directe écraserait l'historique. « Depuis combien de jours Untel
 * est-il absent cette saison » deviendrait impossible à répondre.
 *
 * ## Le champ « depuis » n'est pas décoratif
 *
 * Il date AUSSI la fin de l'état précédent. Un kiné qui saisit lundi une reprise
 * datée du samedi produit un historique juste ; s'il laisse la date du jour, le
 * joueur apparaît en soins deux jours de trop, tous les ans, sur tous les
 * cumuls. D'où la valeur par défaut à aujourd'hui et le champ modifiable.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { availabilityService } from '@/lib/services';
import {
  AVAILABILITY_META,
  AVAILABILITY_ORDER,
  type AvailabilityRow,
  type AvailabilityStatus,
} from '@/lib/availability';
import { zoneById } from '@/lib/painMap';
import BodyMap, { type PainSelection } from '@/components/BodyMap';
import { T, TONE_COLORS } from '../theme';

interface AvailabilityEditorProps {
  player: { id: string; first_name: string; last_name: string };
  current: AvailabilityRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AvailabilityEditor({
  player,
  current,
  onClose,
  onSaved,
}: AvailabilityEditorProps) {
  const [status, setStatus] = useState<AvailabilityStatus>(current?.status ?? 'disponible');
  const [since, setSince] = useState(todayIso());
  const [expectedReturn, setExpectedReturn] = useState(current?.expected_return_date ?? '');
  const [confidence, setConfidence] = useState<'estimee' | 'confirmee'>(
    current?.return_confidence ?? 'estimee',
  );
  const [pain, setPain] = useState<PainSelection>(current?.zone ? { [current.zone]: 1 } : {});
  const [note, setNote] = useState(current?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zone = Object.keys(pain)[0] ?? '';
  const meta = AVAILABILITY_META[status];
  const isAvailable = status === 'disponible';

  // Repasser un joueur en « disponible » solde son indisponibilité : garder une
  // date de retour et une zone à ce moment-là produirait une ligne qui se
  // contredit elle-même.
  useEffect(() => {
    if (isAvailable) {
      setExpectedReturn('');
      setPain({});
    }
  }, [isAvailable]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await availabilityService.setPlayerAvailability({
        playerId: player.id,
        status,
        since: since || todayIso(),
        expectedReturn: expectedReturn || null,
        returnConfidence: expectedReturn ? confidence : null,
        // `side` est déduit de la zone, jamais choisi séparément : les zones
        // encodent déjà le côté (`hamstring_l`), et `lib/painMap.ts` remplit
        // `pain_reports.side` exactement comme ça. Deux champs indépendants
        // finiraient par se contredire.
        zone: zone || null,
        side: zone ? (zoneById(zone)?.side ?? null) : null,
        note: note.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg p-6 shadow-xl"
        style={{ backgroundColor: T.cardBg }}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: T.text }}>
              {player.first_name} {player.last_name}
            </h2>
            <p className="text-sm" style={{ color: T.textMuted }}>
              Statut de disponibilité
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 hover:bg-gray-100"
            style={{ color: T.textMuted }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium" style={{ color: T.text }}>
            Statut
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {AVAILABILITY_ORDER.map((value) => {
              const m = AVAILABILITY_META[value];
              const tone = TONE_COLORS[m.tone];
              const active = status === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  aria-pressed={active}
                  className="rounded-md border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: active ? tone.border : T.border,
                    backgroundColor: active ? tone.bg : 'transparent',
                  }}
                >
                  <span
                    className="block text-sm font-medium"
                    style={{ color: active ? tone.fg : T.text }}
                  >
                    {m.label}
                  </span>
                  <span className="block text-xs" style={{ color: T.textMuted }}>
                    {m.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="av-since" className="mb-1 block text-sm font-medium" style={{ color: T.text }}>
              Depuis le
            </label>
            <input
              id="av-since"
              type="date"
              value={since}
              max={todayIso()}
              onChange={(e) => setSince(e.target.value)}
              className="w-full rounded-md border px-3 py-2"
              style={{ borderColor: T.border }}
            />
            <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
              Date aussi la fin de l&apos;état précédent. À corriger si la saisie est faite après
              coup.
            </p>
          </div>

          {!isAvailable && (
            <div>
              <label
                htmlFor="av-return"
                className="mb-1 block text-sm font-medium"
                style={{ color: T.text }}
              >
                Retour prévu <span className="font-normal">(optionnel)</span>
              </label>
              <input
                id="av-return"
                type="date"
                value={expectedReturn}
                onChange={(e) => setExpectedReturn(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                style={{ borderColor: T.border }}
              />
              {expectedReturn && (
                <div className="mt-2 flex gap-2">
                  {(['estimee', 'confirmee'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setConfidence(value)}
                      aria-pressed={confidence === value}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{
                        borderColor: confidence === value ? T.accent : T.border,
                        color: confidence === value ? T.accent : T.textMuted,
                      }}
                    >
                      {value === 'estimee' ? 'Estimé' : 'Confirmé'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {!isAvailable && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium" style={{ color: T.text }}>
              Zone concernée <span className="font-normal">(optionnel)</span>
            </label>
            <BodyMap value={pain} onChange={setPain} singleSelect maxHeight={280} />
            <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
              Même mannequin que les déclarations de douleur : c&apos;est ce qui permet de
              rapprocher un signal d&apos;une blessure.
            </p>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="av-note" className="mb-1 block text-sm font-medium" style={{ color: T.text }}>
            Note <span className="font-normal">(optionnel)</span>
          </label>
          <textarea
            id="av-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Protocole, consigne au staff, contexte…"
            className="w-full rounded-md border px-3 py-2"
            style={{ borderColor: T.border }}
          />
        </div>

        <p className="mb-4 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: T.rowOdd, color: T.textMuted }}>
          {meta.hint}. L&apos;état précédent est conservé dans l&apos;historique du joueur, il
          n&apos;est pas écrasé.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2"
            style={{ borderColor: T.border, color: T.text }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-white disabled:opacity-50"
            style={{ backgroundColor: T.accent }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
