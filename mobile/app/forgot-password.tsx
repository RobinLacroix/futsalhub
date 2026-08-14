/**
 * Mot de passe oublié
 *
 * Troisième écran de la porte d'entrée, migré avec les deux autres : le lien
 * qui y mène venait d'être rendu correctement cliquable, il n'avait pas de sens
 * de le faire aboutir sur une carte blanche en thème sombre.
 *
 * ## Le bug de l'URL de redirection
 *
 *     const redirectTo =
 *       process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '') + '/auth/reset-password' ||
 *       'https://futsalhub.vercel.app/auth/reset-password';
 *
 * `+` lie plus fort que `||`. Sans `EXPO_PUBLIC_SITE_URL`, l'optional chaining
 * donne `undefined`, puis `undefined + '/auth/reset-password'` produit la
 * **chaîne** `"undefined/auth/reset-password"` — qui est truthy. Le `||` ne se
 * déclenchait donc jamais : le repli n'a jamais pu servir, et l'email de
 * réinitialisation partait avec une URL invalide.
 *
 * ## Le message de confirmation reste volontairement ambigu
 *
 * « Si un compte existe avec cette adresse… » : c'est délibéré, et conservé.
 * Confirmer qu'un email est inconnu permettrait d'énumérer les comptes du club.
 */

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { haptics } from '../lib/design/haptics';
import { Text, Input, Button } from '../components/ui';
import { AuthCard, AuthError, AuthLink } from '../components/auth/AuthChrome';

// Repli utilisé quand EXPO_PUBLIC_SITE_URL manque du build (le .env local l'a,
// un build EAS sans la variable ne l'aurait pas). L'ancienne valeur pointait sur
// https://futsalhub.vercel.app, qui répond 404 : le lien de réinitialisation
// aurait mené à une page morte. Le domaine servi est futsalhub-nu.
// À remplacer par le domaine personnalisé le jour où il est en place.
const FALLBACK_SITE_URL = 'https://futsalhub-nu.vercel.app';

function resetRedirectUrl(): string {
  const base = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  return `${base || FALLBACK_SITE_URL}/auth/reset-password`;
}

export default function ForgotPasswordScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const mail = email.trim();
    if (!mail) {
      setError('Saisis ton adresse email.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: resetRedirectUrl(),
      });
      if (err) throw err;
      haptics.success();
      setSent(true);
    } catch (e) {
      haptics.error();
      setError(authErrorMessage(e, "Envoi impossible."));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard title="Email envoyé" subtitle="Vérifie ta boîte de réception">
        <View style={[s.notice, { backgroundColor: theme.colors.positive.subtle }]}>
          <Ionicons name="mail-unread-outline" size={22} color={theme.colors.positive.default} />
          <Text variant="callout" style={s.flex}>
            Si un compte existe avec cette adresse, un lien de réinitialisation vient d’y être
            envoyé. Pense à regarder tes spams.
          </Text>
        </View>
        <Button
          label="Retour à la connexion"
          onPress={() => router.back()}
          icon="arrow-back-outline"
          block
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="On t’envoie un lien pour en choisir un nouveau"
    >
      <AuthError message={error} />

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
        returnKeyType="go"
        onSubmitEditing={() => void handleSubmit()}
      />

      <Button
        label="Envoyer le lien"
        onPress={handleSubmit}
        loading={loading}
        disabled={loading}
        block
      />

      <AuthLink label="Retour à la connexion" onPress={() => router.back()} disabled={loading} />
    </AuthCard>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.md,
    padding: t.space.lg,
    borderRadius: t.radius.md,
  },
}));
