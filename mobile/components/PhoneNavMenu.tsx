import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet } from '../hooks/useIsTablet';
import { useAppRole } from '../contexts/AppRoleContext';
import { useNotifications } from '../contexts/NotificationContext';
import { supabase } from '../lib/supabase';

type NavItem = {
  name: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { name: 'Accueil', path: '/(tabs)', icon: 'home-outline' },
  { name: 'Calendrier', path: '/(tabs)/calendar', icon: 'calendar-outline' },
  { name: 'Effectif', path: '/(tabs)/squad', icon: 'people-outline' },
  { name: 'Équipes', path: '/(tabs)/teams', icon: 'flag-outline' },
  { name: 'Dashboard', path: '/(tabs)/dashboard', icon: 'grid-outline' },
  { name: 'Tracker', path: '/(tabs)/tracker', icon: 'stats-chart-outline' },
  { name: 'Analytics', path: '/(tabs)/analytics', icon: 'pie-chart-outline' },
  { name: 'Partages', path: '/(tabs)/share', icon: 'share-social-outline' },
  { name: 'Paramètres', path: '/(tabs)/settings', icon: 'settings-outline' },
];

function isActive(segments: string[], item: NavItem): boolean {
  const first = segments[1];
  if (item.path === '/(tabs)') return first === undefined || first === 'index';
  if (item.path === '/(tabs)/calendar') return first === 'calendar';
  if (item.path === '/(tabs)/squad') return first === 'squad';
  if (item.path === '/(tabs)/dashboard') return first === 'dashboard';
  if (item.path === '/(tabs)/tracker') return first === 'tracker';
  if (item.path === '/(tabs)/analytics') return first === 'analytics';
  if (item.path === '/(tabs)/share') return first === 'share';
  if (item.path === '/(tabs)/teams') return first === 'teams';
  if (item.path === '/(tabs)/settings') return first === 'settings';
  return false;
}

export function PhoneNavMenu() {
  const router = useRouter();
  const segments = useSegments();
  const isTablet = useIsTablet();
  const { isPlayer, setAppRole } = useAppRole();
  const { counts, markRead } = useNotifications();
  const [visible, setVisible] = useState(false);

  if (isTablet) return null;

  const close = () => setVisible(false);

  const navigate = (path: string) => {
    close();
    if (path === '/(tabs)/calendar') void markRead(['absence_report']);
    if (path === '/(tabs)/squad')    void markRead(['feedback_comment']);
    router.push(path as any);
  };

  const calendarBadge = counts.absence_report;
  const squadBadge    = counts.feedback_comment;

  const handleSwitchToPlayer = async () => {
    close();
    await setAppRole('player');
    router.replace('/(player-tabs)');
  };

  const handleSignOut = async () => {
    close();
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={styles.trigger}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="menu" size={26} color="#fff" />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>FutsalHub</Text>
              <TouchableOpacity onPress={close} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.navList}>
              {NAV_ITEMS.map((item) => {
                const active = isActive((segments ?? []) as string[], item);
                const badge = item.path === '/(tabs)/calendar' ? calendarBadge
                            : item.path === '/(tabs)/squad'    ? squadBadge
                            : 0;
                return (
                  <TouchableOpacity
                    key={item.path}
                    style={[styles.navItem, active && styles.navItemActive]}
                    onPress={() => navigate(item.path)}
                    activeOpacity={0.7}
                  >
                    <View style={{ position: 'relative' }}>
                      <Ionicons
                        name={item.icon}
                        size={22}
                        color={active ? '#3b82f6' : '#64748b'}
                      />
                      {badge > 0 && (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.drawerFooter}>
              {isPlayer && (
                <TouchableOpacity style={styles.footerBtn} onPress={handleSwitchToPlayer}>
                  <Ionicons name="person-outline" size={20} color="#475569" />
                  <Text style={styles.footerBtnText}>Espace joueur</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.footerBtn} onPress={() => navigate('/(tabs)/choose-team')}>
                <Ionicons name="swap-horizontal-outline" size={20} color="#475569" />
                <Text style={styles.footerBtnText}>Changer d'équipe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color="#475569" />
                <Text style={styles.footerBtnText}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 8,
    paddingRight: 12,
    paddingLeft: 4,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
  },
  drawer: {
    backgroundColor: '#fff',
    width: '80%',
    maxWidth: 320,
    height: '100%',
    paddingTop: 48,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  closeBtn: { padding: 8 },
  navList: {
    flex: 1,
    paddingTop: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  navItemActive: {
    backgroundColor: '#eff6ff',
  },
  navLabel: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#3b82f6',
  },
  drawerFooter: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    gap: 4,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 10,
  },
  footerBtnText: {
    fontSize: 15,
    color: '#475569',
  },
});
