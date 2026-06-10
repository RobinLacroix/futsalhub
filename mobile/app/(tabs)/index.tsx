import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Modal, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../../hooks/useIsTablet';
import { supabase } from '../../lib/supabase';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { getUserClubId } from '../../lib/services/clubs';

// ─── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    key: 'calendar',
    label: 'Calendrier',
    desc: 'Matchs & entraînements',
    icon: 'calendar' as const,
    color: '#3b82f6',
    bg: '#eff6ff',
    route: '/(tabs)/calendar',
  },
  {
    key: 'squad',
    label: 'Effectif',
    desc: 'Joueurs & statistiques',
    icon: 'people' as const,
    color: '#10b981',
    bg: '#ecfdf5',
    route: '/(tabs)/squad',
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    desc: 'Vue d\'ensemble équipe',
    icon: 'grid' as const,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    route: '/(tabs)/dashboard',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    desc: 'Analyse des performances',
    icon: 'pie-chart' as const,
    color: '#ef4444',
    bg: '#fef2f2',
    route: '/(tabs)/analytics',
  },
  {
    key: 'share',
    label: 'Partages',
    desc: 'Vidéos & ressources',
    icon: 'share-social' as const,
    color: '#06b6d4',
    bg: '#ecfeff',
    route: '/(tabs)/share',
  },
  {
    key: 'tracker',
    label: 'Tracker',
    desc: 'Enregistrer un match',
    icon: 'stats-chart' as const,
    color: '#f59e0b',
    bg: '#fffbeb',
    route: '/(tabs)/tracker',
    phoneOnly: true,
  },
] as const;

