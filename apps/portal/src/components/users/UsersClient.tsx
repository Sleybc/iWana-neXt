// apps/portal/src/components/users/UsersClient.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Copy, ShieldAlert } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { UsersTable } from './UsersTable';
import { CreateUserModal } from './CreateUserModal';
import { BulkImportUsersModal } from './BulkImportUsersModal';
import { readActiveBulkJobId } from './bulk-import-job-storage';
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
import { ensureIdempotencyKey } from '@/lib/idempotency-key';
import { listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { useAuth } from '@/components/auth/AuthProvider';
import { isPlatformOnlyRole, UserRole } from '@iwana/shared';
import { PortalAlert, PortalPanel, PortalSuccessAlert } from '@/components/shared/portal-ui';

const PARTIAL_CREATE_PROFILES_ERROR =
  'El usuario se creó, pero no se pudieron asignar los roles de empresa. Reintenta solo la asignación desde editar usuario; no vuelvas a crearlo.';

const PARTIAL_EDIT_PROFILES_ERROR =
  'El usuario se actualizó, pero no se pudieron asignar los roles de empresa. Reintenta solo la asignación de roles; no hace falta volver a editar el resto de datos.';

const GENERIC_OPERATION_ERROR = 'No fue posible completar la operación. Intenta de nuevo.';

/** Status HTTP cuyos mensajes de API son seguros para mostrar al usuario (FE-16). */
const USER_FACING_API_STATUSES = new Set([400, 409, 422]);
const USERS_FILTER_KEYS = ['search', 'status', 'role'] as const;

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para gestionar usuarios.';
    if (USER_FACING_API_STATUSES.has(error.status)) return error.message;
    return GENERIC_OPERATION_ERROR;
  }
  return GENERIC_OPERATION_ERROR;
}

