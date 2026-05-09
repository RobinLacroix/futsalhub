'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const AMBER = '#FFB020';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';

const inputStyle = {
  backgroundColor: 'rgba(255,255,255,0.06)',
  border: `1px solid ${CARD_BORDER}`,
  color: '#f9fafb',
  fontFamily: 'var(--font-inter)',
  outline: 'none',
} as const;

function Field({ id, label, type = 'text', name, value, onChange, required = false, children }: {
  id: string; label: string; type?: string; name: string;
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  required?: boolean; children?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5"
        style={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'var(--font-inter)' }}>
        {label}
      </label>
      {children ?? (
        <input id={id} type={type} name={name} value={value} onChange={onChange} required={required}
          className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-all"
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = AMBER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
        />
      )}
    </div>
  );
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/webapp';
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', country: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!formData.firstName || !formData.lastName) { setError('Nom et prénom requis'); return; }
    if (formData.password.length < 6) { setError('Mot de passe : 6 caractères minimum'); return; }
    setIsLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: formData.email, password: formData.password });
      if (authError) throw authError;
      if (authData.user) {
        const { error: profileError } = await supabase.from('users').insert([{
          id: authData.user.id, first_name: formData.firstName, last_name: formData.lastName,
          email: formData.email, phone: formData.phone, country: formData.country, created_at: new Date().toISOString(),
        }]);
        if (profileError) throw profileError;
        setSuccess('Inscription réussie ! Redirection…');
        setTimeout(() => router.push(redirect.startsWith('/') ? redirect : `/${redirect}`), 2000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#0E0E10' }}>

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.07]"
          style={{ backgroundColor: AMBER, filter: 'blur(120px)' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: AMBER }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0E0E10', fontFamily: 'var(--font-syne)' }}>F</span>
            </div>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>FutsalHub</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#f9fafb', fontFamily: 'var(--font-syne)' }}>
            Créer votre compte
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)', fontFamily: 'var(--font-inter)' }}>
            Déjà inscrit ?{' '}
            <Link href="/signin" style={{ color: AMBER }}>Se connecter</Link>
          </p>
        </div>

        <div className="rounded-2xl p-7" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, backdropFilter: 'blur(24px)' }}>
          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', color: '#f87171', fontFamily: 'var(--font-inter)' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{ backgroundColor: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.25)', color: '#6ee7b7', fontFamily: 'var(--font-inter)' }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field id="firstName" label="Prénom" name="firstName" value={formData.firstName} onChange={handleChange} required />
              <Field id="lastName" label="Nom" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>
            <Field id="email" label="Email" type="email" name="email" value={formData.email} onChange={handleChange} required />
            <Field id="password" label="Mot de passe" type="password" name="password" value={formData.password} onChange={handleChange} required />
            <Field id="phone" label="Téléphone" type="tel" name="phone" value={formData.phone} onChange={handleChange} />
            <Field id="country" label="Pays" name="country" value={formData.country} onChange={handleChange}>
              <select id="country" name="country" value={formData.country} onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm"
                style={inputStyle}>
                <option value="">Sélectionnez un pays</option>
                <option value="FR">France</option>
                <option value="BE">Belgique</option>
                <option value="CH">Suisse</option>
                <option value="LU">Luxembourg</option>
                <option value="CA">Canada</option>
              </select>
            </Field>

            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mt-2 disabled:opacity-50"
              style={{ backgroundColor: AMBER, color: '#0E0E10', fontFamily: 'var(--font-inter)' }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#e09800'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = AMBER; }}>
              {isLoading ? 'Inscription…' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-inter)' }}>
          <Link href="/" style={{ color: 'rgba(255,255,255,0.35)' }}>← Retour à l&apos;accueil</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUp() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0E0E10' }}>
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#FFB020' }} />
      </div>
    }>
      <SignUpForm />
    </Suspense>
  );
}
