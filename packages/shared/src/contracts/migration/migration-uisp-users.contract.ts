import { z } from 'zod';
import { UserRole } from '../../enums/user-role.enum';

/**
 * Usuarios del personal desde la API de UISP — contrato HTTP (ADR-110 v1.2 D15; spec
 * 2026-11-15 «importación UISP: usuarios», §2 a §4). Bloque A: congelado al cerrar la ola 1.
 *
 * - La clave de aplicación de UISP entra solo en el `PUT` de la conexión y nunca vuelve en
 *   una respuesta: la conexión se describe con `hasAppKey`.
 * - La fila de revisión lleva nombre y correo mientras está `PENDIENTE`; al enlazar, crear o
 *   descartar, la API purga esos datos (CHECK de la migración 211) y ambos vuelven `null`.
 * - **Correo en la fila (decisión del bloque A):** la API lo devuelve completo solo a un
 *   `ADMIN` con `migration.import.manage` (spec §2.3); a cualquier otro portador del permiso
 *   lo devuelve enmascarado (`p***@dominio`). El contrato no distingue la forma: es
 *   `string | null` en ambos casos y nunca se usa como identificador.
 */

// ── Conexión con UISP (spec §2.1) ───────────────────────────────────────────────────────

/** Resultado de la última prueba de conexión (`GET /crm/api/v1.0/version`). */
export const MIGRATION_SOURCE_CHECK_RESULTS = ['OK', 'UNREACHABLE', 'UNAUTHORIZED'] as const;
export type MigrationSourceCheckResult = (typeof MIGRATION_SOURCE_CHECK_RESULTS)[number];

const NO_CONTROL_CHARS = /^[^\p{Cc}]+$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/iu;

const httpsUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.username === '' && url.password === '';
    } catch {
      return false;
    }
  }, 'La dirección de UISP debe usar https y no llevar credenciales.');

/**
 * `PUT` de la conexión: reemplaza la conexión completa del tenant (una por tenant).
 * `trustedCertificateSha256` ausente = sin huella fijada (se exige un certificado de confianza).
 */
