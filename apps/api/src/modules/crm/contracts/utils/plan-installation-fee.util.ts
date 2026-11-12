import { NotFoundException } from '@nestjs/common';
import type { CustomerSegment } from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import type { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';

/** Un plan del catálogo de MOD06 es un UUID; los identificadores heredados no lo son. */
export const CONTRACT_PLAN_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function round2Money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * `installation_fee` vigente (`catalog_price_history.is_current`) del plan para el segmento,
 * leído por el puerto de MOD06 dentro de la transacción del llamante (fase 2, D1). Null si el
 * plan es un identificador heredado, no está activo o no tiene precio vigente para el segmento.
 * Regla única para la creación del contrato y para el congelamiento del primer cobro (R4).
 */
export async function resolvePlanInstallationFee(
  catalog: CommercialCatalogReadPort,
  scope: { tenantId: string; schemaName: string },
  manager: EntityManager,
  planId: string,
  segment: CustomerSegment | null,
): Promise<number | null> {
  if (!CONTRACT_PLAN_UUID_PATTERN.test(planId)) return null;
  try {
    const snapshot = await catalog.createSnapshot(
      scope.tenantId,
      scope.schemaName,
      planId,
      segment ?? undefined,
      { manager },
    );
    return Number.isFinite(snapshot.installationFee) && snapshot.installationFee >= 0
      ? round2Money(snapshot.installationFee)
      : null;
  } catch (error) {
    if (error instanceof NotFoundException) return null;
    throw error;
  }
}
