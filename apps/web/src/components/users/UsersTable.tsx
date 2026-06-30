'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iwana/ui';
import { ChevronLeft, ChevronRight, KeyRound, Shield, ShieldOff, UserCog } from 'lucide-react';
import type { UserListItem } from '@/lib/api-client';
import { getWebUserRoleLabel, getWebUserStatusLabel } from '@/lib/user-labels';

const TABLE_HEADERS = [
  { id: 'user', label: 'Usuario', className: 'min-w-[220px]' },
  { id: 'role', label: 'Rol', className: 'min-w-[120px]' },
  { id: 'status', label: 'Estado', className: 'min-w-[120px]' },
  { id: 'mfa', label: 'MFA', className: 'hidden md:table-cell min-w-[100px]' },
  { id: 'reset', label: 'Restablecimiento', className: 'hidden lg:table-cell min-w-[140px]' },
  { id: 'lastLogin', label: 'Último acceso', className: 'hidden sm:table-cell min-w-[160px]' },
  { id: 'actions', label: 'Acciones', className: 'w-[120px] text-right' },
] as const;

/** Retorna las clases pill para el badge de rol */
function roleBadgeClasses(role: string): string {
  const base =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';
  switch (role) {
    case 'ADMIN':
      return `${base} bg-iwana-primary-50 text-iwana-primary-700 ring-iwana-primary-100 dark:bg-iwana-primary-500/15 dark:text-iwana-primary-300 dark:ring-iwana-primary-500/20`;
    case 'NOC':
      return `${base} bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-400 dark:ring-blue-500/20`;
    case 'SUPPORT':
      return `${base} bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-dark-border-2`;
    case 'TECHNICIAN':
      return `${base} bg-yellow-50 text-yellow-700 ring-yellow-100 dark:bg-yellow-500/15 dark:text-yellow-400 dark:ring-yellow-500/20`;
    case 'SALES':
      return `${base} bg-green-50 text-green-700 ring-green-100 dark:bg-green-500/15 dark:text-green-400 dark:ring-green-500/20`;
    case 'ACCOUNTANT':
      return `${base} bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-400 dark:ring-purple-500/20`;
    case 'HR':
      return `${base} bg-pink-50 text-pink-700 ring-pink-100 dark:bg-pink-500/15 dark:text-pink-400 dark:ring-pink-500/20`;
    case 'SUBSCRIBER':
      return `${base} bg-gray-100 text-gray-500 ring-gray-200`;
    default:
      return `${base} bg-gray-100 text-gray-500 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-dark-border-2`;
  }
}

/** Retorna las clases pill para el badge de estado */
function statusBadgeClasses(status: string): string {
  const base =
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset';
  switch (status) {
    case 'ACTIVE':
      return `${base} bg-success-50 text-success-700 ring-success-100 dark:bg-success-500/15 dark:text-success-400 dark:ring-success-500/20`;
    case 'SUSPENDED':
      return `${base} bg-error-50 text-error-700 ring-error-100 dark:bg-error-500/15 dark:text-error-400 dark:ring-error-500/20`;
    case 'PENDING':
    case 'PENDING_VERIFICATION':
      return `${base} bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-500/15 dark:text-warning-400 dark:ring-warning-500/20`;
    case 'INACTIVE':
      return `${base} bg-gray-100 text-gray-600 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-dark-border-2`;
    default:
      return `${base} bg-gray-100 text-gray-500 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-dark-border-2`;
  }
}

function userDisplayName(user: UserListItem): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
}

/** Devuelve la primera letra del nombre del usuario, con fallback 'U' */
function userInitial(user: UserListItem): string {
  const source = user.firstName || user.lastName || user.email;
  return source.charAt(0).toUpperCase();
}

