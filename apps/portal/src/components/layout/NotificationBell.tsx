'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, BellRing } from 'lucide-react';
import { auditApi, ApiError, type AuditLogEntry } from '@/lib/api-client';
import { cn } from '@iwana/ui';

// Mapea el action crudo del audit log a texto español legible
function formatAuditAction(action: string): string {
  const MAP: Record<string, string> = {
    CREATE: 'Nuevo registro',
    UPDATE: 'Actualización',
    DELETE: 'Eliminación',
    LOGIN: 'Inicio de sesión',
    LOGOUT: 'Cierre de sesión',
  };
  return MAP[action.toUpperCase()] ?? action;
}

// Mapea el entityType crudo a nombre legible en español
function formatAuditEntity(entityType: string): string {
  const MAP: Record<string, string> = {
    ExpedienteRecord: 'Oportunidad',
    ContactAttempt: 'Intento de contacto',
    Expediente: 'Oportunidad',
    User: 'Usuario',
    Tenant: 'Empresa',
    Contract: 'Contrato',
    Quote: 'Cotización',
    Opportunity: 'Oportunidad',
    Contact: 'Contacto',
  };
  return MAP[entityType] ?? entityType;
}

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
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/95 text-gray-500 shadow-iwana-soft transition hover:-translate-y-0.5 hover:bg-[#f8faf5] hover:text-gray-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-white"
      >
        {count > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-iwana-secondary px-1 text-[10px] font-bold text-iwana-primary">
            {Math.min(count, 9)}
          </span>
        )}
        <Bell className={cn('w-5 h-5', tone)} />
      </button>

      <div
        id="portal-notifications-menu"
        ref={dropdownRef}
        role="dialog"
        aria-label="Notificaciones del portal"
        className={cn(
          'absolute right-0 mt-3 w-80 overflow-hidden rounded-[24px] border border-white/70 bg-white/95 shadow-[var(--shadow-iwana-lg)] dark:border-dark-border dark:bg-dark-surface-2/95',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="border-b border-gray-100 px-4 py-4 dark:border-dark-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Centro de actividad
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
            Notificaciones del portal
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Basadas en eventos de auditoría
          </p>
        </div>

        <ul className="max-h-72 overflow-auto py-2">
          {error ? (
            <li className="px-4 py-3">
              <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            </li>
          ) : count === 0 ? (
            <li className="px-4 py-3">
              <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary-300" aria-hidden="true" />
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">Sin actividad reciente</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Cuando existan cambios relevantes del tenant aparecerán aquí.
                  </p>
                </div>
              </div>
            </li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <Link
                  href="/support"
                  className="block rounded-2xl border border-transparent px-3 py-3 transition hover:border-iwana-primary/10 hover:bg-[#f8faf5] dark:hover:border-iwana-primary/20 dark:hover:bg-dark-surface-3"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {formatAuditAction(entry.action)} · {formatAuditEntity(entry.entityType)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatRelativeDate(entry.createdAt)} · ID: {entry.entityId.slice(0, 8).toUpperCase()}
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
