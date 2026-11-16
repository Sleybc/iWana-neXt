import {
  MIGRATION_IMPORTABLE_USER_ROLES,
  type MigrationAuthorsRefreshResult,
  type MigrationSourceCheckResult,
  type MigrationUispUser,
  type MigrationUispUserStatus,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import { MIGRATION_SETTINGS_HREF, migrationErrorMessage } from './migration-labels';

/**
 * Vocabulario visible de «Usuarios de UISP» (spec 2026-11-15 «usuarios» §2.1–§2.4, §2.7).
 * Ningún estado, motivo ni rol llega crudo a la pantalla.
 */
export const UISP_USERS_SECTION_ID = 'usuarios-uisp';
export const UISP_USERS_SECTION_HREF = `${MIGRATION_SETTINGS_HREF}#${UISP_USERS_SECTION_ID}`;

/** Tope de filas por envío (el contrato admite hasta 100 por acción). */
export const UISP_USERS_MAX_PER_ACTION = 100;

/** Sondeo de «Traer usuarios»: cada 4 s, máximo 30 intentos (unos 2 minutos). */
export const UISP_USERS_FETCH_MAX_POLLS = 30;

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';

export const UISP_CHECK_RESULT_PRESENTATION: Record<
  MigrationSourceCheckResult,
  { label: string; variant: BadgeVariant }
> = {
  OK: { label: 'Conexión correcta', variant: 'success' },
  UNREACHABLE: { label: 'Sin conexión', variant: 'error' },
  UNAUTHORIZED: { label: 'Clave rechazada', variant: 'error' },
};

export const UISP_USER_STATUS_PRESENTATION: Record<
  MigrationUispUserStatus,
  { label: string; filterLabel: string; variant: BadgeVariant }
> = {
  PENDIENTE: { label: 'Pendiente', filterLabel: 'Pendientes', variant: 'warning' },
  ENLAZADO: { label: 'Enlazado', filterLabel: 'Enlazados', variant: 'primary' },
  CREADO: { label: 'Creado', filterLabel: 'Creados', variant: 'success' },
  DESCARTADO: { label: 'Descartado', filterLabel: 'Descartados', variant: 'neutral' },
};

/** Roles que se pueden asignar al crear, con la etiqueta del portal. */
export const UISP_IMPORTABLE_ROLE_OPTIONS = MIGRATION_IMPORTABLE_USER_ROLES.map((role) => ({
  value: role,
  label: getPortalUserRoleLabel(role),
}));

/** Nombre visible de la fila: los datos se purgan al resolverla y las «sin datos» no traen. */
export function uispUserDisplayName(
  user: Pick<MigrationUispUser, 'displayName' | 'uispUserId' | 'source'>,
): string {
  if (user.displayName) return user.displayName;
  const base = `Usuario de UISP n.º ${user.uispUserId}`;
  return user.source === 'SIN_DATOS' ? `${base} (sin datos)` : base;
}

export function uispActivityLabel(isActive: boolean | null): string {
  if (isActive === null) return 'Sin datos';
  return isActive ? 'Activo' : 'Inactivo';
}

/** Motivo técnico de `details.reason` cuando UISP no respondió como se esperaba. */
const SOURCE_FAILURE_MESSAGES: Record<string, string> = {
  CREDENCIAL_RECHAZADA:
    'UISP rechazó la clave de aplicación. Revisa que la clave siga activa y sea de solo lectura.',
  CERTIFICADO_NO_COINCIDE:
    'El certificado de UISP no coincide con la huella guardada. Si UISP renovó su certificado, copia la huella nueva.',
  CERTIFICADO_NO_CONFIABLE:
    'UISP usa un certificado que no es de una entidad reconocida. Si es autofirmado, marca «Confiar en este certificado» y pega su huella.',
  TIEMPO_AGOTADO: 'UISP tardó demasiado en responder. Intenta de nuevo en unos minutos.',
  RED: 'No pudimos llegar a la dirección de UISP. Revisa la dirección y que el servidor esté encendido.',
  RESPUESTA_INVALIDA: 'La dirección respondió, pero no parece ser UISP. Revisa la dirección.',
  RESPUESTA_DEMASIADO_GRANDE:
    'UISP respondió con más datos de los esperados. Intenta de nuevo o contacta a soporte.',
  HTTP_4XX: 'UISP no aceptó la consulta. Revisa la dirección y los permisos de la clave.',
  HTTP_5XX: 'UISP tuvo un error interno. Intenta de nuevo en unos minutos.',
  DESTINO_NO_PERMITIDO:
    'Esa dirección apunta a una red interna y no se permite. Usa la dirección pública de tu UISP.',
};

/** Mensaje de un fallo de conexión: primero el motivo concreto, luego el código. */
export function uispConnectionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const details = error.details as { reason?: unknown } | undefined;
    const reason = typeof details?.reason === 'string' ? details.reason : undefined;
    const specific = reason ? SOURCE_FAILURE_MESSAGES[reason] : undefined;
    if (specific) return specific;
  }
  return migrationErrorMessage(error, fallback);
}

