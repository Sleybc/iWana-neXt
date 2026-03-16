'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { UserCreateModal } from '@/components/users/UserCreateModal';
import { UserManagementModal } from '@/components/users/UserManagementModal';
import { UsersTable } from '@/components/users/UsersTable';
import { tenantApi, type TenantListItem, type UserListItem, usersApi } from '@/lib/api-client';

export default function UsersPage() {
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

  useEffect(() => {
    const loadTenants = async () => {
      const list = await tenantApi.list({ limit: 100, offset: 0 });
      const active = list.filter((item) => item.status === 'ACTIVE');
      setTenants(active);
      if (active[0]) {
        setTenantSlug(active[0].slug);
      }
    };

    loadTenants();
  }, []);

  const loadUsers = useCallback(async () => {
    if (!tenantSlug) {
      setUsers([]);
      setTotalUsers(0);
      setNextCursor(null);
      return;
    }

    setIsLoading(true);
    try {
      const params = cursor ? { cursor, limit: 20 } : { limit: 20 };
      const response = await usersApi.list(tenantSlug, params);
      setUsers(response.data ?? []);
      setTotalUsers(response.meta?.total ?? 0);
      setNextCursor(response.meta?.nextCursor ?? null);
    } catch {
      setUsers([]);
      setTotalUsers(0);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantSlug, cursor]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const selectedTenantName = useMemo(() => {
    return tenants.find((tenant) => tenant.slug === tenantSlug)?.name ?? 'Sin tenant';
  }, [tenantSlug, tenants]);

  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios" subtitle={`Gestión interna de ${selectedTenantName}`} />

      <div className="flex flex-wrap items-center gap-2">
        {/* Selector de tenant con icono custom y bordes redondeados */}
        <div className="relative">
          <select
            aria-label="Seleccionar tenant"
            title="Seleccionar tenant"
            value={tenantSlug}
            onChange={(event) => {
              setTenantSlug(event.target.value);
              setCursor(undefined);
              setCursorHistory([]);
              setNextCursor(null);
            }}
            className="h-10 appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-9 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.slug}>
                {tenant.name}
              </option>
            ))}
          </select>
          {/* Flecha custom: pointer-events-none para no interferir con el click */}
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
        </div>

        <Button type="button" onClick={() => setOpenCreateModal(true)} disabled={!tenantSlug}>
          Crear usuario
        </Button>
      </div>

      <UsersTable
        users={users}
        isLoading={isLoading}
        total={totalUsers}
        hasNextPage={Boolean(nextCursor)}
        hasPrevPage={cursorHistory.length > 0}
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
        onCreated={(user) => {
          setUsers((prev) => [user, ...prev]);
          setTotalUsers((prev) => prev + 1);
        }}
      />

      <UserManagementModal
        open={Boolean(selectedUser)}
        tenantSlug={tenantSlug}
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSaved={(updatedUser) => {
          setUsers((prev) => prev.map((item) => (item.id === updatedUser.id ? updatedUser : item)));
          setSelectedUser(updatedUser);
        }}
        onDeleted={(userId) => {
          setUsers((prev) => prev.filter((item) => item.id !== userId));
          setTotalUsers((prev) => Math.max(0, prev - 1));
        }}
      />
    </div>
  );
}
