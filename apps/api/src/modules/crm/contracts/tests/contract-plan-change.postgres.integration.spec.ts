import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditLog, TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import {
  CustomerSegment,
  NetworkType,
  PersonType,
  ServiceUsage,
  VatConcept,
  VatTreatment,
  TaxRegime,
} from '@iwana/shared';
import { ContractsService } from '../contracts.service';
import { Contract } from '../entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { InternetVatResolverAdapter } from '../../../taxation/ports/internet-vat-resolver.adapter';
import { AuditService } from '../../../audit/audit.service';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { MediaService } from '../../../media/media.service';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describeWithDb('Cambio de plan: PostgreSQL y auditoría atómica en schema sintético', () => {
  let dataSource: DataSource;
  let service: ContractsService;
  let audit: AuditService;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const schemaName = 'tenant_plan_change_' + randomUUID().replace(/-/g, '');
  const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + '"';
  const context = { tenantId, schemaName, tenantSlug: 'plan-change-synthetic' };
  const inContext = <T>(callback: () => Promise<T>) => TenantContext.run(context, callback);
  const snapshot = {
    planId: 'plan-new',
    name: 'Plan sintético nuevo',
    downloadSpeed: 500,
    uploadSpeed: 200,
    technology: 'FIBER',
    monthlyPrice: 80000,
    installationFee: 0,
    vatConcept: VatConcept.INTERNET_ACCESS,
    networkType: NetworkType.FIXED,
    snapshotAt: new Date('2026-10-30T12:00:00.000Z'),
  };
  const catalog = { getPlanById: jest.fn(), createSnapshot: jest.fn() };
  const marks = { activeMarks: jest.fn().mockResolvedValue({}) };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  });

  async function fixture(status = ContractStatus.DRAFT): Promise<Contract> {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    return runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO subscribers (
        id, tenant_id, party_id, person_type, customer_segment, document_type,
        document_number_encrypted, first_name, last_name, stratum, nit, business_name,
        email_encrypted, phone_encrypted, vat_treatment, tax_regime, vat_responsibility,
        rut_responsibilities, address, created_by
      ) VALUES ($1,$2,$3,$4,$5,'CC',$6,'Fixture','Plan',4,$7,'Fixture Plan SAS',
        $6,$6,$8,$9,'RESPONSABLE',ARRAY['O-13']::text[],'Dirección sintética',$10)`,
        [
          subscriberId,
          tenantId,
          randomUUID(),
          PersonType.NATURAL,
          CustomerSegment.SOHO,
          'synthetic-cipher-' + subscriberId,
          'synthetic-' + subscriberId,
          VatTreatment.STANDARD,
          TaxRegime.SIMPLIFIED,
          actorId,
        ],
      );
      const contract = Object.assign(new Contract(), {
        id: contractId,
        tenantId,
        subscriberId,
        quoteId: null,
        planId: 'plan-old',
        planSnapshotJson: { name: 'Plan anterior', monthlyPrice: 60000 },
        status,
        alias: 'Servicio sintético',
        customerSegment: null,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 4,
        stratumEvidenceMediaId: null,
        vatSnapshot: null,
        billingCycleDay: 1,
        additionalProductIds: [],
        additionalServiceIds: [],
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
        updatedAt: new Date('2026-10-29T12:00:00.000Z'),
      });
      return qr.manager.save(Contract, contract);
    });
  }
  const command = (contract: Contract) => ({
    planId: 'plan-new',
    expectedUpdatedAt: contract.updatedAt.toISOString(),
    expectedMonthlyPrice: 80000,
  });
  const persisted = (id: string) =>
    runInTenantSchema(dataSource, schemaName, (qr) => qr.manager.findOneByOrFail(Contract, { id }));
  const audits = (id: string) =>
    runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: id, entityType: 'ContractPlanChange' } }),
    );

  it('dos escrituras en el mismo milisegundo avanzan versión y rechazan cambio de plan con versión obsoleta', async () => {
    const initial = await fixture();
    initial.updatedAt = new Date(Date.now() + 60_000);
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('UPDATE contracts SET updated_at = $2 WHERE id = $1', [
        initial.id,
        initial.updatedAt,
      ]),
    );
    const clock = jest.spyOn(Date, 'now').mockReturnValue(initial.updatedAt.getTime());
    try {
      await inContext(() => service.update(initial.id, { alias: 'Primera escritura' }, actorId));
      const first = await persisted(initial.id);
      await inContext(() => service.update(initial.id, { alias: 'Segunda escritura' }, actorId));
      const second = await persisted(initial.id);
      expect(first.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime());
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      const beforeAudit = await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.manager.count(AuditLog, { where: { entityId: initial.id } }),
      );
      // D-RER-3 reemplaza la ventana interna del PATCH por relectura bajo bloqueo.
      // changePlan sí recibe una versión del cliente: la primera ya es obsoleta.
      await expect(
        inContext(() => service.changePlan(initial.id, command(first), actorId)),
      ).rejects.toMatchObject({ status: 409, response: { code: 'CONTRACT_CHANGED' } });
      const unchanged = await persisted(initial.id);
      expect(unchanged.alias).toBe('Segunda escritura');
      expect(unchanged.planId).toBe(second.planId);
      expect(unchanged.planSnapshotJson).toEqual(second.planSnapshotJson);
      expect(unchanged.updatedAt).toEqual(second.updatedAt);
      expect(await audits(initial.id)).toEqual([]);
      const afterAudit = await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.manager.count(AuditLog, { where: { entityId: initial.id } }),
      );
      expect(afterAudit).toBe(beforeAudit);
    } finally {
      clock.mockRestore();
    }
  });
  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, AuditLog],
      migrations: [],
      logging: false,
      extra: { max: 6, min: 1, application_name: schemaName },
    });
    await dataSource.initialize();
    // Solo se toma DDL de la plantilla de pruebas; no se leen ni escriben sus registros.
    const source = (await dataSource.query(
      'SELECT schema_name FROM public.tenants WHERE slug = $1',
      ['test-s2-live'],
    )) as Array<{ schema_name: string }>;
    const sourceSchema = source[0]?.schema_name;
    if (!sourceSchema || sourceSchema === 'tenant_iwana')
      throw new Error('Se requiere una plantilla de pruebas segura.');
    await dataSource.query('CREATE SCHEMA ' + quote(schemaName));
    for (const table of ['subscribers', 'contracts', 'audit_logs']) {
      await dataSource.query(
        `CREATE TABLE ${quote(schemaName)}.${quote(table)} (LIKE ${quote(sourceSchema)}.${quote(table)} INCLUDING ALL)`,
      );
    }
    await dataSource.query(
      `ALTER TABLE ${quote(schemaName)}.contracts ADD COLUMN IF NOT EXISTS billing_cycle_day smallint`,
    );
    audit = new AuditService(dataSource, {} as PlatformAuditService);
    service = new ContractsService(
      dataSource,
      catalog as unknown as CommercialCatalogReadPort,
      new InternetVatResolverAdapter(),
      audit,
      {} as MediaService,
      config,
      {} as SubscriberFiscalCompletenessService,
      {} as SubscriberLifecycleService,
      undefined,
      marks as unknown as IPrivacyMarksReadPort,
    );
  });
  beforeEach(() => {
    jest.restoreAllMocks();
    catalog.getPlanById.mockReset().mockResolvedValue({ id: 'plan-new', isActive: true });
    catalog.createSnapshot.mockReset().mockResolvedValue(snapshot);
    marks.activeMarks.mockReset().mockResolvedValue({});
  });
  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    // La limpieza solo puede apuntar al schema aleatorio creado por esta suite.
    if (!/^tenant_plan_change_[a-f0-9]{32}$/.test(schemaName))
      throw new Error('Schema de limpieza inválido.');
    await dataSource.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
    await dataSource.destroy();
  });

  it.each([ContractStatus.DRAFT, ContractStatus.ACTIVE])(
    'persiste %s y auditoría antes/después sin modificar facturas',
    async (status) => {
      const contract = await fixture(status);
      const result = await inContext(() =>
        service.changePlan(contract.id, command(contract), actorId),
      );
      const saved = await persisted(contract.id);
      expect(saved.planId).toBe('plan-new');
      expect(saved.planSnapshotJson).toMatchObject({ monthlyPrice: 80000, downloadSpeed: 500 });
      expect(result.updatedAt.getTime()).toBeGreaterThan(contract.updatedAt.getTime());
      if (status === ContractStatus.ACTIVE)
        expect(saved.vatSnapshot).toMatchObject({ ratePercent: 19 });
      else expect(saved.vatSnapshot).toBeNull();
      const history = await audits(contract.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.oldValue).toMatchObject({
        planId: 'plan-old',
        planSnapshotJson: { monthlyPrice: 60000 },
      });
      expect(history[0]?.newValue).toMatchObject({
        planId: 'plan-new',
        effectiveAt: expect.any(String),
      });
      expect(catalog.createSnapshot).toHaveBeenCalledWith(
        tenantId,
        schemaName,
        'plan-new',
        CustomerSegment.SOHO,
      );
    },
  );
  it('revierte plan, versión, snapshot, IVA y auditoría si el INSERT de auditoría falla', async () => {
    const contract = await fixture(ContractStatus.ACTIVE);
    const realAudit = audit.logWithin.bind(audit);
    jest.spyOn(audit, 'logWithin').mockImplementationOnce(async (entry, manager) => {
      await realAudit(entry, manager);
      throw new Error('Fallo posterior al INSERT de auditoría');
    });
    await expect(
      inContext(() => service.changePlan(contract.id, command(contract), actorId)),
    ).rejects.toThrow('Fallo posterior');
    const saved = await persisted(contract.id);
    expect(saved.planId).toBe('plan-old');
    expect(saved.planSnapshotJson).toEqual(contract.planSnapshotJson);
    expect(saved.vatSnapshot).toBeNull();
    expect(saved.updatedAt).toEqual(contract.updatedAt);
    expect(await audits(contract.id)).toHaveLength(0);
  });
  it('mismo plan mantiene versión y no duplica historial', async () => {
    const contract = await fixture();
    const result = await inContext(() =>
      service.changePlan(contract.id, { ...command(contract), planId: contract.planId }, actorId),
    );
    expect(result.updatedAt).toEqual(contract.updatedAt);
    expect(await audits(contract.id)).toHaveLength(0);
    expect(catalog.createSnapshot).not.toHaveBeenCalled();
  });
  // El 409 anterior depend�a de una ventana interna; D-RER-3 la reemplaza por bloqueo y relectura.
  async function orderedRace(first: 'plan' | 'patch') {
    const contract = await fixture();
    const blocker = dataSource.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(`SELECT id FROM ${quote(schemaName)}.contracts WHERE id = $1 FOR UPDATE`, [
      contract.id,
    ]);
    const pidRows = (await blocker.query('SELECT pg_backend_pid() AS pid')) as Array<{
      pid: number;
    }>;
    const blockerPid = pidRows[0]!.pid;
    const outcomes: Array<Promise<{ value?: Contract; error?: unknown }>> = [];
    const launch = (
      operation: 'plan' | 'patch',
    ): Promise<{ value?: Contract; error?: unknown }> => {
      const result = inContext(() =>
        operation === 'plan'
          ? service.changePlan(contract.id, command(contract), actorId)
          : service.update(contract.id, { alias: 'Edici�n concurrente' }, actorId),
      );
      const observed = result.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      outcomes.push(observed);
      return observed;
    };
    const waitForWaiters = async (count: number) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const rows = (await dataSource.query(
          `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND application_name = $1
            AND pid <> $2 AND state = 'active' AND wait_event_type = 'Lock'
            AND cardinality(pg_blocking_pids(pid)) > 0`,
          [schemaName, blockerPid],
        )) as Array<{ pid: number }>;
        if (rows.length >= count) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timeout expl�cito esperando ${count} escritores bloqueados`);
    };
    try {
      const firstResult = launch(first);
      await waitForWaiters(1);
      const secondResult = launch(first === 'plan' ? 'patch' : 'plan');
      await waitForWaiters(2);
      await blocker.commitTransaction();
      const [firstOutcome, secondOutcome] = await Promise.all([firstResult, secondResult]);
      const saved = await persisted(contract.id);
      expect(saved.alias).toBe('Edici�n concurrente');
      expect(saved.updatedAt.getTime()).toBeGreaterThan(contract.updatedAt.getTime());
      if (first === 'plan') {
        expect(firstOutcome.error).toBeUndefined();
        expect(secondOutcome.error).toBeUndefined();
        expect(secondOutcome.value?.alias).toBe('Edici�n concurrente');
        expect(saved.planId).toBe('plan-new');
        expect(saved.planSnapshotJson).toMatchObject({ monthlyPrice: 80000, downloadSpeed: 500 });
        expect(await audits(contract.id)).toHaveLength(1);
      } else {
        expect(firstOutcome.error).toBeUndefined();
        expect(secondOutcome.error).toMatchObject({
          status: 409,
          response: { code: 'CONTRACT_CHANGED' },
        });
        expect(saved.planId).toBe('plan-old');
        expect(saved.planSnapshotJson).toEqual(contract.planSnapshotJson);
        expect(await audits(contract.id)).toHaveLength(0);
      }
    } finally {
      if (blocker.isTransactionActive) await blocker.rollbackTransaction();
      await blocker.release();
      await Promise.all(outcomes);
    }
  }
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'B3-H2 C(i) corrida %i/20: changePlan primero, PATCH 200 conserva plan nuevo',
    async () => orderedRace('plan'),
  );
  it.each(Array.from({ length: 20 }, (_, index) => index + 1))(
    'B3-H2 C(ii) corrida %i/20: PATCH primero, changePlan 409 conserva alias y plan anterior',
    async () => orderedRace('patch'),
  );
  it('dos cambios con la misma versión solo pueden confirmar uno', async () => {
    const contract = await fixture();
    const results = await Promise.allSettled([
      inContext(() => service.changePlan(contract.id, command(contract), actorId)),
      inContext(() => service.changePlan(contract.id, command(contract), actorId)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { response: { code: 'CONTRACT_CHANGED' } } });
    expect(await audits(contract.id)).toHaveLength(1);
  });
  it('contexto de otro tenant no encuentra ni modifica el contrato', async () => {
    const contract = await fixture();
    await expect(
      TenantContext.run({ ...context, tenantId: randomUUID() }, () =>
        service.changePlan(contract.id, command(contract), actorId),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await persisted(contract.id)).planId).toBe('plan-old');
    expect(await audits(contract.id)).toHaveLength(0);
  });
});
