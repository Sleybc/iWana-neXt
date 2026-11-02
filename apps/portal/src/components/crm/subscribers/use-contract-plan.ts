'use client';

import { useEffect, useState } from 'react';
import { commercialApi } from '@/lib/api-client';
import type { Contract, PlanCatalogItem } from '@/lib/api-client';

function planNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Conserva los valores contratados y completa solo los ausentes desde el plan seleccionado. */
export function useContractPlan(contract: Contract) {
  const [resolved, setResolved] = useState<{ id: string; plan: PlanCatalogItem | null } | null>(
    null,
  );
  const snapshot = contract.planSnapshotJson;
  const snapshotName = [snapshot?.name, snapshot?.planName].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const snapshotPrice =
    planNumber(snapshot?.monthlyPrice) ??
    planNumber(snapshot?.basePrice) ??
    planNumber(snapshot?.currentPrice);
  const snapshotDown =
    planNumber(snapshot?.downloadSpeedMbps) ?? planNumber(snapshot?.downloadSpeed);
  const snapshotUp = planNumber(snapshot?.uploadSpeedMbps) ?? planNumber(snapshot?.uploadSpeed);
  const needsCatalog =
    !snapshotName ||
    snapshotPrice === undefined ||
    snapshotDown === undefined ||
    snapshotUp === undefined;
  const catalog = resolved?.id === contract.planId ? resolved.plan : null;
  const loading = needsCatalog && resolved?.id !== contract.planId;

  useEffect(() => {
    if (!needsCatalog) return;
    let cancelled = false;
    void commercialApi.getPlanById(contract.planId).then(
      (plan) => {
        if (!cancelled) setResolved({ id: contract.planId, plan });
      },
      () => {
        if (!cancelled) setResolved({ id: contract.planId, plan: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contract.planId, needsCatalog]);

  const price = snapshotPrice ?? planNumber(catalog?.basePrice);
  return {
    name: snapshotName ?? catalog?.name ?? (loading ? 'Cargando plan…' : 'Plan no disponible'),
    price,
    technology:
      typeof snapshot?.technology === 'string' ? snapshot.technology : catalog?.technology,
    downloadSpeedMbps: snapshotDown ?? planNumber(catalog?.downloadSpeedMbps),
    uploadSpeedMbps: snapshotUp ?? planNumber(catalog?.uploadSpeedMbps),
    loading,
    priceFromCatalog: snapshotPrice === undefined && price !== undefined,
  };
}
