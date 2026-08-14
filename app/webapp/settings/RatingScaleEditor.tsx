'use client';

/**
 * Échelle de notation — le même bug que sur mobile, resté vivant ici.
 *
 * L'état gardait des `number`, et chaque frappe faisait :
 *
 *     const v = parseFloat(raw);
 *     setWeights(prev => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
 *
 * Toute saisie illisible devenait **0**, silencieusement. Deux façons d'y
 * arriver au clavier :
 *
 *   - vider le champ pour retaper une valeur : `parseFloat("")` vaut `NaN`,
 *     le champ se remplit aussitôt d'un `0` qu'il faut effacer à son tour ;
 *   - saisir « 0,5 » : selon le navigateur et sa locale, un `input[type=number]`
 *     renvoie `""` pour une virgule. `parseFloat("0,5")` vaut de toute façon 0.
 *
 * Le coach croyait pondérer un événement, la note ne bougeait pas, et rien ne
 * le signalait — les notes de match de tous les joueurs s'en trouvaient
 * faussées. Corrigé sur mobile le 2026-08-03, pas ici : réparer les données
 * sans corriger cet écran n'aurait servi à rien, le web les aurait réécrites.
 *
 * L'état garde donc des chaînes brutes, la conversion se fait à
 * l'enregistrement, et une valeur illisible bloque la sauvegarde au lieu d'être
 * remplacée par 0. La virgule est acceptée comme séparateur décimal.
 */

import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { matchRatingsService } from '@/lib/services';
import { DEFAULT_RATING_WEIGHTS, type RatingWeights } from '@/types';

// Champs éditables, groupés Individuel / Collectif. Base de départ = 5.0 (fixe).
const INDIV_FIELDS: { key: keyof RatingWeights; label: string }[] = [
  { key: 'w_goal', label: 'But' },
  { key: 'w_assist', label: 'Passe décisive' },
  { key: 'w_recovery', label: 'Récupération' },
  { key: 'w_shot_on_target', label: 'Tir cadré' },
  { key: 'w_shot', label: 'Tir non cadré' },
  { key: 'w_ball_loss', label: 'Perte (transition)' },
  { key: 'w_yellow_card', label: 'Carton jaune' },
  { key: 'w_red_card', label: 'Carton rouge' },
];

const COLL_FIELDS: { key: keyof RatingWeights; label: string }[] = [
  { key: 'cw_goal', label: 'But marqué (équipe)' },
  { key: 'cw_shot', label: 'Tir équipe' },
  { key: 'cw_opponent_shot', label: 'Tir concédé' },
  { key: 'cw_opponent_goal', label: 'But concédé' },
];

const WEIGHT_KEYS = [...INDIV_FIELDS, ...COLL_FIELDS].map(f => f.key);

type StrMap = Record<keyof RatingWeights, string>;

function toStrMap(w: RatingWeights): StrMap {
  const out = {} as StrMap;
  WEIGHT_KEYS.forEach(k => { out[k] = String(w[k] ?? 0); });
  return out;
}

/** `null` si la saisie n'est pas un nombre. La virgule est acceptée. */
function parseWeight(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

export function RatingScaleEditor() {
  const [values, setValues] = useState<StrMap>(toStrMap(DEFAULT_RATING_WEIGHTS));
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await matchRatingsService.getRatingWeights();
        setValues(toStrMap(res));
        setIsCustom(res.is_custom);
      } catch {
        setValues(toStrMap(DEFAULT_RATING_WEIGHTS));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const invalidKeys = useMemo(
    () => WEIGHT_KEYS.filter(k => parseWeight(values[k]) === null),
    [values]
  );

  const setField = (key: keyof RatingWeights, raw: string) => {
    setValues(prev => ({ ...prev, [key]: raw }));
    setFeedback(null);
  };

  const save = async () => {
    if (invalidKeys.length > 0) {
      setFeedback({
        tone: 'error',
        text: `${invalidKeys.length} valeur(s) illisible(s). Corrigez-les avant d'enregistrer.`,
      });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const out = {} as RatingWeights;
      WEIGHT_KEYS.forEach(k => { out[k] = parseWeight(values[k])!; });
      await matchRatingsService.setRatingWeights(out);
      setIsCustom(true);
      setFeedback({ tone: 'ok', text: 'Échelle enregistrée.' });
    } catch {
      setFeedback({ tone: 'error', text: "Échec de l'enregistrement." });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await matchRatingsService.resetRatingWeights();
      setValues(toStrMap(DEFAULT_RATING_WEIGHTS));
      setIsCustom(false);
      setFeedback({ tone: 'ok', text: 'Échelle réinitialisée aux valeurs par défaut.' });
    } catch {
      setFeedback({ tone: 'error', text: 'Échec de la réinitialisation.' });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: 74, padding: '5px 8px', borderRadius: 6, border: '1px solid #E2E8F0',
    fontSize: '0.8125rem', textAlign: 'right', color: '#0F172A',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 0',
  };

  return (
    <div className="fm-card">
      <div className="fm-card-header">
        <div className="fm-card-accent" />
        <div className="fm-card-title"><SlidersHorizontal size={15} /> Échelle de notation des joueurs</div>
      </div>
      <div className="fm-card-body">
        <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 0, marginBottom: 14 }}>
          Chaque joueur de champ part de <strong>5,0</strong>. Ces poids ajustent sa note à partir des
          événements du match. Individuel = porté par le joueur concerné. Collectif = appliqué à tous
          les joueurs présents sur le terrain. Les gardiens ne sont pas notés.
          {' '}
          <span style={{ fontWeight: 700, color: isCustom ? '#059669' : '#6B7280' }}>
            {loading ? '' : isCustom ? 'Échelle personnalisée active.' : 'Échelle par défaut.'}
          </span>
        </p>

        {loading ? (
          <p style={{ fontSize: '0.8125rem', color: '#6B7280' }}>Chargement…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Individuel
                </div>
                {INDIV_FIELDS.map(f => (
                  <div key={f.key} style={rowStyle}>
                    <span style={{ fontSize: '0.8125rem', color: '#334155' }}>{f.label}</span>
                    <input
                      type="text" inputMode="decimal"
                      value={values[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      aria-invalid={parseWeight(values[f.key]) === null}
                      style={{
                        ...inputStyle,
                        borderColor: parseWeight(values[f.key]) === null ? '#DC2626' : '#E2E8F0',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Collectif (présents sur le terrain)
                </div>
                {COLL_FIELDS.map(f => (
                  <div key={f.key} style={rowStyle}>
                    <span style={{ fontSize: '0.8125rem', color: '#334155' }}>{f.label}</span>
                    <input
                      type="text" inputMode="decimal"
                      value={values[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      aria-invalid={parseWeight(values[f.key]) === null}
                      style={{
                        ...inputStyle,
                        borderColor: parseWeight(values[f.key]) === null ? '#DC2626' : '#E2E8F0',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={save}
                disabled={saving || invalidKeys.length > 0}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#1B2D4F', color: '#fff', fontWeight: 700, fontSize: '0.8125rem',
                  cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer l’échelle'}
              </button>
              <button
                onClick={reset}
                disabled={saving || !isCustom}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0',
                  background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.8125rem',
                  cursor: saving || !isCustom ? 'default' : 'pointer', opacity: !isCustom ? 0.5 : 1,
                }}
              >
                Réinitialiser
              </button>
              {feedback && (
                <span style={{ fontSize: '0.8125rem', fontWeight: feedback.tone === 'error' ? 700 : 400, color: feedback.tone === 'error' ? '#DC2626' : '#6B7280' }}>
                  {feedback.text}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
