/**
 * Navigation — source unique des destinations (P0-5)
 *
 * L'audit a relevé trois listes de destinations maintenues à la main et déjà
 * divergentes : la grille de features de l'accueil, les `NAV_ITEMS` du drawer
 * téléphone et le `TabletSidebar`. L'accueil n'exposait ni Équipes ni
 * Paramètres, le drawer n'exposait pas les raccourcis de création.
 *
 * Tout part désormais d'ici : la tab bar iPhone, la sidebar iPad et l'écran
 * « Plus » lisent la même liste. Ajouter une section se fait à un seul endroit.
 */

import type Ionicons from '@expo/vector-icons/Ionicons';

export interface NavDestination {
  key: string;
  /** Libellé affiché. Court : il doit tenir sous une icône de tab bar. */
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Variante pleine, affichée quand l'onglet est actif (convention iOS). */
  iconActive: keyof typeof Ionicons.glyphMap;
  /** Description, utilisée par l'écran « Plus » et la sidebar étendue. */
  description?: string;
}

/**
 * Destinations principales, exposées en tab bar sur iPhone.
 *
 * Cinq au maximum : au-delà, les libellés se tronquent et les cibles tactiles
 * passent sous le seuil confortable. `Dashboard`, `Tracker` et `Analytics` ont
 * été fusionnés sous `Analyse` (voir `app/(tabs)/analyse.tsx`) : pour un
 * utilisateur, « Dashboard » et « Analytics » sont des synonymes, et les trois
 * consommaient trois places pour une seule idée, « voir mes données ».
 */
export const PRIMARY_DESTINATIONS: readonly NavDestination[] = [
  {
    key: 'home',
    label: 'Accueil',
    route: '/(tabs)',
    icon: 'home-outline',
    iconActive: 'home',
    description: 'Prochaine échéance, forme, alertes',
  },
  {
    key: 'calendar',
    label: 'Calendrier',
    route: '/(tabs)/calendar',
    icon: 'calendar-outline',
    iconActive: 'calendar',
    description: 'Matchs et entraînements',
  },
  {
    key: 'squad',
    label: 'Effectif',
    route: '/(tabs)/squad',
    icon: 'people-outline',
    iconActive: 'people',
    description: 'Joueurs, suivi individuel, santé',
  },
  {
    key: 'analyse',
    label: 'Analyse',
    route: '/(tabs)/analyse',
    icon: 'stats-chart-outline',
    iconActive: 'stats-chart',
    description: 'Équipe, joueurs, matchs',
  },
  {
    key: 'more',
    label: 'Plus',
    route: '/(tabs)/plus',
    icon: 'ellipsis-horizontal-circle-outline',
    iconActive: 'ellipsis-horizontal-circle',
    description: 'Partages, équipes, réglages',
  },
] as const;

/** Destinations secondaires, listées dans l'écran « Plus » et la sidebar iPad. */
export const SECONDARY_DESTINATIONS: readonly NavDestination[] = [
  {
    key: 'share',
    label: 'Partages',
    route: '/(tabs)/share',
    icon: 'share-social-outline',
    iconActive: 'share-social',
    description: 'Vidéos et ressources partagées aux joueurs',
  },
  {
    key: 'teams',
    label: 'Équipes',
    route: '/(tabs)/teams',
    icon: 'flag-outline',
    iconActive: 'flag',
    description: 'Équipes du club et affectation des coachs',
  },
  {
    key: 'settings',
    label: 'Paramètres',
    route: '/(tabs)/settings',
    icon: 'settings-outline',
    iconActive: 'settings',
    description: 'Club, staff, notifications, apparence',
  },
] as const;

/** Compteurs de notifications rattachés à une destination. */
export type BadgeSource = 'calendar' | 'squad';

export const BADGE_BY_DESTINATION: Record<string, BadgeSource> = {
  calendar: 'calendar',
  squad: 'squad',
};