export const MigrationSourceConnectionUpsertSchema = z
  .object({
    baseUrl: httpsUrlSchema,
    appKey: z.string().min(1).max(200).regex(NO_CONTROL_CHARS, 'Clave con caracteres de control.'),
    trustedCertificateSha256: z
      .string()
      .regex(SHA256_HEX, 'Huella SHA-256 de 64 caracteres hexadecimales.')
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict();
export type MigrationSourceConnectionUpsert = z.infer<typeof MigrationSourceConnectionUpsertSchema>;

/** Respuesta de la conexión: nunca transporta la clave. */
export const MigrationSourceConnectionSchema = z
  .object({
    baseUrl: z.string(),
    hasAppKey: z.literal(true),
    trustedCertificateSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    lastCheckedAt: z.string().datetime().nullable(),
    lastCheckResult: z.enum(MIGRATION_SOURCE_CHECK_RESULTS).nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type MigrationSourceConnection = z.infer<typeof MigrationSourceConnectionSchema>;

// ── Fila de revisión (spec §2.2, §2.3) ──────────────────────────────────────────────────

/** `API`: devuelto por `users/admins`; `SIN_DATOS`: número visto en un lote y no en la API. */
export const MIGRATION_UISP_USER_SOURCES = ['API', 'SIN_DATOS'] as const;
export type MigrationUispUserSource = (typeof MIGRATION_UISP_USER_SOURCES)[number];

export const MIGRATION_UISP_USER_STATUSES = [
  'PENDIENTE',
  'ENLAZADO',
  'CREADO',
  'DESCARTADO',
] as const;
export type MigrationUispUserStatus = (typeof MIGRATION_UISP_USER_STATUSES)[number];

/** Roles que se pueden asignar a un usuario creado desde UISP (spec §2.3). */
export const MIGRATION_IMPORTABLE_USER_ROLES = [
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.TECHNICIAN,
  UserRole.ACCOUNTANT,
  UserRole.HR,
  UserRole.CONTRACTOR,
  UserRole.AUDITOR,
] as const satisfies readonly Exclude<
  UserRole,
  UserRole.SUBSCRIBER | UserRole.PARTNER | UserRole.INVESTOR
>[];
export type MigrationImportableUserRole = (typeof MIGRATION_IMPORTABLE_USER_ROLES)[number];

export function isMigrationImportableUserRole(role: UserRole): role is MigrationImportableUserRole {
  return (MIGRATION_IMPORTABLE_USER_ROLES as readonly UserRole[]).includes(role);
}

export const MigrationUispUserSchema = z
  .object({
    id: z.string().uuid(),
    uispUserId: z.number().int().positive(),
    /** `null` si la fila es `SIN_DATOS` o ya se resolvió (PII purgada). */
    displayName: z.string().nullable(),
    /** Completo o enmascarado según quien consulta (ver JSDoc del archivo); `null` igual que el nombre. */
    email: z.string().nullable(),
    /** `null` para `SIN_DATOS`. */
    isActiveInUisp: z.boolean().nullable(),
    source: z.enum(MIGRATION_UISP_USER_SOURCES),
    status: z.enum(MIGRATION_UISP_USER_STATUSES),
    /** Usuario de iWana con el mismo correo (HMAC); propuesta para enlazar. */
    matchedUserId: z.string().uuid().nullable(),
    /** Usuario enlazado o creado; `null` mientras esté `PENDIENTE` o si se descartó. */
    targetUserId: z.string().uuid().nullable(),
    proposedRole: z.nativeEnum(UserRole).nullable(),
    /** Lotes con intermedias vigentes que mencionan este número. */
    referencedInBatches: z.number().int().min(0),
  })
  .strict();
export type MigrationUispUser = z.infer<typeof MigrationUispUserSchema>;

// ── Acciones en lote (spec §2.3, §2.4) ──────────────────────────────────────────────────

export const MIGRATION_UISP_USER_ACTIONS = ['ENLAZAR', 'CREAR', 'DESCARTAR'] as const;
export type MigrationUispUserAction = (typeof MIGRATION_UISP_USER_ACTIONS)[number];

const MAX_BATCH_ITEMS = 100;

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/**
 * Una acción por fila. `role`, `displayName` e `isOperationalResource` solo valen con `CREAR`
 * (rol obligatorio). El contrato admite cualquier `UserRole` para que la API responda
 * `MIGRATION_USER_ROLE_NOT_ALLOWED` con su código; `displayName` solo lo acepta la API en
 * filas `SIN_DATOS`, e `isOperationalResource` se fuerza a `false` para inactivos.
 */
export const MigrationUispUserResolveItemSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(MIGRATION_UISP_USER_ACTIONS),
    role: z.nativeEnum(UserRole).optional(),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(NO_CONTROL_CHARS, 'Nombre con caracteres de control.')
      .optional(),
    isOperationalResource: z.boolean().optional(),
    /**
     * Solo con ENLAZAR: usuario de iWana elegido a mano (2026-11-15), para filas «sin datos» o
     * sin coincidencia por correo. Sin él, ENLAZAR usa la coincidencia por correo.
     */
    targetUserId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.targetUserId !== undefined && item.action !== 'ENLAZAR') {
      ctx.addIssue({
        code: 'custom',
        path: ['targetUserId'],
        message: 'Solo se admite al enlazar.',
      });
    }
    if (item.action === 'CREAR') {
      if (item.role === undefined) {
        ctx.addIssue({ code: 'custom', path: ['role'], message: 'Crear exige un rol.' });
      }
      return;
    }
    for (const field of ['role', 'displayName', 'isOperationalResource'] as const) {
      if (item[field] !== undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: 'Solo se admite al crear.' });
      }
    }
  });
export type MigrationUispUserResolveItem = z.infer<typeof MigrationUispUserResolveItemSchema>;

export const MigrationUispUsersResolveSchema = z
  .object({
    items: z
      .array(MigrationUispUserResolveItemSchema)
      .min(1)
      .max(MAX_BATCH_ITEMS)
      .refine((items) => hasUniqueValues(items.map((item) => item.id)), 'Filas repetidas.'),
  })
  .strict();
export type MigrationUispUsersResolve = z.infer<typeof MigrationUispUsersResolveSchema>;

const rowIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(MAX_BATCH_ITEMS)
  .refine(hasUniqueValues, 'Filas repetidas.');

