// apps/portal/src/components/users/UsersTable.tsx
'use client';

import { useState } from 'react';
import type { InternalUser, ListUsersParams, UsersPaginationMeta } from '@/lib/api-client';
import { UserRole } from '@iwana/shared';
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronsLeftRight,
  ShieldCheck,
  KeyRound,
  Search,
} from 'lucide-react';
import { Badge, Button, Select } from '@iwana/ui';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  getPortalUserStatusVariant,
  PORTAL_TENANT_ROLE_FILTER_OPTIONS,
  PORTAL_USER_STATUS_FILTER_OPTIONS,
} from '@/lib/user-labels';
import {
  PortalActionToolbar,
  PortalEmptyState,
  PortalSectionHeader,
} from '@/components/shared/portal-ui';

interface UsersTableProps {
  users: InternalUser[];
  isLoading: boolean;
  meta: UsersPaginationMeta | null;
  onEdit: (user: InternalUser) => void;
  onDelete: (user: InternalUser) => void;
  onResetPassword: (user: InternalUser) => void;
  onFilterChange: (filters: ListUsersParams) => void;
  onLoadMore: () => void;
  /** Valor actual del input de búsqueda — controlado desde UsersClient */
  searchValue: string;
  /** Callback invocado cuando el usuario escribe en el input de búsqueda */
  onSearchChange: (value: string) => void;
  currentUserId?: string;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function UsersTable({
  users,
  isLoading,
  meta,
  onEdit,
  onDelete,
  onResetPassword,
  onFilterChange,
  onLoadMore,
  searchValue,
  onSearchChange,
  currentUserId,
}: UsersTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    const newFilters: ListUsersParams = { limit: 20 };
    if (value) newFilters.status = value;
    if (roleFilter) newFilters.role = roleFilter;
    onFilterChange(newFilters);
  };

  const handleRoleChange = (value: string) => {
    setRoleFilter(value);
    const newFilters: ListUsersParams = { limit: 20 };
    if (statusFilter) newFilters.status = statusFilter;
    if (value) newFilters.role = value;
    onFilterChange(newFilters);
  };

  const canDelete = (user: InternalUser): boolean => {
    if (user.id === currentUserId) return false;
    if (user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM_ADMIN) return false;
    return true;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      {/* Filtros */}
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <PortalSectionHeader
            className="w-full gap-3"
            eyebrow="Directorio interno"
            title="Gestión de accesos de la empresa"
            description="Filtra por estado, rol o búsqueda libre para operar usuarios sin salir del panel."
            actions={
              <Badge
                variant="neutral"
                className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
              >
                {meta?.total ?? users.length} registros
              </Badge>
            }
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px_auto] lg:items-end">
          {/* Input de búsqueda — debounce gestionado en UsersClient */}
          <div className="flex min-w-[200px] items-center gap-2">
            <label htmlFor="search-filter" className="sr-only">
              Buscar usuario
            </label>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              />
              <input
                id="search-filter"
                type="search"
                placeholder="Buscar por nombre o correo…"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50/70 pl-11 pr-4 text-sm text-iwana-primary shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-iwana-secondary focus:bg-white focus:outline-none focus:ring-2 focus:ring-iwana-secondary/35 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
          </div>

          <div>
            <Select
              id="status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="h-12"
              options={PORTAL_USER_STATUS_FILTER_OPTIONS}
            />
          </div>

          <div>
            <Select
              id="role-filter"
              label="Rol"
              value={roleFilter}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="h-12"
              options={PORTAL_TENANT_ROLE_FILTER_OPTIONS}
            />
          </div>

          {(statusFilter || roleFilter || searchValue) && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStatusFilter('');
                setRoleFilter('');
                onSearchChange('');
                onFilterChange({});
              }}
              className="h-12 px-4"
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Usuario
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Rol
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                MFA
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Último acceso
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Creado
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="h-5 w-5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Cargando usuarios...
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  <PortalEmptyState
                    title="Sin usuarios registrados"
                    description="Ajusta los filtros o crea el primer usuario para comenzar a gestionar accesos internos."
                    className="mx-auto max-w-xl text-left"
                  />
                </td>
              </tr>
            )}

            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-gray-50 transition-colors hover:bg-[#fbfcf8] dark:border-dark-border dark:hover:bg-dark-surface-3"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{user.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                      {(user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM_ADMIN) && (
                        <ShieldCheck
                          className="h-3.5 w-3.5 text-iwana-primary dark:text-iwana-primary-400"
                          aria-hidden="true"
                        />
                      )}
                      {getPortalUserRoleLabel(user.role)}
                    </span>
                    <span
                      className={
                        user.isOperationalResource
                          ? 'text-xs text-emerald-700 dark:text-emerald-400'
                          : 'text-xs text-gray-500 dark:text-gray-400'
                      }
                    >
                      {user.isOperationalResource ? 'Despacho operativo' : 'Agenda general'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={getPortalUserStatusVariant(user.status)}>
                    {getPortalUserStatusLabel(user.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {user.mfaEnabled ? (
                      <>
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Habilitado
                        </span>
                        {user.mfaRequired && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            Requerido
                          </span>
                        )}
                      </>
                    ) : user.mfaRequired ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Requerido</span>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        No configurado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {formatDate(user.lastLoginAt)}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <PortalActionToolbar
                    compact={true}
                    align="end"
                    className="ml-auto !inline-flex !w-fit sm:!w-fit"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(user)}
                      aria-label={`Editar usuario ${user.email}`}
                      title={`Editar usuario ${user.email}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onResetPassword(user)}
                      className="hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
                      aria-label={`Reiniciar contraseña de ${user.email}`}
                      title="Reiniciar contraseña"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(user)}
                      disabled={!canDelete(user)}
                      className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      aria-label={`Eliminar usuario ${user.email}`}
                      title={
                        !canDelete(user)
                          ? user.id === currentUserId
                            ? 'No puedes eliminarte a ti mismo'
                            : 'No puedes eliminar administradores'
                          : 'Eliminar usuario'
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </PortalActionToolbar>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginacion */}
      {(meta?.nextCursor || users.length > 0) && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-dark-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {users.length} de {meta?.total ?? 0} usuarios
          </p>
          <div className="flex items-center gap-2">
            {meta?.nextCursor && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoading}
                loading={isLoading}
              >
                {!isLoading && <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                Cargar más
              </Button>
            )}
            {!meta?.nextCursor && users.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <ChevronsLeftRight className="h-4 w-4" aria-hidden="true" />
                Fin de resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
