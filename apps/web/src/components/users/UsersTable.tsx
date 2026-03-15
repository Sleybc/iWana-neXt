'use client';

import { Badge } from '@iwana/ui';
import type { UserListItem } from '@/lib/api-client';

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'warning';
  if (status === 'INACTIVE') return 'neutral';
  return 'error';
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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th className="px-3 py-2 text-left">Nombre / Usuario</th>
            <th className="px-3 py-2 text-left">Rol</th>
            <th className="px-3 py-2 text-left">Estado</th>
            <th className="px-3 py-2 text-left">MFA</th>
            <th className="px-3 py-2 text-left">Reset clave</th>
            <th className="px-3 py-2 text-left">Último login</th>
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
                No hay usuarios para el tenant seleccionado.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id} className="border-t border-gray-100 dark:border-dark-border">
                <td className="px-3 py-2">
                  {(user.firstName ?? user.lastName) ? (
                    <span>{[user.firstName, user.lastName].filter(Boolean).join(' ')}</span>
                  ) : (
                    <span className="font-mono text-xs text-gray-400">{user.id.slice(0, 8)}…</span>
                  )}
                </td>
                <td className="px-3 py-2">{user.role}</td>
                <td className="px-3 py-2">
                  <Badge variant={statusVariant(user.status)}>{user.status}</Badge>
                </td>
                <td className="px-3 py-2">{user.mfaEnabled ? 'Sí' : 'No'}</td>
                <td className="px-3 py-2">{user.passwordResetRequired ? 'Pendiente' : 'No'}</td>
                <td className="px-3 py-2">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-CO') : 'Nunca'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-iwana-primary hover:underline"
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
            Prev
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
            disabled={!hasNextPage || isLoading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
