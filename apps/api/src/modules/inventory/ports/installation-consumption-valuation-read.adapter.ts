import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import type { CustomerSegment } from '@iwana/shared';
import type { DataSource } from 'typeorm';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import {
  InstallationConsumptionValuationReadPort,
  type InventoryItemValuation,
} from './installation-consumption-valuation-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface ItemRow {
  id: string;
  name: string;
  unit_of_measure: string;
  average_cost: string | null;
  commercial_reference_id: string | null;
}

@Injectable()
export class InstallationConsumptionValuationReadAdapter extends InstallationConsumptionValuationReadPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commercialCatalog: CommercialCatalogReadPort,
  ) {
    super();
  }

  /**
   * Precio vigente para el segmento de los productos comerciales vinculados (R2), por el puerto de
   * MOD06. Omite los que no existen o no están activos.
   */
  private async resolveProductValuations(
    productIds: string[],
    segment: CustomerSegment,
  ): Promise<
    Array<{ id: string; name: string; isLoan: boolean; currentBasePrice: string | null }>
  > {
    const ids = [...new Set(productIds)];
    if (ids.length === 0) return [];
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const prices = await this.commercialCatalog.getItemVatTreatments(
      tenantId,
      schemaName,
      ids,
      undefined,
      segment,
    );
    const priceById = new Map(prices.map((row) => [row.itemId, row.currentBasePrice ?? null]));
    const valuations = [];
    for (const id of ids) {
      if (!priceById.has(id)) continue;
      const reference = await this.commercialCatalog.resolveProductReference(
        tenantId,
        schemaName,
        id,
      );
      if (!reference) continue;
      valuations.push({
        id: reference.id,
        name: reference.name,
        isLoan: reference.isLoan,
        currentBasePrice: priceById.get(id) ?? null,
      });
    }
    return valuations;
  }

  async describeItems(
    itemIds: string[],
    segment: CustomerSegment,
  ): Promise<InventoryItemValuation[]> {
    const ids = [...new Set(itemIds)].filter((id) => UUID_PATTERN.test(id));
    // Sin UUIDs no se consulta: un 22P02 no aporta nada al caller.
    if (ids.length === 0) return [];
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const items = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) =>
        (await qr.query(
          `SELECT id::text AS id, name, unit_of_measure,
                CASE WHEN average_cost > 0 THEN average_cost::text END AS average_cost,
                commercial_reference_id
           FROM inventory_items
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [tenantId, ids],
        )) as ItemRow[],
    );

    const productIds = items
      .map((item) => item.commercial_reference_id)
      .filter((id): id is string => typeof id === 'string' && UUID_PATTERN.test(id));
    const products = await this.resolveProductValuations(productIds, segment);
    const productById = new Map(products.map((product) => [product.id, product]));

    return items.map((item) => {
      const product = item.commercial_reference_id
        ? productById.get(item.commercial_reference_id)
        : undefined;
      return {
        itemId: item.id,
        name: item.name,
        unitOfMeasure: item.unit_of_measure,
        averageCost: item.average_cost,
        commercialProduct: product
          ? {
              id: product.id,
              name: product.name,
              isLoan: product.isLoan,
              currentBasePrice: product.currentBasePrice,
            }
          : null,
      };
    });
  }
}
