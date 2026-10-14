/** Longitud máxima de `contracts.plan_id` (varchar(120)). */
export const CONTRACT_PLAN_ID_MAX_LENGTH = 120;

/**
 * Regla única del plan de un contrato, compartida por la creación directa y la
 * creación desde expediente: se recortan los espacios y el resultado debe tener
 * entre 1 y 120 caracteres. Devuelve `null` si no la cumple, para que cada ruta
 * responda con su propio mensaje.
 */
export function normalizeContractPlanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const planId = value.trim();
  if (planId.length === 0 || planId.length > CONTRACT_PLAN_ID_MAX_LENGTH) return null;
  return planId;
}
