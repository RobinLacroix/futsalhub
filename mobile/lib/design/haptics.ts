/**
 * FutsalHub — Retour haptique (P0-2 / P0-8)
 *
 * Point d'entrée unique, pour que le vocabulaire haptique reste cohérent dans
 * toute l'app plutôt que d'être choisi au cas par cas.
 *
 * Ce n'est pas du confort : dans le match recorder, le coach regarde le terrain
 * et pas son écran. Sans retour haptique il n'a aucune confirmation que sa
 * saisie a été prise en compte, il doit détourner le regard pour vérifier et
 * rate l'action suivante.
 *
 * Toutes les fonctions sont silencieuses en cas d'échec : un appareil sans
 * moteur haptique ne doit jamais faire remonter une erreur.
 */

import * as Haptics from 'expo-haptics';

function safe(run: () => Promise<unknown>): void {
  void run().catch(() => {
    // Pas de moteur haptique, ou permission refusée : sans conséquence.
  });
}

/** Tap sur un bouton, saisie d'un événement de match. */
export function tapLight(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Action structurante : ouverture de feuille, validation d'étape. */
export function tapMedium(): void {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Changement d'onglet, de filtre, de segment. */
export function select(): void {
  safe(() => Haptics.selectionAsync());
}

/** Opération réussie. */
export function success(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Avertissement non bloquant. */
export function warning(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Échec, saisie refusée. */
export function error(): void {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export const haptics = { tapLight, tapMedium, select, success, warning, error };
