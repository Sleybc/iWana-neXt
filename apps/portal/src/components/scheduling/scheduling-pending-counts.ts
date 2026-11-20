'use client';

import { useEffect, useState } from 'react';
import { ScheduleEventStatus, VisitRequestStatus } from '@iwana/shared';
import { wfmApi } from '@/lib/api-client';

/**
 * Conteos junto a los accesos del encabezado de la agenda (spec MOD09 agenda §3 H, CA-11).
 * Cada total sale de `meta.total` de las mismas consultas que cargan su bandeja, con
 * `limit: 1`: pendientes = carga por defecto de la bandeja de pendientes (todos los estados);
 * sin realizar = las tres fuentes de la bandeja de visitas sin realizar. Un fallo (403 para
 * técnico o contratista incluido) deja el conteo en `null`: no se muestra.
 */

export interface SchedulingPendingCounts {
  toSchedule: number | null;
  unrealized: number | null;
}

const EMPTY_COUNTS: SchedulingPendingCounts = { toSchedule: null, unrealized: null };

async function countToSchedule(): Promise<number> {
  const response = await wfmApi.visitRequests.list({ page: 1, limit: 1 });
  return response.meta.total;
}

async function countUnrealized(): Promise<number> {
  const [requests, noShow, expired] = await Promise.all([
    wfmApi.visitRequests.list({
      status: VisitRequestStatus.REQUIRES_RESCHEDULE,
      page: 1,
      limit: 1,
    }),
    wfmApi.events.list({ status: ScheduleEventStatus.NO_SHOW, page: 1, limit: 1 }),
    wfmApi.events.list({ status: ScheduleEventStatus.EXPIRED, page: 1, limit: 1 }),
  ]);
  return requests.meta.total + noShow.meta.total + expired.meta.total;
}

function settledTotal(result: PromiseSettledResult<number>): number | null {
  return result.status === 'fulfilled' && Number.isFinite(result.value) ? result.value : null;
}

export async function loadSchedulingPendingCounts(): Promise<SchedulingPendingCounts> {
  const [toSchedule, unrealized] = await Promise.allSettled([countToSchedule(), countUnrealized()]);
  return { toSchedule: settledTotal(toSchedule), unrealized: settledTotal(unrealized) };
}

/**
 * `refreshKey` vuelve a consultar sin cambiar `enabled`: el cliente lo incrementa en cada
 * recarga de la agenda para que el número siga a la bandeja tras agendar o devolver.
 */
export function useSchedulingPendingCounts(
  enabled: boolean,
  refreshKey = 0,
): SchedulingPendingCounts {
  const [counts, setCounts] = useState<SchedulingPendingCounts>(EMPTY_COUNTS);

  useEffect(() => {
    if (!enabled) {
      setCounts(EMPTY_COUNTS);
      return;
    }
    let cancelled = false;
    void loadSchedulingPendingCounts().then((next) => {
      if (!cancelled) setCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return counts;
}

/** Nombre accesible del acceso con su número (sin número, solo el rótulo). */
export function getPendingShortcutLabel(label: string, count: number | null): string {
  return count === null ? label : `${label}: ${count}`;
}
