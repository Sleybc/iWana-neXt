'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';

function FieldOperationsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PortalSkeletonBlock className="h-24" />
      <PortalSkeletonBlock className="h-72" />
      <PortalSkeletonBlock className="h-72" />
    </div>
  );
}

export function FieldOperationsSettingsClient() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Despacho técnico"
          subtitle="Cargando horarios y cierres de la agenda técnica"
        />
        <FieldOperationsSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Despacho técnico" subtitle="Sesión no disponible" />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description="No fue posible resolver la sesión del portal para cargar la operación de campo."
          icon={AlertTriangle}
        />
      </div>
    );
  }

  const canEdit = user.role === UserRole.ADMIN;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Despacho técnico"
        subtitle="Configuración de operación de campo y agenda técnica."
      />
      <PortalPanel
        title="Ventana técnica y jornadas"
        description="Los horarios de despacho, overrides por sede y cierres especiales se gestionan en el Calendario operativo."
      >
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {canEdit
                ? 'Edita horarios y cierres WFM desde la sección dedicada.'
                : 'Consulta los horarios WFM en el Calendario operativo.'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Ventana técnica, horario base de despacho y festivos especiales.
            </p>
          </div>
          <Link
            href="/dashboard/settings/calendar"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300 dark:hover:text-white"
          >
            Ir a Calendario operativo y jornadas →
          </Link>
        </div>
      </PortalPanel>
    </div>
  );
}
