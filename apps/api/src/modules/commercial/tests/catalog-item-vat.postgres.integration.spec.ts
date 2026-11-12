// Spec MOD14 2026-11-12 «IVA por concepto y cortesías» (R1, R2) contra PostgreSQL real: el
// catálogo guarda el IVA por ítem con las entidades reales y el puerto de lectura lo entrega.
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { dataSourceOptions, TenantContext } from '@iwana/db';
import { CatalogItemType, VatConcept, VatTreatment } from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { CatalogItem } from '../entities/catalog-item.entity';
import { CatalogPriceHistory } from '../entities/catalog-price-history.entity';
import { PlanDetail } from '../entities/plan-detail.entity';
import { ProductDetail } from '../entities/product-detail.entity';
import { ServiceDetail } from '../entities/service-detail.entity';
import { CommercialCatalogReadAdapter } from '../ports/commercial-catalog-read.adapter';
import { CatalogService } from '../services/catalog.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Catálogo — IVA por ítem con PostgreSQL real (MOD14 R1/R2)', () => {
  let dataSource: DataSource;
  let service: CatalogService;
  let reader: CommercialCatalogReadAdapter;
  const tenantId = randomUUID();
  const schemaName = `tenant_mod14_item_vat_${randomUUID().replaceAll('-', '')}`;
  const slug = `mod14-item-vat-${tenantId.slice(0, 8)}`;
  const context = { tenantId, schemaName, tenantSlug: slug };
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context, fn);

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [CatalogItem, PlanDetail, ProductDetail, ServiceDetail, CatalogPriceHistory],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'MOD14 IVA por ítem sintético', slug, schemaName, 'mod14-vat@example.invalid'],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, slug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    service = new CatalogService(dataSource, new EventEmitter2());
    reader = new CommercialCatalogReadAdapter(dataSource);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_mod14_item_vat_[a-f0-9]{32}$/u.test(schemaName)) {
      throw new Error('Schema de limpieza inválido.');
    }
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('crea servicio, producto y plan con su IVA y el puerto lo devuelve', async () => {
    const serviceItem = await run(() =>
      service.create({
        type: CatalogItemType.SERVICE,
        name: 'Soporte exento sintético',
        vatConcept: VatConcept.INDEPENDENT_SERVICE,
        chargeType: 'RECURRING',
        vatTreatment: VatTreatment.EXEMPT,
        vatLegalBasis: 'ET_476_7',
      } as never),
    );
    const product = await run(() =>
      service.create({
        type: CatalogItemType.PRODUCT,
        name: 'Router sintético',
        vatConcept: VatConcept.EQUIPMENT_SALE,
        category: 'NETWORKING',
      } as never),
    );
    const plan = await run(() =>
      service.create({
        type: CatalogItemType.PLAN,
        name: 'Plan sintético 300',
        vatConcept: VatConcept.INTERNET_ACCESS,
        downloadSpeedMbps: 300,
        uploadSpeedMbps: 100,
        technology: 'FTTH',
        installationVatTreatment: VatTreatment.EXCLUDED,
        installationVatLegalBasis: 'ET_476_7',
      } as never),
    );

    const rows = await run(() =>
      reader.getItemVatTreatments('ignorado', 'ignorado', [
        serviceItem.id,
        product.id,
        plan.id,
        'heredado',
      ]),
    );
    const byId = Object.fromEntries(rows.map((row) => [row.itemId, row]));
    expect(rows).toHaveLength(3);
    expect(byId[serviceItem.id]).toMatchObject({
      itemType: 'SERVICE',
      vatTreatment: 'EXEMPT',
      vatLegalBasis: 'ET_476_7',
      installationVatTreatment: null,
    });
    expect(byId[product.id]).toMatchObject({
      itemType: 'PRODUCT',
      vatTreatment: 'STANDARD',
      vatLegalBasis: 'ET_468',
    });
    expect(byId[plan.id]).toMatchObject({
      itemType: 'PLAN',
      vatTreatment: null,
      vatLegalBasis: null,
      installationVatTreatment: 'EXCLUDED',
      installationVatLegalBasis: 'ET_476_7',
    });

    // Editar: el servicio vuelve a 19 % (base ET_468) y la instalación del plan a STANDARD.
    const editedService = await run(() =>
      service.update(serviceItem.id, { vatTreatment: VatTreatment.STANDARD } as never),
    );
    expect(editedService).toMatchObject({ vatTreatment: 'STANDARD', vatLegalBasis: 'ET_468' });
    const editedPlan = await run(() =>
      service.update(plan.id, { installationVatTreatment: VatTreatment.STANDARD } as never),
    );
    expect(editedPlan).toMatchObject({
      vatTreatment: null,
      installationVatTreatment: 'STANDARD',
      installationVatLegalBasis: 'ET_468',
    });
    const reread = await run(() => service.findOne(plan.id));
    expect(reread.installationVatTreatment).toBe('STANDARD');
  });

  it('la base rechaza un plan con IVA propio aunque se salte el servicio', async () => {
    const plan = await run(() =>
      service.create({
        type: CatalogItemType.PLAN,
        name: 'Plan con CHECK',
        vatConcept: VatConcept.INTERNET_ACCESS,
        downloadSpeedMbps: 10,
        uploadSpeedMbps: 10,
        technology: 'FTTH',
      } as never),
    );
    await expect(
      dataSource.query(
        `UPDATE "${schemaName}".catalog_items SET vat_treatment = 'STANDARD',
                vat_legal_basis = 'ET_468' WHERE id = $1`,
        [plan.id],
      ),
    ).rejects.toMatchObject({ constraint: 'chk_catalog_items_plan_vat' });
  });
});
