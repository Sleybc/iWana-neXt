'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { auditApi, ApiError, type AuditLogEntry } from '@/lib/api-client';
import { cn } from '@iwana/ui';

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'reciente';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const logs = await auditApi.list({ limit: 10 });
      setEntries(logs.slice(0, 5));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Sin permisos para ver auditoría.');
      } else {
        setError('No fue posible cargar notificaciones.');
      }
      setEntries([]);
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

  const count = entries.length;
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
        aria-controls="portal-notifications-menu"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      >
        {count > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-iwana-secondary" />
        )}
        <Bell className={cn('w-5 h-5', tone)} />
      </button>

      <div
        id="portal-notifications-menu"
        ref={dropdownRef}
        role="dialog"
        aria-label="Notificaciones del portal"
        className={cn(
          'absolute right-0 mt-3 w-80 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">
            Notificaciones del portal
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Basadas en eventos de auditoría
          </p>
        </div>

        <ul className="max-h-72 overflow-auto py-2">
          {error ? (
            <li className="px-4 py-3 text-sm text-red-500 dark:text-red-400">{error}</li>
          ) : count === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Sin actividad reciente.
            </li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <Link
                  href="/support"
                  className="block rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {entry.action} · {entry.entityType}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatRelativeDate(entry.createdAt)} · Ref: {entry.entityId}
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
