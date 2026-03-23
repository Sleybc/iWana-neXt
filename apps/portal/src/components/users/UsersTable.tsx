// apps/portal/src/components/users/UsersTable.tsx
'use client';

import { useState } from 'react';
import type { InternalUser, ListUsersParams, UsersPaginationMeta } from '@/lib/api-client';
import { UserRole, UserStatus } from '@iwana/shared';
import {
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronsLeftRight,
  ShieldCheck,
} from 'lucide-react';

interface UsersTableProps {
  users: InternalUser[];
  isLoading: boolean;
  meta: UsersPaginationMeta | null;
  onEdit: (user: InternalUser) => void;
  onDelete: (user: InternalUser) => void;
  onFilterChange: (filters: ListUsersParams) => void;
  onLoadMore: () => void;
  currentUserId?: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  NOC: 'Operador NOC',
  SUPPORT: 'Soporte',
  SALES: 'Ventas',
  TECHNICIAN: 'Técnico',
  ACCOUNTANT: 'Contabilidad',
  HR: 'Recursos Humanos',
  SUBSCRIBER: 'Suscriptor',
  CONTRACTOR: 'Contratista',
  PARTNER: 'Socio',
  AUDITOR: 'Auditor',
  INVESTOR: 'Inversionista',
  SYSTEM_ADMIN: 'Admin Plataforma',
  IWANA_SUPPORT: 'Soporte iWana',
};

/** Roles de plataforma excluidos del filtro de tenant. */
const PLATFORM_ROLES = new Set([UserRole.SYSTEM_ADMIN, UserRole.IWANA_SUPPORT]);

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING_VERIFICATION: 'warning',
  SUSPENDED: 'error',
  INACTIVE: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING_VERIFICATION: 'Pendiente',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
};

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
  onFilterChange,
  onLoadMore,
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
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2 overflow-hidden">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100 dark:border-dark-border">
        <div className="flex items-center gap-2">
          <label
            htmlFor="status-filter"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Estado:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-iwana-primary"
          >
            <option value="">Todos</option>
            {Object.values(UserStatus).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="role-filter"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Rol:
          </label>
          <select
            id="role-filter"
            value={roleFilter}
            onChange={(e) => handleRoleChange(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-iwana-primary"
          >
            <option value="">Todos</option>
            {Object.values(UserRole)
              .filter((r) => !PLATFORM_ROLES.has(r))
              .map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] ?? r}
                </option>
              ))}
          </select>
        </div>

        {(statusFilter || roleFilter) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('');
              setRoleFilter('');
              onFilterChange({});
            }}
            className="text-sm text-iwana-secondary hover:underline dark:text-iwana-secondary-400"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 dark:border-dark-border dark:bg-dark-surface-3">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                Usuario
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                Rol
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                Estado
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                MFA
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                Último acceso
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                Creado
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
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
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3 transition-colors"
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
                  <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
                    {(user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM_ADMIN) && (
                      <ShieldCheck
                        className="h-3.5 w-3.5 text-iwana-primary dark:text-iwana-primary-400"
                        aria-hidden="true"
                      />
                    )}
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                      ${STATUS_VARIANTS[user.status] === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}
                      ${STATUS_VARIANTS[user.status] === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : ''}
                      ${STATUS_VARIANTS[user.status] === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}
                      ${STATUS_VARIANTS[user.status] === 'neutral' ? 'bg-gray-100 text-gray-600 dark:bg-dark-surface-4 dark:text-gray-300' : ''}
                      ${STATUS_VARIANTS[user.status] === 'info' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                    `}
                  >
                    {STATUS_LABELS[user.status] ?? user.status}
                  </span>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-dark-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Mostrando {users.length} de {meta?.total ?? 0} usuarios
          </p>
          <div className="flex items-center gap-2">
            {meta?.nextCursor && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4 transition-colors"
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
