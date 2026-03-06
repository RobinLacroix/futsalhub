'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserClub } from '../hooks/useUserClub';
import { usePlayerProfile } from '../hooks/usePlayerProfile';
import { claimPlayerLinkCode } from '@/lib/services/playerConvocationsService';
import {
  Building2,
  Plus,
  Trash2,
  Users,
  Mail,
  Shield,
  UserPlus,
  Copy,
  Check,
  X,
  Link2
} from 'lucide-react';
import type { ClubMemberRole } from '@/types';

const ROLE_LABELS: Record<ClubMemberRole, string> = {
  admin: 'Administrateur',
  coach: 'Entraîneur',
  viewer: 'Lecteur'
};

export default function SettingsPage() {
  const { club, loading, error, refetch } = useUserClub();
  const [members, setMembers] = useState<(Record<string, unknown> & { email?: string })[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; category: string; level: string; color: string }[]>([]);
  const [invitations, setInvitations] = useState<{ id: string; email: string; role: string; team_id: string | null; token: string; expires_at: string; status: string }[]>([]);
  const [clubName, setClubName] = useState('');
  const [clubDescription, setClubDescription] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ClubMemberRole>('viewer');
  const [inviteTeamId, setInviteTeamId] = useState<string>('');
  const [inviteSent, setInviteSent] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<ClubMemberRole>('viewer');
  const [editMemberTeamId, setEditMemberTeamId] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { player: linkedPlayer } = usePlayerProfile();
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [linkClaimLoading, setLinkClaimLoading] = useState(false);
  const [linkClaimError, setLinkClaimError] = useState<string | null>(null);
  const [linkClaimSuccess, setLinkClaimSuccess] = useState(false);

  useEffect(() => {
    if (club) {
      setClubName(club.name);
      setClubDescription(club.description || '');
      fetchMembers();
      fetchTeams();
      fetchInvitations();
      checkAdmin();
    }
  }, [club]);

  const checkAdmin = async () => {
    if (!club) return;
    const { data } = await supabase.rpc('is_club_admin', { p_club_id: club.id });
    setIsAdmin(!!data);
  };

  const fetchMembers = async () => {
    if (!club) return;
    const { data: membersData, error } = await supabase
      .from('club_members')
      .select('*')
      .eq('club_id', club.id);
    if (error) return;
    const { data: usersData } = await supabase.from('users').select('id, email');
    const usersMap = new Map((usersData || []).map((u) => [u.id, u.email]));
    const withEmails = (membersData || []).map((m) => ({
      ...m,
      email: usersMap.get(m.user_id) ?? '—'
    }));
    setMembers(withEmails);
  };

  const fetchTeams = async () => {
    if (!club) return;
    const { data } = await supabase
      .from('teams')
      .select('id, name, category, level, color')
      .eq('club_id', club.id)
      .order('name');
    setTeams(data || []);
  };

  const fetchInvitations = async () => {
    if (!club) return;
    const { data } = await supabase
      .from('club_invitations')
      .select('*')
      .eq('club_id', club.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    setInvitations(data || []);
  };

  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club || !isAdmin) return;
    await supabase.from('clubs').update({ name: clubName, description: clubDescription, updated_at: new Date().toISOString() }).eq('id', club.id);
    refetch();
  };

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
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club || !isAdmin) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('club_invitations').insert({
      club_id: club.id,
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      team_id: inviteTeamId || null,
      created_by: user.id
    });
    if (error) {
      alert(error.message);
      return;
    }
    setInviteEmail('');
    setInviteSent(true);
    fetchInvitations();
    setTimeout(() => setInviteSent(false), 3000);
  };

  const getInviteLink = (token: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/invite/${token}`;
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(getInviteLink(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleUpdateMember = async () => {
    if (!editMemberId || !club || !isAdmin) return;
    await supabase
      .from('club_members')
      .update({ role: editMemberRole, team_id: editMemberTeamId || null })
      .eq('id', editMemberId);
    setEditMemberId(null);
    fetchMembers();
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!club || !isAdmin) return;
    setRemoveError(null);
    const { error } = await supabase.from('club_members').delete().eq('id', memberId);
    if (error) {
      setRemoveError(error.message);
      return;
    }
    setDeleteConfirm(null);
    fetchMembers();
  };

  const handleDeleteClub = async () => {
    if (!club || !isAdmin || deleteInput !== 'SUPPRIMER') return;
    await supabase.from('clubs').delete().eq('id', club.id);
    setDeleteConfirm(null);
    setDeleteInput('');
    refetch();
  };

  const cancelInvitation = async (id: string) => {
    await supabase.from('club_invitations').update({ status: 'expired' }).eq('id', id);
    fetchInvitations();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <Building2 className="h-12 w-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-amber-900 mb-2">Aucun club associé</h2>
          <p className="text-amber-800 mb-6">Créez un club pour commencer à gérer vos équipes et vos membres.</p>
          <button
            onClick={() => { setShowCreateClub(true); setCreateError(null); }}
            className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >
            <Plus className="h-5 w-5 mr-2" />
            Créer un club
          </button>
        </div>

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
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Paramètres du club</h1>

      {/* Infos club */}
      <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Mon club
        </h2>
        {isAdmin ? (
          <form onSubmit={handleUpdateClub} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Nom</label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">Description</label>
              <textarea
                value={clubDescription}
                onChange={(e) => setClubDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                rows={2}
              />
            </div>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Enregistrer
            </button>
          </form>
        ) : (
          <div>
            <p className="font-medium">{club.name}</p>
            {club.description && <p className="text-gray-600 text-sm mt-1">{club.description}</p>}
          </div>
        )}
      </section>

      {/* Lier mon compte joueur */}
      <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Lier mon compte joueur
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Si vous êtes joueur, votre coach peut vous donner un code à saisir ici pour accéder au calendrier (présences) et aux questionnaires.
        </p>
        {linkedPlayer ? (
          <div className="flex items-center gap-2 text-green-700">
            <Check className="h-5 w-5 flex-shrink-0" />
            <span>Votre compte est lié au joueur <strong>{linkedPlayer.first_name} {linkedPlayer.last_name}</strong>. Vous avez accès à l&apos;espace Joueur dans le menu.</span>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setLinkClaimError(null);
              setLinkClaimSuccess(false);
              setLinkClaimLoading(true);
              const result = await claimPlayerLinkCode(linkCodeInput.trim());
              setLinkClaimLoading(false);
              if (result.ok) {
                setLinkClaimSuccess(true);
                setLinkCodeInput('');
                setTimeout(() => window.location.reload(), 800);
              } else {
                const msg = result.error === 'code_not_found' ? 'Code invalide.' : result.error === 'code_expired' ? 'Ce code a expiré.' : result.error === 'already_linked_other' ? 'Votre compte est déjà lié à un autre joueur.' : result.error || 'Erreur';
                setLinkClaimError(msg);
              }
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-800 mb-1">Code reçu de votre coach</label>
              <input
                type="text"
                value={linkCodeInput}
                onChange={(e) => setLinkCodeInput(e.target.value.toUpperCase())}
                placeholder="Ex: AB12CD34"
                className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-500 font-mono tracking-wider"
                maxLength={12}
              />
            </div>
            <button
              type="submit"
              disabled={linkClaimLoading || !linkCodeInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {linkClaimLoading ? 'Vérification...' : 'Lier mon compte'}
            </button>
          </form>
        )}
        {linkClaimError && <p className="mt-3 text-red-600 text-sm">{linkClaimError}</p>}
        {linkClaimSuccess && <p className="mt-3 text-green-600 text-sm">Compte lié avec succès. Rechargez la page si le menu Joueur n’apparaît pas.</p>}
      </section>

      {isAdmin && (
        <>
          {/* Inviter un membre */}
          <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Inviter un membre
            </h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  placeholder="email@exemple.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">Rôle</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as ClubMemberRole)}
                  className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                >
                  <option value="admin">Administrateur</option>
                  <option value="coach">Entraîneur</option>
                  <option value="viewer">Lecteur</option>
                </select>
              </div>
              {(inviteRole === 'coach' || inviteRole === 'viewer') && (
                <div>
                  <label className="block text-sm font-medium text-gray-800 mb-1">Équipe (optionnel)</label>
                  <select
                    value={inviteTeamId}
                    onChange={(e) => setInviteTeamId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                  >
                    <option value="">Toutes les équipes</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Envoyer l&apos;invitation
              </button>
            </form>
            {inviteSent && (
              <p className="mt-4 text-green-600 text-sm">Invitation envoyée.</p>
            )}
          </section>

          {/* Invitations en attente */}
          {invitations.length > 0 && (
            <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Invitations en attente</h2>
              <ul className="space-y-3">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <span className="font-medium">{inv.email}</span>
                      <span className="text-gray-600 text-sm ml-2">— {ROLE_LABELS[inv.role as ClubMemberRole]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyInviteLink(inv.token)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        title="Copier le lien"
                      >
                        {copiedToken === inv.token ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button onClick={() => cancelInvitation(inv.id)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Membres */}
          <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Membres
            </h2>
            <ul className="space-y-3">
              {members.map((m) => (
                <li key={m.id as string} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <span className="font-medium">{m.email as string || '—'}</span>
                    <span className="text-gray-600 text-sm ml-2">— {ROLE_LABELS[(m.role as ClubMemberRole) || 'viewer']}</span>
                  </div>
                  {editMemberId === m.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={editMemberRole}
                        onChange={(e) => setEditMemberRole(e.target.value as ClubMemberRole)}
                        className="px-2 py-1 border border-gray-400 rounded text-sm text-gray-900 bg-white"
                      >
                        <option value="admin">Administrateur</option>
                        <option value="coach">Entraîneur</option>
                        <option value="viewer">Lecteur</option>
                      </select>
                      <select
                        value={editMemberTeamId}
                        onChange={(e) => setEditMemberTeamId(e.target.value)}
                        className="px-2 py-1 border border-gray-400 rounded text-sm text-gray-900 bg-white"
                      >
                        <option value="">Toutes</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button onClick={handleUpdateMember} className="text-blue-600 text-sm">OK</button>
                      <button onClick={() => setEditMemberId(null)} className="text-gray-600 text-sm">Annuler</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditMemberId(m.id as string);
                          setEditMemberRole((m.role as ClubMemberRole) || 'viewer');
                          setEditMemberTeamId((m.team_id as string) || '');
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      {members.length > 1 && (
                        <button
                          onClick={() => setDeleteConfirm(m.id as string)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Supprimer le club */}
          <section className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-700 mb-4">Zone dangereuse</h2>
            <p className="text-gray-600 text-sm mb-4">La suppression du club est définitive. Tapez SUPPRIMER pour confirmer.</p>
            {deleteConfirm ? (
              <div className="flex items-center gap-4 flex-wrap">
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="SUPPRIMER"
                  className="px-3 py-2 border border-gray-400 rounded-lg text-gray-900 bg-white placeholder:text-gray-600"
                />
                <button
                  onClick={handleDeleteClub}
                  disabled={deleteInput !== 'SUPPRIMER'}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmer la suppression
                </button>
                <button onClick={() => { setDeleteConfirm(null); setDeleteInput(''); }} className="text-gray-600">
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm('show')}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                Supprimer le club
              </button>
            )}
          </section>
        </>
      )}

      {/* Modal confirmation suppression membre */}
      {deleteConfirm && deleteConfirm !== 'SUPPRIMER' && deleteConfirm !== 'input' && deleteConfirm !== 'show' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm">
            <p className="mb-4">Retirer ce membre du club ?</p>
            {removeError && (
              <p className="mb-4 text-red-600 text-sm">{removeError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setDeleteConfirm(null); setRemoveError(null); }} className="px-4 py-2 text-gray-600">
                Annuler
              </button>
              <button type="button" onClick={() => handleRemoveMember(deleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded-lg">
                Retirer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
