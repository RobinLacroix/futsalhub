/**
 * Feuille de suppression de compte, partagée coach (`(tabs)/plus.tsx`) et
 * joueur (`player-settings.tsx`). Conformité App Store / Play Store : un
 * compte doit pouvoir se supprimer lui-même, pas seulement se déconnecter.
 *
 * Saisie de « SUPPRIMER » plutôt qu'un simple `Alert.alert` de confirmation
 * (suffisant pour la déconnexion, réversible) : cette action est irréversible,
 * même rigueur que la zone dangereuse web (`app/webapp/settings/DeleteAccountSection.tsx`).
 */

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { deleteOwnAccount } from '../lib/services/account';
import { Sheet, Text, Input, Button } from './ui';

export interface DeleteAccountSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (deleting) return;
    setInput('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (input.trim().toUpperCase() !== 'SUPPRIMER') return;
    setDeleting(true);
    setError(null);
    const result = await deleteOwnAccount();
    if (!result.ok) {
      setDeleting(false);
      if ('clubName' in result) {
        setError(
          `Tu es le seul administrateur de "${result.clubName}". Promeus un autre membre administrateur, ou supprime le club, avant de supprimer ton compte.`
        );
      } else {
        setError('Une erreur est survenue. Réessaie.');
      }
      return;
    }
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  return (
    <Sheet visible={visible} onClose={handleClose} title="Supprimer mon compte">
      <View style={{ gap: theme.space.md }}>
        <Text variant="body" tone="secondary">
          Cette action est définitive et irréversible : ton identité de connexion et tes données
          personnelles sont effacées. Tape SUPPRIMER pour confirmer.
        </Text>
        {error ? (
          <Text variant="caption" tone="negative">
            {error}
          </Text>
        ) : null}
        <Input
          label="Confirmation"
          value={input}
          onChangeText={setInput}
          placeholder="SUPPRIMER"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!deleting}
        />
        <Button
          label={deleting ? 'Suppression...' : 'Supprimer mon compte'}
          onPress={handleDelete}
          variant="destructive"
          disabled={input.trim().toUpperCase() !== 'SUPPRIMER' || deleting}
          loading={deleting}
          block
        />
      </View>
    </Sheet>
  );
}
