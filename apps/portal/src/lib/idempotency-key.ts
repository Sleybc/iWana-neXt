/**
 * Reutiliza la Idempotency-Key de una intención en curso.
 * Crea una sola vez (primer intento / apertura) y la conserva en reintentos.
 */
export function ensureIdempotencyKey(ref: { current: string | null }): string {
  if (!ref.current) {
    ref.current = crypto.randomUUID();
  }
  return ref.current;
}
