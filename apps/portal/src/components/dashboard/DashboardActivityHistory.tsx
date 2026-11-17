'use client';

import { useEffect, useState } from 'react';
import { Button } from '@iwana/ui';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert } from '@/components/shared/portal-ui';
import { auditApi, type AuditLogListResponse } from '@/lib/api-client';
import { RecentActivityPanel } from './RecentActivityPanel';

export function DashboardActivityHistory() {
  const { user, isLoading } = useAuth();
  return (
    <div className="space-y-3">
      <PageHeader title="Historial de actividad" />
      {isLoading ? (
        <RecentActivityPanel status="loading" />
      ) : user?.role === UserRole.ADMIN ? (
        <ActivityPages key={user.id} />
      ) : (
        <PortalAlert variant="error" title="No tienes acceso a este historial" />
      )}
    </div>
  );
}

function ActivityPages() {
  const [cursor, setCursor] = useState<string>();
  const [page, setPage] = useState<AuditLogListResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void auditApi.listPage({ limit: 20, ...(cursor ? { cursor } : {}) }).then(
      (result) => {
        if (cancelled) return;
        setPage(result);
        setStatus('success');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, cursor]);

  const goTo = (nextCursor?: string) => {
    setPage(null);
    setStatus('loading');
    setCursor(nextCursor);
    setAttempt((current) => current + 1);
  };

  return (
    <>
      <RecentActivityPanel
        entries={page?.data ?? null}
        status={status}
        onRetry={() => goTo(cursor)}
      />
      {page && (cursor || page.nextCursor) ? (
        <nav aria-label="Páginas del historial" className="flex flex-wrap gap-2">
          {cursor ? (
            <Button type="button" variant="outline" onClick={() => goTo()}>
              Volver al inicio del historial
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => goTo(page.nextCursor ?? undefined)}
            >
              Ver cambios anteriores
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
