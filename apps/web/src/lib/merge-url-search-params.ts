/**
 * Fusiona actualizaciones en un URLSearchParams existente.
 * `null` / `undefined` / `''` eliminan la clave.
 */
export function mergeUrlSearchParams(
  current: URLSearchParams | string,
  updates: Record<string, string | null | undefined>,
): string {
  const next = new URLSearchParams(typeof current === 'string' ? current : current.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }

  return next.toString();
}

/** Construye `pathname?query` omitiendo el `?` si no hay query. */
export function withSearchParams(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}
