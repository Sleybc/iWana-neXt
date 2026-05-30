// apps/portal/src/components/users/UsersClient.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { UsersTable } from './UsersTable';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { DeleteUserDialog } from './DeleteUserDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import {
  accessControlApi,
  usersApi,
  type AccessPermissionsCatalog,
  type AccessProfileView,
  type InternalUser,
  type ListUsersParams,
  type CreateInternalUserDto,
  type UpdateInternalUserDto,
  type UsersPaginationMeta,
  ApiError,
} from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';
import { UserRole } from '@iwana/shared';
import { PortalAlert } from '@/components/shared/portal-ui';

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
  const searchParams = useSearchParams();
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
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InternalUser | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessCatalog, setAccessCatalog] = useState<AccessPermissionsCatalog | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<AccessProfileView[]>([]);
  const [selectedUserCompanyRoleIds, setSelectedUserCompanyRoleIds] = useState<string[]>([]);

  /** Texto ingresado por el usuario en el input de búsqueda (sin debounce) */
  const [searchValue, setSearchValue] = useState('');
  /** Timer id para el debounce del input de búsqueda */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParam = searchParams.get('search')?.trim() ?? '';

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
    if (!isAdmin) {
      return;
    }

    setSearchValue(searchParam);
    const nextFilters: ListUsersParams = { limit: PAGE_SIZE };
    if (searchParam) {
      nextFilters.search = searchParam;
    }

    void loadUsers(nextFilters);
  }, [isAdmin, loadUsers, searchParam]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let mounted = true;

    Promise.all([accessControlApi.listPermissions(), accessControlApi.listProfiles()])
      .then(([catalogResponse, profilesResponse]) => {
        if (!mounted) {
          return;
        }

        setAccessCatalog(catalogResponse);
        setAvailableProfiles(profilesResponse);
      })
      .catch((err: unknown) => {
        if (!mounted) {
          return;
        }

        setActionError(mapError(err));
      });

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  const handleFilterChange = (newFilters: ListUsersParams) => {
    void loadUsers({ ...newFilters, limit: PAGE_SIZE });
  };

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      // Se pasa append=true para concatenar la siguiente página sin descartar la actual
      void loadUsers({ ...filters, cursor: meta.nextCursor }, true);
    }
  };

  /**
   * Actualiza el valor del input de búsqueda y dispara una nueva carga con debounce de 300ms.
   * Se cancela el timer anterior antes de crear uno nuevo para evitar peticiones redundantes.
   */
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const newFilters: ListUsersParams = { limit: PAGE_SIZE };
      if (value) newFilters.search = value;
      void loadUsers(newFilters);
    }, 300);
  };

  const handleCreate = async (dto: CreateInternalUserDto, companyRoleIds: string[]) => {
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsSubmitting(true);
    try {
      const result = await usersApi.create(dto, crypto.randomUUID());
      if (companyRoleIds.length > 0) {
        await accessControlApi.replaceUserProfiles(result.id, { profileIds: companyRoleIds });
      }
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

  const handleEdit = async (dto: UpdateInternalUserDto, companyRoleIds: string[]) => {
    if (!selectedUser) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSubmitting(true);
    try {
      const userId = selectedUser.id;
      const normalizedInitialCompanyRoleIds = [...selectedUserCompanyRoleIds].sort();
      const normalizedNextCompanyRoleIds = [...companyRoleIds].sort();
      const companyRolesChanged =
        normalizedInitialCompanyRoleIds.join('|') !== normalizedNextCompanyRoleIds.join('|');

      if (Object.keys(dto).length > 0) {
        await usersApi.update(userId, dto, crypto.randomUUID());
      }
      if (companyRolesChanged) {
        await accessControlApi.replaceUserProfiles(userId, { profileIds: companyRoleIds });
      }
      setActionSuccess('Usuario actualizado correctamente.');
      setIsEditOpen(false);
      setSelectedUser(null);
      setSelectedUserCompanyRoleIds([]);
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

  /**
   * Confirma el reinicio de contraseña para el usuario seleccionado.
   * Genera una contraseña temporal y la expone al admin para que la entregue manualmente.
   */
  const handleResetPasswordConfirm = async () => {
    if (!selectedUser) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const result = await usersApi.resetPassword(selectedUser.id, {
        idempotencyKey: crypto.randomUUID(),
      });
      setTempPassword(result.temporaryPassword);
      setNewUserEmail(selectedUser.email);
      setIsResetPasswordOpen(false);
    } catch (err: unknown) {
      setActionError(mapError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = async (userToEdit: InternalUser) => {
    setSelectedUser(userToEdit);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    try {
      const summary = await accessControlApi.getEffectivePermissions(userToEdit.id);
      setSelectedUserCompanyRoleIds(summary.profileSources.map((source) => source.profileId));
    } catch (err: unknown) {
      setActionError(mapError(err));
      setSelectedUserCompanyRoleIds([]);
    }
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

  /**
   * Abre el dialog de confirmación de reinicio de contraseña para el usuario seleccionado.
   * Resetea los estados de acción previos para evitar mensajes residuales.
   */
  const openResetPassword = (userToReset: InternalUser) => {
    setSelectedUser(userToReset);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsResetPasswordOpen(true);
  };

  const closeModals = () => {
    setIsEditOpen(false);
    setIsDeleteOpen(false);
    setIsResetPasswordOpen(false);
    setSelectedUser(null);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setSelectedUserCompanyRoleIds([]);
  };

  const dismissTempPassword = () => {
    setTempPassword(null);
    setNewUserEmail(null);
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios" subtitle="Acceso restringido" />
        <PortalAlert
          variant="warning"
          title="Permisos insuficientes"
          description="Solo los administradores pueden gestionar usuarios internos."
          icon={ShieldAlert}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      <div className="space-y-4">
        {actionSuccess && !actionError && !tempPassword && (
          <PortalAlert
            variant="success"
            title="Operación completada"
            description={actionSuccess}
            icon={CheckCircle2}
          />
        )}

        {error && (
          <PortalAlert
            variant="error"
            title="Incidente en la carga"
            description={error}
            action={
              <button
                type="button"
                onClick={() => void loadUsers(filters)}
                className="text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-300"
              >
                Reintentar
              </button>
            }
            icon={AlertTriangle}
          />
        )}

        <UsersTable
          users={users}
          isLoading={isLoading}
          meta={meta}
          onEdit={openEdit}
          onDelete={openDelete}
          onResetPassword={openResetPassword}
          onFilterChange={handleFilterChange}
          onLoadMore={handleLoadMore}
          searchValue={searchValue}
          onSearchChange={handleSearchChange}
          currentUserId={user?.id}
        />
      </div>

      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        isSubmitting={isSubmitting}
        error={actionError}
        accessCatalog={accessCatalog}
        availableProfiles={availableProfiles}
        tempPassword={tempPassword}
        tempPasswordEmail={newUserEmail}
        onDismissSuccess={dismissTempPassword}
      />

      {/* Modal de contraseña temporal tras reset desde la tabla */}
      {tempPassword && newUserEmail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-success-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/70 bg-white/95 p-6 shadow-2xl dark:border-dark-border dark:bg-dark-surface-2">
            <h2
              id="reset-success-title"
              className="text-base font-semibold text-iwana-primary dark:text-white"
            >
              Contraseña temporal generada
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Entrega esta contraseña a{' '}
              <span className="font-medium text-gray-900 dark:text-white">{newUserEmail}</span>.
              Deberá cambiarla en el próximo inicio de sesión.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
              <code className="flex-1 break-all font-mono text-sm text-gray-900 dark:text-white select-all">
                {tempPassword}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(tempPassword)}
                className="shrink-0 rounded-xl p-1.5 text-gray-500 transition-colors hover:bg-white dark:hover:bg-dark-surface-4"
                aria-label="Copiar contraseña temporal"
                title="Copiar"
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={dismissTempPassword}
              className="mt-4 w-full rounded-2xl bg-iwana-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-iwana-primary-600"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

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
            accessCatalog={accessCatalog}
            availableProfiles={availableProfiles}
            initialCompanyRoleIds={selectedUserCompanyRoleIds}
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

          <ResetPasswordDialog
            isOpen={isResetPasswordOpen}
            user={selectedUser}
            onClose={closeModals}
            onConfirm={handleResetPasswordConfirm}
            isSubmitting={isSubmitting}
            error={actionError}
          />
        </>
      )}
    </div>
  );
}
