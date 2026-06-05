'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { tenantApi, type TenantListItem } from '@/lib/api-client';
import { cn } from '@iwana/ui';

type NotificationTone = 'error' | 'warning' | 'info' | 'success';

interface OperationalNotification {
  id: string;
  href?: string;
  title: string;
  detail: string;
  meta: string;
  tone: NotificationTone;
  updatedAt: string;
}

const STATUS_LABELS: Record<TenantListItem['status'], string> = {
  ACTIVE: 'Activa',
  PROVISIONING: 'Configuración en curso',
  PROVISIONING_FAILED: 'Configuración fallida',
  SUSPENDED: 'Suspendida',
  INACTIVE: 'Inactiva',
  MARKED_FOR_DELETION: 'En eliminación',
};

const STATUS_TONE: Record<TenantListItem['status'], NotificationTone> = {
  ACTIVE: 'success',
  PROVISIONING: 'warning',
  PROVISIONING_FAILED: 'error',
  SUSPENDED: 'warning',
  INACTIVE: 'info',
  MARKED_FOR_DELETION: 'error',
};

const TONE_PRIORITY: Record<NotificationTone, number> = {
  error: 4,
  warning: 3,
  info: 2,
  success: 1,
};

const toneClasses: Record<NotificationTone, string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
};

function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(updatedAt);
}

function toNotification(tenant: TenantListItem): OperationalNotification {
  const statusLabel = STATUS_LABELS[tenant.status];

  return {
    id: tenant.id,
    href: `/tenants/${tenant.id}/settings`,
    title: tenant.name,
    detail: `${statusLabel} · ${tenant.slug}`,
    meta: `Actualizada ${formatUpdatedAt(tenant.updatedAt)}`,
    tone: STATUS_TONE[tenant.status],
    updatedAt: tenant.updatedAt,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const tenants = await tenantApi.list({ limit: 100, offset: 0 });
      const nextNotifications = tenants
        .map(toNotification)
        .sort((left, right) => {
          const priorityDelta = TONE_PRIORITY[right.tone] - TONE_PRIORITY[left.tone];
          if (priorityDelta !== 0) {
            return priorityDelta;
          }

          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        })
        .slice(0, 5);

      setNotifications(nextNotifications);
    } catch {
      setNotifications([
        {
          id: 'notifications-load-error',
          title: 'No fue posible cargar notificaciones',
          detail: 'Revisa la conexión con la API de plataforma.',
          meta: 'Intento reciente',
          tone: 'error',
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, 60_000);
    return () => window.clearInterval(intervalId);
  }, [loadNotifications]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!open) {
        return;
      }

      if (
        dropdownRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [open]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open]);

  const count = notifications.length;
  const alertCount = notifications.filter(
    (notification) => notification.tone === 'error' || notification.tone === 'warning',
  ).length;
  const tone = useMemo(
    () => (alertCount > 0 ? 'text-iwana-secondary-700 dark:text-iwana-secondary' : ''),
    [alertCount],
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notificaciones"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notifications-menu"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      >
        {alertCount > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-iwana-secondary" />
        )}
        <Bell className={cn('w-5 h-5', tone)} />
      </button>

      <div
        id="notifications-menu"
        ref={dropdownRef}
        role="dialog"
        aria-label="Notificaciones operativas"
        className={cn(
          'absolute right-0 mt-3 w-80 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            Notificaciones operativas
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Basadas en estado real de empresas
          </p>
        </div>

        <ul className="max-h-72 overflow-auto py-2">
          {count === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Sin empresas registradas.
            </li>
          ) : (
            notifications.map((notification) => (
              <li key={notification.id} className="px-4 py-2">
                {notification.href ? (
                  <Link
                    href={notification.href}
                    className="flex gap-3 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setOpen(false)}
                  >
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        toneClasses[notification.tone],
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-800 dark:text-white">
                        {notification.title}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {notification.detail}
                      </span>
                      <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                        {notification.meta}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <div className="flex gap-3 rounded-lg px-3 py-2">
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        toneClasses[notification.tone],
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800 dark:text-white">
                        {notification.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        {notification.detail}
                      </span>
                      <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                        {notification.meta}
                      </span>
                    </span>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
