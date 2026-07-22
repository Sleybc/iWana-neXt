'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  type BadgeProps,
} from '@iwana/ui';
import { UserRole } from '@iwana/shared';
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

type BadgeVariant = NonNullable<BadgeProps['variant']>;

/** Mapea el rol del usuario a la variante semántica del Badge del DS */
function roleBadgeVariant(role: string): BadgeVariant {
  switch (role) {
    case UserRole.ADMIN:
      return 'primary';
    case UserRole.NOC:
      return 'info';
    case UserRole.SUPPORT:
      return 'neutral';
    case UserRole.TECHNICIAN:
      return 'warning';
    case UserRole.SALES:
      return 'success';
    case UserRole.ACCOUNTANT:
      return 'info';
    case UserRole.HR:
      return 'lime';
    case UserRole.SUBSCRIBER:
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Mapea el estado del usuario a la variante semántica del Badge del DS */
function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'error';
    case 'PENDING':
    case 'PENDING_VERIFICATION':
      return 'warning';
    case 'INACTIVE':
      return 'neutral';
    default:
      return 'neutral';
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
    <Badge variant={enabled ? 'success' : 'neutral'} className="gap-1.5 py-1">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {enabled ? enabledLabel : disabledLabel}
    </Badge>
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
            <UserCog
              className="h-5 w-5 text-iwana-secondary-700 dark:text-iwana-secondary"
              aria-hidden="true"
            />
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
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Listado de usuarios internos">
                <caption className="sr-only">
                  Usuarios internos con rol, estado de seguridad y acciones de gestión
                </caption>
                <thead>
                  <TableHeaderRow />
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, rowIndex) => (
                      <tr key={`user-skeleton-${rowIndex}`} className="animate-pulse">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 shrink-0 rounded-2xl bg-gray-200 dark:bg-dark-surface-4" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-dark-surface-4" />
                              <div className="h-3 w-48 rounded bg-gray-100 dark:bg-dark-surface-3" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                        <td className="hidden px-6 py-4 md:table-cell">
                          <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-dark-surface-3" />
                        </td>
                        <td className="hidden px-6 py-4 lg:table-cell">
                          <div className="h-4 w-16 rounded bg-gray-100 dark:bg-dark-surface-3" />
                        </td>
                        <td className="hidden px-6 py-4 sm:table-cell">
                          <div className="h-4 w-28 rounded bg-gray-100 dark:bg-dark-surface-3" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="ml-auto h-9 w-24 rounded-xl bg-gray-200 dark:bg-dark-surface-4" />
                        </td>
                      </tr>
                    ))
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
                          <Badge variant={roleBadgeVariant(user.role)}>
                            {getWebUserRoleLabel(user.role)}
                          </Badge>
                        </td>

                        <td className="px-6 py-4">
                          <Badge variant={statusBadgeVariant(user.status)}>
                            {getWebUserStatusLabel(user.status)}
                          </Badge>
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
                            <Badge variant="warning" className="gap-1.5 py-1">
                              <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              Pendiente
                            </Badge>
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
                className="min-h-11 rounded-xl"
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
                className="min-h-11 rounded-xl"
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
