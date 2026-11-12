import {
  CatalogItemType,
  CustomerSegment,
  freezeCatalogItemVat,
  resolveCatalogItemVat,
  type ContractAdditionalVatSnapshot,
  type ContractItemVatSnapshot,
} from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import type { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';

/**
 * Congelamiento del IVA de la instalación y de los adicionales en el contrato (spec MOD14
 * 2026-11-12 R2). Lee el catálogo de MOD06 solo por su puerto, dentro de la transacción del
 * llamante. Sin tratamiento propio en el catálogo (plan heredado, ítem legado o que no existe)
 * congela STANDARD 19 % con `source: 'DEFAULT'` (D2).
 */

type CatalogScope = { tenantId: string; schemaName: string };

/** IVA del cargo de instalación del plan, congelado al crear el contrato (sustituye D-F1). */
export async function freezeInstallationVat(
  catalog: CommercialCatalogReadPort,
  scope: CatalogScope,
  manager: EntityManager,
  planId: string,
  now: Date = new Date(),
): Promise<ContractItemVatSnapshot> {
  const [plan] = await catalog.getItemVatTreatments(scope.tenantId, scope.schemaName, [planId], {
    manager,
  });
  const resolution =
    plan && plan.itemType === CatalogItemType.PLAN
      ? resolveCatalogItemVat(plan.installationVatTreatment, plan.installationVatLegalBasis)
      : resolveCatalogItemVat(null, null);
  return freezeCatalogItemVat(resolution, now);
}

/** Precio del catálogo a texto con dos decimales; null si no es un valor válido. */
function frozenUnitPrice(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * IVA, nombre y precio de cada adicional del contrato. Un adicional que ya estaba congelado
 * conserva lo congelado (no se re-resuelve con el catálogo actual); uno nuevo se resuelve ahora;
 * uno retirado sale del arreglo. Un identificador repetido se congela una sola vez.
 *
 * Bloque C (spec MOD14 2026-11-12 D3/R3): el precio es el vigente del ítem para el segmento del
 * contrato (RESIDENTIAL si no tiene) en el momento de congelar, como `installation_fee`; un cambio
 * de tarifa posterior en el catálogo no reprecia contratos existentes. Sin precio vigente la
 * entrada queda con `unitPrice: null` y el cobro la cuenta como «adicional sin cobrar».
 */
export async function freezeAdditionalsVat(
  catalog: CommercialCatalogReadPort,
  scope: CatalogScope,
  manager: EntityManager,
  additionals: { productIds: readonly string[]; serviceIds: readonly string[] },
  previous: readonly ContractAdditionalVatSnapshot[] = [],
  now: Date = new Date(),
  segment: CustomerSegment | null = null,
): Promise<ContractAdditionalVatSnapshot[]> {
  const wanted: Array<{ itemId: string; itemType: 'PRODUCT' | 'SERVICE' }> = [];
  const seen = new Set<string>();
  for (const [itemType, ids] of [
    ['PRODUCT', additionals.productIds],
    ['SERVICE', additionals.serviceIds],
  ] as const) {
    for (const itemId of ids) {
      const key = `${itemType}:${itemId}`;
      if (typeof itemId !== 'string' || itemId.length === 0 || seen.has(key)) continue;
      seen.add(key);
      wanted.push({ itemId, itemType });
    }
  }
  if (wanted.length === 0) return [];

  const kept = new Map(previous.map((entry) => [`${entry.itemType}:${entry.itemId}`, entry]));
  const missing = wanted.filter((entry) => !kept.has(`${entry.itemType}:${entry.itemId}`));
  const catalogRows = missing.length
    ? await catalog.getItemVatTreatments(
        scope.tenantId,
        scope.schemaName,
        missing.map((entry) => entry.itemId),
        { manager },
        segment ?? CustomerSegment.RESIDENTIAL,
      )
    : [];
  const byId = new Map(catalogRows.map((row) => [row.itemId, row]));

  return wanted.map(({ itemId, itemType }) => {
    const frozen = kept.get(`${itemType}:${itemId}`);
    if (frozen) return frozen;
    const row = byId.get(itemId);
    const matches = row !== undefined && row.itemType === CatalogItemType[itemType];
    const resolution = matches
      ? resolveCatalogItemVat(row.vatTreatment, row.vatLegalBasis)
      : resolveCatalogItemVat(null, null);
    return {
      itemId,
      itemType,
      ...freezeCatalogItemVat(resolution, now),
      ...(matches && row.name ? { name: row.name.slice(0, 200) } : {}),
      unitPrice: matches ? frozenUnitPrice(row.currentBasePrice) : null,
    };
  });
}
