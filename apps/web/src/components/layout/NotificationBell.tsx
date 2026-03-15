'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { tenantApi, type TenantListItem } from '@/lib/api-client';
import { cn } from '@iwana/ui';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<TenantListItem[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const tenants = await tenantApi.list({ limit: 30, offset: 0 });
      setNotifications(tenants.filter((tenant) => tenant.status !== 'ACTIVE').slice(0, 5));
    } catch {
      setNotifications([]);
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
  const tone = useMemo(
    () => (count > 0 ? 'text-iwana-secondary-700 dark:text-iwana-secondary' : ''),
    [count],
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notificaciones"
        aria-haspopup="dialog"
        aria-controls="notifications-menu"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      >
        {count > 0 && (
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
            Basadas en estado real de tenants
          </p>
        </div>

        <ul className="max-h-72 overflow-auto py-2">
          {count === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Sin alertas activas.
            </li>
          ) : (
            notifications.map((tenant) => (
              <li key={tenant.id} className="px-4 py-2">
                <Link
                  href={`/tenants/${tenant.id}`}
                  className="block rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{tenant.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Estado: {tenant.status.toLowerCase()} · Slug: {tenant.slug}
                  </p>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
