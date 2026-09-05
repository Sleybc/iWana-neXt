/**
 * Nombres de persona e iniciales canónicas.
 *
 * Contrato: docs/specs/2026-09-04-contrato-avatar.md v1.0 §4–§5.
 * - `formatFullName` absorbe el patrón `[firstName, lastName].filter(Boolean).join(' ')`.
 * - `getInitials` es la única fuente de iniciales de persona; el icono fallback
 *   lo decide `Avatar` (`@iwana/ui`), no esta función.
 * - Ni esta función ni `Avatar` aceptan email como entrada (§5 privacidad).
 */

/** Segmenta en grafemas visibles. Reserva a puntos de código, nunca a unidades UTF-16. */
function segmentGraphemes(value: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}

function firstGrapheme(word: string): string {
  const segments = segmentGraphemes(word);
  return segments.length > 0 && segments[0] !== undefined ? segments[0] : '';
}

function upperEs(value: string): string {
  return value.toLocaleUpperCase('es');
}

/**
 * Compone el nombre visible a partir de nombre y apellido.
 * Equivale al patrón que reemplaza: filtra falsos y une con un espacio,
 * sin recortar ni añadir repliegues. El repliegue (`|| email`, `|| '—'`, …)
 * lo decide cada call site; esta función devuelve `''` cuando no hay nada.
 */
export function formatFullName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter((part): part is string => Boolean(part)).join(' ');
}

/**
 * Iniciales canónicas de persona: primera+última palabra, máx. 2 grafemas.
 * Devuelve `''` cuando no hay nada computable (el icono fallback lo pinta `Avatar`).
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) {
    return '';
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const firstWord = words[0] as string;
  if (words.length === 1) {
    return upperEs(segmentGraphemes(firstWord).slice(0, 2).join(''));
  }
  const lastWord = words[words.length - 1] as string;
  return upperEs(firstGrapheme(firstWord) + firstGrapheme(lastWord));
}

/**
 * Iniciales de identidad de tenant (NO de persona): primera+segunda palabra.
 * Vive aquí solo para unificar `TenantSeal` (portal) y `TenantCreateSummary`
 * (web) entre sí, sin pasar por `Avatar` (contrato §8). El repliegue vacío
 * se parametriza porque cada superficie conserva el suyo (`'?'` / `'iW'`).
 */
export function getTenantInitials(name: string | null | undefined, emptyFallback = '?'): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return emptyFallback;
  }
  const firstWord = words[0] as string;
  if (words.length === 1) {
    return upperEs(segmentGraphemes(firstWord).slice(0, 2).join(''));
  }
  const secondWord = words[1] as string;
  return upperEs(firstGrapheme(firstWord) + firstGrapheme(secondWord));
}