/** Invitar (o reenviar) a usuarios creados desde UISP en `PENDING_VERIFICATION` con correo real. */
export const MigrationUispUsersInviteSchema = z.object({ ids: rowIdsSchema }).strict();
export type MigrationUispUsersInvite = z.infer<typeof MigrationUispUsersInviteSchema>;

/**
 * Recuperar descartados (spec §2.3, v1.4): las filas `DESCARTADO` vuelven a `PENDIENTE`, sin
 * nombre ni correo hasta la siguiente lectura. Enlazadas y creadas no se reabren.
 */
export const MigrationUispUsersReopenSchema = z.object({ ids: rowIdsSchema }).strict();
export type MigrationUispUsersReopen = z.infer<typeof MigrationUispUsersReopenSchema>;

/** `recuperados` = filas que volvieron a pendientes; `omitidos` = pedidas que no estaban descartadas. */
export const MigrationUispUsersReopenResultSchema = z
  .object({
    recuperados: z.number().int().min(0),
    omitidos: z.number().int().min(0),
  })
  .strict();
export type MigrationUispUsersReopenResult = z.infer<typeof MigrationUispUsersReopenResultSchema>;

/**
 * Resultado de invitar (adición del bloque C): `invitados` = correos de activación emitidos;
 * `omitidos` = filas pedidas que no eran elegibles (no `CREADO`, usuario no
 * `PENDING_VERIFICATION`, correo `.invalid` o fila inexistente). Solo conteos, sin PII.
 */
export const MigrationUispUsersInviteResultSchema = z
  .object({
    invitados: z.number().int().min(0),
    omitidos: z.number().int().min(0),
  })
  .strict();
export type MigrationUispUsersInviteResult = z.infer<typeof MigrationUispUsersInviteResultSchema>;

// ── «Actualizar autores» de un lote (spec §2.7) ─────────────────────────────────────────

const countSchema = z.number().int().min(0);

/**
 * Filas re-atribuidas por destino, filas `respetados` (alguien las cambió después de importar)
 * y números de UISP del lote `sinEnlazar`. Solo conteos, sin PII.
 */
export const MigrationAuthorsRefreshResultSchema = z
  .object({
    tickets: countSchema,
    comentarios: countSchema,
    pagos: countSchema,
    respetados: countSchema,
    sinEnlazar: countSchema,
  })
  .strict();
export type MigrationAuthorsRefreshResult = z.infer<typeof MigrationAuthorsRefreshResultSchema>;

// ── Bloque B: lectura de usuarios por cola (spec §2.2) — adición del bloque B ──────────

/**
 * Job de lectura de `users/admins` en la cola `MIGRATION_IMPORT_QUEUE` (ADR-110 D9): solo
 * identificadores. El schema se resuelve en `public.tenants` a partir de `tenantId`, como en la
 * simulación y la promoción; la clave de UISP nunca viaja en la cola.
 */
export const MIGRATION_IMPORT_FETCH_UISP_USERS_JOB = 'fetch-uisp-users';

export const MigrationFetchUispUsersJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.string().uuid(),
    actorId: z.string().uuid(),
  })
  .strict();
export type MigrationFetchUispUsersJob = z.infer<typeof MigrationFetchUispUsersJobSchema>;

/**
 * Respuesta 202 de «Traer usuarios de UISP»: la lectura corre en segundo plano. El resultado se
 * ve en la lista (`meta.lastFetchedAt`) y en `lastCheckResult` de la conexión.
 */
export const MigrationUispUsersFetchAcceptedSchema = z
  .object({
    status: z.literal('EN_CURSO'),
    requestedAt: z.string().datetime(),
  })
  .strict();
export type MigrationUispUsersFetchAccepted = z.infer<typeof MigrationUispUsersFetchAcceptedSchema>;

/** `meta` de la lista de revisión: última lectura que escribió filas (`null` si nunca). */
export const MigrationUispUsersListMetaSchema = z
  .object({
    total: z.number().int().min(0),
    lastFetchedAt: z.string().datetime().nullable(),
  })
  .strict();
export type MigrationUispUsersListMeta = z.infer<typeof MigrationUispUsersListMetaSchema>;
