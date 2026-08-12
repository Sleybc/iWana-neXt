/** Campos de mayor prioridad para identificar el cambio clave en un UPDATE */
const PRIORITY_GROUPS = [
  // Seguridad — cambios de mayor impacto
  ['role', 'mfaEnabled', 'status', 'isActive', 'password'],
  // Identidad — cambios de nombre o credenciales
  ['email', 'name', 'firstName', 'lastName'],
  // Configuración crítica de tenant
  ['slug', 'schemaName', 'plan'],
];

/** Campos de auditoría interna / internos de producto que no se muestran como cambio clave */
const SKIP_FIELDS = new Set(['updatedAt', 'createdAt', 'lastLoginAt', 'id', 'slug', 'schemaName']);

/** Campos de identidad para CREATE/DELETE */
const IDENTITY_FIELDS = ['email', 'name', 'firstName'];

export interface KeyChange {
  field: string;
  oldVal: unknown;
  newVal: unknown;
  /** Cantidad de cambios adicionales en el mismo evento */
  extraCount: number;
}

/**
 * Selecciona el cambio más relevante de un evento de auditoría para mostrarlo
 * en la fila básica. Usa jerarquía: seguridad → identidad → config → primer diff.
 */
export function pickKeyChange(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  action: string,
): KeyChange | null {
  if (!oldValue && !newValue) return null;

  if (action === 'UPDATE' && oldValue && newValue) {
    const allDiffs: Array<{ field: string; old: unknown; new: unknown }> = [];
    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

    for (const key of allKeys) {
      if (SKIP_FIELDS.has(key)) continue;
      if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
        allDiffs.push({ field: key, old: oldValue[key], new: newValue[key] });
      }
    }

    if (allDiffs.length === 0) return null;

    // Buscar por grupos de prioridad
    for (const group of PRIORITY_GROUPS) {
      const match = allDiffs.find((d) => group.includes(d.field));
      if (match) {
        return {
          field: match.field,
          oldVal: match.old,
          newVal: match.new,
          extraCount: allDiffs.length - 1,
        };
      }
    }

    // Fallback: primer campo con cambio real
    const first = allDiffs[0]!;
    return {
      field: first.field,
      oldVal: first.old,
      newVal: first.new,
      extraCount: allDiffs.length - 1,
    };
  }

  if (action === 'CREATE' && newValue) {
    const field = IDENTITY_FIELDS.find((k) => k in newValue && Boolean(newValue[k]));
    if (field) {
      return { field, oldVal: null, newVal: newValue[field], extraCount: 0 };
    }
  }

  if (action === 'DELETE' && oldValue) {
    const field = IDENTITY_FIELDS.find((k) => k in oldValue && Boolean(oldValue[k]));
    if (field) {
      return { field, oldVal: oldValue[field], newVal: null, extraCount: 0 };
    }
  }

  return null;
}
