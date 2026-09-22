/**
 * Navigation principale sur iPad
 *
 * ## Elle ne suivait pas le thème
 *
 * Défaut constaté au simulateur, pas déduit du code : en thème sombre, la
 * sidebar restait un aplat blanc `#f8fafc` collé au canvas anthracite, sur
 * **toute la hauteur de l'écran et sur tous les écrans**. C'est la navigation
 * permanente de la tablette, l'appareil du bord de terrain — et le seul
 * élément de l'app qui ne basculait pas.
 *
 * Elle portait aussi le **quatrième bleu** de l'inventaire d'audit (`#1d4ed8`
 * en état actif, `#eff6ff` en fond de sélection), là où le reste de l'app est
 * passé sur l'accent violet. L'onglet actif était donc d'une couleur de marque
 * que plus aucun autre écran n'utilisait.
 *
 * ## Elle était muette pour VoiceOver
 *
 * Aucune des destinations n'avait de rôle ni d'état : un lecteur d'écran
 * annonçait le nom sans dire que c'était un bouton, ni lequel était
 * sélectionné. **Repliée, la sidebar n'affiche que des icônes** — sans
 * `accessibilityLabel`, elle n'annonçait alors plus rien du tout, et c'est le
 * seul moyen de naviguer. La pastille de notification était un chiffre à 9 px
 * dans un rond rouge, sans équivalent textuel : le nombre de retours en attente
 * n'existait pas pour un lecteur d'écran.
 *
 * `lib/navigation.ts` reste la source unique des destinations — c'est ce qui
 * avait mis fin à la divergence entre la sidebar, la tab bar et l'écran « Plus ».
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsTablet, LAYOUT } from '../hooks/useIsTablet';
import { useAppRole } from '../contexts/AppRoleContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { SeasonHeaderButton } from './SeasonHeaderButton';
import { PRIMARY_DESTINATIONS, SECONDARY_DESTINATIONS } from '../lib/navigation';
import { supabase } from '../lib/supabase';
import { useMatchRecorderExitGuard, confirmLeaveMatchRecorder } from '../contexts/MatchRecorderExitGuardContext';
import { Text } from './ui';

export type TabletSidebarProps = {
  isExpanded: boolean;
  onToggle: () => void;
};

type NavItem = {
  name: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  /** Segment de route correspondant, pour l'état actif. */
  segment: string | null;
};

/**
 * Dérivé de la source unique `lib/navigation.ts` (P0-5). La sidebar n'entretient
 * plus sa propre liste : c'est ce qui l'avait fait diverger de la tab bar et de
 * l'accueil. « Plus » n'a pas lieu d'être sur tablette, où la place ne manque
 * pas : ses destinations sont listées directement.
 *
 * `settings` en est retiré : Robin la veut en permanence visible (pied de
 * sidebar, hors zone défilante) plutôt que noyée dans la liste — cf pied.
 */
const NAV_ITEMS: NavItem[] = [
  ...PRIMARY_DESTINATIONS.filter((d) => d.key !== 'more'),
  ...SECONDARY_DESTINATIONS.filter((d) => d.key !== 'settings'),
].map((d) => ({
  name: d.label,
  path: d.route,
  icon: d.icon,
  iconFocused: d.iconActive,
  segment: d.route === '/(tabs)' ? null : d.route.replace('/(tabs)/', ''),
}));

function isActive(segments: string[], item: NavItem): boolean {
  const first = segments[1];
  if (item.segment === null) return first === undefined || first === 'index';
  if (item.segment === 'analyse') {
    // Les anciennes routes restent atteignables : elles allument le même onglet.
    return first === 'analyse' || first === 'dashboard' || first === 'analytics' || first === 'tracker';
  }
  return first === item.segment;
}

