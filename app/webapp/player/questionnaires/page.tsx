'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseClient';
import { getMyPendingFeedbackTokens, type MyPendingFeedbackRow } from '@/lib/services/playerConvocationsService';
import { AlertCircle, CheckCircle2, ChevronRight, FileText, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';

// ─── Theme FM light ───────────────────────────────────────────────────────────

const T = {
  pageBg:    '#EEF0F5',
  cardBg:    '#FFFFFF',
  cardBg2:   '#F8FAFC',
  border:    '#DDE1EA',
  divider:   '#E8EDF4',
  text:      '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  navy:      '#1a2744',
  green:     '#059669',
  greenBg:   '#ecfdf5',
  greenBorder:'#6ee7b7',
  amber:     '#d97706',
  red:       '#dc2626',
  redBg:     '#fef2f2',
};

// ─── Metrics config ───────────────────────────────────────────────────────────

type FormKey = 'auto_evaluation' | 'rpe' | 'physical_form' | 'pleasure';
type FormValues = Record<FormKey, number | null>;

const METRICS: { key: FormKey; label: string; desc: string; lowLabel: string; highLabel: string }[] = [
  { key: 'auto_evaluation', label: 'Auto-évaluation',  desc: 'Comment as-tu joué ?',               lowLabel: 'Très mal',    highLabel: 'Excellent'  },
  { key: 'rpe',             label: 'Intensité (RPE)',   desc: "Intensité perçue de l'effort",        lowLabel: 'Très légère', highLabel: 'Maximale'   },
  { key: 'physical_form',   label: 'Forme physique',   desc: 'Comment tu te sentais physiquement',  lowLabel: 'Très faible', highLabel: 'Parfaite'   },
  { key: 'pleasure',        label: 'Plaisir',           desc: 'As-tu apprécié la séance ?',          lowLabel: 'Aucun',       highLabel: 'Maximum'    },
];

const INITIAL_FORM: FormValues = { auto_evaluation: null, rpe: null, physical_form: null, pleasure: null };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerQuestionnairesPage() {
  const [items,     setItems]     = useState<MyPendingFeedbackRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Modal / form state
  const [activeItem,      setActiveItem]      = useState<MyPendingFeedbackRow | null>(null);
  const [sessionLoading,  setSessionLoading]  = useState(false);
  const [sessionError,    setSessionError]    = useState<string | null>(null);
  const [sessionDate,     setSessionDate]     = useState<string | null>(null);
  const [sessionTheme,    setSessionTheme]    = useState<string | null>(null);
  const [form,            setForm]            = useState<FormValues>(INITIAL_FORM);
  const [comment,         setComment]         = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [submitted,       setSubmitted]       = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await getMyPendingFeedbackTokens();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur au chargement');
      setItems([]);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(true); };

  const openForm = async (item: MyPendingFeedbackRow) => {
    setActiveItem(item);
    setSessionLoading(true);
    setSessionError(null);
    setSubmitted(false);
    setForm(INITIAL_FORM);
    setComment('');
    setSessionDate(null);
    setSessionTheme(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('get_feedback_session_by_token', { p_token: item.token });
      if (rpcErr) throw rpcErr;
      const result = data as Record<string, string> | null;
      if (!result) throw new Error('Token introuvable');
      if ('error' in result) {
        setSessionError(
          result.error === 'already_used' ? 'Ce questionnaire a déjà été rempli.'
          : result.error === 'expired'    ? 'Ce questionnaire a expiré.'
          : 'Lien invalide.'
        );
      } else {
        setSessionDate(result.training_date ?? null);
        setSessionTheme(result.theme ?? null);
      }
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Erreur lors du chargement');
    } finally {
      setSessionLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeItem) return;
    const { auto_evaluation, rpe, physical_form, pleasure } = form;
    if (!auto_evaluation || !rpe || !physical_form || !pleasure) return;

    setSubmitting(true);
    setSessionError(null);
    try {
      const { data } = await supabase.rpc('submit_training_feedback', {
        p_token:           activeItem.token,
        p_auto_evaluation: auto_evaluation,
        p_rpe:             rpe,
        p_physical_form:   physical_form,
        p_pleasure:        pleasure,
        p_comment:         comment.trim() || null,
      });
      const res = data as { success: boolean; error?: string } | null;
      if (!res?.success) {
        setSessionError(
          res?.error === 'already_used' ? 'Ce questionnaire a déjà été rempli.'
          : res?.error === 'expired'   ? 'Ce questionnaire a expiré.'
          : 'Une erreur est survenue.'
        );
      } else {
        setSubmitted(true);
        setItems(prev => prev.filter(i => i.token !== activeItem.token));
      }
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : 'Erreur lors de la soumission');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setActiveItem(null);
    setSessionError(null);
    setSubmitted(false);
    setForm(INITIAL_FORM);
    setComment('');
  };

  const allFilled = Object.values(form).every(v => v !== null);

  if (loading) {
    return (
      <div style={{ background: T.pageBg, minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 240 }}>
        <Loader2 size={24} color={T.textFaint} style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: T.pageBg, minHeight: '100%' }}>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.redBg, padding: '10px 20px', borderBottom: '1px solid #fee2e2' }}>
          <AlertCircle size={15} color={T.red} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: T.red }}>{error}</span>
          <button onClick={() => load()} style={{ fontSize: 13, fontWeight: 700, color: T.red, background: 'none', border: 'none', cursor: 'pointer' }}>Réessayer</button>
        </div>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 40px' }}>
        {/* ── Header ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={17} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.2px' }}>Questionnaires</h1>
              <p style={{ fontSize: 12, color: T.textFaint, margin: 0, marginTop: 1 }}>
                {items.length > 0 ? `${items.length} questionnaire${items.length > 1 ? 's' : ''} en attente` : 'Aucun questionnaire en attente'}
              </p>
            </div>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.cardBg, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={14} color={T.textMuted} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>

        {/* ── Empty ──────────────────────────────────────── */}
        {items.length === 0 ? (
          <div style={{ background: T.cardBg, borderRadius: 14, border: `1px solid ${T.border}`, padding: '48px 24px', textAlign: 'center' }}>
            <FileText size={40} color={T.textFaint} style={{ marginBottom: 14 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0, marginBottom: 6 }}>Aucun questionnaire en attente</p>
            <p style={{ fontSize: 13, color: T.textMuted, margin: 0, lineHeight: 1.6 }}>
              Les liens de questionnaire apparaissent après une séance ou depuis le calendrier.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => {
              const date = item.training_date ? format(parseISO(item.training_date), 'd MMMM yyyy', { locale: fr }) : '';
              return (
                <button
                  key={item.token}
                  onClick={() => openForm(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    background: T.cardBg, border: `1px solid ${T.border}`,
                    borderLeft: `4px solid ${T.green}`, borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.05)', width: '100%',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: T.greenBg, border: `1px solid ${T.greenBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} color={T.green} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>{date}</p>
                    {item.theme && <p style={{ fontSize: 12, color: T.textMuted, margin: '2px 0 0' }}>{item.theme}</p>}
                  </div>
                  <ChevronRight size={16} color={T.textFaint} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal ─────────────────────────────────────────── */}
      {activeItem && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={closeModal}
        >
          <div
            style={{ background: T.cardBg, borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: `1px solid ${T.divider}` }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Questionnaire de séance</p>
                {sessionDate && (
                  <p style={{ fontSize: 12, color: T.textFaint, margin: '3px 0 0' }}>
                    {format(parseISO(sessionDate), 'd MMMM yyyy', { locale: fr })}
                    {sessionTheme ? ` · ${sessionTheme}` : ''}
                  </p>
                )}
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color={T.textFaint} />
              </button>
            </div>

            <div style={{ padding: '20px 22px 24px' }}>
              {/* Loading */}
              {sessionLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                  <Loader2 size={28} color={T.navy} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}

              {/* Error */}
              {sessionError && !sessionLoading && (
                <div style={{ padding: '12px 14px', borderRadius: 10, background: T.redBg, border: '1px solid #fca5a5', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: T.red, margin: 0 }}>{sessionError}</p>
                </div>
              )}

              {/* Success */}
              {submitted && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', textAlign: 'center' }}>
                  <CheckCircle2 size={48} color={T.green} style={{ marginBottom: 16 }} />
                  <p style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0, marginBottom: 6 }}>Questionnaire envoyé !</p>
                  <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Merci pour ton retour.</p>
                  <button onClick={closeModal} style={{ marginTop: 20, padding: '10px 24px', borderRadius: 10, background: T.navy, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Fermer
                  </button>
                </div>
              )}

              {/* Form */}
              {!sessionLoading && !submitted && !sessionError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {METRICS.map(metric => {
                    const val = form[metric.key];
                    return (
                      <div key={metric.key}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{metric.label}</p>
                            <p style={{ fontSize: 11, color: T.textFaint, margin: '2px 0 0' }}>{metric.desc}</p>
                          </div>
                          {val && (
                            <span style={{ fontSize: 20, fontWeight: 800, color: T.navy, minWidth: 24, textAlign: 'right' }}>{val}</span>
                          )}
                        </div>

                        {/* Scale buttons 1-10 */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                            const active = val === n;
                            const hue = n <= 3 ? T.red : n <= 6 ? T.amber : T.green;
                            return (
                              <button
                                key={n}
                                onClick={() => setForm(prev => ({ ...prev, [metric.key]: n }))}
                                style={{
                                  flex: 1, paddingTop: 8, paddingBottom: 8, borderRadius: 7,
                                  fontSize: 12, fontWeight: active ? 800 : 600,
                                  border: `1.5px solid ${active ? hue : T.border}`,
                                  background: active ? hue : T.cardBg2,
                                  color: active ? '#fff' : T.textMuted,
                                  cursor: 'pointer', transition: 'all 0.1s',
                                }}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <span style={{ fontSize: 10, color: T.textFaint }}>{metric.lowLabel}</span>
                          <span style={{ fontSize: 10, color: T.textFaint }}>{metric.highLabel}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Comment */}
                  <div style={{ borderTop: `1px solid ${T.divider}`, paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <MessageCircle size={13} color={T.green} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Commentaire libre
                      </span>
                      <span style={{ fontSize: 10, color: T.textFaint, background: T.cardBg2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '1px 6px' }}>
                        optionnel
                      </span>
                    </div>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Un mot pour ton coach : ressenti, douleur, motivation..."
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                        border: `1px solid ${T.border}`, background: T.cardBg2, fontSize: 13, color: T.text,
                        resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
                      }}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!allFilled || submitting}
                    style={{
                      padding: '12px', borderRadius: 12, border: 'none', cursor: allFilled ? 'pointer' : 'not-allowed',
                      background: T.navy, color: '#fff', fontSize: 14, fontWeight: 700,
                      opacity: (!allFilled || submitting) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {submitting && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                    Envoyer le questionnaire
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
