/**
 * Statuts de présence — catalogue unique (P0-7)
 *
 * Avant, le statut était **un émoji, et rien d'autre** : `✅ ❌ ⏰ 🩹`, posés sur
 * une puce grise qui devenait bleue quand elle était active. Trois problèmes,
 * tous sérieux sur l'écran le plus utilisé du staff :
 *
 * 1. **Illisible à VoiceOver.** L'annonce était « coche blanche », « croix
 *    rouge », « réveil », « pansement adhésif ». Aucun rapport avec présent,
 *    absent, en retard, blessé.
 * 2. **Aucun texte de repli.** Un émoji ne suit ni la couleur du thème ni la
 *    taille de police, et son rendu change d'une version d'iOS à l'autre.
 * 3. **État sélectionné porté par la seule couleur de fond.** Sur quatre puces
 *    identiques, la sélection ne se lisait qu'au bleu. Sans distinction de
 *    forme, c'est perdu en deutéranopie comme sous forte luminosité.
 *
 * Chaque statut porte maintenant une icône, un libellé texte et un ton
 * sémantique. `injured` est en `warning` et non en `negative` : un joueur blessé
 * n'est pas une erreur de saisie, c'est une information à traiter.
 */

import type Ionicons from '@expo/vector-icons/Ionicons';
import type { PlayerStatus } from '../../types';
import type { TextTone } from '../ui/Text';

export interface AttendanceMeta {
  value: PlayerStatus;
  label: string;
  /** Forme courte pour les listes denses. */
  short: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: TextTone;
}

export const ATTENDANCE_STATUSES: readonly AttendanceMeta[] = [
  { value: 'present', label: 'Présent', short: 'Présent', icon: 'checkmark-circle', tone: 'positive' },
  { value: 'late', label: 'En retard', short: 'Retard', icon: 'time', tone: 'warning' },
  { value: 'absent', label: 'Absent', short: 'Absent', icon: 'close-circle', tone: 'negative' },
  { value: 'injured', label: 'Blessé', short: 'Blessé', icon: 'medkit', tone: 'warning' },
] as const;

export function attendanceMeta(status: PlayerStatus): AttendanceMeta {
  return ATTENDANCE_STATUSES.find((s) => s.value === status) ?? ATTENDANCE_STATUSES[0];
}
