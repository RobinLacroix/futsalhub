/**
 * Connexion
 *
 * C'est le seul écran qu'un coach extérieur voit avant de décider si le produit
 * est sérieux. Il portait 24 couleurs en dur, aucun libellé de champ, et
 * affichait les erreurs de Supabase en anglais.
 *
 * ## Corrections de fond, au-delà des couleurs
 *
 * **« Rester connecté » mentait.** La case ne mémorisait que l'**email**, jamais
 * la session : Supabase persiste celle-ci de toute façon, et la décocher ne
 * déconnectait donc rien. Un utilisateur qui la décochait sur un appareil
 * partagé croyait se protéger. Le libellé dit maintenant ce que la case fait
 * réellement — « Mémoriser mon email ».
 *
 * **Les erreurs étaient en anglais.** « Invalid login credentials » sur la porte
 * d'entrée d'une application française. Traduites dans `lib/authErrors.ts`, avec
 * la conduite à tenir : « Email not confirmed » devient une phrase qui dit
 * d'aller voir ses spams.
 *
 * **Aucun champ n'avait de libellé**, seulement un placeholder — qui disparaît
 * à la première frappe et n'est annoncé par aucun lecteur d'écran.
 *
 * **Le mot de passe ne pouvait pas être relu.** Pas de bouton œil : la seule
 * façon de vérifier une saisie était de tout effacer.
 *
 * **Le lien « Design system (dev) » avait exactement le style du lien « Créer un
 * compte ».** Il est neutralisé visuellement — il reste sous `__DEV__`, donc
 * absent de tout build de production, mais il n'avait rien à faire au même
 * niveau qu'une action réelle.
 *
 * **Le rappel « mêmes identifiants que sur le site » était à 2,5:1** de
 * contraste, donc illisible, alors que c'est une information utile à quelqu'un
 * qui vient du web.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { useAppRole } from '../contexts/AppRoleContext';
import { useTheme, makeStyles } from '../contexts/ThemeContext';
import { HIT_SLOP_MIN } from '../lib/design/tokens';
import { haptics } from '../lib/design/haptics';
import { Text, Input, Button } from '../components/ui';
import { AuthCard, AuthError, AuthLink, PasswordInput } from '../components/auth/AuthChrome';

const REMEMBER_KEY = 'futsalhub.rememberEmail';

export default function SignInScreen() {
  const s = useStyles();
  const { theme } = useTheme();
  const router = useRouter();
  const { refetch } = useAppRole();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberEmail, setRememberEmail] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY)
      .then((value) => {
        if (value) {
          setEmail(value);
          setRememberEmail(true);
        }
      })
      .catch(() => {
        // Préférence illisible : le champ reste vide, ce n'est pas bloquant.
      });
  }, []);

  const handleSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email et mot de passe sont requis.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      if (rememberEmail) await AsyncStorage.setItem(REMEMBER_KEY, email.trim());
      else await AsyncStorage.removeItem(REMEMBER_KEY);
      haptics.success();
      await refetch();
      router.replace('/');
    } catch (e) {
      haptics.error();
      setError(authErrorMessage(e, 'Connexion impossible.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="FutsalHub" subtitle="Connecte-toi à ton espace">
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
        textContentType="username"
        editable={!loading}
        returnKeyType="next"
      />

      <PasswordInput
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        autoComplete="current-password"
        textContentType="password"
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={() => void handleSignIn()}
      />

      <View style={s.row}>
        {/* La case ne mémorise QUE l'email. Elle s'appelait « Rester
            connecté », ce qu'elle n'a jamais fait. */}
        <Pressable
          onPress={() => setRememberEmail((v) => !v)}
          disabled={loading}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberEmail }}
          accessibilityLabel="Mémoriser mon email"
          style={({ pressed }) => [s.check, pressed && s.pressed]}
        >
          <View
            style={[
              s.box,
              {
                borderColor: rememberEmail ? theme.colors.accent.default : theme.colors.border.strong,
                backgroundColor: rememberEmail ? theme.colors.accent.default : 'transparent',
              },
            ]}
          >
            {rememberEmail && (
              <Ionicons name="checkmark" size={14} color={theme.colors.text.onFill} />
            )}
          </View>
          <Text variant="callout" tone="secondary">
            Mémoriser mon email
          </Text>
        </Pressable>

        <AuthLink
          label="Mot de passe oublié ?"
          onPress={() => router.push('/forgot-password' as any)}
          disabled={loading}
        />
      </View>

      <Button
        label="Se connecter"
        onPress={handleSignIn}
        loading={loading}
        disabled={loading}
        block
      />

      <AuthLink
        label="Pas encore de compte ? En créer un"
        onPress={() => router.push('/sign-up' as any)}
        disabled={loading}
      />

      <Text variant="caption" tone="tertiary" style={s.center}>
        Les identifiants sont les mêmes que sur le site FutsalHub.
      </Text>

      {/* `__DEV__` est faux dans tout build de production : cette entrée ne peut
          pas partir en App Store. Style volontairement effacé, elle ne doit pas
          se lire comme une action du produit. */}
      {__DEV__ && (
        <AuthLink
          label="Design system (dev)"
          tone="tertiary"
          onPress={() => router.push('/design-gallery' as any)}
        />
      )}
    </AuthCard>
  );
}

const useStyles = makeStyles((t) => ({
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: HIT_SLOP_MIN,
    paddingRight: t.space.sm,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: t.radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
