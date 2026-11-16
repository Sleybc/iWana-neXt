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

export interface UispAdmin {
  uispUserId: number;
  /** Nombre para la revisión: nombre y apellido, o el usuario; `null` si UISP no trae ninguno. */
  displayName: string | null;
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
    const email = admin.email?.toLowerCase() ?? null;
    admins.push({
      uispUserId: admin.id,
      displayName: (fullName || admin.username)?.slice(0, 200) ?? null,
      email: email && EMAIL.safeParse(email).success ? email : null,
      isActive: admin.isActive,
    });
  }
  return { admins, skipped };
}
