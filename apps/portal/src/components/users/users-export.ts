import type { InternalUserExportRow } from '@/lib/api-client';
import {
  getPortalDocumentTypeLabel,
  getPortalUserRoleLabel,
  PORTAL_USER_STATUS_LABELS,
} from '@/lib/user-labels';
import type { UserStatus } from '@iwana/shared';

/**
 * Archivo de exportación del directorio de usuarios: una fila por usuario con
 * todos sus datos, en el vocabulario que ve el administrador. No es el formato
 * de la importación masiva (esa plantilla usa claves técnicas).
 */
const COLUMNS: ReadonlyArray<{
  header: string;
  value: (user: InternalUserExportRow) => string;
}> = [
  { header: 'Nombres', value: (u) => u.firstName ?? '' },
  { header: 'Apellidos', value: (u) => u.lastName ?? '' },
  { header: 'Correo', value: (u) => u.email },
  { header: 'Teléfono', value: (u) => u.phone ?? '' },
  { header: 'Cargo', value: (u) => u.jobTitle ?? '' },
  {
    header: 'Tipo de documento',
    value: (u) => (u.documentType ? getPortalDocumentTypeLabel(u.documentType) : ''),
  },
  { header: 'Número de documento', value: (u) => u.documentNumber ?? '' },
  { header: 'Rol', value: (u) => getPortalUserRoleLabel(u.role) },
  { header: 'Roles de empresa', value: (u) => u.companyRoles.join('; ') },
  {
    header: 'Estado',
    value: (u) => PORTAL_USER_STATUS_LABELS[u.status as UserStatus] ?? u.status,
  },
  {
    header: 'Administrador principal',
    value: (u) => (u.isPrincipalAdmin === undefined ? '' : yesNo(u.isPrincipalAdmin)),
  },
  { header: 'Disponible para despacho operativo', value: (u) => yesNo(u.isOperationalResource) },
  { header: 'Verificación en dos pasos activa', value: (u) => yesNo(u.mfaEnabled) },
  { header: 'Verificación en dos pasos obligatoria', value: (u) => yesNo(u.mfaRequired) },
  { header: 'Correo verificado', value: (u) => yesNo(u.emailVerified) },
  { header: 'Debe cambiar la contraseña', value: (u) => yesNo(u.passwordResetRequired) },
  { header: 'Último acceso', value: (u) => formatDateTime(u.lastLoginAt) },
  { header: 'Fecha de creación', value: (u) => formatDateTime(u.createdAt) },
  { header: 'Última actualización', value: (u) => formatDateTime(u.updatedAt) },
  { header: 'Foto de perfil', value: (u) => u.avatarUrl ?? '' },
  { header: 'Identificador', value: (u) => u.id },
];

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Bogota',
});

function formatDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : DATE_TIME.format(date);
}

/**
 * Celda CSV entre comillas. Un valor cuyo primer carácter visible es `=`, `+`,
 * `-` o `@`, o que empieza por tabulador o salto de línea, se antepone con `'`
 * para que la hoja de cálculo no lo ejecute como fórmula (inyección CSV, OWASP).
 */
function escapeCell(raw: string): string {
  const value = /^(\s*[=+\-@]|[\t\r\n])/.test(raw) ? `'${raw}` : raw;
  return `"${value.replace(/"/g, '""')}"`;
}

/** CSV con BOM UTF-8 (Excel respeta tildes) y fin de línea CRLF. */
export function buildUsersExportCsv(users: readonly InternalUserExportRow[]): string {
  const lines = [
    COLUMNS.map((column) => escapeCell(column.header)).join(','),
    ...users.map((user) => COLUMNS.map((column) => escapeCell(column.value(user))).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** `usuarios-AAAA-MM-DD.csv` con la fecha local de Bogotá. */
export function buildUsersExportFilename(now: Date = new Date()): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(now);
  return `usuarios-${day}.csv`;
}
