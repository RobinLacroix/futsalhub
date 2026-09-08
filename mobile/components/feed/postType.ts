import type { TeamFeedPostType } from '../../types';

/** Émoji affiché devant l'auteur pour les posts système. Rien pour un post manuel. */
export const postTypeEmoji = (type: TeamFeedPostType): string | null => {
  switch (type) {
    case 'birthday': return '🎂';
    case 'convocation': return '📋';
    case 'planning': return '🗓️';
    case 'video': return '🎬';
    default: return null;
  }
};

export const linkButtonLabel = (type: TeamFeedPostType): string =>
  type === 'video' ? 'Voir la vidéo' : 'Voir';
