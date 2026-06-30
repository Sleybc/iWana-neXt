'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformTenantPicker } from '@/components/shared/PlatformTenantPicker';
import { UserCreateModal } from '@/components/users/UserCreateModal';
import { UserManagementModal } from '@/components/users/UserManagementModal';
import { UsersTable } from '@/components/users/UsersTable';
import { tenantApi, type TenantListItem, type UserListItem, usersApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY, getPlatformUsersSubtitle } from '@/lib/platform-ui-copy';

export default function UsersPage() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  /** Incrementar para forzar recarga del listado desde el servidor. */
  const [refreshKey, setRefreshKey] = useState(0);
  /** Error visible al cargar usuarios — muestra el mensaje real del API. */
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestedTenantSlug = searchParams.get('tenant')?.trim() ?? '';
  const requestedSearch = searchParams.get('search')?.trim() ?? '';
  const requestedUserId = searchParams.get('openUser')?.trim() ?? '';

  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await tenantApi.list({ limit: 100, offset: 0 });
        const active = list.filter((item) => item.status === 'ACTIVE');
        setTenants(active);
        const initialTenant =
          active.find((item) => item.slug === requestedTenantSlug) ?? active[0] ?? null;

        if (initialTenant) {
          setTenantSlug(initialTenant.slug);
        }
      } catch {
        setTenants([]);
        setTenantSlug('');
      }
    };

    void loadTenants();
  }, [requestedTenantSlug]);

  const loadUsers = useCallback(async () => {
    if (!tenantSlug) {
      setUsers([]);
      setTotalUsers(0);
      setNextCursor(null);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const params = cursor
        ? { cursor, limit: 20, ...(requestedSearch ? { search: requestedSearch } : {}) }
        : { limit: 20, ...(requestedSearch ? { search: requestedSearch } : {}) };
      const response = await usersApi.list(tenantSlug, params);
      setUsers(response.data ?? []);
      setTotalUsers(response.meta?.total ?? 0);
      setNextCursor(response.meta?.nextCursor ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar usuarios.';
      setLoadError(message);
      setUsers([]);
      setTotalUsers(0);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, cursor, refreshKey, requestedSearch]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!requestedUserId) {
      return;
    }

    const matchedUser = users.find((user) => user.id === requestedUserId);
    if (matchedUser) {
      setSelectedUser(matchedUser);
    }
  }, [requestedUserId, users]);

  const selectedTenantName = useMemo(() => {
    return tenants.find((tenant) => tenant.slug === tenantSlug)?.name ?? 'Sin empresa';
  }, [tenantSlug, tenants]);

  const emptyState = useMemo(() => {
    if (loadError && tenantSlug) {
      return {
        title: `No pudimos mostrar los usuarios de ${selectedTenantName}.`,
        description: 'Reintenta la carga para volver a consultar los accesos internos.',
      };
    }

    if (!tenantSlug) {
      if (tenants.length === 0) {
        return {
          title: 'No hay empresas activas disponibles.',
          description: 'Cuando actives una empresa, podrás revisar aquí sus usuarios internos.',
        };
      }

      return {
        title: 'Selecciona una empresa para revisar usuarios internos.',
        description: 'Elige una empresa del listado para ver su equipo y gestionar accesos.',
      };
    }

    if (requestedSearch) {
      return {
        title: `No encontramos usuarios en ${selectedTenantName}.`,
        description: 'Revisa el criterio de búsqueda o crea un usuario interno para continuar.',
      };
    }

    return {
      title: `Aún no hay usuarios internos en ${selectedTenantName}.`,
      description: 'Crea el primer usuario interno para empezar a gestionar accesos.',
    };
  }, [loadError, requestedSearch, selectedTenantName, tenantSlug, tenants.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={PLATFORM_UI_COPY.users.title}
        subtitle={getPlatformUsersSubtitle(tenantSlug ? selectedTenantName : null)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <PlatformTenantPicker
          tenants={tenants}
          value={tenantSlug}
          onChange={(slug) => {
            setTenantSlug(slug);
            setCursor(undefined);
            setCursorHistory([]);
            setNextCursor(null);
          }}
          ariaLabel={PLATFORM_UI_COPY.shared.selectTenant}
        />

        <Button type="button" onClick={() => setOpenCreateModal(true)} disabled={!tenantSlug}>
          {PLATFORM_UI_COPY.users.createAction}
        </Button>
      </div>

      {/* Error visible — facilita el diagnóstico de problemas de API */}
      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          <strong>Error al cargar usuarios:</strong> {loadError}
          <button
            type="button"
            className="ml-3 underline hover:no-underline"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      <UsersTable
        users={users}
        isLoading={isLoading}
        total={totalUsers}
        hasNextPage={Boolean(nextCursor)}
        hasPrevPage={cursorHistory.length > 0}
        tenantName={tenantSlug ? selectedTenantName : undefined}
        emptyStateTitle={emptyState.title}
        emptyStateDescription={emptyState.description}
        onPrev={() => {
          const previousCursor = cursorHistory[cursorHistory.length - 1];
          setCursor(previousCursor);
          setCursorHistory((prev) => prev.slice(0, -1));
        }}
        onNext={() => {
          if (!nextCursor) {
            return;
          }
          setCursorHistory((prev) => [...prev, cursor]);
          setCursor(nextCursor);
        }}
        onManage={(user) => setSelectedUser(user)}
      />

      <UserCreateModal
        open={openCreateModal}
        tenantSlug={tenantSlug}
        onClose={() => setOpenCreateModal(false)}
        onCreated={() => {
          // Volver a la primera página y recargar desde el servidor
          setCursor(undefined);
          setCursorHistory([]);
          setRefreshKey((k) => k + 1);
        }}
      />

      <UserManagementModal
        open={Boolean(selectedUser)}
        tenantSlug={tenantSlug}
        tenantName={selectedTenantName}
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSaved={(updatedUser) => {
          setUsers((prev) => prev.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
          setSelectedUser(updatedUser);
        }}
        onDeleted={() => {
          // Recargar lista desde el servidor tras eliminar
          setCursor(undefined);
          setCursorHistory([]);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
