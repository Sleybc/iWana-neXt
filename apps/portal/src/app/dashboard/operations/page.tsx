// apps/portal/src/app/dashboard/operations/page.tsx
// Despachador de deep links de la raíz (spec 2026-09-13 §4.2) — Server
// Component. `redirect()` emite 307: NUNCA `permanentRedirect()` (308), que el
// navegador cachea de forma persistente y no permite corregir el mapeo.
//
// La raíz es compatibilidad permanente, no una etapa de migración: esas URLs
// viajan en notificaciones, correos e historial. Las ramas reconocidas
// preservan la query completa; una query sin ninguna llave reconocida cae en
// la rama landing (D-A7), resuelta en cliente por `OperationsLandingRedirect`
// porque la elección de pestaña por permiso es de cliente (dictamen G3 §3.1).
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { OperationsLandingRedirect } from '@/components/operations/OperationsLandingRedirect';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';

type OperationsSearchParams = Record<string, string | string[] | undefined>;

function buildQueryString(params: OperationsSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    } else if (typeof value === 'string') {
      query.append(key, value);
    }
  }
  return query.toString();
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<OperationsSearchParams>;
}) {
  const params = await searchParams;
  const query = buildQueryString(params);
  const redirectPreservingQuery = (pathname: string) => {
    redirect(query ? `${pathname}?${query}` : pathname);
  };

  if (params.executionOrderId !== undefined) {
    // Deep link legado de notificaciones y de Programación (R2): sigue vivo.
    redirectPreservingQuery('/dashboard/operations/execution-orders');
  }

  if (params.ticketId !== undefined) {
    // Alta de tarea con contexto de mesa de ayuda (AssuranceClient).
    redirectPreservingQuery('/dashboard/operations/tasks/new');
  }

  if (params.taskId !== undefined) {
    // Detalle de tarea (deep link de la bandeja y del alta exitosa, D-A3).
    redirectPreservingQuery('/dashboard/operations/tasks');
  }

  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-48" />}>
      <OperationsLandingRedirect />
    </Suspense>
  );
}
