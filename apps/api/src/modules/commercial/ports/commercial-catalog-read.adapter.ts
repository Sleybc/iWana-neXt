import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CatalogItemType, CustomerSegment, NetworkType, VatTreatment } from '@iwana/shared';
import { CatalogItem } from '../entities/catalog-item.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import {
  CommercialCatalogItem,
  CommercialCatalogReadPort,
  CommercialItemSnapshot,
  CommercialItemVatReference,
  CommercialProductReference,
} from './commercial-catalog-read.port';
import type { PlanCatalogLookupItem } from './plan-catalog-read.port';

/**
 * Adaptador real del puerto CommercialCatalogReadPort.
 * Lee directamente de las tablas del módulo comercial dentro del schema del tenant.
 *
 * Registrado en CommercialModule y exportado para consumo por CrmModule.
 */
@Injectable()
export class CommercialCatalogReadAdapter extends CommercialCatalogReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  /** Ignora tenant/schema del caller; el aislamiento sale de TenantContext. */
  private scopedTenant(
    _callerTenantId: string,
    _callerSchemaName: string,
  ): {
    tenantId: string;
    schemaName: string;
  } {
    return TenantContext.getOrThrow();
  }

  async getActivePlans(tenantId: string, schemaName: string): Promise<CommercialCatalogItem[]> {
    const ctx = this.scopedTenant(tenantId, schemaName);
    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const items = await qr.manager.find(CatalogItem, {
        where: {
          tenantId: ctx.tenantId,
          type: CatalogItemType.PLAN,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { name: 'ASC' },
      });
      return this.mapPlans(qr.manager, items);
    });
  }

  async getPlansByIds(
    tenantId: string,
    schemaName: string,
    ids: string[],
  ): Promise<Map<string, PlanCatalogLookupItem>> {
    const ctx = this.scopedTenant(tenantId, schemaName);
    const validIds = [...new Set(ids)].filter((id) => UUID_PATTERN.test(id));
    if (validIds.length === 0) return new Map();

    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const items = await qr.manager.find(CatalogItem, {
        where: {
          id: In(validIds),
          tenantId: ctx.tenantId,
          type: CatalogItemType.PLAN,
          deletedAt: IsNull(),
        },
        select: { id: true, name: true, isActive: true },
      });

      return new Map(
        items.map((item) => [item.id, { id: item.id, name: item.name, active: item.isActive }]),
      );
    });
  }

  async getPlanById(
    tenantId: string,
    schemaName: string,
    planId: string,
    ctx?: { manager: EntityManager },
  ): Promise<CommercialCatalogItem | null> {
    const scope = this.scopedTenant(tenantId, schemaName);
    // Solo lectura (D3): con contexto se reutiliza la transacción del llamante.
    if (ctx) {
      return this.loadPlanById(planId, scope.tenantId, ctx.manager);
    }
    return runInTenantSchema(this.dataSource, scope.schemaName, (qr) =>
      this.loadPlanById(planId, scope.tenantId, qr.manager),
    );
  }

  /** Lectura del plan sobre el manager recibido (propio o de la transacción). */
  private async loadPlanById(
    planId: string,
    tenantId: string,
    manager: EntityManager,
  ): Promise<CommercialCatalogItem | null> {
    const item = await manager.findOne(CatalogItem, {
      where: {
        id: planId,
        tenantId,
        type: CatalogItemType.PLAN,
        isActive: true,
        deletedAt: IsNull(),
      },
    });
    if (!item) return null;
    const [mapped] = await this.mapPlans(manager, [item]);
    return mapped ?? null;
  }

  private async mapPlans(
    manager: EntityManager,
    items: CatalogItem[],
  ): Promise<CommercialCatalogItem[]> {
    const itemIds = items.map((item) => item.id);
    const priceMap = new Map<string, string>();
    const installationMap = new Map<string, string>();
    const detailMap = new Map<string, PlanDetail>();

    if (itemIds.length) {
      const priceRows = await manager
        .createQueryBuilder(CatalogPriceHistory, 'ph')
        .where('ph.item_id = ANY(:ids)', { ids: itemIds })
        .andWhere('ph.customer_segment = :seg', { seg: CustomerSegment.RESIDENTIAL })
        .andWhere('ph.is_current = true')
        .getMany();

      for (const row of priceRows) {
        priceMap.set(row.itemId, row.basePrice);
        installationMap.set(row.itemId, row.installationFee);
      }

      const planDetails = await manager
        .createQueryBuilder(PlanDetail, 'pd')
        .where('pd.item_id = ANY(:ids)', { ids: itemIds })
        .getMany();

      for (const detail of planDetails) {
        detailMap.set(detail.itemId, detail);
      }
    }

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      technology: detailMap.get(item.id)?.technology ?? 'N/A',
      downloadSpeedMbps: detailMap.get(item.id)?.downloadSpeedMbps ?? 0,
      uploadSpeedMbps: detailMap.get(item.id)?.uploadSpeedMbps ?? 0,
      isActive: item.isActive,
      basePrice: priceMap.has(item.id) ? parseFloat(priceMap.get(item.id)!) : 0,
      installationFee: installationMap.has(item.id) ? parseFloat(installationMap.get(item.id)!) : 0,
      vatConcept: item.vatConcept,
      networkType: detailMap.get(item.id)?.networkType ?? NetworkType.FIXED,
    }));
  }

  async createSnapshot(
    tenantId: string,
    schemaName: string,
    itemId: string,
    segment: CustomerSegment = CustomerSegment.RESIDENTIAL,
    ctx?: { manager: EntityManager },
  ): Promise<CommercialItemSnapshot> {
    const scope = this.scopedTenant(tenantId, schemaName);
    // Solo lectura (D3): con contexto se reutiliza la transacción del llamante.
    if (ctx) {
      return this.loadSnapshot(itemId, scope.tenantId, segment, ctx.manager);
    }
    return runInTenantSchema(this.dataSource, scope.schemaName, (qr) =>
      this.loadSnapshot(itemId, scope.tenantId, segment, qr.manager),
    );
  }

  /** Snapshot sobre el manager recibido (propio o de la transacción). */
  private async loadSnapshot(
    itemId: string,
    tenantId: string,
    segment: CustomerSegment,
    manager: EntityManager,
  ): Promise<CommercialItemSnapshot> {
    const item = await manager.findOne(CatalogItem, {
      where: { id: itemId, tenantId, isActive: true, deletedAt: IsNull() },
    });
    if (!item) throw new NotFoundException(`Ítem de catálogo ${itemId} no encontrado o inactivo`);

    const price = await manager.findOne(CatalogPriceHistory, {
      where: {
        itemId,
        tenantId,
        customerSegment: segment,
        isCurrent: true,
      },
    });
    if (!price) {
      throw new NotFoundException(
        `No hay precio vigente para ítem ${itemId} en segmento ${segment}`,
      );
    }

    const detail = await manager.findOne(PlanDetail, { where: { itemId } });

    return {
      planId: item.id,
      name: item.name,
      downloadSpeed: detail?.downloadSpeedMbps ?? 0,
      uploadSpeed: detail?.uploadSpeedMbps ?? 0,
      monthlyPrice: parseFloat(price.basePrice),
      installationFee: parseFloat(price.installationFee),
      technology: detail?.technology ?? 'N/A',
      vatConcept: item.vatConcept,
      networkType: detail?.networkType ?? NetworkType.FIXED,
      snapshotAt: new Date(),
    };
  }

  async getItemVatTreatments(
    tenantId: string,
    schemaName: string,
    itemIds: string[],
    ctx?: { manager: EntityManager },
    segment?: CustomerSegment,
  ): Promise<CommercialItemVatReference[]> {
    const scope = this.scopedTenant(tenantId, schemaName);
    const validIds = [...new Set(itemIds)].filter((id) => UUID_PATTERN.test(id));
    // Sin UUIDs no se consulta: un 22P02 abortaría la transacción del llamante.
    if (validIds.length === 0) return [];
    const load = async (manager: EntityManager): Promise<CommercialItemVatReference[]> => {
      const rows = (await manager.query(
        `SELECT ci.id::text AS item_id, ci.type AS item_type, ci.name,
                ci.vat_treatment, ci.vat_legal_basis,
                pd.installation_vat_treatment, pd.installation_vat_legal_basis,
                (SELECT ph.base_price::text FROM catalog_price_history ph
                  WHERE ph.item_id = ci.id AND ph.tenant_id = ci.tenant_id
                    AND ph.customer_segment = $3 AND ph.is_current = true
                  ORDER BY ph.valid_from DESC LIMIT 1) AS current_base_price
           FROM catalog_items ci
           LEFT JOIN plan_details pd ON pd.item_id = ci.id AND ci.type = 'PLAN'
          WHERE ci.tenant_id = $1 AND ci.id = ANY($2::uuid[])`,
        [scope.tenantId, validIds, segment ?? null],
      )) as Array<{
        item_id: string;
        name: string;
        current_base_price: string | null;
        item_type: CatalogItemType;
        vat_treatment: VatTreatment | null;
        vat_legal_basis: string | null;
        installation_vat_treatment: VatTreatment | null;
        installation_vat_legal_basis: string | null;
      }>;
      return rows.map((row) => ({
        itemId: row.item_id,
        itemType: row.item_type,
        vatTreatment: row.vat_treatment,
        vatLegalBasis: row.vat_legal_basis,
        installationVatTreatment: row.installation_vat_treatment,
        installationVatLegalBasis: row.installation_vat_legal_basis,
        name: row.name,
        ...(segment ? { currentBasePrice: row.current_base_price } : {}),
      }));
    };
    if (ctx) return load(ctx.manager);
    return runInTenantSchema(this.dataSource, scope.schemaName, (qr) => load(qr.manager));
  }

  async getActiveProducts(
    tenantId: string,
    schemaName: string,
  ): Promise<CommercialProductReference[]> {
    const ctx = this.scopedTenant(tenantId, schemaName);
    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const items = await qr.manager.find(CatalogItem, {
        where: {
          tenantId: ctx.tenantId,
          type: CatalogItemType.PRODUCT,
          isActive: true,
          deletedAt: IsNull(),
        },
        order: { name: 'ASC' },
      });

      if (!items.length) {
        return [];
      }

      const itemIds = items.map((item) => item.id);
      const details = await qr.manager
        .createQueryBuilder(ProductDetail, 'pd')
        .where('pd.item_id = ANY(:ids)', { ids: itemIds })
        .getMany();
      const detailMap = new Map(details.map((detail) => [detail.itemId, detail]));

      return items.map((item) => {
        const detail = detailMap.get(item.id);
        return {
          id: item.id,
          name: item.name,
          isActive: item.isActive,
          requiresInventory: detail?.requiresInventory ?? false,
          isLoan: detail?.isLoan ?? false,
        };
      });
    });
  }

  async resolveProductReference(
    tenantId: string,
    schemaName: string,
    productId: string,
  ): Promise<CommercialProductReference | null> {
    const ctx = this.scopedTenant(tenantId, schemaName);
    return runInTenantSchema(this.dataSource, ctx.schemaName, async (qr) => {
      const item = await qr.manager.findOne(CatalogItem, {
        where: {
          id: productId,
          tenantId: ctx.tenantId,
          type: CatalogItemType.PRODUCT,
          deletedAt: IsNull(),
        },
      });

      if (!item) {
        return null;
      }

      const detail = await qr.manager.findOne(ProductDetail, { where: { itemId: item.id } });

      return {
        id: item.id,
        name: item.name,
        isActive: item.isActive,
        requiresInventory: detail?.requiresInventory ?? false,
        isLoan: detail?.isLoan ?? false,
      };
    });
  }
}

const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/iu;
