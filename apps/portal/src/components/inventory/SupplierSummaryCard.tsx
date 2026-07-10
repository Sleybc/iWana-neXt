'use client';

import type { SupplierSummaryRecord } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { getPartyStatusLabel } from './inventory-labels';

interface SupplierSummaryCardProps {
  summary: SupplierSummaryRecord | null;
  isLoading?: boolean;
  error?: string | null;
}

export function SupplierSummaryCard({ summary, isLoading, error }: SupplierSummaryCardProps) {
  if (isLoading) {
    return <PortalSkeletonBlock className="h-32 rounded-2xl" />;
  }

  if (error) {
    return (
      <PortalAlert variant="error" title="No fue posible cargar el proveedor" description={error} />
    );
  }

  if (!summary) {
    return (
      <PortalEmptyState
        title="Sin proveedor seleccionado"
        description="Selecciona un proveedor para ver su ficha resumida."
      />
    );
  }

  return (
    <PortalPanel
      eyebrow="Proveedor"
      title={summary.displayName}
      description="Resumen de la ficha del proveedor."
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="portal-eyebrow-muted">Contacto principal</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">
            {summary.primaryContact ?? 'Sin contacto'}
          </dd>
        </div>
        <div>
          <dt className="portal-eyebrow-muted">Teléfono</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.phone ?? 'Sin teléfono'}</dd>
        </div>
        <div>
          <dt className="portal-eyebrow-muted">Correo</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.email ?? 'Sin correo'}</dd>
        </div>
        <div>
          <dt className="portal-eyebrow-muted">Ciudad</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.city ?? 'Sin ciudad'}</dd>
        </div>
        <div>
          <dt className="portal-eyebrow-muted">Estado</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">
            {getPartyStatusLabel(summary.status)}
          </dd>
        </div>
      </dl>
    </PortalPanel>
  );
}
