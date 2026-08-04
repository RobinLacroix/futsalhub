/**
 * Création de compte
 *
 * ## Le message le plus important du parcours était dans une alerte
 *
 * Après un `signUp()` réussi sans session, l'écran ouvrait un `Alert.alert`
 * — « Vérifiez votre boîte mail » — puis renvoyait vers la connexion. C'est la
 * seule information qui explique pourquoi le compte ne marche pas encore, et
 * elle était livrée dans une boîte qu'on referme d'un doigt, sur un écran qui
 * disparaît aussitôt derrière.
 *
 * Elle devient l'état de l'écran : le formulaire cède la place à une
 * confirmation qui reste affichée, nomme l'adresse exacte, dit de regarder les
 * spams, et propose d'aller se connecter quand c'est fait.
 *
 * ## Le reste
 *
 * **Le bouton principal était vert** (`#16a34a`) alors que celui de la
 * connexion était bleu — deux couleurs de marque à un écran d'intervalle, pour
 * la même action au même endroit. Les deux écrans partagent maintenant
 * `components/auth/AuthChrome`.
 *
 * **Les deux mots de passe n'étaient comparés qu'à la soumission.** L'écart se
 * voit maintenant sous le champ, dès la saisie.
 *
 * **Aucun champ n'avait de libellé**, et aucun mot de passe ne pouvait être
 * relu. Cinq champs à l'aveugle, dont deux à faire correspondre.
 *
 * **Les erreurs de Supabase étaient en anglais** — « User already registered »
 * était d'ailleurs déjà traduit à la main pour ce seul cas, via un test sur
 * `identities.length`. Tout passe par `lib/authErrors.ts`.
 */

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Text, Input, Button } from '../components/ui';
import { AuthCard, AuthError, AuthLink, PasswordInput } from '../components/auth/AuthChrome';

const MIN_PASSWORD = 6;

export default function SignUpScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Adresse à confirmer. Non nulle = le formulaire cède la place. */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Vérifié à la saisie, pas seulement à la soumission : deux champs masqués
  // qui doivent correspondre ne se comparent pas de tête.
  const mismatch = useMemo(
    () => confirmPassword.length > 0 && password !== confirmPassword,
    [password, confirmPassword]
  );
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  const handleSignUp = async () => {
    setError(null);
    const mail = email.trim();
    const first = firstName.trim();
    const last = lastName.trim();

    if (!first || !last) return setError('Prénom et nom sont requis.');
    if (!mail || !password) return setError('Email et mot de passe sont requis.');
    if (password.length < MIN_PASSWORD)
      return setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
    if (password !== confirmPassword) return setError('Les deux mots de passe ne correspondent pas.');

    setLoading(true);
    try {
      // Le profil public.users est créé côté serveur par le trigger
      // on_auth_user_created (migration 20260803160000) à partir de ces
      // métadonnées. Ne jamais insérer dans `users` depuis le client : la RLS
      // le refuse, et signUp() ne renvoie pas de session tant que l'email n'est
      // pas confirmé.
      const { data, error: err } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { data: { first_name: first, last_name: last } },
      });
      if (err) throw err;

      // Supabase ne lève pas d'erreur sur un email déjà pris : il renvoie un
      // utilisateur sans identité, pour ne pas révéler l'existence du compte.
      if (data?.user?.identities?.length === 0) {
        haptics.error();
        setError('Un compte existe déjà avec cet email. Connecte-toi plutôt.');
        return;
      }

      haptics.success();
      if (data?.session) router.replace('/');
      else setPendingEmail(mail);
    } catch (e) {
      haptics.error();
      setError(authErrorMessage(e, 'Création du compte impossible.'));
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) {
    return (
      <AuthCard title="Compte créé" subtitle="Il reste une étape">
        <View style={[s.notice, { backgroundColor: theme.colors.positive.subtle }]}>
          <Ionicons name="mail-unread-outline" size={22} color={theme.colors.positive.default} />
          <Text variant="callout" style={s.flex}>
            Un lien de confirmation vient d’être envoyé à{' '}
            <Text variant="callout" weight="700">
              {pendingEmail}
            </Text>
            . Ouvre-le, puis reviens te connecter.
          </Text>
        </View>

        <Text variant="callout" tone="secondary">
          Sans cette confirmation, la connexion sera refusée. Si le message n’arrive pas dans les
          minutes qui suivent, regarde tes spams.
        </Text>

        <Button
          label="Aller à la connexion"
          onPress={() => router.replace('/sign-in')}
          icon="log-in-outline"
          block
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Créer un compte" subtitle="Convocations, calendrier, questionnaires">
      <AuthError message={error} />

      <View style={s.row}>
        <Input
          label="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          editable={!loading}
          containerStyle={s.flex}
        />
        <Input
          label="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          editable={!loading}
          containerStyle={s.flex}
        />
      </View>

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="prenom@club.fr"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
      />

      <PasswordInput
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        hint={tooShort ? undefined : `${MIN_PASSWORD} caractères minimum`}
        error={tooShort ? `${MIN_PASSWORD} caractères minimum` : undefined}
      />

      <PasswordInput
        label="Confirmer le mot de passe"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="••••••••"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        error={mismatch ? 'Les deux mots de passe diffèrent.' : undefined}
        returnKeyType="go"
        onSubmitEditing={() => void handleSignUp()}
      />

      <Button
        label="Créer mon compte"
        onPress={handleSignUp}
        loading={loading}
        disabled={loading || mismatch || tooShort}
        block
      />

      <AuthLink
        label="Déjà un compte ? Se connecter"
        onPress={() => router.replace('/sign-in')}
        disabled={loading}
      />
    </AuthCard>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: t.space.md },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.md,
    padding: t.space.lg,
    borderRadius: t.radius.md,
  },
}));
