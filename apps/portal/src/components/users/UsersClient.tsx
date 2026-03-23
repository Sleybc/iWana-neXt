// apps/portal/src/components/users/UsersClient.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { UsersTable } from './UsersTable';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { DeleteUserDialog } from './DeleteUserDialog';
import {
  usersApi,
  type InternalUser,
  type ListUsersParams,
  type CreateInternalUserDto,
  type UpdateInternalUserDto,
  type UsersPaginationMeta,
  ApiError,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { UserRole } from '@iwana/shared';

const PAGE_SIZE = 20;

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para gestionar usuarios.';
    if (error.status === 409) return error.message;
    return error.message;
  }
  return 'No fue posible completar la operación. Intenta de nuevo.';
}

interface UsersClientProps {
  initialUsers?: InternalUser[];
  initialMeta?: UsersPaginationMeta;
}

export function UsersClient({ initialUsers, initialMeta }: UsersClientProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SYSTEM_ADMIN;

  const [users, setUsers] = useState<InternalUser[]>(initialUsers ?? []);
  const [meta, setMeta] = useState<UsersPaginationMeta | null>(initialMeta ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ListUsersParams>({ limit: PAGE_SIZE });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InternalUser | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // append=true cuando el usuario pulsa "Cargar más"; en ese caso se concatenan los
  // resultados al final de la lista en lugar de reemplazarla.
  const loadUsers = useCallback(async (params: ListUsersParams, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await usersApi.list(params);
      setUsers((prev) => (append ? [...prev, ...result.data] : result.data));
      setMeta(result.meta);
      setFilters(params);
    } catch (err: unknown) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers({ limit: PAGE_SIZE });
    }
  }, [isAdmin, loadUsers]);

  const handleFilterChange = (newFilters: ListUsersParams) => {
    void loadUsers({ ...newFilters, limit: PAGE_SIZE });
  };

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      // Se pasa append=true para concatenar la siguiente página sin descartar la actual
      void loadUsers({ ...filters, cursor: meta.nextCursor }, true);
    }
  };

  const handleCreate = async (dto: CreateInternalUserDto) => {
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsSubmitting(true);
    try {
      const result = await usersApi.create(dto, crypto.randomUUID());
      setNewUserEmail(dto.email);
      if ('temporaryPassword' in result && result.temporaryPassword) {
        setTempPassword(result.temporaryPassword);
        void loadUsers({ limit: PAGE_SIZE });
      } else {
        setIsCreateOpen(false);
        void loadUsers({ limit: PAGE_SIZE });
      }
    } catch (err: unknown) {
      setActionError(mapError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (dto: UpdateInternalUserDto) => {
    if (!selectedUser) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);
    try {
      await usersApi.update(selectedUser.id, dto, crypto.randomUUID());
      setActionSuccess('Usuario actualizado correctamente.');
      setIsEditOpen(false);
      setSelectedUser(null);
      void loadUsers(filters);
    } catch (err: unknown) {
      setActionError(mapError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);
    try {
      await usersApi.remove(selectedUser.id);
      setActionSuccess('Usuario eliminado correctamente.');
      setIsDeleteOpen(false);
      setSelectedUser(null);
      void loadUsers(filters);
    } catch (err: unknown) {
      setActionError(mapError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (userToEdit: InternalUser) => {
    setSelectedUser(userToEdit);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsEditOpen(true);
  };

  const openDelete = (userToDelete: InternalUser) => {
    setSelectedUser(userToDelete);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsDeleteOpen(true);
  };

  const closeModals = () => {
    setIsEditOpen(false);
    setIsDeleteOpen(false);
    setSelectedUser(null);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
  };

  const dismissTempPassword = () => {
    setTempPassword(null);
    setNewUserEmail(null);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col flex-1">
        <PageHeader title="Usuarios" subtitle="Acceso restringido" />
        <main className="flex-1 p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Solo los administradores pueden gestionar usuarios internos.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <PageHeader
        title="Usuarios internos"
        subtitle={`${meta?.total ?? 0} usuario${(meta?.total ?? 0) !== 1 ? 's' : ''} en total`}
        actions={
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setTempPassword(null);
              setNewUserEmail(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-iwana-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-iwana-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nuevo usuario
          </button>
        }
      />

      <main className="flex-1 p-6 space-y-4">
        {actionSuccess && !actionError && !tempPassword && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              {actionSuccess}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <svg
                className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadUsers(filters)}
                  className="text-sm text-red-700 dark:text-red-400 underline mt-1 hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        )}

        <UsersTable
          users={users}
          isLoading={isLoading}
          meta={meta}
          onEdit={openEdit}
          onDelete={openDelete}
          onFilterChange={handleFilterChange}
          onLoadMore={handleLoadMore}
          currentUserId={user?.id}
        />
      </main>

      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={isSubmitting}
        error={actionError}
        tempPassword={tempPassword}
        tempPasswordEmail={newUserEmail}
        onDismissSuccess={dismissTempPassword}
      />

      {selectedUser && (
        <>
          <EditUserModal
            isOpen={isEditOpen}
            user={selectedUser}
            onClose={closeModals}
            onSubmit={handleEdit}
            onEmailChanged={() => void loadUsers(filters)}
            isSubmitting={isSubmitting}
            error={actionError}
          />

          <DeleteUserDialog
            isOpen={isDeleteOpen}
            user={selectedUser}
            onClose={closeModals}
            onConfirm={handleDelete}
            isSubmitting={isSubmitting}
            error={actionError}
            isSelfDelete={selectedUser.id === user?.id}
          />
        </>
      )}
    </div>
  );
}
