// apps/portal/src/components/users/UsersTable.tsx
'use client';

import type { InternalUser, UsersPaginationMeta } from '@/lib/api-client';
import { isPlatformOnlyRole, UserRole, UserStatus } from '@iwana/shared';
import { Pencil, Plus, Trash2, ShieldCheck, KeyRound, Loader2, Upload } from 'lucide-react';
import { Badge, Button, Select, cn } from '@iwana/ui';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  getPortalUserStatusVariant,
  PORTAL_TENANT_ROLE_FILTER_OPTIONS,
  PORTAL_USER_STATUS_FILTER_OPTIONS,
} from '@/lib/user-labels';
import {
  PortalActionToolbar,
  PortalDataTableHead,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableInactiveRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { canDeleteUser, getDeleteUserBlockedReason } from './can-delete-user';

const TABLE_HEADERS = [
  { id: 'user', label: 'Usuario', className: 'min-w-[180px]' },
  { id: 'role', label: 'Rol', className: 'min-w-[140px]' },
  { id: 'status', label: 'Estado', className: 'min-w-[110px]' },
  {
    id: 'mfa',
    label: 'Verificación en dos pasos',
    className: 'hidden md:table-cell min-w-[140px]',
  },
  { id: 'lastLogin', label: 'Último acceso', className: 'hidden sm:table-cell min-w-[140px]' },
  { id: 'created', label: 'Creado', className: 'hidden lg:table-cell min-w-[140px]' },
  { id: 'actions', label: 'Acciones', className: 'w-[140px] text-right' },
] as const;

const SKELETON_ROW_COUNT = 5;

interface UsersTableProps {
  users: InternalUser[];
  isLoading: boolean;
  meta: UsersPaginationMeta | null;
  onEdit: (user: InternalUser) => void;
  onDelete: (user: InternalUser) => void;
  onResetPassword: (user: InternalUser) => void;
  onLoadMore: () => void;
  /** ADR-065 page-based props (randomAccess=true). */
  page?: number | undefined;
  pageCount?: number | undefined;
  from?: number | undefined;
  to?: number | undefined;
  /** ADR-065 page navigation callback. */
  onPageChange?: ((page: number) => void) | undefined;
  /** ADR-065 page-size callback. */
  pageSize?: number | undefined;
  onPageSizeChange?: ((pageSize: number) => void) | undefined;
  /** La modalidad la declara `meta.capabilities.randomAccess`, nunca la UI local. */
  isPageMode?: boolean | undefined;
  /** Criterios controlados desde UsersClient (única fuente de verdad). */
  searchValue: string;
  statusFilter: string;
  roleFilter: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onClearFilters: () => void;
  /** Abre el flujo de alta (toolbar y empty state de primera vez). */
  onCreateUser: () => void;
  /** Abre la importación masiva por CSV. */
  onImportCsv: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  /** Id del usuario cuya edición se está preparando (FE-11). */
  preparingEditUserId?: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isInactiveRowStatus(status: string): boolean {
  return status === UserStatus.INACTIVE || status === UserStatus.SUSPENDED;
}

interface UserRowActionsProps {
  user: InternalUser;
  deleteAllowed: boolean;
  deleteBlockedReason: string | null;
  deleteBlockedId: string;
  preparingEditUserId: string | null;
  isPreparingEdit: boolean;
  onEdit: (user: InternalUser) => void;
  onDelete: (user: InternalUser) => void;
  onResetPassword: (user: InternalUser) => void;
}

function UserRowActions({
  user,
  deleteAllowed,
  deleteBlockedReason,
  deleteBlockedId,
  preparingEditUserId,
  isPreparingEdit,
  onEdit,
  onDelete,
  onResetPassword,
}: UserRowActionsProps) {
  const rowBusy = Boolean(preparingEditUserId);

  return (
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
        disabled={rowBusy}
        aria-busy={isPreparingEdit}
        aria-label={`Editar usuario ${user.email}`}
        title={`Editar usuario ${user.email}`}
      >
        {isPreparingEdit ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Pencil className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onResetPassword(user)}
        disabled={rowBusy}
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
        disabled={!deleteAllowed || rowBusy}
        className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
        aria-label={`Eliminar usuario ${user.email}`}
        title={deleteBlockedReason ?? 'Eliminar usuario'}
        aria-describedby={!deleteAllowed && deleteBlockedReason ? deleteBlockedId : undefined}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
      {!deleteAllowed && deleteBlockedReason ? (
        <span id={deleteBlockedId} className="sr-only">
          {deleteBlockedReason}
        </span>
      ) : null}
    </PortalActionToolbar>
  );
}

export function UsersTable({
  users,
  isLoading,
  meta,
  onEdit,
  onDelete,
  onResetPassword,
  onLoadMore,
  page,
  pageCount,
  from,
  to,
  onPageChange,
  pageSize,
  onPageSizeChange,
  isPageMode = false,
  searchValue,
  statusFilter,
  roleFilter,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onClearFilters,
  onCreateUser,
  onImportCsv,
  currentUserId,
  currentUserRole,
  preparingEditUserId = null,
}: UsersTableProps) {
  const hasActiveFilters = Boolean(statusFilter || roleFilter || searchValue);
  const hasMore = Boolean(meta?.nextCursor);
  const total = meta?.total ?? users.length;
  const loadingAnnouncement =
    isLoading && users.length === 0
      ? 'Cargando usuarios'
      : isLoading
        ? 'Actualizando listado de usuarios'
        : `${users.length} usuarios mostrados`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <PortalSearchField
            id="search-filter"
            value={searchValue}
            onChange={onSearchChange}
            placeholder="Buscar por nombre o correo…"
            label="Buscar usuario"
            className="min-w-0 flex-1"
          />
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="h-11 min-h-11 w-full px-3 sm:w-auto"
              onClick={onCreateUser}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Nuevo usuario
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 min-h-11 w-full px-3 sm:w-auto"
              onClick={onImportCsv}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Importar CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[220px_220px_auto] lg:items-end">
          <Select
            id="status-filter"
            label="Estado"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="h-12"
            options={PORTAL_USER_STATUS_FILTER_OPTIONS}
          />
          <Select
            id="role-filter"
            label="Rol"
            value={roleFilter}
            onChange={(e) => onRoleChange(e.target.value)}
            className="h-12"
            options={PORTAL_TENANT_ROLE_FILTER_OPTIONS}
          />
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onClearFilters}
              className="h-12 px-4"
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loadingAnnouncement}
      </div>

      <div className={portalDataTableShellClassName}>
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[720px] border-collapse text-sm"
            aria-label="Listado de usuarios internos"
          >
            <caption className="sr-only">
              Usuarios internos de la empresa con rol, estado, verificación en dos pasos y acciones
              de gestión
            </caption>
            <thead className={portalDataTableHeadRowClassName}>
              <tr>
                {TABLE_HEADERS.map((header) => (
                  <PortalDataTableHead key={header.id} className={header.className}>
                    {header.label}
                  </PortalDataTableHead>
                ))}
              </tr>
            </thead>
            <tbody className={portalDataTableBodyClassName}>
              {isLoading && users.length === 0 && (
                <>
                  {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                    <tr key={`users-skeleton-${index}`}>
                      <td className={portalDataTableCellClassName} colSpan={TABLE_HEADERS.length}>
                        <PortalSkeletonBlock className="h-10 w-full rounded-xl" />
                      </td>
                    </tr>
                  ))}
                </>
              )}

              {!isLoading && users.length === 0 && (
                <tr>
                  <td
                    colSpan={TABLE_HEADERS.length}
                    className={cn(portalDataTableCellClassName, 'py-12')}
                  >
                    {hasActiveFilters ? (
                      <PortalEmptyState
                        embedded
                        title="Sin resultados"
                        description="Ningún usuario coincide con los filtros actuales."
                        className="w-full text-left"
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onClearFilters}
                          >
                            Limpiar filtros
                          </Button>
                        }
                      />
                    ) : (
                      <div className="relative w-full overflow-hidden">
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-iwana-secondary/5"
                        />
                        <PortalEmptyState
                          embedded
                          title="Aún no hay usuarios"
                          description="Crea el primer usuario interno para gestionar los accesos de tu equipo."
                          className="relative w-full text-left"
                          action={
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={onCreateUser}
                            >
                              Nuevo usuario
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </td>
                </tr>
              )}

              {users.map((user) => {
                const deleteRuleParams = {
                  targetId: user.id,
                  targetRole: user.role,
                  targetIsPrincipalAdmin: user.isPrincipalAdmin,
                  actorUserId: currentUserId,
                  actorRole: currentUserRole,
                };
                const deleteAllowed = canDeleteUser(deleteRuleParams);
                const deleteBlockedReason = getDeleteUserBlockedReason(deleteRuleParams);
                const isPreparingEdit = preparingEditUserId === user.id;
                const deleteBlockedId = `delete-blocked-${user.id}`;

                return (
                  <tr
                    key={user.id}
                    className={cn(
                      portalTableRowHoverClassName,
                      isInactiveRowStatus(user.status) && portalDataTableInactiveRowClassName,
                    )}
                  >
                    <td className={portalDataTableCellClassName}>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </span>
                      </div>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                          {(user.role === UserRole.ADMIN || isPlatformOnlyRole(user.role)) && (
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
                              ? 'text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400'
                              : 'text-xs text-gray-500 dark:text-gray-400'
                          }
                        >
                          {user.isOperationalResource ? 'Despacho operativo' : 'Agenda general'}
                        </span>
                      </div>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getPortalUserStatusVariant(user.status)}>
                        {getPortalUserStatusLabel(user.status)}
                      </Badge>
                    </td>
                    <td className={cn(portalDataTableCellClassName, 'hidden md:table-cell')}>
                      <div className="flex flex-col gap-0.5">
                        {user.mfaEnabled ? (
                          <>
                            <span className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
                              Habilitado
                            </span>
                            {user.mfaRequired && (
                              <span className="text-xs text-amber-700 dark:text-amber-400">
                                Requerido
                              </span>
                            )}
                          </>
                        ) : user.mfaRequired ? (
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            Requerido
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            No configurado
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={cn(
                        portalDataTableCellClassName,
                        'hidden font-mono tabular-nums text-gray-500 sm:table-cell dark:text-gray-400',
                      )}
                    >
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td
                      className={cn(
                        portalDataTableCellClassName,
                        'hidden font-mono tabular-nums text-gray-500 lg:table-cell dark:text-gray-400',
                      )}
                    >
                      {formatDate(user.createdAt)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <UserRowActions
                        user={user}
                        deleteAllowed={deleteAllowed}
                        deleteBlockedReason={deleteBlockedReason}
                        deleteBlockedId={deleteBlockedId}
                        preparingEditUserId={preparingEditUserId}
                        isPreparingEdit={isPreparingEdit}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onResetPassword={onResetPassword}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isPageMode &&
        onPageChange &&
        page !== undefined &&
        pageCount !== undefined &&
        from !== undefined &&
        to !== undefined &&
        total > 0 ? (
          <PortalTablePager
            page={page}
            pageCount={Math.max(1, pageCount)}
            onPageChange={onPageChange}
            from={from}
            to={to}
            total={total}
            resource={{ singular: 'usuario', plural: 'usuarios' }}
            loading={isLoading}
            pageSizeControl={
              pageSize !== undefined && onPageSizeChange ? (
                <PortalPageSizeSelect
                  value={pageSize}
                  onChange={onPageSizeChange}
                  disabled={isLoading}
                />
              ) : undefined
            }
          />
        ) : (
          <PortalTablePagination
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            loading={isLoading}
            resourceLabel="usuarios"
            shown={users.length}
            total={total}
          />
        )}
      </div>
    </div>
  );
}
