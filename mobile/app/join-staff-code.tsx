/**
 * Rejoindre le staff depuis un compte joueur déjà connecté.
 *
 * Distinct de `(tabs)/join-club-staff.tsx` (onboarding d'un tout nouveau
 * compte, sans rôle) : ici l'utilisateur a déjà un rôle joueur actif, donc le
 * succès doit rafraîchir `AppRoleContext` (isCoach passe à true) ET basculer
 * explicitement l'espace actif (`setAppRole('coach')`), sinon le retour à
 * `(tabs)` retomberait côté joueur — cf. le bloc « Espace coach » de
 * `player-settings.tsx`, qui fait exactement cette séquence.
 *
 * Même RPC que l'onboarding (`accept_club_invitation_by_code`) : aucune
 * garde serveur à ajouter, l'invitation est nominative par email et rien
 * n'empêche un compte déjà joueur de rejoindre aussi `club_members` (deux
 * tables indépendantes).
 */

import { useRouter } from 'expo-router';
import { acceptClubInvitationByCode } from '../lib/services/clubs';
import { useActiveTeam } from '../contexts/ActiveTeamContext';
import { useAppRole } from '../contexts/AppRoleContext';
import { CodeEntryScreen } from '../components/onboarding/CodeEntryScreen';

export default function JoinStaffCodeScreen() {
  const router = useRouter();
  const { refetchTeams } = useActiveTeam();
  const { refetch, setAppRole } = useAppRole();

  return (
    <CodeEntryScreen
      tone="staff"
      icon="shield-checkmark-outline"
      title="Rejoindre le staff"
      subtitle="Saisis le code d'invitation que l'administrateur du club t'a transmis pour accéder à l'espace coach avec ce même compte."
      fieldLabel="Code d'invitation"
      placeholder="Ex. ABC12XYZ"
      submitLabel="Rejoindre le staff"
      emptyError="Saisis le code d'invitation reçu."
      hint="Le code est valable 7 jours. Passé ce délai, demande une nouvelle invitation à l'administrateur du club."
      onSubmit={async (code) => {
        await acceptClubInvitationByCode(code);
        return { ok: true };
      }}
      onSuccess={async () => {
        await refetch();
        await refetchTeams();
        await setAppRole('coach');
        router.replace('/(tabs)');
      }}
    />
  );
}
