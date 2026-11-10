'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button, cn } from '@iwana/ui';
import {
  PortalAlert,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { subscriberServicesHref } from './use-subscriber-360';

/** Enlace «Volver a servicios» de las páginas de servicio. */
export function BackToServicesLink({ subscriberId }: { subscriberId: string }) {
  return (
    <Link
      href={subscriberServicesHref(subscriberId)}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300',
        interactiveFocusClassName,
      )}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Volver a servicios
    </Link>
  );
}

/** Estados de carga y error compartidos por el detalle y el alta de servicio. */
export function ServicePageFrame({
  subscriberId,
  loading,
  error,
  onRetry,
  notFound,
  children,
}: {
  subscriberId: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Mensaje cuando la ficha cargó pero el recurso pedido no existe. */
  notFound?: { title: string; description: string } | null;
  children: () => ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <p className="sr-only" role="status">
          Cargando el servicio
        </p>
        <PortalSkeletonBlock className="h-24 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PortalSkeletonBlock className="h-64 rounded-xl" />
          <PortalSkeletonBlock className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-4">
        <BackToServicesLink subscriberId={subscriberId} />
        <PortalAlert
          variant="error"
          live="assertive"
          title="No pudimos cargar el servicio"
          description={error}
          action={
            <Button type="button" variant="secondary" className="min-h-11" onClick={onRetry}>
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="space-y-4">
        <BackToServicesLink subscriberId={subscriberId} />
        <PortalAlert variant="warning" title={notFound.title} description={notFound.description} />
      </div>
    );
  }
  return <>{children()}</>;
}