export function TabletSidebar({ isExpanded, onToggle }: TabletSidebarProps) {
  const router = useRouter();
  const segments = useSegments();
  const isTablet = useIsTablet();
  const s = useStyles();
  const { theme } = useTheme();
  const { isPlayer, setAppRole } = useAppRole();
  const { counts, markRead } = useNotifications();
  const { isRecordingActive, setSuppressExitGuard } = useMatchRecorderExitGuard();
  // Indique qu'il reste des destinations sous la ligne de flottaison de la
  // zone défilante (aucune indication n'existait avant, cf retour de Robin :
  // rien ne montrait qu'on pouvait descendre pour voir la suite de la liste).
  const [navContentHeight, setNavContentHeight] = useState(0);
  const [navViewportHeight, setNavViewportHeight] = useState(0);
  const [navScrolledToBottom, setNavScrolledToBottom] = useState(false);

  if (!isTablet) return null;

  const c = theme.colors;
  const navOverflowing = navContentHeight > navViewportHeight + 1;
  const showScrollHint = navOverflowing && !navScrolledToBottom;

  const onNavScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setNavScrolledToBottom(contentOffset.y + layoutMeasurement.height >= contentSize.height - 4);
  };
  const onNavViewportLayout = (e: LayoutChangeEvent) => setNavViewportHeight(e.nativeEvent.layout.height);

  const handleSwitchToPlayer = async () => {
    await setAppRole('player');
    router.replace('/(player-tabs)');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  const sidebarWidth = isExpanded ? LAYOUT.SIDEBAR_WIDTH : LAYOUT.SIDEBAR_WIDTH_COLLAPSED;

  /** Action de pied de sidebar. Repliée, seule l'icône reste : le libellé
   *  d'accessibilité est donc obligatoire, pas optionnel. */
  const footerAction = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    withLabel = true,
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.footerBtn, pressed && s.pressed]}
    >
      <Ionicons name={icon} size={20} color={c.text.secondary} />
      {withLabel && (
        <Text variant="callout" tone="secondary" weight="500">
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={[s.sidebar, { width: sidebarWidth }]}>
      <View style={[s.header, !isExpanded && s.headerCollapsed]}>
        {isExpanded ? (
          <>
            <Text variant="title">FutsalHub</Text>
            {/* Bascule déplacée ici depuis le pied (retour de Robin : en pied,
                dans sa propre ligne, elle prenait trop de place sur tablette).
                Repliée, c'est le logo lui-même qui bascule (cf ci-dessous) —
                un seul geste "taper le coin haut-gauche" dans les deux sens. */}
            <Pressable
              onPress={onToggle}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Réduire le menu"
              accessibilityState={{ expanded: true }}
              style={({ pressed }) => [s.headerToggleBtn, pressed && s.pressed]}
            >
              <Ionicons name="chevron-back" size={20} color={c.text.secondary} />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={onToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Déployer le menu"
            accessibilityState={{ expanded: false }}
            style={({ pressed }) => [s.logoIcon, pressed && s.pressed]}
          >
            <Text variant="headline" tone="onFill">
              F
            </Text>
          </Pressable>
        )}
      </View>

      <View style={s.navWrap} onLayout={onNavViewportLayout}>
        <ScrollView
          contentContainerStyle={s.navContent}
          showsVerticalScrollIndicator={false}
          accessibilityRole="tablist"
          onScroll={onNavScroll}
          onContentSizeChange={(_, h) => setNavContentHeight(h)}
          scrollEventThrottle={32}
        >
        {NAV_ITEMS.map((item) => {
          const active = isActive(segments as string[], item);
          const badge = item.path === '/(tabs)/calendar' ? counts.absence_report + counts.injury
                      : item.path === '/(tabs)/squad'    ? counts.feedback_comment + counts.questionnaire_response
                      : 0;
          return (
            <Pressable
              key={item.path}
              onPress={() => {
                const go = () => {
                  if (item.path === '/(tabs)/calendar') void markRead(['absence_report', 'injury']);
                  if (item.path === '/(tabs)/squad')    void markRead(['feedback_comment', 'questionnaire_response']);
                  router.push(item.path as any);
                };
                if (isRecordingActive) {
                  confirmLeaveMatchRecorder(go, setSuppressExitGuard);
                } else {
                  go();
                }
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              // Le compte de notifications n'existait pas pour un lecteur
              // d'écran : la pastille était un chiffre dessiné, sans texte.
              accessibilityLabel={
                badge > 0 ? `${item.name}, ${badge} en attente` : item.name
              }
              style={({ pressed }) => [
                s.navItem,
                active && { backgroundColor: c.accent.subtle },
                !isExpanded && s.navItemCollapsed,
                pressed && s.pressed,
              ]}
            >
              <View style={s.iconWrap}>
                <Ionicons
                  name={active ? item.iconFocused : item.icon}
                  size={24}
                  color={active ? c.accent.default : c.text.secondary}
                />
                {badge > 0 && (
                  <View style={[s.badge, { backgroundColor: c.negative.fill }]}>
                    <Text variant="caption" tone="onFill" numeric>
                      {badge > 99 ? '99+' : badge}
                    </Text>
                  </View>
                )}
              </View>
              {isExpanded && (
                <Text
                  variant="body"
                  tone={active ? 'accent' : 'secondary'}
                  weight={active ? '600' : '500'}
                >
                  {item.name}
                </Text>
              )}
            </Pressable>
          );
        })}
        </ScrollView>
        {showScrollHint && (
          <View style={s.scrollHint} pointerEvents="none">
            <View style={[s.scrollHintPill, { backgroundColor: c.bg.elevated, borderColor: c.border.subtle }]}>
              <Ionicons name="chevron-down" size={14} color={c.text.tertiary} />
            </View>
          </View>
        )}
      </View>

      <View style={[s.footer, !isExpanded && s.footerCollapsed]}>
        {isExpanded && (
          <>
            <SeasonHeaderButton style={{ alignSelf: 'flex-start', marginBottom: 4 }} />
            {/* Un coach est souvent aussi joueur. Tant qu'aucun profil n'est
                lié, la sidebar propose la liaison — sans ça, l'écran n'était
                atteignable que depuis un compte sans aucune équipe. */}
            {isPlayer
              ? footerAction('person-outline', 'Espace joueur', () => void handleSwitchToPlayer())
              : footerAction('person-add-outline', 'Profil joueur', () =>
                  router.push('/join-club' as never)
                )}
            {footerAction('swap-horizontal-outline', "Changer d'équipe", () =>
              router.push('/(tabs)/choose-team')
            )}
          </>
        )}
        {/* Paramètres : à la demande de Robin, toujours visible (hors zone
            défilante) plutôt que noyé dans la liste des destinations
            secondaires — même traitement replié/déployé que Déconnexion. */}
        {footerAction('settings-outline', 'Paramètres', () => router.push('/(tabs)/settings'), isExpanded)}
        {footerAction('log-out-outline', 'Déconnexion', () => void handleSignOut(), isExpanded)}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pressed: { opacity: 0.7 },
  iconWrap: { position: 'relative' },

  sidebar: {
    backgroundColor: t.colors.bg.surface,
    borderRightWidth: 1,
    borderRightColor: t.colors.border.subtle,
    paddingVertical: t.space.lg,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.xl,
    paddingBottom: t.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  headerCollapsed: {
    paddingHorizontal: t.space.md,
    justifyContent: 'center',
  },
  headerToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: t.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.accent.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navWrap: {
    flex: 1,
  },
  navContent: {
    paddingTop: t.space.lg,
    paddingHorizontal: t.space.md,
    paddingBottom: t.space.md,
  },
  scrollHint: {
    position: 'absolute',
    bottom: t.space.xs,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scrollHintPill: {
    width: 26,
    height: 18,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.elevation.raised,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    marginBottom: t.space.xs,
    gap: t.space.md,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    paddingHorizontal: t.space.md,
    paddingTop: t.space.lg,
    borderTopWidth: 1,
    borderTopColor: t.colors.border.subtle,
    gap: t.space.sm,
  },
  footerCollapsed: {
    justifyContent: 'center',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.md,
    borderRadius: t.radius.sm,
    gap: 6,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
}));