function formatLastLogin(value: string | null): string {
  if (!value) {
    return 'Sin acceso registrado';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin acceso registrado';
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SecurityIndicator({
  enabled,
  enabledLabel,
  disabledLabel,
  enabledIcon: EnabledIcon,
  disabledIcon: DisabledIcon,
}: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  enabledIcon: typeof Shield;
  disabledIcon: typeof ShieldOff;
}) {
  const Icon = enabled ? EnabledIcon : DisabledIcon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        enabled
          ? 'bg-success-50 text-success-700 ring-success-100 dark:bg-success-500/15 dark:text-success-400 dark:ring-success-500/20'
          : 'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-dark-border-2',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function TableHeaderRow() {
  return (
    <tr className="border-b border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3">
      {TABLE_HEADERS.map((header) => (
        <th
          key={header.id}
          scope="col"
          className={cn(
            'px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
            header.className,
          )}
        >
          {header.label}
        </th>
      ))}
    </tr>
  );
}

function EmptyStateRow({
  colSpan,
  title,
  description,
}: {
  colSpan: number;
  title: string;
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-iwana-surface-soft ring-1 ring-inset ring-iwana-primary-100 dark:bg-dark-surface-3 dark:ring-dark-border-2">
            <UserCog className="h-5 w-5 text-iwana-secondary-700 dark:text-iwana-secondary" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-iwana-primary dark:text-white">{title}</p>
            {description ? (
              <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function UsersTable({
  users,
  isLoading,
  total,
  hasNextPage,
  hasPrevPage,
  tenantName,
  emptyStateTitle,
  emptyStateDescription,
  onNext,
  onPrev,
  onManage,
}: {
  users: UserListItem[];
  isLoading: boolean;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  tenantName?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onNext: () => void;
  onPrev: () => void;
  onManage: (user: UserListItem) => void;
}) {
  const visibleCount = users.length;
  const cardSubtitle = tenantName
    ? `Revisa roles, estado de seguridad y accesos recientes del equipo interno de ${tenantName}.`
    : 'Selecciona una empresa para revisar su equipo interno, roles y estado de seguridad.';

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="space-y-1">
          <CardTitle>Directorio de usuarios internos</CardTitle>
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">{cardSubtitle}</p>
        </div>
      </CardHeader>

      <CardContent className="mt-4 p-0">
        <div className="px-6 pb-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Listado de usuarios internos">
                <thead>
                  <TableHeaderRow />
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={TABLE_HEADERS.length}
                        className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                      >
                        Cargando usuarios internos...
                      </td>
                    </tr>
                  ) : visibleCount === 0 ? (
                    <EmptyStateRow
                      colSpan={TABLE_HEADERS.length}
                      title={emptyStateTitle ?? 'No hay usuarios para la empresa seleccionada.'}
                      {...(emptyStateDescription ? { description: emptyStateDescription } : {})}
                    />
                  ) : (
                    users.map((user) => (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-iwana-surface-soft/70 dark:hover:bg-white/[0.03]"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary-50 text-sm font-semibold text-iwana-primary-700 ring-1 ring-inset ring-iwana-primary-100 dark:bg-iwana-primary-500/15 dark:text-iwana-primary-300 dark:ring-iwana-primary-500/20"
                            >
                              {userInitial(user)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-iwana-primary dark:text-white">
                                {userDisplayName(user)}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className={roleBadgeClasses(user.role)}>
                            {getWebUserRoleLabel(user.role)}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className={statusBadgeClasses(user.status)}>
                            {getWebUserStatusLabel(user.status)}
                          </span>
                        </td>

                        <td className="hidden px-6 py-4 md:table-cell">
                          <SecurityIndicator
                            enabled={user.mfaEnabled}
                            enabledLabel="Activo"
                            disabledLabel="Inactivo"
                            enabledIcon={Shield}
                            disabledIcon={ShieldOff}
                          />
                        </td>

                        <td className="hidden px-6 py-4 lg:table-cell">
                          {user.passwordResetRequired ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-medium text-warning-700 ring-1 ring-inset ring-warning-100 dark:bg-warning-500/15 dark:text-warning-400 dark:ring-warning-500/20">
                              <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              Pendiente
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">Al día</span>
                          )}
                        </td>

                        <td className="hidden px-6 py-4 sm:table-cell">
                          <span className="tabular-nums text-gray-500 dark:text-gray-400">
                            {formatLastLogin(user.lastLoginAt)}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={() => onManage(user)}
                          >
                            Gestionar
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {!isLoading && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-dark-border">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Mostrando {visibleCount} de {total} usuarios internos
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={onPrev}
                disabled={!hasPrevPage || isLoading}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-xl"
                onClick={onNext}
                disabled={!hasNextPage || isLoading}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
