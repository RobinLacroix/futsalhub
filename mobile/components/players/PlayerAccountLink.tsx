/**
 * Compte joueur — génération du code de liaison, côté coach
 *
 * ## Le trou que ça comble
 *
 * `claim_player_link_code` (le joueur saisit le code) existait sur mobile :
 * `app/join-club.tsx`. `create_player_link_code` (le coach le génère) n'existait
 * que sur le web, `app/webapp/manager/squad/[playerId]/page.tsx`. Un coach qui
 * n'utilise que l'application ne pouvait relier aucun joueur à son compte —
 * **sur iPhone comme sur iPad**, ce n'était pas un défaut de la version
 * tablette.
 *
 * Conséquence concrète : sans compte lié, un joueur ne reçoit pas ses
 * convocations, ne répond pas aux présences et ne remplit aucun questionnaire.
 * L'espace joueur entier dépend de ce code.
 *
 * ## Transmettre plutôt que copier
 *
 * Le web propose « Copier ». Sur mobile, `expo-clipboard` est un module natif :
 * l'ajouter imposerait un rebuild pour une fonction que le geste réel n'utilise
 * pas. Un coach ne colle pas ce code quelque part, il l'envoie — WhatsApp, SMS.
 * D'où `Share`, qui est dans le cœur de React Native, et qui ouvre directement
 * la feuille de partage du système avec un message rédigé.
 *
 * Le code reste sélectionnable pour le cas où le joueur est à côté et le
 * recopie.
 *
 * ## Durée de vie
 *
 * Le code expire en 24 h et **`create_player_link_code` supprime le précédent**
 * (`DELETE FROM player_link_codes WHERE player_id = ...`). En régénérer un
 * invalide donc celui déjà transmis : c'est dit avant, pas après.
 */

import { useState } from 'react';
import { View, StyleSheet, Share, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createPlayerLinkCode } from '../../lib/services/playerConvocations';
import { Text, Button } from '../ui';
import type { FMPalette } from './fmPalette';

export interface PlayerAccountLinkProps {
  playerId: string;
  /** Prénom + nom, pour le message de partage. */
  playerName: string;
  /** Vrai si `players.user_id` est renseigné. */
  linked: boolean;
  p: FMPalette;
}

export function PlayerAccountLink({ playerId, playerName, linked, p }: PlayerAccountLinkProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    setLoading(true);
    const result = await createPlayerLinkCode(playerId);
    setLoading(false);
    if (result.ok && result.code) setCode(result.code);
    else setError(result.error ?? 'Erreur');
  };

  const confirmRegenerate = () => {
    Alert.alert(
      'Générer un nouveau code ?',
      'Le code précédent sera invalidé. Si tu l’as déjà transmis, il ne fonctionnera plus.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Générer', onPress: () => void generate() },
      ],
    );
  };

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message:
          `Salut ${playerName.split(' ')[0]}, voici ton code pour relier ton compte FutsalHub : ${code}\n\n` +
          'Connecte-toi à l’application, va dans Rejoindre le club et saisis ce code. Il est valable 24 h.',
      });
    } catch {
      // L'utilisateur a fermé la feuille de partage : rien à signaler.
    }
  };

  if (linked) {
    return (
      <View style={[styles.state, { backgroundColor: p.surface2, borderColor: p.positive }]}>
        <Ionicons name="checkmark-circle" size={18} color={p.positive} />
        <Text variant="callout" color={p.positive} weight="600" style={styles.flex}>
          Compte lié
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {error && (
        <View
          style={[styles.state, { backgroundColor: p.surface2, borderColor: p.negative }]}
          accessibilityRole="alert"
        >
          <Ionicons name="alert-circle" size={16} color={p.negative} />
          <Text variant="caption" color={p.negative} style={styles.flex}>
            {error}
          </Text>
        </View>
      )}

      {code ? (
        <>
          <View style={[styles.codeBox, { backgroundColor: p.surface2, borderColor: p.border }]}>
            <Text variant="display" numeric selectable style={styles.code}>
              {code}
            </Text>
            <Text variant="caption" tone="tertiary">
              Valable 24 h
            </Text>
          </View>
          <Button label="Transmettre le code" icon="share-outline" block onPress={share} />
          <Button
            label="Générer un nouveau code"
            variant="ghost"
            block
            disabled={loading}
            onPress={confirmRegenerate}
          />
        </>
      ) : (
        <>
          <Text variant="callout" tone="secondary">
            Sans compte lié, ce joueur ne reçoit pas ses convocations et ne peut pas répondre aux
            présences.
          </Text>
          <Button
            label={loading ? 'Génération…' : 'Générer un code de liaison'}
            icon="link-outline"
            block
            disabled={loading}
            onPress={generate}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: 10 },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  codeBox: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  code: { letterSpacing: 4 },
});
