'use client';

import type { UserListItem } from '@/lib/api-client';
import { getWebUserRoleLabel, getWebUserStatusLabel } from '@/lib/user-labels';

/** Retorna las clases pill para el badge de rol */
function roleBadgeClasses(role: string): string {
  const base = 'rounded-full px-2.5 py-0.5 text-xs font-medium';
  switch (role) {
    case 'ADMIN':
      return `${base} bg-iwana-primary-50 text-iwana-primary-700 dark:bg-iwana-primary-500/15 dark:text-iwana-primary-300`;
    case 'NOC':
      return `${base} bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400`;
    case 'SUPPORT':
      return `${base} bg-gray-100 text-gray-600 dark:bg-white/[0.03] dark:text-gray-400`;
    case 'TECHNICIAN':
      return `${base} bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400`;
    case 'SALES':
      return `${base} bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400`;
    case 'ACCOUNTANT':
      return `${base} bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400`;
    case 'HR':
      return `${base} bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400`;
    case 'SUBSCRIBER':
      return `${base} bg-gray-100 text-gray-500`;
    default:
      return `${base} bg-gray-100 text-gray-500`;
  }
}

/** Retorna las clases pill para el badge de estado */
function statusBadgeClasses(status: string): string {
  const base = 'rounded-full px-2.5 py-0.5 text-xs font-medium';
  switch (status) {
    case 'ACTIVE':
      return `${base} bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400`;
    case 'SUSPENDED':
      return `${base} bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400`;
    case 'PENDING':
      return `${base} bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400`;
    default:
      return `${base} bg-gray-100 text-gray-500`;
  }
}

/** Devuelve la primera letra del nombre del usuario, con fallback 'U' */
function userInitial(user: UserListItem): string {
  if (user.firstName) return user.firstName.charAt(0).toUpperCase();
  if (user.lastName) return user.lastName.charAt(0).toUpperCase();
  return 'U';
}

export function UsersTable({
  users,
  isLoading,
  total,
  hasNextPage,
  hasPrevPage,
  onNext,
  onPrev,
  onManage,
}: {
  users: UserListItem[];
  isLoading: boolean;
  total: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNext: () => void;
  onPrev: () => void;
  onManage: (user: UserListItem) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-dark-surface-3">
            <tr>
              <th className="px-3 py-2 text-left">Nombre / Usuario</th>
              <th className="px-3 py-2 text-left">Rol</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">MFA</th>
              <th className="px-3 py-2 text-left">Restablecimiento</th>
              <th className="px-3 py-2 text-left">Último acceso</th>
              <th className="px-3 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Cargando usuarios...
                </td>
              </tr>
            ) : (users ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No hay usuarios para la empresa seleccionada.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-gray-100 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  {/* Columna: avatar de inicial + nombre/email */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden="true"
                        className="h-8 w-8 rounded-full bg-iwana-primary-100 text-iwana-primary-700 flex items-center justify-center text-sm font-semibold shrink-0"
                      >
                        {userInitial(user)}
                      </div>
                      <div className="min-w-0">
                        {(user.firstName ?? user.lastName) ? (
                          <span className="block truncate font-medium">
                            {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                          </span>
                        ) : (
                          <span className="block font-mono text-xs text-gray-400">
                            {user.id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Columna: rol con pill badge */}
                  <td className="px-3 py-2">
                    <span className={roleBadgeClasses(user.role)}>
                      {getWebUserRoleLabel(user.role)}
                    </span>
                  </td>

                  {/* Columna: estado con pill badge */}
                  <td className="px-3 py-2">
                    <span className={statusBadgeClasses(user.status)}>
                      {getWebUserStatusLabel(user.status)}
                    </span>
                  </td>

                  <td className="px-3 py-2">{user.mfaEnabled ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2">{user.passwordResetRequired ? 'Pendiente' : 'No'}</td>
                  <td className="px-3 py-2">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString('es-CO')
                      : 'Nunca'}
                  </td>

                  {/* Columna: acciones */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-medium text-iwana-primary hover:underline dark:text-iwana-primary-300 dark:hover:text-iwana-primary-200"
                        onClick={() => onManage(user)}
                      >
                        Gestionar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 dark:border-dark-border">
        <p className="text-xs text-gray-500">
          Total visible: {(users ?? []).length} de {total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onPrev}
            disabled={!hasPrevPage || isLoading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
            disabled={!hasNextPage || isLoading}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
