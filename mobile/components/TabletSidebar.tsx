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

import React from 'react';
import { View, Pressable } from 'react-native';
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
 */
const NAV_ITEMS: NavItem[] = [
  ...PRIMARY_DESTINATIONS.filter((d) => d.key !== 'more'),
  ...SECONDARY_DESTINATIONS,
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

  if (!isTablet) return null;

  const c = theme.colors;

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
          <Text variant="title">FutsalHub</Text>
        ) : (
          <View style={s.logoIcon} accessibilityLabel="FutsalHub">
            <Text variant="headline" tone="onFill">
              F
            </Text>
          </View>
        )}
      </View>

      <View style={s.nav} accessibilityRole="tablist">
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
            {footerAction('log-out-outline', 'Déconnexion', () => void handleSignOut())}
          </>
        )}
        {!isExpanded &&
          footerAction('log-out-outline', 'Déconnexion', () => void handleSignOut(), false)}

        <Pressable
          onPress={onToggle}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? 'Réduire le menu' : 'Déployer le menu'}
          accessibilityState={{ expanded: isExpanded }}
          style={({ pressed }) => [s.toggleBtn, pressed && s.pressed]}
        >
          <Ionicons
            name={isExpanded ? 'chevron-back' : 'chevron-forward'}
            size={22}
            color={c.text.secondary}
          />
        </Pressable>
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
    paddingHorizontal: t.space.xl,
    paddingBottom: t.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border.subtle,
  },
  headerCollapsed: {
    paddingHorizontal: t.space.md,
    alignItems: 'center',
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.accent.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    flex: 1,
    paddingTop: t.space.lg,
    paddingHorizontal: t.space.md,
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
  toggleBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: t.space.sm,
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
