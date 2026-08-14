/**
 * Rejoindre un club en tant que membre du staff
 *
 * Deuxième porte d'entrée d'un coach extérieur dans FutsalHub, après la
 * création de compte : celle de l'adjoint que l'administrateur a invité.
 *
 * Tout le chrome vit dans `CodeEntryScreen`, partagé avec `app/join-club.tsx`
 * (liaison d'un profil joueur). Les deux écrans faisaient le même travail et
 * avaient divergé — le détail des écarts est documenté dans la primitive.
 *
 * Corrections propres à cet écran, au-delà du remapping :
 *
 * - **Le succès était une `Alert.alert` à valider** avant d'arriver dans
 *   l'app. Rejoindre un club est une action dont le résultat se constate
 *   (l'équipe apparaît) : la boîte de dialogue ajoutait un tap sans rien
 *   apprendre. Elle disparaît, la navigation suit directement.
 * - **Une trentaine de caractères accentués manquaient** dans les libellés
 *   (« recu », « succes », « expire »), comme sur l'écran Paramètres avant sa
 *   migration.
 * - Les 7 jours de validité annoncés sont exacts : `club_invitations.expires_at`
 *   vaut `NOW() + INTERVAL '7 days'` (migration `20250118000007`), et
 *   `accept_club_invitation_by_code` refuse au-delà.
 */

import { useRouter } from 'expo-router';
import { acceptClubInvitationByCode } from '../../lib/services/clubs';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { CodeEntryScreen } from '../../components/onboarding/CodeEntryScreen';

export default function JoinClubStaffScreen() {
  const router = useRouter();
  const { refetchTeams } = useActiveTeam();

  return (
    <CodeEntryScreen
      tone="staff"
      icon="enter-outline"
      title="Rejoindre un club"
      subtitle="Saisissez le code d'invitation que l'administrateur du club vous a transmis."
      fieldLabel="Code d'invitation"
      placeholder="Ex. ABC12XYZ"
      submitLabel="Rejoindre le club"
      emptyError="Saisissez le code d'invitation reçu."
      hint="Le code est valable 7 jours. Passé ce délai, demandez une nouvelle invitation à l'administrateur de votre club."
      // Le groupe `(tabs)` fournit déjà la marge haute : header natif sur
      // iPhone, bandeau de la disposition tablette sur iPad.
      edgeTop={false}
      onSubmit={async (code) => {
        await acceptClubInvitationByCode(code);
        return { ok: true };
      }}
      onSuccess={async () => {
        await refetchTeams();
        router.replace('/(tabs)');
      }}
    />
  );
}
