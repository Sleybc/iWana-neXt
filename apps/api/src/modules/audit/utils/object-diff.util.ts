/**
 * Utilidad para generar un diff entre dos objetos.
 * Identifica campos añadidos, modificados y eliminados.
 */

const SENSITIVE_KEYS = new Set([
  'passwordHash',
  'passwordResetToken',
  'mfaSecret',
  'email',
  'accessToken',
  'refreshToken',
  'tokenHash',
]);

const MAX_STRING_LENGTH = 100;

function truncate(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    return value.slice(0, MAX_STRING_LENGTH) + '...';
  }
  return value;
}

export interface ObjectDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Compara dos objetos y retorna solo los campos que cambiaron.
 * Ignora campos sensibles y trunca strings largos.
 */
export function diffObjects(
  oldObj: Record<string, unknown> | null,
  newObj: Record<string, unknown> | null,
): ObjectDiff[] {
  const diffs: ObjectDiff[] = [];

  if (!oldObj && !newObj) return diffs;

  const oldKeys = oldObj ? Object.keys(oldObj) : [];
  const newKeys = newObj ? Object.keys(newObj) : [];
  const allKeys = new Set([...oldKeys, ...newKeys]);

  for (const key of allKeys) {
    if (SENSITIVE_KEYS.has(key)) continue;

    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({
        field: key,
        oldValue: truncate(oldVal ?? '[no definido]'),
        newValue: truncate(newVal ?? '[eliminado]'),
      });
    }
  }

  return diffs;
}
