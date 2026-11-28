import { z } from 'zod';

/**
 * Respuesta de `GET /crm/api/v1.0/users/admins` (spec 2026-11-15 «usuarios» §0): `id`,
 * `email`, `username`, `firstName`, `lastName` e `isActive`. Se valida cada elemento: uno que
 * no cumple se omite y se cuenta (sin registrar su contenido, que es PII).
 */
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const UispAdminSchema = z
  .object({
    id: z.number().int().positive().max(2_147_483_647),
    email: optionalText,
    username: optionalText,
    firstName: optionalText,
    lastName: optionalText,
    isActive: z.boolean(),
  })
  .passthrough();

const EMAIL = z.string().email().max(254);

/**
 * Nombre del personal de UISP tal como lo entrega la API: nombre y apellido por separado. Unirlos
 * y volver a partirlos por espacios pasaba el segundo nombre al apellido («Ana María Pérez» →
 * «Ana» + «María Pérez»), así que las partes viajan juntas hasta crear el usuario.
 */
export interface UispStaffName {
  /** Nombre para la revisión: nombre y apellido, o el usuario de UISP. */
  displayName: string;
  /** `firstName` de UISP; `null` si no lo trae (o en filas guardadas antes de este formato). */
  firstName: string | null;
  /** `lastName` de UISP; `null` si no lo trae (o en filas guardadas antes de este formato). */
  lastName: string | null;
}

export interface UispAdmin {
  uispUserId: number;
  /** `null` si UISP no trae nombre, apellido ni usuario. */
  name: UispStaffName | null;
  /** Correo con forma válida, en minúsculas; `null` si falta o no es un correo. */
  email: string | null;
  isActive: boolean;
}

export interface ParsedUispAdmins {
  admins: UispAdmin[];
  /** Elementos omitidos por forma inválida o número repetido. */
  skipped: number;
}

export class UispAdminsResponseError extends Error {
  constructor() {
    super('La respuesta de users/admins no es una lista.');
    this.name = 'UispAdminsResponseError';
  }
}

export function parseUispAdmins(body: unknown): ParsedUispAdmins {
  if (!Array.isArray(body)) throw new UispAdminsResponseError();
  const admins: UispAdmin[] = [];
  const seen = new Set<number>();
  let skipped = 0;
  for (const item of body) {
    const parsed = UispAdminSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) {
      skipped += 1;
      continue;
    }
    const admin = parsed.data;
    seen.add(admin.id);
    const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim();
    const displayName = (fullName || admin.username)?.slice(0, 200) ?? null;
    const email = admin.email?.toLowerCase() ?? null;
    admins.push({
      uispUserId: admin.id,
      name: displayName
        ? {
            displayName,
            firstName: admin.firstName?.slice(0, 200) ?? null,
            lastName: admin.lastName?.slice(0, 200) ?? null,
          }
        : null,
      email: email && EMAIL.safeParse(email).success ? email : null,
      isActive: admin.isActive,
    });
  }
  return { admins, skipped };
}

const STORED_NAME = z.object({
  v: z.literal(1),
  displayName: z.string().min(1),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

/** Texto que se cifra en `migration_uisp_users.display_name_encrypted`. */
export function serializeUispStaffName(name: UispStaffName): string {
  return JSON.stringify({ v: 1, ...name });
}

/**
 * Lee el nombre descifrado de la fila. Las filas guardadas antes de este formato (texto plano
 * con el nombre unido) devuelven solo `displayName`, sin partes.
 */
export function parseStoredUispStaffName(text: string): UispStaffName {
  if (text.startsWith('{')) {
    try {
      const parsed = STORED_NAME.safeParse(JSON.parse(text));
      if (parsed.success) {
        const { displayName, firstName, lastName } = parsed.data;
        return { displayName, firstName, lastName };
      }
    } catch {
      // No es JSON: un nombre que empieza por «{». Se trata como texto plano.
    }
  }
  return { displayName: text, firstName: null, lastName: null };
}
