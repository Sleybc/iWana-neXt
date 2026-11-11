import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CatalogItemType,
  CustomerSegment,
  PersonType,
  TaxRegime,
  VatTreatment,
} from '@iwana/shared';
import { CatalogItem } from '../../../commercial/entities/catalog-item.entity';
import { CatalogPriceHistory } from '../../../commercial/entities/catalog-price-history.entity';
import { PlanDetail } from '../../../commercial/entities/plan-detail.entity';
import { PlanPermanenceService } from '../../../commercial/services/plan-permanence.service';
import { Contract } from '../entities/contract.entity';
import { ContractPermanenceRecord } from '../entities/contract-permanence.entity';
import { ContractPermanenceService } from '../contract-permanence.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('Permanencia mínima (bloque H) con PostgreSQL real', () => {
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const tenantSlug = `permanence-${tenantId.slice(0, 8)}`;
  const schemaName = 'tenant_permanence_' + randomUUID().replace(/-/g, '');
  const actorId = randomUUID();
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  let plans: PlanPermanenceService;
  let permanence: ContractPermanenceService;

  const ctx = () => ({ tenantId, schemaName, tenantSlug });
  const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(ctx(), fn);
  const q = (sql: string, params: unknown[] = []) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.query(sql, params));

  async function insertPrice(planId: string, segment: CustomerSegment, fee: number) {
    await q(
      `INSERT INTO catalog_price_history
         (item_id, tenant_id, customer_segment, base_price, installation_fee, created_by)
       VALUES ($1, $2, $3, 90000, $4, $5)`,
      [planId, tenantId, segment, fee, actorId],
    );
  }

  async function insertPlan(installationFee?: number): Promise<string> {
    const id = randomUUID();
    await q(
      `INSERT INTO catalog_items (id, tenant_id, type, name) VALUES ($1, $2, $3, 'Plan permanencia')`,
      [id, tenantId, CatalogItemType.PLAN],
    );
    await q(
      `INSERT INTO plan_details (item_id, download_speed_mbps, upload_speed_mbps, technology)
       VALUES ($1, 300, 100, 'FIBER')`,
      [id],
    );
    if (installationFee !== undefined) {
      await insertPrice(id, CustomerSegment.RESIDENTIAL, installationFee);
    }
    return id;
  }

  async function insertContract(
    planId: string,
    status = ContractStatus.DRAFT,
    installationFee: number | null = null,
  ): Promise<string> {
    const subscriberId = randomUUID();
    const tag = subscriberId.slice(0, 8);
    await q(
      `INSERT INTO subscribers (
         id, tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, nit, business_name,
         email_encrypted, phone_encrypted, vat_treatment, tax_regime, vat_responsibility,
         rut_responsibilities, address, created_by
       ) VALUES ($1,$2,$3,$4,$5,'CC',$6,'Fixture','Permanencia',2,$7,'Fixture SAS',$6,$6,$8,$9,
         'RESPONSABLE', ARRAY['O-13']::text[], 'Dirección sintética', $10)`,
      [
        subscriberId,
        tenantId,
        randomUUID(),
        PersonType.NATURAL,
        CustomerSegment.RESIDENTIAL,
        'cifrado-' + tag,
        '900000000-' + tag,
        VatTreatment.STANDARD,
        TaxRegime.SIMPLIFIED,
        actorId,
      ],
    );
    const contractId = randomUUID();
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.save(
        Contract,
        Object.assign(new Contract(), {
          id: contractId,
          tenantId,
          quoteId: null,
          subscriberId,
          planId,
          planSnapshotJson: { id: planId },
          status,
          customerSegment: CustomerSegment.RESIDENTIAL,
          installationFee,
          alias: 'Servicio permanencia',
          additionalProductIds: [],
          additionalServiceIds: [],
          billingCycleDay: 1,
          deletedAt: null,
        }),
      ),
    );
    return contractId;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        Contract,
        CatalogItem,
        CatalogPriceHistory,
        PlanDetail,
        ContractPermanenceRecord,
        AuditLog,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Permanence synthetic', $2, $3, 'ACTIVE', 'permanence@example.invalid')`,
      [tenantId, tenantSlug, schemaName],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDs = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDs.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDs);
    } finally {
      await tenantDs.destroy();
    }
    plans = new PlanPermanenceService(dataSource, audit as never);
    permanence = new ContractPermanenceService(dataSource, plans, audit as never);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  it('un plan nuevo no ofrece permanencia; sin precio vigente no tiene cargo', async () => {
    const planId = await insertPlan();
    await expect(inTenant(() => plans.getOfferOrThrow(planId))).resolves.toEqual({
      installationFee: null,
      offersPermanence: false,
      months: null,
      discountedOrDeferredAmount: null,
    });
  });

  it('CA-7: plan_details ya no tiene connection_fee; el cargo es installation_fee vigente', async () => {
    const [column] = await q(
      `SELECT COUNT(*)::int AS total FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'plan_details' AND column_name = 'connection_fee'`,
      [schemaName],
    );
    expect(column.total).toBe(0);
    const planId = await insertPlan(150_000);
    await insertPrice(planId, CustomerSegment.PYME, 250_000);
    await expect(inTenant(() => plans.getOfferOrThrow(planId))).resolves.toMatchObject({
      installationFee: 150_000,
    });
    await expect(
      inTenant(() => plans.getOffer(planId, { segment: CustomerSegment.PYME })),
    ).resolves.toMatchObject({ installationFee: 250_000 });
  });

  it('el CHECK de plan_details rechaza más de 12 meses o meses nulos con oferta', async () => {
    const planId = await insertPlan();
    await expect(
      q(
        `UPDATE plan_details SET offers_permanence = true,
           permanence_months = 13, permanence_discounted_amount = 50 WHERE item_id = $1`,
        [planId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      q(
        `UPDATE plan_details SET offers_permanence = true,
           permanence_months = NULL, permanence_discounted_amount = 50 WHERE item_id = $1`,
        [planId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('la oferta no supera el installation_fee vigente (409) y se valida contra todos los segmentos', async () => {
    const planId = await insertPlan(150_000);
    await insertPrice(planId, CustomerSegment.PYME, 100_000);
    await expect(
      inTenant(() =>
        plans.updateOffer(
          planId,
          { offersPermanence: true, months: 6, discountedOrDeferredAmount: 120_000 },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({ response: { code: 'PERMANENCE_EXCEEDS_INSTALLATION_FEE' } });
    await expect(
      inTenant(() =>
        plans.updateOffer(
          planId,
          { offersPermanence: true, months: 6, discountedOrDeferredAmount: 100_000 },
          actorId,
        ),
      ),
    ).resolves.toMatchObject({ installationFee: 150_000, discountedOrDeferredAmount: 100_000 });
  });

  it('la permanencia usa el installation_fee congelado en el contrato, no el vigente', async () => {
    const planId = await insertPlan(200_000);
    await inTenant(() =>
      plans.updateOffer(
        planId,
        { offersPermanence: true, months: 12, discountedOrDeferredAmount: 120_000 },
        actorId,
      ),
    );
    const frozen = await insertContract(planId, ContractStatus.DRAFT, 180_000);
    const view = await inTenant(() => permanence.set(frozen, true, actorId));
    expect(view.permanence.connectionFee).toBe(180_000);
    expect(view.planOffer?.installationFee).toBe(180_000);
    const [row] = await q(`SELECT connection_fee FROM contract_permanence WHERE contract_id = $1`, [
      frozen,
    ]);
    expect(row.connection_fee).toBe('180000.00');

    const tooLow = await insertContract(planId, ContractStatus.DRAFT, 100_000);
    await expect(inTenant(() => permanence.set(tooLow, true, actorId))).rejects.toMatchObject({
      response: { code: 'PERMANENCE_EXCEEDS_INSTALLATION_FEE' },
    });
  });

  it('flujo completo: oferta → aceptación en DRAFT → activación → suspensión', async () => {
    const planId = await insertPlan(200_000);
    await inTenant(() =>
      plans.updateOffer(
        planId,
        {
          offersPermanence: true,
          months: 12,
          discountedOrDeferredAmount: 120_000,
        },
        actorId,
      ),
    );
    const contractId = await insertContract(planId);

    const accepted = await inTenant(() => permanence.set(contractId, true, actorId));
    expect(accepted.permanence).toMatchObject({
      accepted: true,
      months: 12,
      connectionFee: 200_000,
      discountedOrDeferredAmount: 120_000,
      startDate: null,
      endDate: null,
    });
    expect(accepted.permanence.schedule[11]).toEqual({ month: 12, amount: 10_000 });

    const rejected = await inTenant(() => permanence.set(contractId, false, actorId));
    expect(rejected.permanence.accepted).toBe(false);
    const [row] = await q(
      `SELECT accepted, months, connection_fee FROM contract_permanence WHERE contract_id = $1`,
      [contractId],
    );
    expect(row).toEqual({ accepted: false, months: null, connection_fee: null });

    await inTenant(() => permanence.set(contractId, true, actorId));
    const activated = await inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        permanence.applyActivationDate(qr.manager, contractId, '2026-11-11'),
      ),
    );
    expect(activated).toMatchObject({ startDate: '2026-11-11', endDate: '2027-11-11' });

    const shifted = await inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        permanence.shiftForVoluntarySuspension(qr.manager, contractId, 30),
      ),
    );
    expect(shifted.endDate).toBe('2027-12-11');
    const [days] = await q(
      `SELECT voluntary_suspension_days FROM contract_permanence WHERE contract_id = $1`,
      [contractId],
    );
    expect(days.voluntary_suspension_days).toBe(30);
    expect(audit.logWithin).toHaveBeenCalled();
  });

  it('fuera de DRAFT la permanencia no se edita', async () => {
    const planId = await insertPlan();
    const contractId = await insertContract(planId, ContractStatus.ACTIVE);
    await expect(inTenant(() => permanence.set(contractId, false, actorId))).rejects.toMatchObject({
      response: { code: 'CONTRACT_NOT_DRAFT' },
    });
  });

  it('el CHECK de contract_permanence exige forma vacía sin aceptar', async () => {
    const planId = await insertPlan();
    const contractId = await insertContract(planId);
    await expect(
      q(
        `INSERT INTO contract_permanence (contract_id, tenant_id, accepted, months, created_by, updated_by)
         VALUES ($1, $2, false, 6, $3, $3)`,
        [contractId, tenantId, actorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('un contrato de otro tenant no se encuentra', async () => {
    const planId = await insertPlan();
    const contractId = await insertContract(planId);
    await expect(
      TenantContext.run({ tenantId: randomUUID(), schemaName, tenantSlug }, () =>
        permanence.get(contractId),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
