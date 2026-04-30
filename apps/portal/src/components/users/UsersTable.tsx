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
import { Badge, Select } from '@iwana/ui';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  getPortalUserStatusVariant,
  PORTAL_TENANT_ROLE_FILTER_OPTIONS,
  PORTAL_USER_STATUS_FILTER_OPTIONS,
} from '@/lib/user-labels';

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
    <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/95 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2/95">
      {/* Filtros */}
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Directorio interno
            </p>
            <h2 className="text-lg font-semibold text-iwana-primary dark:text-white">
              Gestión de accesos de la empresa
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Filtra por estado, rol o búsqueda libre para operar usuarios sin salir del panel.
            </p>
          </div>
          <Badge
            variant="neutral"
            className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
          >
            {meta?.total ?? users.length} registros
          </Badge>
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
            <button
              type="button"
              onClick={() => {
                setStatusFilter('');
                setRoleFilter('');
                onSearchChange('');
                onFilterChange({});
              }}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-iwana-primary transition-colors hover:border-iwana-secondary/40 hover:bg-iwana-secondary-50 dark:border-dark-border dark:text-gray-100 dark:hover:bg-dark-surface-3"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-[#f6f8f4] dark:border-dark-border dark:bg-dark-surface-3">
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
                  No se encontraron usuarios.
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
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                    {(user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM_ADMIN) && (
                      <ShieldCheck
                        className="h-3.5 w-3.5 text-iwana-primary dark:text-iwana-primary-400"
                        aria-hidden="true"
                      />
                    )}
                    {getPortalUserRoleLabel(user.role)}
                  </span>
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
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(user)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-gray-200 transition-colors"
                      aria-label={`Editar usuario ${user.email}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onResetPassword(user)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 transition-colors"
                      aria-label={`Reiniciar contraseña de ${user.email}`}
                      title="Reiniciar contraseña"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(user)}
                      disabled={!canDelete(user)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
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
                    </button>
                  </div>
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
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-iwana-secondary/40 hover:bg-[#fbfcf8] disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4"
              >
                {isLoading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
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
                    Cargando...
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    Cargar más
                  </>
                )}
              </button>
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