export function UsersClient() {
  const { user } = useAuth();
  // `user !== null` primero: TypeScript usa esta condicion con alias para
  // estrechar `user` en el JSX de abajo. Sin ella, `user?.id` vuelve a ser
  // `string | undefined` y rompe `exactOptionalPropertyTypes`.
  const isAdmin = user !== null && (user.role === UserRole.ADMIN || isPlatformOnlyRole(user.role));

  const [users, setUsers] = useState<InternalUser[]>([]);
  const [meta, setMeta] = useState<UsersPaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({ filterKeys: USERS_FILTER_KEYS });
  const [listParams, setListParams] = useState<ListUsersParams>({
    limit: PORTAL_DEFAULT_PAGE_SIZE,
  });
  /** Texto inmediato del input; el filtro aplicado permanece en la dirección. */
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [activeBulkJobId, setActiveBulkJobId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InternalUser | null>(null);
  const [preparingEditUserId, setPreparingEditUserId] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<'ok' | 'error' | null>(null);
  const [tempSecretsSaved, setTempSecretsSaved] = useState(false);
  const [tempConfirmClose, setTempConfirmClose] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessCatalog, setAccessCatalog] = useState<AccessPermissionsCatalog | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<AccessProfileView[]>([]);
  const [selectedUserCompanyRoleIds, setSelectedUserCompanyRoleIds] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Trigger de fila (edit/delete/reset) para restaurar foco al cerrar dialogs. */
  const actionTriggerRef = useRef<HTMLElement | null>(null);

  /** FE-02: una clave por intención (abrir modal / primer submit); se reutiliza en reintentos. */
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const editIdempotencyKeyRef = useRef<string | null>(null);
  const resetPasswordIdempotencyKeyRef = useRef<string | null>(null);

  const captureActionTrigger = () => {
    actionTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const restoreActionTriggerFocus = () => {
    const trigger = actionTriggerRef.current;
    actionTriggerRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
    }
  };

  useEffect(() => {
    setActiveBulkJobId(readActiveBulkJobId());
  }, []);

  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

  // append=true cuando el usuario pulsa "Cargar más"; en ese caso se concatenan los
  // resultados al final de la lista en lugar de reemplazarla.
  const loadUsers = useCallback(async (params: ListUsersParams, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await usersApi.list(params);
      const data = Array.isArray(result?.data) ? result.data : [];
      const normalizedMeta = normalizeListMeta(result?.meta, {
        dataLength: data.length,
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      });
      setUsers((prev) => (append ? [...prev, ...data] : data));
      setMeta(normalizedMeta);
      setListParams(params);
    } catch (err: unknown) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isPageMode = meta?.capabilities?.randomAccess === true;
  const requestParams = useMemo((): ListUsersParams => {
    const params: ListUsersParams = { limit: pageSize };
    if (filters.search) params.search = filters.search;
    if (filters.status) params.status = filters.status;
    if (filters.role) params.role = filters.role;
    // La página solo existe para recursos que el servidor declara de acceso aleatorio.
    if (isPageMode && page > 1) params.page = page;
    return params;
  }, [filters, isPageMode, page, pageSize]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void loadUsers(requestParams);
  }, [isAdmin, loadUsers, requestParams]);

  useEffect(() => {
    if (meta && !isPageMode && page > 1) {
      setQuery({ page: null }, { history: 'replace' });
    }
  }, [isPageMode, meta, page, setQuery]);

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
        setCatalogError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) {
          return;
        }

        setCatalogError(mapError(err));
      });

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  /** FE-09: cancelar debounce pendiente al desmontar. */
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleLoadMore = () => {
    if (meta?.nextCursor) {
      void loadUsers({ ...listParams, cursor: meta.nextCursor }, true);
    }
  };

  /** ADR-065: navegación a página arbitraria (push para soportar Atrás del navegador). */
  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
    },
    [setPage],
  );

  /**
   * Actualiza el valor del input de búsqueda y dispara una nueva carga con debounce de 300ms.
   * Preserva status y role (FE-01).
   */
  const handleSearchChange = (value: string) => {
    setSearchDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters({ search: value });
    }, 300);
  };

  const handleStatusChange = (value: string) => {
    setFilters({ status: value });
  };

  const handleRoleChange = (value: string) => {
    setFilters({ role: value });
  };

  const handleClearFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchDraft('');
    setFilters({ search: null, status: null, role: null });
  };

  const handleCreate = async (dto: CreateInternalUserDto, companyRoleIds: string[]) => {
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsSubmitting(true);
    const idempotencyKey = ensureIdempotencyKey(createIdempotencyKeyRef);
    try {
      const result = await usersApi.create(dto, idempotencyKey);
      let profilesFailed = false;
      if (companyRoleIds.length > 0) {
        try {
          await accessControlApi.replaceUserProfiles(result.id, { profileIds: companyRoleIds });
        } catch {
          profilesFailed = true;
          setActionError(PARTIAL_CREATE_PROFILES_ERROR);
        }
      }

      setNewUserEmail(dto.email);
      createIdempotencyKeyRef.current = null;

      if ('temporaryPassword' in result && result.temporaryPassword) {
        setTempSecretsSaved(false);
        setTempConfirmClose(false);
        setTempPassword(result.temporaryPassword);
      } else if (!profilesFailed) {
        setIsCreateOpen(false);
      }

      void loadUsers(listParams);
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

      let userUpdated = false;
      if (Object.keys(dto).length > 0) {
        const idempotencyKey = ensureIdempotencyKey(editIdempotencyKeyRef);
        await usersApi.update(userId, dto, idempotencyKey);
        userUpdated = true;
      }

      if (companyRolesChanged) {
        try {
          await accessControlApi.replaceUserProfiles(userId, { profileIds: companyRoleIds });
        } catch (err: unknown) {
          setActionError(userUpdated ? PARTIAL_EDIT_PROFILES_ERROR : mapError(err));
          return;
        }
      }

      editIdempotencyKeyRef.current = null;
      setActionSuccess('Usuario actualizado correctamente.');
      setIsEditOpen(false);
      setSelectedUser(null);
      setSelectedUserCompanyRoleIds([]);
      void loadUsers(listParams);
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
      window.requestAnimationFrame(() => {
        restoreActionTriggerFocus();
      });
      void loadUsers(listParams);
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
    const idempotencyKey = ensureIdempotencyKey(resetPasswordIdempotencyKeyRef);
    try {
      const result = await usersApi.resetPassword(selectedUser.id, {
        idempotencyKey,
      });
      resetPasswordIdempotencyKeyRef.current = null;
      setTempSecretsSaved(false);
      setTempConfirmClose(false);
      setCopyFeedback(null);
      setTempPassword(result.temporaryPassword);
      setNewUserEmail(selectedUser.email);
      setIsResetPasswordOpen(false);
      window.requestAnimationFrame(() => {
        restoreActionTriggerFocus();
      });
    } catch (err: unknown) {
      setActionError(mapError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreate = () => {
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    createIdempotencyKeyRef.current = crypto.randomUUID();
    setIsCreateOpen(true);
  };

  const openBulkImport = () => {
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setIsBulkImportOpen(true);
  };

  /** FE-11: feedback inmediato en el botón Editar mientras cargan permisos. */
  const openEdit = async (userToEdit: InternalUser) => {
    captureActionTrigger();
    const editTrigger = actionTriggerRef.current;
    setPreparingEditUserId(userToEdit.id);
    setSelectedUser(userToEdit);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    editIdempotencyKeyRef.current = crypto.randomUUID();
    try {
      const summary = await accessControlApi.getEffectivePermissions(userToEdit.id);
      setSelectedUserCompanyRoleIds(summary.profileSources.map((source) => source.profileId));
    } catch (err: unknown) {
      setActionError(mapError(err));
      setSelectedUserCompanyRoleIds([]);
    } finally {
      setPreparingEditUserId(null);
    }
    // PortalSidePeek restaura foco al cerrar; reenfocar el trigger antes de abrir
    // para que capture el elemento correcto tras el await de permisos.
    if (editTrigger?.isConnected) {
      editTrigger.focus();
    }
    setIsEditOpen(true);
  };

  const openDelete = (userToDelete: InternalUser) => {
    captureActionTrigger();
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
    captureActionTrigger();
    setSelectedUser(userToReset);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    resetPasswordIdempotencyKeyRef.current = crypto.randomUUID();
    setIsResetPasswordOpen(true);
  };

  const closeModals = () => {
    const shouldRestoreFocus = isDeleteOpen || isResetPasswordOpen;
    setIsEditOpen(false);
    setIsDeleteOpen(false);
    setIsResetPasswordOpen(false);
    setSelectedUser(null);
    setActionError(null);
    setActionSuccess(null);
    setTempPassword(null);
    setNewUserEmail(null);
    setSelectedUserCompanyRoleIds([]);
    setPreparingEditUserId(null);
    editIdempotencyKeyRef.current = null;
    resetPasswordIdempotencyKeyRef.current = null;
    // Edit usa PortalSidePeek (restaura foco solo). Delete/Reset necesitan restore explícito.
    if (shouldRestoreFocus) {
      window.requestAnimationFrame(() => {
        restoreActionTriggerFocus();
      });
    } else {
      actionTriggerRef.current = null;
    }
  };

  const dismissTempPassword = () => {
    setTempPassword(null);
    setNewUserEmail(null);
    setCopyFeedback(null);
    setTempSecretsSaved(false);
    setTempConfirmClose(false);
  };

  const requestDismissTempPassword = () => {
    if (tempPassword && !tempSecretsSaved) {
      setTempConfirmClose(true);
      return;
    }
    dismissTempPassword();
  };

  const handleCopyTempPassword = async () => {
    if (!tempPassword) return;
    setCopyFeedback(null);
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopyFeedback('ok');
      setTempSecretsSaved(true);
      setTempConfirmClose(false);
    } catch {
      setCopyFeedback('error');
    }
  };

  // ADR-065: la modalidad se deriva exclusivamente de capabilities.randomAccess.
  // La ausencia de page/totalPages solo deja al pager sin datos de navegación;
  // nunca convierte una respuesta cursor en una tabla numerada.
  const metaPage = meta?.page;
  const metaTotalPages = meta?.totalPages;
  const effectivePage = metaPage ?? 1;
  const pageCount = metaTotalPages ?? 1;
  const metaLimit = meta?.limit ?? pageSize;
  const metaTotal = meta?.total ?? 0;
  const { from, to } = listPageWindow({ page: effectivePage, limit: metaLimit, total: metaTotal });

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
    <div className="space-y-6">
      <PageHeader
        title="Usuarios internos"
        subtitle={`${meta?.total ?? 0} usuario${(meta?.total ?? 0) !== 1 ? 's' : ''} en total`}
      />

      {activeBulkJobId && !isBulkImportOpen && (
        <PortalAlert
          variant="info"
          title="Importación de usuarios en curso"
          description="La importación sigue en segundo plano. Puedes ver el estado o el resultado cuando termine."
          action={
            <Button type="button" variant="outline" size="sm" onClick={openBulkImport}>
              Ver estado
            </Button>
          }
        />
      )}

      {actionSuccess && !actionError && !tempPassword && (
        <PortalSuccessAlert message={actionSuccess} onDismiss={() => setActionSuccess(null)} />
      )}

      {catalogError && (
        <PortalAlert
          variant="warning"
          title="Catálogo de perfiles"
          description={catalogError}
          icon={AlertTriangle}
        />
      )}

      {error && (
        <PortalAlert
          variant="error"
          title="Incidente en la carga"
          description={error}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadUsers(listParams)}
            >
              Reintentar
            </Button>
          }
          icon={AlertTriangle}
        />
      )}

      <PortalPanel
        eyebrow="Directorio"
        title="Listado de usuarios"
        description="Filtra y gestiona los accesos del equipo interno de la empresa."
        contentClassName="space-y-4"
      >
        <UsersTable
          users={users}
          isLoading={isLoading}
          meta={meta}
          onEdit={openEdit}
          onDelete={openDelete}
          onResetPassword={openResetPassword}
          onLoadMore={handleLoadMore}
          page={isPageMode ? effectivePage : undefined}
          pageCount={isPageMode ? pageCount : undefined}
          from={isPageMode ? from : undefined}
          to={isPageMode ? to : undefined}
          onPageChange={isPageMode ? handlePageChange : undefined}
          pageSize={isPageMode ? pageSize : undefined}
          onPageSizeChange={isPageMode ? setPageSize : undefined}
          isPageMode={isPageMode}
          searchValue={searchDraft}
          statusFilter={filters.status ?? ''}
          roleFilter={filters.role ?? ''}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
          onRoleChange={handleRoleChange}
          onClearFilters={handleClearFilters}
          onCreateUser={openCreate}
          onImportCsv={openBulkImport}
          currentUserId={user?.id}
          currentUserRole={user?.role}
          preparingEditUserId={preparingEditUserId}
        />
      </PortalPanel>

      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          createIdempotencyKeyRef.current = null;
        }}
        onSubmit={handleCreate}
        isSubmitting={isSubmitting}
        error={actionError}
        accessCatalog={accessCatalog}
        availableProfiles={availableProfiles}
        tempPassword={tempPassword}
        tempPasswordEmail={newUserEmail}
        onDismissSuccess={dismissTempPassword}
      />

      <BulkImportUsersModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        resumeJobId={activeBulkJobId}
        onActiveJobChange={setActiveBulkJobId}
        onSuccess={() => {
          void loadUsers(listParams);
        }}
      />

      {/* Modal de contraseña temporal tras reset desde la tabla */}
      {!isCreateOpen && tempPassword && newUserEmail && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              requestDismissTempPassword();
            }
          }}
        >
          <DialogContent aria-labelledby="reset-success-title" className="max-w-sm">
            <DialogHeader className="space-y-1">
              <DialogTitle id="reset-success-title">Contraseña temporal generada</DialogTitle>
              <DialogDescription>
                Entrega esta contraseña a{' '}
                <span className="font-medium text-gray-900 dark:text-white">{newUserEmail}</span>.
                Deberá cambiarla en el próximo inicio de sesión.
              </DialogDescription>
            </DialogHeader>

            {tempConfirmClose && (
              <PortalAlert
                variant="warning"
                title="Contraseña temporal"
                description="¿Ya guardaste la contraseña temporal? No podrás verla de nuevo."
                className="mt-4"
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTempConfirmClose(false)}
                    >
                      Seguir aquí
                    </Button>
                    <Button type="button" variant="lime" size="sm" onClick={dismissTempPassword}>
                      Ya la guardé
                    </Button>
                  </div>
                }
              />
            )}

            <PortalAlert
              variant="warning"
              title="Contraseña de un solo uso"
              description="Esta contraseña solo se muestra una vez. El usuario deberá cambiarla en el próximo inicio de sesión."
              className="mt-4"
            />

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
              <code className="flex-1 break-all font-mono text-sm text-gray-900 dark:text-white select-all">
                {tempPassword}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleCopyTempPassword()}
                className="shrink-0"
                aria-label="Copiar contraseña temporal"
                title="Copiar"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {copyFeedback === 'ok' && (
              <p
                className="mt-2 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-300"
                role="status"
              >
                Contraseña copiada al portapapeles.
              </p>
            )}
            {copyFeedback === 'error' && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
                No se pudo copiar. Selecciona el texto y cópialo manualmente.
              </p>
            )}
            <Button
              type="button"
              variant="primary"
              className="mt-4 w-full rounded-2xl"
              onClick={requestDismissTempPassword}
            >
              Entendido
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {selectedUser && (
        <>
          <EditUserModal
            isOpen={isEditOpen}
            user={selectedUser}
            onClose={closeModals}
            onSubmit={handleEdit}
            onEmailChanged={() => void loadUsers(listParams)}
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
