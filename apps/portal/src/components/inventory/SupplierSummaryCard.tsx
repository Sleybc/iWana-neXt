'use client';

import type { SupplierSummaryRecord } from '@/lib/api-client';
import { PortalPanel } from '@/components/shared/portal-ui';

interface SupplierSummaryCardProps {
  summary: SupplierSummaryRecord | null;
  isLoading?: boolean;
  error?: string | null;
}

export function SupplierSummaryCard({ summary, isLoading, error }: SupplierSummaryCardProps) {
  if (isLoading) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-300">Cargando ficha del proveedor…</p>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!summary) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-300">
        Selecciona un proveedor para ver su ficha resumida.
      </p>
    );
  }

  return (
    <PortalPanel
      eyebrow="Proveedor"
      title={summary.displayName}
      description="Ficha operativa resumida."
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-iwana-secondary-700 dark:text-iwana-secondary">Contacto principal</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">
            {summary.primaryContact ?? 'Sin contacto'}
          </dd>
        </div>
        <div>
          <dt className="text-iwana-secondary-700 dark:text-iwana-secondary">Teléfono</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.phone ?? 'Sin teléfono'}</dd>
        </div>
        <div>
          <dt className="text-iwana-secondary-700 dark:text-iwana-secondary">Correo</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.email ?? 'Sin correo'}</dd>
        </div>
        <div>
          <dt className="text-iwana-secondary-700 dark:text-iwana-secondary">Ciudad</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.city ?? 'Sin ciudad'}</dd>
        </div>
        <div>
          <dt className="text-iwana-secondary-700 dark:text-iwana-secondary">Estado</dt>
          <dd className="mt-1 text-gray-900 dark:text-white">{summary.status}</dd>
        </div>
      </dl>
    </PortalPanel>
  );
}
