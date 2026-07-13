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
  Link2,
  AlertCircle,
} from 'lucide-react';
import type { ClubMemberRole } from '@/types';

const ROLE_LABELS: Record<ClubMemberRole, string> = {
  admin: 'Administrateur',
  coach: 'Entraîneur',
  viewer: 'Lecteur'
};

type WebMember = Record<string, unknown> & { email?: string };
type WebDisplayMember =
  | { kind: 'single'; member: WebMember }
  | { kind: 'coach'; userId: string; email: string; teamIds: string[]; memberIds: string[] };

/** Consolide les membres : une seule entrée par coach, regroupant toutes ses équipes. */
function consolidateMembers(members: WebMember[]): WebDisplayMember[] {
  const list: WebDisplayMember[] = [];
  const coachIndex = new Map<string, number>();
  for (const m of members) {
    if (m.role === 'coach') {
      const userId = String(m.user_id ?? '');
      const idx = coachIndex.get(userId);
      const teamId = m.team_id ? String(m.team_id) : null;
      if (idx == null) {
        list.push({
          kind: 'coach',
          userId,
          email: (m.email as string) ?? '—',
          teamIds: teamId ? [teamId] : [],
          memberIds: [String(m.id)],
        });
        coachIndex.set(userId, list.length - 1);
      } else {
        const g = list[idx] as Extract<WebDisplayMember, { kind: 'coach' }>;
        if (teamId && !g.teamIds.includes(teamId)) g.teamIds.push(teamId);
        g.memberIds.push(String(m.id));
      }
    } else {
      list.push({ kind: 'single', member: m });
    }
  }
  return list;
}

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
  const [editCoachUserId, setEditCoachUserId] = useState<string | null>(null);
  const [editCoachTeamIds, setEditCoachTeamIds] = useState<string[]>([]);
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

  const openEditCoach = (g: Extract<WebDisplayMember, { kind: 'coach' }>) => {
    setEditCoachUserId(g.userId);
    setEditCoachTeamIds(g.teamIds);
  };

  const toggleEditCoachTeam = (teamId: string) => {
    setEditCoachTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((t) => t !== teamId) : [...prev, teamId]
    );
  };

  /** Réconcilie les équipes d'un coach : une ligne club_members par équipe. */
  const handleUpdateCoachTeams = async () => {
    if (!editCoachUserId || !club || !isAdmin) return;
    const { data: existing } = await supabase
      .from('club_members')
      .select('id, team_id')
      .eq('club_id', club.id)
      .eq('user_id', editCoachUserId)
      .eq('role', 'coach');
    const rows = (existing ?? []) as { id: string; team_id: string | null }[];
    const existingTeamIds = new Set(rows.map((r) => r.team_id).filter((t): t is string => !!t));
    const target = new Set(editCoachTeamIds);
    const toDelete = rows.filter((r) => !r.team_id || !target.has(r.team_id)).map((r) => r.id);
    if (toDelete.length > 0) {
      const { error } = await supabase.from('club_members').delete().in('id', toDelete);
      if (error) { alert(error.message); return; }
    }
    const toInsert = editCoachTeamIds
      .filter((tid) => !existingTeamIds.has(tid))
      .map((tid) => ({ club_id: club.id, user_id: editCoachUserId, role: 'coach', team_id: tid }));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('club_members').insert(toInsert);
      if (error) { alert(error.message); return; }
    }
    setEditCoachUserId(null);
    fetchMembers();
  };

  const handleRemoveCoach = async (userId: string, email: string) => {
    if (!club || !isAdmin) return;
    if (!confirm(`Retirer ${email} du club ? Il perdra l'accès à toutes ses équipes.`)) return;
    const { error } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', club.id)
      .eq('user_id', userId)
      .eq('role', 'coach');
    if (error) { alert(error.message); return; }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
        <div className="animate-spin rounded-full h-10 w-10" style={{ border: '3px solid #E8EDF4', borderTopColor: '#1B2D4F' }} />
      </div>
    );
  }

  if (!club) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: '#FEF3C7', border: '1.5px solid #FDE68A', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <Building2 style={{ width: 40, height: 40, color: '#D97706', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#92400E', marginBottom: 8 }}>Aucun club associé</h2>
          <p style={{ color: '#B45309', fontSize: '0.875rem', marginBottom: 24 }}>Créez un club pour commencer à gérer vos équipes et vos membres.</p>
          <button
            onClick={() => { setShowCreateClub(true); setCreateError(null); }}
            className="fm-btn fm-btn-primary"
          >
            <Plus size={16} />
            Créer un club
          </button>
        </div>

        {showCreateClub && (
          <div className="fm-overlay">
            <div className="fm-modal" style={{ maxWidth: 460 }}>
              <div className="fm-modal-header">
                <div className="fm-modal-title">
                  <div className="fm-modal-title-bar" />
                  Créer un club
                </div>
                <button className="fm-modal-close" onClick={() => setShowCreateClub(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="fm-modal-body">
                {createError && (
                  <div className="fm-alert fm-alert-error" style={{ marginBottom: 20 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    {createError}
                  </div>
                )}
                <form id="create-club-form" onSubmit={handleCreateClub} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label className="fm-label">Nom du club</label>
                    <input
                      type="text"
                      value={newClubName}
                      onChange={(e) => setNewClubName(e.target.value)}
                      className="fm-input"
                      placeholder="Ex: FC Paris Futsal"
                      required
                    />
                  </div>
                  <div>
                    <label className="fm-label">Description</label>
                    <textarea
                      value={newClubDesc}
                      onChange={(e) => setNewClubDesc(e.target.value)}
                      className="fm-textarea"
                      rows={2}
                      placeholder="Brève description (optionnel)"
                    />
                  </div>
                </form>
              </div>
              <div className="fm-modal-footer">
                <button type="button" className="fm-btn fm-btn-secondary" onClick={() => setShowCreateClub(false)}>
                  Annuler
                </button>
                <button type="submit" form="create-club-form" disabled={creating} className="fm-btn fm-btn-primary">
                  {creating ? 'Création...' : 'Créer le club'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 24px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
          Paramètres du club
        </h1>
      </div>

      {/* ── Mon club ─────────────────────────────────────────────── */}
      <div className="fm-card">
        <div className="fm-card-header">
          <div className="fm-card-accent" />
          <div className="fm-card-title"><Building2 size={15} /> Mon club</div>
        </div>
        <div className="fm-card-body">
          {isAdmin ? (
            <form onSubmit={handleUpdateClub} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="fm-label">Nom du club</label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="fm-input"
                />
              </div>
              <div>
                <label className="fm-label">Description</label>
                <textarea
                  value={clubDescription}
                  onChange={(e) => setClubDescription(e.target.value)}
                  className="fm-textarea"
                  rows={2}
                />
              </div>
              <div>
                <button type="submit" className="fm-btn fm-btn-primary">Enregistrer</button>
              </div>
            </form>
          ) : (
            <div>
              <p style={{ fontWeight: 700, color: '#0F172A' }}>{club.name}</p>
              {club.description && <p style={{ color: '#6B7280', fontSize: '0.875rem', marginTop: 4 }}>{club.description}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Lier compte joueur ───────────────────────────────────── */}
      <div className="fm-card">
        <div className="fm-card-header">
          <div className="fm-card-accent" />
          <div className="fm-card-title"><Link2 size={15} /> Lier mon compte joueur</div>
        </div>
        <div className="fm-card-body">
          <p style={{ color: '#6B7280', fontSize: '0.8125rem', marginBottom: 16, lineHeight: 1.6 }}>
            Si vous êtes joueur, votre coach peut vous donner un code à saisir ici pour accéder au calendrier (présences) et aux questionnaires.
          </p>
          {linkedPlayer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
              <Check size={16} style={{ color: '#16A34A', flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem', color: '#166534' }}>
                Votre compte est lié au joueur <strong>{linkedPlayer.first_name} {linkedPlayer.last_name}</strong>. Vous avez accès à l&apos;espace Joueur dans le menu.
              </span>
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
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="fm-label">Code reçu de votre coach</label>
                <input
                  type="text"
                  value={linkCodeInput}
                  onChange={(e) => setLinkCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ex: AB12CD34"
                  className="fm-input"
                  style={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}
                  maxLength={12}
                />
              </div>
              <button
                type="submit"
                disabled={linkClaimLoading || !linkCodeInput.trim()}
                className="fm-btn fm-btn-blue"
              >
                {linkClaimLoading ? 'Vérification...' : 'Lier mon compte'}
              </button>
            </form>
          )}
          {linkClaimError && <p style={{ marginTop: 12, fontSize: '0.8125rem', color: '#DC2626' }}>{linkClaimError}</p>}
          {linkClaimSuccess && <p style={{ marginTop: 12, fontSize: '0.8125rem', color: '#16A34A' }}>Compte lié avec succès. Rechargez la page si le menu Joueur n&apos;apparaît pas.</p>}
        </div>
      </div>

      {isAdmin && (
        <>
          {/* ── Inviter un membre ───────────────────────────────── */}
          <div className="fm-card">
            <div className="fm-card-header">
              <div className="fm-card-accent" />
              <div className="fm-card-title"><UserPlus size={15} /> Inviter un membre</div>
            </div>
            <div className="fm-card-body">
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="fm-label">Email</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="fm-input"
                    placeholder="email@exemple.com"
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label className="fm-label">Rôle</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as ClubMemberRole)}
                      className="fm-select"
                    >
                      <option value="admin">Administrateur</option>
                      <option value="coach">Entraîneur</option>
                      <option value="viewer">Lecteur</option>
                    </select>
                  </div>
                  {(inviteRole === 'coach' || inviteRole === 'viewer') && (
                    <div>
                      <label className="fm-label">Équipe (optionnel)</label>
                      <select
                        value={inviteTeamId}
                        onChange={(e) => setInviteTeamId(e.target.value)}
                        className="fm-select"
                      >
                        <option value="">Toutes les équipes</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <button type="submit" className="fm-btn fm-btn-primary">
                    <Mail size={14} />
                    Envoyer l&apos;invitation
                  </button>
                </div>
              </form>
              {inviteSent && (
                <div className="fm-alert fm-alert-success" style={{ marginTop: 16, marginBottom: 0 }}>
                  <Check size={15} style={{ flexShrink: 0 }} />
                  Invitation envoyée avec succès.
                </div>
              )}
            </div>
          </div>

          {/* ── Invitations en attente ──────────────────────────── */}
          {invitations.length > 0 && (
            <div className="fm-card">
              <div className="fm-card-header">
                <div className="fm-card-accent" style={{ background: '#D97706' }} />
                <div className="fm-card-title">Invitations en attente</div>
              </div>
              <div className="fm-card-body" style={{ padding: 0 }}>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {invitations.map((inv, i) => (
                    <li
                      key={inv.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 20px',
                        borderBottom: i < invitations.length - 1 ? '1px solid #EEF0F5' : 'none',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{inv.email}</span>
                        <span style={{ fontSize: '0.8125rem', color: '#6B7280', marginLeft: 8 }}>— {ROLE_LABELS[inv.role as ClubMemberRole]}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => copyInviteLink(inv.token)}
                          className="fm-btn fm-btn-ghost fm-btn-sm"
                          title="Copier le lien"
                        >
                          {copiedToken === inv.token ? <Check size={14} style={{ color: '#16A34A' }} /> : <Copy size={14} />}
                        </button>
                        <button onClick={() => cancelInvitation(inv.id)} className="fm-btn fm-btn-ghost fm-btn-sm" style={{ color: '#DC2626' }}>
                          <X size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── Membres ─────────────────────────────────────────── */}
          <div className="fm-card">
            <div className="fm-card-header">
              <div className="fm-card-accent" />
              <div className="fm-card-title"><Users size={15} /> Membres</div>
            </div>
            <div className="fm-card-body" style={{ padding: 0 }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {(() => {
                  const display = consolidateMembers(members);
                  return display.map((entry, i) => {
                    const isLast = i === display.length - 1;
                    const liStyle = {
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px',
                      borderBottom: !isLast ? '1px solid #EEF0F5' : 'none',
                    } as const;

                    if (entry.kind === 'coach') {
                      const teamNames = entry.teamIds.length > 0
                        ? entry.teamIds.map((id) => teams.find((t) => t.id === id)?.name ?? '?').join(', ')
                        : 'Aucune équipe';
                      const editing = editCoachUserId === entry.userId;
                      return (
                        <li key={`coach-${entry.userId}`} style={liStyle}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{entry.email}</span>
                            <span style={{ fontSize: '0.8125rem', color: '#6B7280', marginLeft: 8 }}>— {ROLE_LABELS.coach}</span>
                            {!editing && (
                              <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>{teamNames}</div>
                            )}
                          </div>
                          {editing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '70%' }}>
                              {teams.map((t) => {
                                const sel = editCoachTeamIds.includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => toggleEditCoachTeam(t.id)}
                                    className={`fm-btn fm-btn-sm ${sel ? 'fm-btn-blue' : 'fm-btn-ghost'}`}
                                    style={{ fontSize: '0.75rem' }}
                                  >
                                    {sel ? '✓ ' : ''}{t.name}
                                  </button>
                                );
                              })}
                              <button onClick={handleUpdateCoachTeams} className="fm-btn fm-btn-blue fm-btn-sm">OK</button>
                              <button onClick={() => setEditCoachUserId(null)} className="fm-btn fm-btn-ghost fm-btn-sm">Annuler</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => openEditCoach(entry)}
                                className="fm-btn fm-btn-ghost fm-btn-sm"
                                title="Modifier les équipes"
                              >
                                <Shield size={14} />
                              </button>
                              {members.length > 1 && (
                                <button
                                  onClick={() => handleRemoveCoach(entry.userId, entry.email)}
                                  className="fm-btn fm-btn-ghost fm-btn-sm"
                                  style={{ color: '#DC2626' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    }

                    const m = entry.member;
                    return (
                      <li key={m.id as string} style={liStyle}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{m.email as string || '—'}</span>
                          <span style={{ fontSize: '0.8125rem', color: '#6B7280', marginLeft: 8 }}>— {ROLE_LABELS[(m.role as ClubMemberRole) || 'viewer']}</span>
                        </div>
                        {editMemberId === m.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <select
                              value={editMemberRole}
                              onChange={(e) => setEditMemberRole(e.target.value as ClubMemberRole)}
                              className="fm-select"
                              style={{ width: 140, padding: '5px 28px 5px 10px', fontSize: '0.8125rem' }}
                            >
                              <option value="admin">Administrateur</option>
                              <option value="coach">Entraîneur</option>
                              <option value="viewer">Lecteur</option>
                            </select>
                            <select
                              value={editMemberTeamId}
                              onChange={(e) => setEditMemberTeamId(e.target.value)}
                              className="fm-select"
                              style={{ width: 120, padding: '5px 28px 5px 10px', fontSize: '0.8125rem' }}
                            >
                              <option value="">Toutes</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button onClick={handleUpdateMember} className="fm-btn fm-btn-blue fm-btn-sm">OK</button>
                            <button onClick={() => setEditMemberId(null)} className="fm-btn fm-btn-ghost fm-btn-sm">Annuler</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => {
                                setEditMemberId(m.id as string);
                                setEditMemberRole((m.role as ClubMemberRole) || 'viewer');
                                setEditMemberTeamId((m.team_id as string) || '');
                              }}
                              className="fm-btn fm-btn-ghost fm-btn-sm"
                              title="Modifier le rôle"
                            >
                              <Shield size={14} />
                            </button>
                            {members.length > 1 && (
                              <button
                                onClick={() => setDeleteConfirm(m.id as string)}
                                className="fm-btn fm-btn-ghost fm-btn-sm"
                                style={{ color: '#DC2626' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  });
                })()}
              </ul>
            </div>
          </div>

          {/* ── Zone dangereuse ──────────────────────────────────── */}
          <div className="fm-card" style={{ borderColor: '#FECACA' }}>
            <div className="fm-card-header" style={{ background: '#FEF2F2' }}>
              <div className="fm-card-accent fm-card-accent-red" />
              <div className="fm-card-title" style={{ color: '#DC2626' }}>Zone dangereuse</div>
            </div>
            <div className="fm-card-body">
              <p style={{ color: '#6B7280', fontSize: '0.8125rem', marginBottom: 16 }}>
                La suppression du club est définitive et irréversible. Tapez <strong>SUPPRIMER</strong> pour confirmer.
              </p>
              {deleteConfirm === 'show' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder="SUPPRIMER"
                    className="fm-input"
                    style={{ maxWidth: 200, fontFamily: 'monospace', letterSpacing: '0.08em' }}
                  />
                  <button
                    onClick={handleDeleteClub}
                    disabled={deleteInput !== 'SUPPRIMER'}
                    className="fm-btn fm-btn-danger"
                  >
                    Confirmer la suppression
                  </button>
                  <button onClick={() => { setDeleteConfirm(null); setDeleteInput(''); }} className="fm-btn fm-btn-ghost">
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm('show')}
                  className="fm-btn fm-btn-outline-danger"
                >
                  Supprimer le club
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal confirmation suppression membre ───────────────── */}
      {deleteConfirm && deleteConfirm !== 'SUPPRIMER' && deleteConfirm !== 'input' && deleteConfirm !== 'show' && (
        <div className="fm-overlay">
          <div className="fm-modal" style={{ maxWidth: 400 }}>
            <div className="fm-modal-header">
              <div className="fm-modal-title">
                <div className="fm-modal-title-bar" style={{ background: '#DC2626' }} />
                Retirer ce membre ?
              </div>
              <button className="fm-modal-close" onClick={() => { setDeleteConfirm(null); setRemoveError(null); }}>
                <X size={16} />
              </button>
            </div>
            <div className="fm-modal-body">
              <p style={{ color: '#374151', fontSize: '0.875rem' }}>Cette action retirera le membre du club. Il perdra l&apos;accès à toutes les données.</p>
              {removeError && (
                <div className="fm-alert fm-alert-error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {removeError}
                </div>
              )}
            </div>
            <div className="fm-modal-footer">
              <button type="button" className="fm-btn fm-btn-secondary" onClick={() => { setDeleteConfirm(null); setRemoveError(null); }}>
                Annuler
              </button>
              <button type="button" className="fm-btn fm-btn-danger" onClick={() => handleRemoveMember(deleteConfirm)}>
                Retirer le membre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
