'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { cn, headerIconControlClassName } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  PortalAlert,
  PortalEmptyState,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { loadAuditFeed, subscribeAuditFeed, type AuditFeedSnapshot } from '@/lib/audit-feed-cache';
import { auditFeedSummary } from '@/lib/audit-vocabulary';

type NotificationTone = 'error' | 'warning' | 'info';

const ERROR_ACTIONS = new Set([
  'DELETE',
  'ACCOUNT_LOCKED',
  'MFA_DISABLED',
  'TENANT_SUSPENDED',
  'LOGIN_FAILED',
]);

const WARNING_ACTIONS = new Set([
  'MFA_ENABLED',
  'MFA_SETUP_INITIATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_COMPLETED',
  'TENANT_PROVISIONED',
]);

function toneForAction(action: string): NotificationTone {
  const normalized = action.trim().toUpperCase();
  if (ERROR_ACTIONS.has(normalized)) {
    return 'error';
  }
  if (WARNING_ACTIONS.has(normalized)) {
    return 'warning';
  }
  return 'info';
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

function renderBellTime(value: string) {
  const date = new Date(value);
  const label = formatRelativeDate(value);
  if (Number.isNaN(date.getTime())) {
    return label;
  }
  return (
    <time dateTime={value} className="font-mono tabular-nums">
      {label}
    </time>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AuditFeedSnapshot | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const canViewAuditNotifications = new Set(['ADMIN', 'SYSTEM_ADMIN']).has(user?.role ?? '');
  const closePopover = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!canViewAuditNotifications) {
      setSnapshot(null);
      return;
    }

    const unsubscribe = subscribeAuditFeed(setSnapshot);
    void loadAuditFeed().catch(() => undefined);
    const intervalId = window.setInterval(() => {
      void loadAuditFeed({ force: true }).catch(() => undefined);
    }, 60_000);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [canViewAuditNotifications]);

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

      closePopover();
    };

    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [closePopover, open]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (open && event.key === 'Escape') {
        closePopover(true);
      }
    };

    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [closePopover, open]);

  const entries = (snapshot?.entries ?? []).slice(0, 5);
  const error = snapshot?.error ?? null;
  const count = entries.length;
  // Peor tono presente — urgencia usa warning/error; lima no significa «hay avisos».
  const worstAlertTone = useMemo<'error' | 'warning' | null>(() => {
    if (error) {
      return 'error';
    }
    if (entries.some((entry) => toneForAction(entry.action) === 'error')) {
      return 'error';
    }
    if (entries.some((entry) => toneForAction(entry.action) === 'warning')) {
      return 'warning';
    }
    return null;
  }, [entries, error]);
  const iconTone =
    worstAlertTone === 'error'
      ? 'text-error-600 dark:text-error-400'
      : worstAlertTone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : '';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Notificaciones"
        aria-controls="portal-notifications-menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn('relative', headerIconControlClassName, interactiveFocusClassName)}
      >
        {worstAlertTone && (
          <span
            className={cn(
              'absolute top-1 right-1 h-2 w-2 rounded-full',
              worstAlertTone === 'error' ? 'bg-error-500' : 'bg-amber-500',
            )}
          />
        )}
        <Bell className={cn('w-5 h-5', iconTone)} />
      </button>

      <div
        id="portal-notifications-menu"
        ref={dropdownRef}
        role="region"
        aria-label="Centro de actividad del portal"
        className={cn(
          'absolute right-0 mt-3 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2',
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
            Basadas en el historial de cambios
          </p>
        </div>

        <ul className="max-h-72 overflow-auto py-2">
          {error ? (
            <li className="px-4 py-3">
              <PortalAlert
                variant="error"
                title="No fue posible cargar la actividad"
                description={error}
              />
            </li>
          ) : count === 0 ? (
            <li className="px-4 py-3">
              <PortalEmptyState
                title="Sin actividad reciente"
                description="Cuando existan cambios relevantes de la empresa aparecerán aquí."
                icon={BellRing}
              />
            </li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white">
                    {auditFeedSummary(entry.action, entry.entityType)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {renderBellTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
