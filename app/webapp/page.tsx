'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Building2, Plus } from 'lucide-react';

export default function WebApp() {
  const [hasClub, setHasClub] = useState<boolean | null>(null);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const checkClub = async () => {
      const { data } = await supabase.rpc('get_user_club_id');
      setHasClub(!!data);
    };
    checkClub();
  }, []);

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCreateError('Vous devez être connecté.');
        return;
      }
      const { data, error } = await supabase.rpc('create_user_club', {
        p_user_id: user.id,
        p_user_email: user.email ?? undefined
      });
      if (error) {
        setCreateError(error.message);
        return;
      }
      const clubId = Array.isArray(data) ? data[0] : data;
      if (!clubId) {
        setCreateError('Impossible de créer le club.');
        return;
      }
      const { error: updateError } = await supabase
        .from('clubs')
        .update({ name: newClubName, description: newClubDesc })
        .eq('id', clubId);
      if (updateError) {
        setCreateError(updateError.message);
        return;
      }
      setShowCreateClub(false);
      setNewClubName('');
      setNewClubDesc('');
      setHasClub(true);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8">
      {hasClub === false && (
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <Building2 className="h-12 w-12 text-amber-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-amber-900 mb-2">Aucun club associé</h2>
              <p className="text-amber-800 mb-4">
                Créez un club pour accéder à vos équipes et données, ou rejoignez un club via une invitation.
              </p>
              <button
                onClick={() => { setShowCreateClub(true); setCreateError(null); }}
                className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                Créer un club
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateClub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Créer un club</h3>
            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateClub} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Nom du club</label>
                <input
                  type="text"
                  value={newClubName}
                  onChange={(e) => setNewClubName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Description</label>
                <textarea
                  value={newClubDesc}
                  onChange={(e) => setNewClubDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreateClub(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h1 className="text-4xl font-bold text-center mb-8">
        Bienvenue sur FutsalHub
      </h1>
      <p className="text-xl text-center text-gray-600 mb-8">
        La plateforme digitale pour les coachs de futsal
      </p>
      <p className="text-lg text-center text-gray-600 mb-12">
        Donnez à votre équipe l&apos;avantage du digital
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Carte Manager */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manager</h2>
          <p className="text-gray-600 mb-4">
            Gérez votre équipe, votre calendrier et vos effectifs.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/manager/calendar"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le calendrier
            </a>
              <a href="/webapp/manager/squad" 
              className="block text-blue-600 hover:text-blue-700">
                → Gérer l&apos;effectif
              </a>
            <a
              href="/webapp/manager/dashboard"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le dashboard
            </a>
          </div>
        </div>

        {/* Carte Tracker */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tracker</h2>
          <p className="text-gray-600 mb-4">
            Suivez vos matchs en direct et analysez les performances.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/tracker"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir le dashboard
            </a>
            <a
              href="/webapp/tracker/matchrecorder"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Enregistrer un match
            </a>
          </div>
        </div>

        {/* Carte Scout */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scout</h2>
          <p className="text-gray-600 mb-4">
            Recrutez de nouveaux joueurs et staff.
          </p>
          <div className="space-y-2">
            <a
              href="/webapp/scout/opening"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Publier une annonce
            </a>
            <a
              href="/webapp/scout/profiles"
              className="block text-blue-600 hover:text-blue-700"
            >
              → Voir les profils
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

