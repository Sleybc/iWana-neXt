'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { UserCreateModal } from '@/components/users/UserCreateModal';
import { UserManagementModal } from '@/components/users/UserManagementModal';
import { UsersTable } from '@/components/users/UsersTable';
import { tenantApi, type TenantListItem, type UserListItem, usersApi } from '@/lib/api-client';

/**
 * Selector de tenant personalizado con dropdown estilizado.
 * Reemplaza el <select> nativo para tener control total sobre bordes y lista desplegable.
 */
function TenantSelect({
  tenants,
  value,
  onChange,
}: {
  tenants: TenantListItem[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedName = tenants.find((t) => t.slug === value)?.name ?? 'Seleccionar empresa';

  /** Calcula si hay espacio debajo antes de abrir */
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setOpenUpward(window.innerHeight - rect.bottom < 200);
    }
    setOpen((prev) => !prev);
  };

  /** Cierra al hacer clic fuera */
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  /** Cierra al presionar Escape */
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      {/* Botón disparador */}
      <button
        type="button"
        aria-label="Seleccionar tenant"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={handleToggle}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-300 bg-white pl-3 pr-3 text-sm text-gray-700 hover:border-iwana-primary focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 focus:border-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 transition-colors"
      >
        <span className="max-w-[180px] truncate">{selectedName}</span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Lista de opciones */}
      {open && tenants.length > 0 && (
        <ul
          role="listbox"
          aria-label="Seleccionar tenant"
          className={`absolute left-0 z-20 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-dark-surface-2 ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {tenants.map((tenant) => (
            <li key={tenant.id} role="option" aria-selected={tenant.slug === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(tenant.slug);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  tenant.slug === value
                    ? 'bg-iwana-primary/10 text-iwana-primary font-medium dark:bg-iwana-primary/20 dark:text-iwana-primary-300'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-surface-3'
                }`}
              >
                {tenant.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  /** Incrementar para forzar recarga del listado desde el servidor. */
  const [refreshKey, setRefreshKey] = useState(0);

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
  }, [tenantSlug, cursor, refreshKey]);

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
        <TenantSelect
          tenants={tenants}
          value={tenantSlug}
          onChange={(slug) => {
            setTenantSlug(slug);
            setCursor(undefined);
            setCursorHistory([]);
            setNextCursor(null);
          }}
        />

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
