/** Routes & context helpers shared by cards, rows, menus. Pure presentation helpers (no business rules). */
import type { Card, ContextType, EntityType } from '@contracts';

export function hrefOf(type: EntityType | 'collection', id: string): string {
  switch (type) {
    case 'playlist': return `/playlist/${id}`;
    case 'album': return `/album/${id}`;
    case 'artist': return `/artist/${id}`;
    case 'track': return `/track/${id}`;
    case 'show': return `/show/${id}`;
    case 'episode': return `/episode/${id}`;
    case 'user': return `/user/${id}`;
    case 'category': return `/genre/${id}`;
    case 'collection': return id === 'episodes' ? '/collection/episodes' : id === 'uploads' ? '/collection/uploads' : '/collection/tracks';
  }
}

/** What pressing play on a card starts. */
export function contextOf(card: Pick<Card, 'type' | 'id'>): { type: ContextType; id: string | null } | null {
  switch (card.type) {
    case 'playlist':
    case 'album':
    case 'artist':
    case 'show':
    case 'episode':
    case 'track':
      return { type: card.type, id: card.id };
    case 'collection':
      return { type: 'collection', id: card.id };
    default:
      return null;
  }
}

export const yearOf = (date: string | null | undefined) => (date ? new Date(date).getFullYear() : null);
