/**
 * Última lectura del inicio `/dashboard` en la sesión del navegador (R-5: volver con «Atrás» sin
 * pedir otra vez la red). La clave incluye a la persona (`sub`), no solo el perfil y la empresa:
 * otra cuenta del mismo perfil en el mismo navegador nunca ve cifras ajenas. Se vacía al cerrar
 * sesión (condición P2-2 de AI-SEC-ENG, HLD-MOD02 v3.0).
 */
export interface DashboardSessionCacheKey {
  /** `sub` del token de la sesión. */
  userId: string;
  role: string;
  slug: string;
}

let entry: { key: DashboardSessionCacheKey; value: unknown } | null = null;

function sameKey(left: DashboardSessionCacheKey, right: DashboardSessionCacheKey): boolean {
  return left.userId === right.userId && left.role === right.role && left.slug === right.slug;
}

/** Devuelve la lectura guardada solo si la clave coincide completa; si no, `null`. */
export function readDashboardSessionCache<T>(key: DashboardSessionCacheKey): T | null {
  if (!entry || !key.userId || !sameKey(entry.key, key)) return null;
  return entry.value as T;
}

export function writeDashboardSessionCache<T>(key: DashboardSessionCacheKey, value: T): void {
  // Sin persona identificada no se guarda nada.
  if (!key.userId) return;
  entry = { key, value };
}

/** Vacía la lectura guardada. Se llama al cerrar sesión. */
export function clearDashboardSessionCache(): void {
  entry = null;
}
