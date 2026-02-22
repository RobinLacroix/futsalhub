'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Building2, Check, X } from 'lucide-react';

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'need_login'>('loading');
  const [message, setMessage] = useState('');
  const [clubName, setClubName] = useState('');

  useEffect(() => {
    const acceptInvitation = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('need_login');
        return;
      }
      try {
        const { data: clubId, error } = await supabase.rpc('accept_club_invitation', {
          p_token: token,
          p_user_id: user.id
        });
        if (error) {
          setStatus('error');
          setMessage(error.message);
          return;
        }
        const { data: club } = await supabase.from('clubs').select('name').eq('id', clubId).single();
        setClubName(club?.name || 'le club');
        setStatus('success');
      } catch {
        setStatus('error');
        setMessage('Une erreur est survenue.');
      }
    };
    acceptInvitation();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Traitement de l&apos;invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'need_login') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Building2 className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion requise</h1>
          <p className="text-gray-600 mb-6">
            Connectez-vous ou créez un compte pour rejoindre ce club.
          </p>
          <Link
            href={`/signin?redirect=${encodeURIComponent(`/invite/${token}`)}`}
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-3 w-full"
          >
            Se connecter
          </Link>
          <Link
            href={`/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`}
            className="inline-block px-6 py-3 border-2 border-gray-400 text-gray-800 rounded-lg hover:bg-gray-50 w-full"
          >
            Créer un compte
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation invalide</h1>
          <p className="text-gray-600 mb-6">{message || 'Cette invitation a expiré ou n\'est plus valide.'}</p>
          <Link
            href="/webapp"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        <Check className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Bienvenue !</h1>
        <p className="text-gray-600 mb-6">
          Vous avez rejoint <strong>{clubName}</strong>.
        </p>
        <button
          onClick={() => router.push('/webapp')}
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Accéder à l&apos;application
        </button>
      </div>
    </div>
  );
}
