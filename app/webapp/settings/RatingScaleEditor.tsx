'use client';

import { useEffect, useState } from 'react';
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

function pickWeights(w: RatingWeights): RatingWeights {
  return {
    w_goal: w.w_goal, w_assist: w.w_assist, w_recovery: w.w_recovery,
    w_shot_on_target: w.w_shot_on_target, w_shot: w.w_shot, w_ball_loss: w.w_ball_loss,
    w_yellow_card: w.w_yellow_card, w_red_card: w.w_red_card,
    cw_goal: w.cw_goal, cw_shot: w.cw_shot,
    cw_opponent_shot: w.cw_opponent_shot, cw_opponent_goal: w.cw_opponent_goal,
  };
}

export function RatingScaleEditor() {
  const [weights, setWeights] = useState<RatingWeights>(DEFAULT_RATING_WEIGHTS);
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await matchRatingsService.getRatingWeights();
        setWeights(pickWeights(res));
        setIsCustom(res.is_custom);
      } catch {
        setWeights(DEFAULT_RATING_WEIGHTS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setField = (key: keyof RatingWeights, raw: string) => {
    const v = parseFloat(raw);
    setWeights(prev => ({ ...prev, [key]: Number.isFinite(v) ? v : 0 }));
    setFeedback(null);
  };

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await matchRatingsService.setRatingWeights(weights);
      setIsCustom(true);
      setFeedback('Échelle enregistrée.');
    } catch {
      setFeedback("Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await matchRatingsService.resetRatingWeights();
      setWeights(DEFAULT_RATING_WEIGHTS);
      setIsCustom(false);
      setFeedback('Échelle réinitialisée aux valeurs par défaut.');
    } catch {
      setFeedback('Échec de la réinitialisation.');
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
                      type="number" step="0.05" inputMode="decimal"
                      value={weights[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      style={inputStyle}
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
                      type="number" step="0.05" inputMode="decimal"
                      value={weights[f.key]}
                      onChange={e => setField(f.key, e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button
                onClick={save}
                disabled={saving}
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
              {feedback && <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>{feedback}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
