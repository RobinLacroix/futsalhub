'use client';

import { useState } from 'react';
import { Activity, CheckCircle2, Loader2, X } from 'lucide-react';
import { reportMyPain } from '@/lib/services';
import { toPayload } from '@/lib/painMap';
import BodyMap, { type PainSelection } from '@/components/BodyMap';

type Onset = 'aigu' | 'chronique' | null;

const T = {
  cardBg: '#FFFFFF',
  cardBg2: '#F8FAFC',
  border: '#DDE1EA',
  divider: '#E8EDF4',
  text: '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  navy: '#1a2744',
  green: '#059669',
  red: '#dc2626',
};

/**
 * Bouton flottant "Signaler une douleur" + sa modale, réutilisable sur toutes
 * les pages joueur. Envoi spontané (hors questionnaire) via reportMyPain.
 */
export default function PainReportButton() {
  const [open, setOpen] = useState(false);
  const [pain, setPain] = useState<PainSelection>({});
  const [onset, setOnset] = useState<Onset>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setPain({});
    setOnset(null);
    setNote('');
    setSubmitted(false);
    setError(null);
  };

  const submit = async () => {
    const zones = toPayload(pain);
    if (zones.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await reportMyPain(zones, note.trim() || null, onset, null);
      if (!res.success) setError(res.error || 'Une erreur est survenue.');
      else setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Bouton flottant — au-dessus de la barre d'onglets mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler une douleur"
        style={{
          position: 'fixed', right: 18, zIndex: 40,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: T.red, color: '#fff', fontSize: 13, fontWeight: 800,
          boxShadow: '0 8px 24px rgba(220,38,38,0.35)',
        }}
        className="md:!bottom-6"
      >
        <Activity size={17} />
        Signaler une douleur
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={close}
        >
          <div
            style={{ background: T.cardBg, borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: `1px solid ${T.divider}` }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Signaler une douleur</p>
                <p style={{ fontSize: 12, color: T.textFaint, margin: '3px 0 0' }}>Transmets au staff une info claire sur ton ressenti.</p>
              </div>
              <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color={T.textFaint} />
              </button>
            </div>

            <div style={{ padding: '20px 22px 24px' }}>
              {submitted ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', textAlign: 'center' }}>
                  <CheckCircle2 size={48} color={T.green} style={{ marginBottom: 16 }} />
                  <p style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0, marginBottom: 6 }}>Signalement envoyé</p>
                  <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Ton staff a été alerté.</p>
                  <button onClick={close} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, background: T.navy, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Fermer</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <BodyMap value={pain} onChange={setPain} />

                  {Object.keys(pain).length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>Depuis quand ?</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {([['aigu', 'Récent / aigu'], ['chronique', 'Qui traîne']] as const).map(([v, lbl]) => (
                          <button key={v} type="button" onClick={() => setOnset(o => (o === v ? null : v))}
                            style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              border: `1.5px solid ${onset === v ? T.navy : T.border}`, background: onset === v ? T.navy : T.cardBg2, color: onset === v ? '#fff' : T.textMuted }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 8px' }}>Précision (optionnel)</p>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Contexte, type de douleur, à l'effort ou au repos..."
                      rows={3}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box', border: `1px solid ${T.border}`, background: T.cardBg2, fontSize: 13, color: T.text, resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5 }}
                    />
                  </div>

                  {error && <p style={{ fontSize: 13, color: T.red, margin: 0 }}>{error}</p>}

                  <button
                    onClick={submit}
                    disabled={Object.keys(pain).length === 0 || submitting}
                    style={{ padding: '12px', borderRadius: 12, border: 'none', cursor: Object.keys(pain).length === 0 ? 'not-allowed' : 'pointer',
                      background: T.navy, color: '#fff', fontSize: 14, fontWeight: 700, opacity: (Object.keys(pain).length === 0 || submitting) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {submitting && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    Envoyer au staff
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
