/**
 * Lier un profil joueur à son compte
 *
 * ## Ce n'est plus un écran d'onboarding
 *
 * Il n'était atteignable que depuis l'accueil d'un compte **sans aucune
 * équipe** : trois options de premiers pas, dont « Lier un profil joueur ».
 * Dès qu'un compte avait une équipe, l'écran devenait inaccessible.
 *
 * En club amateur, un coach est très souvent aussi joueur — un senior qui
 * entraîne les jeunes. Ce compte-là avait donc une équipe, et perdait
 * définitivement l'accès à son propre espace joueur : ni convocations, ni
 * questionnaire de séance, ni fiche personnelle. L'entrée vit désormais dans
 * « Plus » et dans la sidebar iPad, disponible en permanence.
 *
 * ## L'arrivée dépend de qui lie
 *
 * L'écran faisait `router.replace('/(player-tabs)')` sans condition et sans
 * enregistrer le rôle. Un coach qui liait son profil se retrouvait donc
 * propulsé dans l'espace joueur sans l'avoir demandé, avec un `appRole` resté
 * sur `coach` — incohérence que l'aiguillage de démarrage corrigeait au
 * lancement suivant en le ramenant côté coach.
 *
 * Désormais : un compte sans équipe entre dans l'espace joueur (c'est ce qu'il
 * venait chercher), un coach revient d'où il vient et bascule quand il le
 * décide.
 *
 * ## Le chrome est partagé
 *
 * Tout ce qui n'est pas propre au joueur vit dans `CodeEntryScreen`, avec son
 * jumeau côté staff (`(tabs)/join-club-staff`). Les deux avaient divergé.
 */

import { useRouter } from 'expo-router';
import { useAppRole } from '../contexts/AppRoleContext';
import { claimPlayerLinkCode } from '../lib/services/playerConvocations';
import { CodeEntryScreen } from '../components/onboarding/CodeEntryScreen';

export default function JoinClubScreen() {
  const router = useRouter();
  const { refetch, isCoach, setAppRole } = useAppRole();

  return (
    <CodeEntryScreen
      tone="player"
      icon="person-add"
      title="Lier mon profil joueur"
      subtitle={
        isCoach
          ? 'On peut être coach et joueur. Saisis le code que le coach de ton équipe t’a communiqué pour accéder aussi à ton espace joueur : convocations, questionnaires, fiche personnelle.'
          : 'Saisis le code que ton coach t’a communiqué pour accéder à ton espace joueur : convocations, questionnaires, fiche personnelle.'
      }
      fieldLabel="Code de liaison"
      placeholder="Ex. ABC12XYZ"
      submitLabel="Valider le code"
      emptyError="Saisis le code que ton coach t’a communiqué."
      hint="Le code est valable 24 h. S’il a expiré, ton coach peut en générer un nouveau depuis ta fiche."
      onSubmit={async (code) => {
        const result = await claimPlayerLinkCode(code);
        return result.ok
          ? { ok: true }
          : { ok: false, error: result.error ?? 'Impossible de lier le compte.' };
      }}
      onSuccess={async () => {
        await refetch();
        if (isCoach) {
          // Il gérait son club : on le laisse où il était. La bascule vers
          // l'espace joueur est offerte dans « Plus » et dans la sidebar.
          router.back();
        } else {
          await setAppRole('player');
          router.replace('/(player-tabs)');
        }
      }}
    />
  );
}
