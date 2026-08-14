/**
 * Carte d'un événement du calendrier joueur — séance ou match (P1-7)
 *
 * ## L'identité de l'espace joueur
 *
 * L'espace joueur était vert (`#16a34a`) et l'espace coach bleu : une
 * distinction utile, mal implémentée — quatre couleurs en dur dans un objet
 * `C` répété à l'identique dans trois fichiers, dont un `navy: '#1a2744'` déjà
 * présent dans `components/players/fmPalette.ts`.
 *
 * La distinction est conservée, l'implémentation change : l'espace joueur
 * prend `positive` (le teal de la rampe), l'espace coach garde `accent`. Deux
 * teintes déjà validées à 4,5:1 dans les deux thèmes, au lieu d'un cinquième
 * système de couleurs. Le vert d'origine (`#16a34a`) était par ailleurs à
 * 3,30:1 — un des trois contrastes nommés par l'audit.
 *
 * ## Séance ou match
 *
 * La nature de l'événement se lisait par une bande latérale colorée et un
 * badge. La bande reste, mais elle n'est plus le seul signal : le badge porte
 * une icône et un mot. « Autre équipe » était un suffixe dans le badge, il
 * devient une mention distincte — un joueur convoqué avec une autre équipe
 * doit le voir sans lire la ligne en entier.
 */

import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme, makeStyles } from '../../contexts/ThemeContext';
import { Text, Badge } from '../ui';

export type PlayerEventKind = 'training' | 'match';

export interface PlayerEventCardProps {
  kind: PlayerEventKind;
  title?: string | null;
  /** Date ISO. Une date illisible n'empêche pas la carte de s'afficher. */
  date: string | null;
  competition?: string | null;
  opponent?: string | null;
  teamName?: string | null;
  location?: string | null;
  /** Convocation avec une équipe autre que la sienne. */
  otherTeam?: boolean;
  children?: React.ReactNode;
}

export function PlayerEventCard({
  kind,
  title,
  date,
  competition,
  opponent,
  teamName,
  location,
  otherTeam,
  children,
}: PlayerEventCardProps) {
  const s = useStyles();
  const { theme } = useTheme();
  const c = theme.colors;

  const isMatch = kind === 'match';
  const accent = otherTeam ? c.neutralData : isMatch ? c.accent.default : c.positive.default;

  let parsed: Date | null = null;
  try {
    parsed = date ? parseISO(date) : null;
  } catch {
    parsed = null;
  }

  const meta = [
    parsed && { icon: 'calendar-outline' as const, text: format(parsed, 'EEEE d MMMM', { locale: fr }) },
    parsed && { icon: 'time-outline' as const, text: format(parsed, 'HH:mm', { locale: fr }) },
    teamName && { icon: 'people-outline' as const, text: teamName },
    location && { icon: 'location-outline' as const, text: location },
  ].filter(Boolean) as { icon: 'calendar-outline'; text: string }[];

  return (
    <View style={[s.card, { borderLeftColor: accent }]}>
      <View style={s.top}>
        <View style={[s.badge, { backgroundColor: isMatch ? c.accent.subtle : c.positive.subtle }]}>
          <Ionicons
            name={isMatch ? 'football' : 'fitness'}
            size={13}
            color={isMatch ? c.accent.default : c.positive.default}
          />
          <Text
            variant="caption"
            weight="700"
            color={isMatch ? c.accent.default : c.positive.default}
          >
            {isMatch ? 'Match' : 'Entraînement'}
          </Text>
        </View>
        {otherTeam && <Badge label="Autre équipe" tone="neutral" size="sm" />}
        {competition ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1} style={s.flex}>
            {competition}
          </Text>
        ) : null}
      </View>

      {title ? (
        <Text variant="headline" numberOfLines={2}>
          {title}
        </Text>
      ) : null}

      {opponent ? (
        <Text variant="callout" tone="secondary">
          contre{' '}
          <Text variant="callout" weight="700">
            {opponent}
          </Text>
        </Text>
      ) : null}

      <View style={s.meta}>
        {meta.map((m) => (
          <View key={m.text} style={s.metaItem}>
            <Ionicons name={m.icon} size={13} color={c.text.tertiary} />
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {m.text}
            </Text>
          </View>
        ))}
      </View>

      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  card: {
    gap: t.space.sm,
    padding: t.space.lg,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.bg.surface,
    borderWidth: 1,
    borderColor: t.colors.border.subtle,
    borderLeftWidth: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.sm,
    paddingVertical: 3,
    borderRadius: t.radius.sm,
  },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
}));
