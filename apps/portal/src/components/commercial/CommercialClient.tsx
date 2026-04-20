'use client';

import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialTabLayout } from '@/components/commercial/CommercialTabLayout';

function CommercialSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-20 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
      <div className="h-96 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
    </div>
  );
}

export function CommercialClient() {
  const { user, isLoading: authLoading } = useAuth();

  const canEdit = user?.role === 'ADMIN';

  if (authLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader
          title="Comercial"
          subtitle="Cargando catálogo comercial y reglas operativas del tenant autenticado"
        />
        <main className="flex-1 p-6">
          <CommercialSkeleton />
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Comercial" subtitle="Error al cargar el módulo" />
        <main className="flex-1 p-6">
          <div className="rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] p-6 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle className="h-5 w-5 shrink-0" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-700 dark:text-red-300">
                  Módulo temporalmente no disponible
                </p>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  No fue posible resolver la sesión del portal para cargar el módulo Comercial.
                </p>
                <p className="mt-1 text-sm text-red-700/80 dark:text-red-200/80">
                  Inicia sesión nuevamente para recuperar el acceso al catálogo comercial del
                  tenant.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Comercial"
        subtitle="Gestiona catálogo, precios vigentes y reglas operativas del tenant autenticado"
      />

      <main className="flex-1 p-6">
        <div className="space-y-6">
          <div className="rounded-[24px] border border-white/70 bg-[linear-gradient(135deg,rgba(248,250,245,0.96),rgba(255,255,255,0.92))] px-5 py-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2/90">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Módulo comercial
            </p>
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
              Aquí se concentra la definición de la oferta comercial sin mezclarla con cobertura ni
              con la configuración general del tenant.
            </p>
          </div>

          <CommercialTabLayout canEdit={canEdit} />
        </div>
      </main>
    </div>
  );
}
