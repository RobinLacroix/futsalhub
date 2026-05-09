'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const AMBER = '#FFB020';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (err) throw err;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  const wrapper = (content: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#0E0E10' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ backgroundColor: AMBER, filter: 'blur(120px)' }} />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: AMBER }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>FutsalHub</span>
          </div>
        </div>
        {content}
      </div>
    </div>
  );

  if (success) return wrapper(
    <div className="rounded-2xl p-7 text-center" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(24px)' }}>
      <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
        <span style={{ fontSize: 20 }}>✓</span>
      </div>
      <h2 className="text-xl font-bold mb-3" style={{ color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>Email envoyé</h2>
      <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-inter)', lineHeight: 1.6 }}>
        Si un compte existe avec cette adresse, vous recevrez un lien pour réinitialiser votre mot de passe.
      </p>
      <Link href="/signin"
        className="block w-full py-2.5 rounded-lg text-sm font-semibold text-center"
        style={{ backgroundColor: AMBER, color: '#0E0E10', fontFamily: 'var(--font-inter)' }}>
        Retour à la connexion
      </Link>
    </div>
  );

  return wrapper(
    <>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>
          Mot de passe oublié
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-inter)' }}>
          Entrez votre email pour recevoir un lien de réinitialisation
        </p>
      </div>

      <div className="rounded-2xl p-7" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(24px)' }}>
        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg text-sm"
            style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', fontFamily: 'var(--font-inter)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5"
              style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-inter)' }}>
              Adresse email
            </label>
            <input id="email" type="email" required value={email} placeholder="votre@email.com"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${CARD_BORDER}`, color: '#f9fafb', fontFamily: 'var(--font-inter)', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
            />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ backgroundColor: AMBER, color: '#0E0E10', fontFamily: 'var(--font-inter)' }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#e09800'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = AMBER; }}>
            {loading ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      </div>

      <p className="text-center mt-5 text-sm" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-inter)' }}>
        <Link href="/signin" style={{ color: AMBER }}>← Retour à la connexion</Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0E0E10' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#FFB020' }} />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  );
}
