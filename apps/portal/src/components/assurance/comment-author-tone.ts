/**
 * Tono por persona en el hilo de comentarios: quien lee distingue de un vistazo quién escribió
 * cada uno. El tono se asigna por orden de aparición, así dos personas de un mismo hilo nunca
 * comparten color mientras haya tonos libres. El color acompaña al nombre, no lo reemplaza.
 */
export interface CommentAuthorTone {
  /** Círculo de iniciales. */
  mark: string;
  /** Borde izquierdo de la tarjeta del comentario. */
  border: string;
}

export const COMMENT_AUTHOR_TONES: readonly CommentAuthorTone[] = [
  {
    mark: 'bg-iwana-primary-100 text-iwana-primary-700 dark:bg-iwana-primary-900 dark:text-iwana-primary-100',
    border: 'border-l-iwana-primary-500 dark:border-l-iwana-primary-400',
  },
  {
    mark: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100',
    border: 'border-l-sky-500 dark:border-l-sky-400',
  },
  {
    mark: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
    border: 'border-l-amber-500 dark:border-l-amber-400',
  },
  {
    mark: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
  },
  {
    mark: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100',
    border: 'border-l-rose-500 dark:border-l-rose-400',
  },
  {
    mark: 'bg-iwana-secondary-100 text-iwana-secondary-800 dark:bg-iwana-secondary-900 dark:text-iwana-secondary-100',
    border: 'border-l-iwana-secondary-500 dark:border-l-iwana-secondary-400',
  },
];

/** Índice de tono por persona, según el orden en que aparece en el hilo. */
export function buildCommentAuthorTones(authorIds: readonly string[]): Map<string, number> {
  const tones = new Map<string, number>();
  for (const authorId of authorIds) {
    if (!tones.has(authorId)) tones.set(authorId, tones.size % COMMENT_AUTHOR_TONES.length);
  }
  return tones;
}
