'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, subscribersApi, type Subscriber360Response } from '@/lib/api-client';

export interface Subscriber360State {
  data: Subscriber360Response | null;
  loading: boolean;
  error: string | null;
  /** `preserveContent` recarga sin volver al esqueleto (tras guardar o cambiar estado). */
  reload: (preserveContent?: boolean) => Promise<void>;
}

/** Lectura 360 del suscriptor para las páginas de servicio (detalle y alta). */
export function useSubscriber360(subscriberId: string): Subscriber360State {
  const [data, setData] = useState<Subscriber360Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (preserveContent = false) => {
      if (!subscriberId) return;
      if (!preserveContent) setLoading(true);
      setError(null);
      try {
        setData(await subscribersApi.get360(subscriberId));
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : 'No fue posible cargar los servicios del suscriptor.',
        );
      } finally {
        setLoading(false);
      }
    },
    [subscriberId],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

/** Ruta de la pestaña Servicios de la ficha, destino de «Volver» y de Cancelar. */
export function subscriberServicesHref(subscriberId: string): string {
  return `/dashboard/crm/subscribers/${subscriberId}?tab=servicios`;
}

export function contractDetailHref(subscriberId: string, contractId: string): string {
  return `/dashboard/crm/subscribers/${subscriberId}/services/${contractId}`;
}

export function newContractHref(subscriberId: string): string {
  return `/dashboard/crm/subscribers/${subscriberId}/services/new`;
}

/**
 * `useRouter` sin romper fuera del App Router (pruebas de componente que montan la
 * pestaña aislada): devuelve `null` en lugar de lanzar. El hook se llama siempre,
 * así que el orden de hooks no cambia.
 */
export function useOptionalRouter(): ReturnType<typeof useRouter> | null {
  try {
    return useRouter();
  } catch {
    return null;
  }
}