// ─── Composant ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [email, setEmail]           = useState<string | null>(null);
  const [hasNoClub, setHasNoClub]   = useState<boolean | null>(null);
  const [teamModal, setTeamModal]   = useState(false);
  const router    = useRouter();
  const isTablet  = useIsTablet();
  const { activeTeam, teams, loading: teamsLoading, setActiveTeamId, refetchTeams } = useActiveTeam();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
  }, []);

  useEffect(() => { refetchTeams(); }, [refetchTeams]);

  const checkUserClub = useCallback(async () => {
    if (!teamsLoading && teams.length === 0) {
      try { setHasNoClub((await getUserClubId()) === null); }
      catch { setHasNoClub(false); }
    } else { setHasNoClub(false); }
  }, [teamsLoading, teams.length]);

  useEffect(() => { checkUserClub(); }, [checkUserClub]);

  const handleSelectTeam = async (teamId: string) => {
    await setActiveTeamId(teamId);
    setTeamModal(false);
  };

  const handleSignOut = async () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/sign-in');
      }},
    ]);
  };

  const visibleFeatures = FEATURES.filter((f) => !('phoneOnly' in f) || !f.phoneOnly || !isTablet);
  const cols = isTablet ? 3 : 2;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

      {/* ── Hero header ── */}
      <View style={s.hero}>
        {/* Logo / Brand */}
        <View style={s.brandRow}>
          <View style={s.logoBox}>
            <Ionicons name="football" size={22} color="#fff" />
          </View>
          <View>
            <Text style={s.brandName}>FutsalHub</Text>
            <Text style={s.brandTagline}>Gestion de club intelligente</Text>
          </View>
        </View>

        {/* Équipe active */}
        {teamsLoading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
        ) : activeTeam ? (
          <TouchableOpacity
            style={s.activeTeamCard}
            onPress={() => teams.length > 1 ? setTeamModal(true) : null}
            activeOpacity={0.85}
          >
            <View style={[s.teamDot, { backgroundColor: activeTeam.color || '#60a5fa' }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.activeTeamLabel}>ÉQUIPE ACTIVE</Text>
              <Text style={s.activeTeamName}>{activeTeam.name}</Text>
              {activeTeam.category ? (
                <Text style={s.activeTeamMeta}>{activeTeam.category} · {activeTeam.level}</Text>
              ) : null}
            </View>
            {teams.length > 1 && (
              <View style={s.switchBadge}>
                <Ionicons name="swap-vertical" size={14} color="#1e3a5f" />
                <Text style={s.switchBadgeText}>Changer</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : hasNoClub ? (
          <TouchableOpacity style={s.noClubCard} onPress={() => router.push('/(tabs)/create-club')}>
            <Ionicons name="add-circle" size={20} color="#f59e0b" />
            <Text style={s.noClubText}>Créer votre club pour commencer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.noTeamCard} onPress={() => router.push('/(tabs)/teams')}>
            <Ionicons name="add-circle" size={20} color="#60a5fa" />
            <Text style={s.noTeamText}>Ajouter une première équipe</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Grille features ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Fonctionnalités</Text>
        <View style={[s.grid, { gap: isTablet ? 14 : 12 }]}>
          {visibleFeatures.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[s.featureCard, {
                width: `${(100 / cols) - (isTablet ? 2 : 2)}%` as any,
                backgroundColor: f.bg,
                borderColor: f.color + '30',
              }]}
              onPress={() => router.push(f.route as any)}
              activeOpacity={0.8}
            >
              <View style={[s.featureIconBox, { backgroundColor: f.color }]}>
                <Ionicons name={f.icon} size={isTablet ? 24 : 20} color="#fff" />
              </View>
              <Text style={[s.featureLabel, { color: '#0f172a' }]}>{f.label}</Text>
              <Text style={s.featureDesc}>{f.desc}</Text>
              <View style={[s.featureArrow, { backgroundColor: f.color + '18' }]}>
                <Ionicons name="arrow-forward" size={12} color={f.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Séction secondaire : raccourcis rapides ── */}
      {activeTeam && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Accès rapide</Text>
          <View style={s.quickRow}>
            <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(tabs)/calendar/new-match' as any)}>
              <View style={[s.quickIcon, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="add-circle" size={18} color="#3b82f6" />
              </View>
              <Text style={s.quickLabel}>Nouveau match</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(tabs)/calendar/new' as any)}>
              <View style={[s.quickIcon, { backgroundColor: '#ecfdf5' }]}>
                <Ionicons name="barbell" size={18} color="#10b981" />
              </View>
              <Text style={s.quickLabel}>Entraînement</Text>
            </TouchableOpacity>
            {!isTablet && (
              <TouchableOpacity style={s.quickBtn} onPress={() => router.push('/(tabs)/tracker/record' as any)}>
                <View style={[s.quickIcon, { backgroundColor: '#fffbeb' }]}>
                  <Ionicons name="radio-button-on" size={18} color="#f59e0b" />
                </View>
                <Text style={s.quickLabel}>Live tracker</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.quickBtn} onPress={() => teams.length > 1 ? setTeamModal(true) : router.push('/(tabs)/teams' as any)}>
              <View style={[s.quickIcon, { backgroundColor: '#f5f3ff' }]}>
                <Ionicons name="swap-horizontal" size={18} color="#8b5cf6" />
              </View>
              <Text style={s.quickLabel}>Changer équipe</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Compte ── */}
      <View style={s.section}>
        <View style={s.accountCard}>
          <View style={s.accountLeft}>
            <View style={s.accountAvatar}>
              <Ionicons name="person" size={18} color="#64748b" />
            </View>
            <View>
              <Text style={s.accountEmail} numberOfLines={1}>{email ?? '—'}</Text>
              <Text style={s.accountRole}>Coach · Admin</Text>
            </View>
          </View>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color="#ef4444" />
            <Text style={s.signOutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Modal sélection équipe ── */}
      <Modal visible={teamModal} transparent animationType="slide" onRequestClose={() => setTeamModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setTeamModal(false)}>
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Choisir une équipe</Text>
            <Text style={s.modalSub}>L'équipe active s'applique à tout le contenu</Text>
            <ScrollView>
              {teams.map((team) => {
                const isActive = team.id === activeTeam?.id;
                return (
                  <TouchableOpacity
                    key={team.id}
                    style={[s.modalTeamRow, isActive && s.modalTeamRowActive]}
                    onPress={() => handleSelectTeam(team.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.modalTeamDot, { backgroundColor: team.color || '#94a3b8' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modalTeamName, isActive && { color: '#2563eb' }]}>{team.name}</Text>
                      {team.category ? (
                        <Text style={s.modalTeamMeta}>{team.category} · {team.level}</Text>
                      ) : null}
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color="#2563eb" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={s.modalAddTeam} onPress={() => { setTeamModal(false); router.push('/(tabs)/teams' as any); }}>
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text style={s.modalAddTeamText}>Gérer les équipes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalClose} onPress={() => setTeamModal(false)}>
              <Text style={s.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { paddingBottom: 40 },

  // Hero
  hero: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 20,
  },
  brandRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox:     { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  brandName:   { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  brandTagline:{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 1 },

  activeTeamCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  teamDot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  activeTeamLabel:{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  activeTeamName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  activeTeamMeta: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  switchBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  switchBadgeText:{ fontSize: 11, fontWeight: '700', color: '#1e3a5f' },

  noClubCard:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  noClubText:  { fontSize: 14, color: '#fbbf24', fontWeight: '600' },
  noTeamCard:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(96,165,250,0.15)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)' },
  noTeamText:  { fontSize: 14, color: '#93c5fd', fontWeight: '600' },

  // Section
  section:      { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  // Grille features
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  featureCard: {
    borderRadius: 16, padding: 16, borderWidth: 1,
    gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  featureIconBox:  { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  featureLabel:    { fontSize: 14, fontWeight: '700' },
  featureDesc:     { fontSize: 11, color: '#64748b', lineHeight: 15 },
  featureArrow:    { width: 24, height: 24, borderRadius: 99, alignItems: 'center', justifyContent: 'center', marginTop: 8, alignSelf: 'flex-start' },

  // Raccourcis rapides
  quickRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn:  { alignItems: 'center', gap: 6, minWidth: 70 },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel:{ fontSize: 10, fontWeight: '600', color: '#475569', textAlign: 'center' },

  // Compte
  accountCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#e2e8f0', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  accountLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  accountEmail:  { fontSize: 13, fontWeight: '600', color: '#1e293b', maxWidth: 180 },
  accountRole:   { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  signOutBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fff5f5' },
  signOutText:   { fontSize: 12, color: '#ef4444', fontWeight: '600' },

  // Modal équipe
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, maxHeight: '75%' },
  modalHandle:  { width: 36, height: 4, backgroundColor: '#e2e8f0', borderRadius: 99, alignSelf: 'center', marginBottom: 18 },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  modalSub:     { fontSize: 12, color: '#94a3b8', marginBottom: 16 },
  modalTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  modalTeamRowActive: { },
  modalTeamDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  modalTeamName:{ fontSize: 15, fontWeight: '600', color: '#0f172a' },
  modalTeamMeta:{ fontSize: 11, color: '#94a3b8', marginTop: 2 },
  modalAddTeam: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#dbeafe', borderRadius: 10, backgroundColor: '#eff6ff' },
  modalAddTeamText: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  modalClose:   { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
});
