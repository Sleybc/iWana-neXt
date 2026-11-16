/**
 * Números de usuario de UISP que menciona una intermedia (spec 2026-11-15 «usuarios» §2.2,
 * §2.6): `tickets[].assignedUserId`, `tickets[].activity[].userId` y `payments[].userId` de la
 * carga útil descifrada (`{ raw }`). Solo números enteros positivos que caben en `integer`
 * (columna `uisp_user_id` de la 211); cualquier otro valor se ignora.
 */
type Raw = Record<string, unknown> | null | undefined;

const MAX_INT32 = 2_147_483_647;

export function uispUserNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 && value <= MAX_INT32 ? value : null;
  }
  if (typeof value === 'string' && /^[1-9]\d{0,9}$/u.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed <= MAX_INT32 ? parsed : null;
  }
  return null;
}

/** Entidades de las intermedias que llevan números de usuario de UISP. */
export const STAGED_ENTITIES_WITH_UISP_USERS = ['TICKET', 'PAGO'] as const;

export function stagedUispUserRefs(entity: string, payload: unknown): Set<number> {
  const refs = new Set<number>();
  const raw = (payload as { raw?: Raw } | null)?.raw;
  if (!raw || typeof raw !== 'object') return refs;
  const add = (value: unknown) => {
    const id = uispUserNumber(value);
    if (id !== null) refs.add(id);
  };
  if (entity === 'TICKET') {
    add(raw['assignedUserId']);
    const activity = Array.isArray(raw['activity']) ? (raw['activity'] as Raw[]) : [];
    for (const entry of activity) {
      if (entry && typeof entry === 'object') add(entry['userId']);
    }
  } else if (entity === 'PAGO') {
    add(raw['userId']);
  }
  return refs;
}
