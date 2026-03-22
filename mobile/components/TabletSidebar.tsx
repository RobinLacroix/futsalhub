import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet, LAYOUT } from '../hooks/useIsTablet';
import { useAppRole } from '../contexts/AppRoleContext';
import { supabase } from '../lib/supabase';

export type TabletSidebarProps = {
  isExpanded: boolean;
  onToggle: () => void;
};

type NavItem = {
  name: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { name: 'Accueil', path: '/(tabs)', icon: 'home-outline', iconFocused: 'home' },
  { name: 'Calendrier', path: '/(tabs)/calendar', icon: 'calendar-outline', iconFocused: 'calendar' },
  { name: 'Équipe', path: '/(tabs)/squad', icon: 'people-outline', iconFocused: 'people' },
  { name: 'Dashboard', path: '/(tabs)/dashboard', icon: 'bar-chart-outline', iconFocused: 'bar-chart' },
  { name: 'Tracker', path: '/(tabs)/tracker', icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
];

function isActive(segments: string[], item: NavItem): boolean {
  const first = segments[1];
  if (item.path === '/(tabs)') return first === undefined || first === 'index';
  if (item.path === '/(tabs)/calendar') return first === 'calendar';
  if (item.path === '/(tabs)/squad') return first === 'squad';
  if (item.path === '/(tabs)/dashboard') return first === 'dashboard';
  if (item.path === '/(tabs)/tracker') return first === 'tracker';
  return false;
}

export function TabletSidebar({ isExpanded, onToggle }: TabletSidebarProps) {
  const router = useRouter();
  const segments = useSegments();
  const isTablet = useIsTablet();
  const { isPlayer, setAppRole } = useAppRole();

  if (!isTablet) return null;

  const handleSwitchToPlayer = async () => {
    await setAppRole('player');
    router.replace('/(player-tabs)');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  const sidebarWidth = isExpanded ? LAYOUT.SIDEBAR_WIDTH : LAYOUT.SIDEBAR_WIDTH_COLLAPSED;

  return (
    <View style={[styles.sidebar, { width: sidebarWidth }]}>
      <View style={[styles.header, !isExpanded && styles.headerCollapsed]}>
        {isExpanded ? (
          <Text style={styles.logo}>FutsalHub</Text>
        ) : (
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>F</Text>
          </View>
        )}
      </View>
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(segments as string[], item);
          return (
            <TouchableOpacity
              key={item.path}
              style={[
                styles.navItem,
                active && styles.navItemActive,
                !isExpanded && styles.navItemCollapsed,
              ]}
              onPress={() => router.push(item.path as any)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={active ? item.iconFocused : item.icon}
                size={24}
                color={active ? '#1d4ed8' : '#64748b'}
              />
              {isExpanded && (
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.name}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.footer, !isExpanded && styles.footerCollapsed]}>
        {isExpanded && (
          <>
            {isPlayer && (
              <TouchableOpacity onPress={handleSwitchToPlayer} style={styles.footerBtn}>
                <Text style={styles.footerBtnText}>Espace joueur</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleSignOut} style={styles.footerBtn}>
              <Ionicons name="log-out-outline" size={20} color="#475569" />
              <Text style={styles.footerBtnText}>Déconnexion</Text>
            </TouchableOpacity>
          </>
        )}
        {!isExpanded && (
          <TouchableOpacity onPress={handleSignOut} style={styles.footerBtn}>
            <Ionicons name="log-out-outline" size={22} color="#475569" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onToggle}
          style={styles.toggleBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name={isExpanded ? 'chevron-back' : 'chevron-forward'}
            size={22}
            color="#64748b"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: '#f8fafc',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#e2e8f0',
    paddingVertical: 16,
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  headerCollapsed: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  logo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  nav: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: '#eff6ff',
  },
  navLabel: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  navLabelActive: {
    color: '#1d4ed8',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  footerCollapsed: {
    justifyContent: 'center',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  footerBtnText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  toggleBtn: {
    padding: 8,
    marginTop: 8,
  },
});
