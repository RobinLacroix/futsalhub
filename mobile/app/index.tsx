/**
 * Aiguillage de démarrage — quel espace ouvrir à l'ouverture de l'app
 *
 * ## Le choix de l'utilisateur survit maintenant au redémarrage
 *
 * L'effet posé ici forçait `appRole = 'coach'` dès que le compte avait une
 * équipe :
 *
 *     if (!loading && session && isCoach && appRole !== 'coach') setAppRole('coach');
 *
 * `AppRoleContext` relit pourtant la préférence enregistrée au démarrage. Un
 * joueur-coach qui basculait vers l'espace joueur voyait donc son choix écrasé
 * à la relance suivante, systématiquement, et se retrouvait dans l'espace
 * coach. Le bouton « Espace joueur » ne servait que pour la session en cours.
 *
 * C'est le cas normal en club amateur : un senior qui entraîne les jeunes est
 * les deux à la fois, et l'espace qu'il ouvre le plus souvent n'est pas
 * forcément celui de son rôle « le plus élevé ».
 *
 * La règle devient : **la préférence enregistrée gagne**, on ne choisit à sa
 * place que la première fois (aucune préférence stockée), et on ne corrige que
 * si le rôle demandé n'est plus tenable — profil joueur délié, ou retrait de
 * toutes les équipes.
 */

import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppRole } from '../contexts/AppRoleContext';
import { useTheme } from '../contexts/ThemeContext';
import { Text } from '../components/ui';

/**
 * Démarrage direct sur la galerie du design system, pour vérifier le rendu sans
 * passer par l'authentification.
 *
 * Double garde : `__DEV__` (faux dans tout build de production) ET une variable
 * d'environnement explicite. Inerte tant qu'on ne lance pas Metro avec
 * `EXPO_PUBLIC_DEV_GALLERY=1`. À retirer à la fin de la refonte UI.
 */
const DEV_GALLERY_BOOT = __DEV__ && process.env.EXPO_PUBLIC_DEV_GALLERY === '1';

export default function Index() {
  const { session, loading, isPlayer, isCoach, appRole, setAppRole } = useAppRole();

  // `appRole === null` après chargement = aucune préférence enregistrée. C'est
  // le seul cas où on décide à la place de l'utilisateur.
  const unavailable =
    (appRole === 'coach' && !isCoach) || (appRole === 'player' && !isPlayer);

  // Compte à la fois coach et joueur, sans préférence enregistrée : on demande
  // plutôt que de deviner. `app/choose-role.tsx` existait déjà pour ça et
  // n'était atteignable depuis nulle part — l'ancien effet fixait `coach` avant
  // que la question puisse se poser.
  const mustAsk = !loading && !!session && appRole === null && isCoach && isPlayer;

  useEffect(() => {
    if (loading || !session || mustAsk) return;
    if (appRole === null) {
      void setAppRole(isCoach ? 'coach' : 'player');
      return;
    }
    // Le rôle enregistré ne correspond plus au compte (profil délié, retiré des
    // équipes) : on bascule vers celui qui reste plutôt que d'afficher un
    // espace vide.
    if (unavailable && (isCoach || isPlayer)) {
      void setAppRole(isCoach ? 'coach' : 'player');
    }
  }, [loading, session, mustAsk, appRole, isCoach, isPlayer, unavailable, setAppRole]);

  if (DEV_GALLERY_BOOT) return <Redirect href={'/design-gallery' as any} />;

  if (loading) return <Booting label="Chargement…" />;

  if (!session) return <Redirect href="/sign-in" />;

  if (mustAsk) return <Redirect href={'/choose-role' as any} />;

  if (appRole === 'player' && isPlayer) return <Redirect href="/(player-tabs)" />;
  if (appRole === 'coach' && isCoach) return <Redirect href="/(tabs)" />;

  // L'effet ci-dessus est en train de fixer le rôle : un tour de rendu.
  if (appRole === null || unavailable) {
    if (isCoach || isPlayer) return <Booting />;
  }

  // Ni équipe ni profil joueur : l'accueil coach sert d'écran d'accueil, avec
  // les trois options (créer un club, rejoindre en staff, lier un profil).
  return <Redirect href="/(tabs)" />;
}

/**
 * Cet écran est le tout premier affiché à chaque lancement. Il gardait un fond
 * `#f8fafc` en dur : un éclair blanc avant l'espace sombre, à chaque ouverture.
 */
function Booting({ label }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.centered, { backgroundColor: theme.colors.bg.canvas }]}>
      <ActivityIndicator size="large" color={theme.colors.accent.default} />
      {label ? (
        <Text variant="callout" tone="secondary" style={styles.loadingText}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12 },
});