/** Texto del fallo de la última lectura en segundo plano, según el resultado guardado. */
export function uispFetchFailureMessage(result: MigrationSourceCheckResult | null): string {
  if (result === 'UNAUTHORIZED') {
    return 'No pudimos traer los usuarios: UISP rechazó la clave de aplicación. Reemplaza la clave y vuelve a intentarlo.';
  }
  return 'No pudimos traer los usuarios: UISP no respondió. Prueba la conexión y vuelve a intentarlo.';
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace('{n}', String(count));
}

/**
 * Error de una acción de revisión: «Enlazar» sin un usuario de iWana con el mismo correo
 * (422 `MIGRATION_MAPPING_TARGET_INVALID` con `details.reason` SIN_COINCIDENCIA) tiene su texto.
 */
export function uispUsersActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code === 'MIGRATION_MAPPING_TARGET_INVALID') {
    const details = error.details as { reason?: unknown } | undefined;
    if (details?.reason === 'SIN_COINCIDENCIA') {
      return 'Ese usuario no tiene un usuario de iWana con el mismo correo para enlazar.';
    }
  }
  return migrationErrorMessage(error, fallback);
}

/**
 * Error de «Actualizar autores»: el 409 `MIGRATION_BATCH_NOT_RECONCILABLE` aquí significa que el
 * lote no está promovido ni conciliado, no que falte conciliarlo.
 */
export function authorsRefreshErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code === 'MIGRATION_BATCH_NOT_RECONCILABLE') {
    return 'Solo se pueden actualizar los autores de un lote promovido o conciliado.';
  }
  return migrationErrorMessage(error, fallback);
}

/** Frases del resultado de «Actualizar autores» (spec §2.7), solo conteos. */
export function authorsRefreshSentences(result: MigrationAuthorsRefreshResult): string[] {
  return [
    plural(
      result.tickets,
      '1 ticket quedó con su responsable o su creador de UISP.',
      '{n} tickets quedaron con su responsable o su creador de UISP.',
    ),
    plural(
      result.comentarios,
      '1 comentario quedó con su autor de UISP.',
      '{n} comentarios quedaron con su autor de UISP.',
    ),
    plural(
      result.pagos,
      '1 pago quedó con quien lo registró en UISP.',
      '{n} pagos quedaron con quien los registró en UISP.',
    ),
    plural(
      result.respetados,
      '1 registro se dejó igual porque alguien lo cambió después de importarlo.',
      '{n} registros se dejaron igual porque alguien los cambió después de importarlos.',
    ),
    plural(
      result.sinEnlazar,
      '1 usuario de UISP de este lote sigue sin enlazar; lo suyo queda a nombre de quien importó.',
      '{n} usuarios de UISP de este lote siguen sin enlazar; lo suyo queda a nombre de quien importó.',
    ),
  ];
}

/** Acepta la huella con dos puntos o espacios (como la muestran los navegadores). */
export function normalizeCertificateFingerprint(value: string): string {
  return value.replace(/[\s:]/gu, '').toLowerCase();
}
