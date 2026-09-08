'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

function ConfirmResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!tokenHash || type !== 'recovery') return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (err) {
      setLoading(false);
      setError('Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.');
      return;
    }
    router.push('/auth/reset-password');
  };

  if (!tokenHash || type !== 'recovery' || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <p className="text-center text-red-600 mb-6">
            {error ?? 'Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.'}
          </p>
          <Link
            href="/forgot-password"
            className="block w-full text-center py-2 px-4 text-blue-600 hover:text-blue-500 font-medium"
          >
            Demander un nouveau lien
          </Link>
          <Link
            href="/signin"
            className="block w-full text-center py-2 mt-4 text-gray-600 hover:text-gray-800"
          >
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Réinitialiser le mot de passe
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Cliquez ci-dessous pour continuer la réinitialisation de votre mot de passe.
          </p>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Vérification…' : 'Continuer'}
        </button>
      </div>
    </div>
  );
}

export default function ConfirmResetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      }
    >
      <ConfirmResetForm />
    </Suspense>
  );
}
