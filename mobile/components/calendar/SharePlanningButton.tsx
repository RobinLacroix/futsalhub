/**
 * SharePlanningButton — partage le planning des 7 prochains jours dans le fil.
 *
 * Même contrainte que AddEventButton : vit dans le headerRight du Stack sur
 * iPhone, et doit être injectable inline sur iPad où le header est masqué.
 */

import { useState } from 'react';
import { Alert, ViewStyle } from 'react-native';
import { useActiveTeam } from '../../contexts/ActiveTeamContext';
import { haptics } from '../../lib/design/haptics';
import { shareWeeklyPlanningToFeed } from '../../lib/services/teamFeed';
import { IconButton, Button } from '../ui';

export interface SharePlanningButtonProps {
  variant?: 'icon' | 'labelled';
  style?: ViewStyle;
}

export function SharePlanningButton({ variant = 'icon', style }: SharePlanningButtonProps) {
  const { activeTeamId } = useActiveTeam();
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!activeTeamId) return;
    setSharing(true);
    const r = await shareWeeklyPlanningToFeed(activeTeamId);
    setSharing(false);
    if (r.success) {
      haptics.success();
      Alert.alert('Partagé', "Le planning de la semaine est visible dans le fil d'équipe.");
    } else {
      haptics.error();
      const msg = r.error === 'no_events' ? 'Aucun événement dans les 7 prochains jours.' : (r.error ?? 'Impossible de partager');
      Alert.alert('Erreur', msg);
    }
  };

  if (!activeTeamId) return null;

  return variant === 'labelled' ? (
    <Button
      label="Partager le planning"
      icon="megaphone-outline"
      size="sm"
      variant="secondary"
      loading={sharing}
      onPress={share}
      style={style}
    />
  ) : (
    <IconButton
      icon="megaphone-outline"
      label="Partager le planning de la semaine"
      onPress={share}
      disabled={sharing}
      style={style}
    />
  );
}
