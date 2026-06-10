'use client';

import { Suspense, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const AMBER = '#FFB020';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';

function InputField({
  id, label, type, value, onChange, placeholder, autoComplete,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5"
        style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-inter)' }}>
        {label}
      </label>
      <input
        id={id} type={type} required value={value} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: `1px solid ${CARD_BORDER}`,
          color: '#f9fafb',
          fontFamily: 'var(--font-inter)',
          outline: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
      />
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/webapp';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!rememberMe) {
        // Remove persisted session from localStorage so it won't restore after browser close
        Object.keys(localStorage)
          .filter(k => k.startsWith('sb-'))
          .forEach(k => localStorage.removeItem(k));
      }
      if (data.user) router.push(redirect.startsWith('/') ? redirect : `/${redirect}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0E0E10' }}>

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ backgroundColor: AMBER, filter: 'blur(120px)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: AMBER }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>FutsalHub</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>
            Bon retour
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-inter)' }}>
            Connectez-vous à votre espace coach
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7"
          style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(24px)' }}>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', fontFamily: 'var(--font-inter)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <InputField id="email" label="Adresse email" type="email" value={email}
              onChange={setEmail} placeholder="votre@email.com" autoComplete="email" />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium"
                  style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-inter)' }}>
                  Mot de passe
                </label>
                <Link href="/forgot-password" className="text-xs transition-colors"
                  style={{ color: 'rgba(255,176,32,0.7)', fontFamily: 'var(--font-inter)' }}>
                  Oublié ?
                </Link>
              </div>
              <input
                id="password" type="password" required value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${CARD_BORDER}`, color: '#f9fafb', fontFamily: 'var(--font-inter)', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
              />
            </div>

            {/* Rester connecté */}
            <button
              type="button"
              onClick={() => setRememberMe(v => !v)}
              className="flex items-center gap-2.5 mt-1 group w-fit"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div
                className="flex items-center justify-center rounded transition-all"
                style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${rememberMe ? AMBER : 'rgba(255,255,255,0.2)'}`,
                  backgroundColor: rememberMe ? AMBER : 'transparent',
                }}
              >
                {rememberMe && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 3.5L3.8 6.5L9 1" stroke="#0E0E10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-inter)', userSelect: 'none' }}>
                Rester connecté
              </span>
            </button>

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mt-2 disabled:opacity-50"
              style={{ backgroundColor: AMBER, color: '#0E0E10', fontFamily: 'var(--font-inter)' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#e09800'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = AMBER; }}
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-inter)' }}>
          Pas encore de compte ?{' '}
          <Link href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'}
            className="font-medium" style={{ color: AMBER }}>
            S&apos;inscrire
          </Link>
        </p>
        <p className="text-center mt-2 text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-inter)' }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.35)' }}>← Retour à l&apos;accueil</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0E0E10' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#FFB020' }} />
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
