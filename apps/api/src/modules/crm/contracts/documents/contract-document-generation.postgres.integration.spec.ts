import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditLog, TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import { NetworkType, VatConcept } from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { ContractStatus } from '../../enums/contract-status.enum';
import { ContractDocumentGenerationService } from './contract-document-generation.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;

/**
 * Bloque B (ADR-109 D5): persistencia de la generación del contrato contra PostgreSQL real
 * (schema sintético con todas las migraciones tenant): PENDING con snapshot cifrado,
 * idempotencia por versión, motivos FAILED y CHECK de la migración 186.
 */
describeWithDb('Generación del contrato: PostgreSQL en schema sintético', () => {
  let dataSource: DataSource;
  let service: ContractDocumentGenerationService;
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const orderId = randomUUID();
  const schemaName = 'tenant_contract_doc_' + randomUUID().replace(/-/g, '');
  const quote = (identifier: string) => '"' + identifier.replace(/"/g, '""') + '"';
  const context = { tenantId, schemaName, tenantSlug: 'contract-doc-synthetic' };
  const inContext = <T>(callback: () => Promise<T>) => TenantContext.run(context, callback);
  const queue = { add: jest.fn() };
  const contracts = { findOne: jest.fn(), assertContractNotBlocked: jest.fn() };
  const operator = { getForTenant: jest.fn() };
  const legalTexts = {
    current: jest
      .fn()
      .mockResolvedValue({ id: randomUUID(), version: '1.0', sha256: 'a'.repeat(64) }),
  };
  const orders = { getExecutionSnapshot: jest.fn() };
  const profile = {
    legalName: 'Operador S.A.S.',
    nit: '900000000-1',
    qualityAndCoverageUrl: 'https://operador.example.invalid/calidad',
    customerServiceChannels: [{ kind: 'PHONE', value: '6010000000', label: null }],
    reconnectionFee: 15000,
    annualIncreaseCapPercent: 5,
    equipmentIncidentReportChannel: 'Línea 6010000000',
    otherConditions: null,
    updatedAt: null,
  };

  async function fixture(): Promise<string> {
    const subscriberId = randomUUID();
    const contractId = randomUUID();
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO subscribers (
           id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, rut_responsibilities,
           address, created_by
         ) VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, 'Fixture', 'Doc', 3, $4, $4,
           'STANDARD', 'SIMPLIFIED', 'NO_RESPONSABLE', ARRAY[]::text[], 'Dirección', $5)`,
        [subscriberId, tenantId, randomUUID(), 'synthetic-' + subscriberId, actorId],
      );
      await qr.query(
        `INSERT INTO contracts (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, alias)
         VALUES ($1, $2, $3, 'plan-1', '{}'::jsonb, 'DRAFT', 'Servicio sintético')`,
        [contractId, tenantId, subscriberId],
      );
    });
    contracts.findOne.mockResolvedValue({
      id: contractId,
      subscriberId,
      planId: 'plan-1',
      status: ContractStatus.DRAFT,
      customerSegment: null,
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      installationAddress: 'Calle 1',
      installationCity: null,
      installationDepartment: null,
      vatSnapshot: null,
    });
    orders.getExecutionSnapshot.mockResolvedValue({
      isAnnulled: false,
      subscriberId,
      assignedTechnicianId: actorId,
    });
    return contractId;
  }

  const rows = (contractId: string) =>
    runInTenantSchema(
      dataSource,
      schemaName,
      (qr) =>
        qr.query(
          `SELECT status, failure_reason, missing_operator_fields, snapshot_encrypted
             FROM contract_document_generations WHERE contract_id = $1 ORDER BY requested_at`,
          [contractId],
        ) as Promise<
          Array<{
            status: string;
            failure_reason: string | null;
            missing_operator_fields: string[];
            snapshot_encrypted: string | null;
          }>
        >,
    );

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog],
      migrations: [],
      logging: false,
      extra: { max: 4, min: 1, application_name: schemaName },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Contract doc synthetic', $2, $3, 'ACTIVE', 'contract-doc@example.invalid')`,
      [tenantId, `contract-doc-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query('CREATE SCHEMA ' + quote(schemaName));
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, context.tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const audit = new AuditService(dataSource, {
      log: jest.fn(),
    } as unknown as PlatformAuditService);
    service = new ContractDocumentGenerationService(
      dataSource,
      queue as never,
      contracts as never,
      {
        findById: jest.fn().mockResolvedValue({
          firstName: 'Fixture',
          lastName: 'Doc',
          businessName: null,
          documentType: 'CC',
          documentNumber: '1000000001',
          customerSegment: 'RESIDENTIAL',
        }),
      } as never,
      {
        get: jest.fn().mockResolvedValue({
          permanence: { accepted: false, schedule: [] },
          planOffer: null,
        }),
      } as never,
      {
        createSnapshot: jest.fn().mockResolvedValue({
          planId: 'plan-1',
          name: 'Fibra 300',
          downloadSpeed: 300,
          uploadSpeed: 150,
          technology: 'FIBER',
          monthlyPrice: 80000,
          installationFee: 0,
          vatConcept: VatConcept.INTERNET_ACCESS,
          networkType: NetworkType.FIXED,
          snapshotAt: new Date(),
        }),
      } as never,
      { listInstalledAtCustomer: jest.fn().mockResolvedValue([]) } as never,
      operator as never,
      legalTexts as never,
      orders as never,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      audit,
      new ConfigService({
        PII_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        MFA_ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      }),
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_contract_doc_[a-f0-9]{32}$/.test(schemaName)) throw new Error('Schema inválido.');
    await dataSource.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  beforeEach(() => {
    queue.add.mockReset();
    operator.getForTenant.mockResolvedValue({ profile, missingFields: [] });
  });

  it('persiste PENDING cifrado, es idempotente por versión y audita una sola vez', async () => {
    const contractId = await fixture();
    const first = await inContext(() =>
      service.request(contractId, orderId, { sub: actorId } as never),
    );
    const second = await inContext(() =>
      service.request(contractId, orderId, { sub: actorId } as never),
    );
    expect(first.status).toBe('PENDING');
    expect(second.generationId).toBe(first.generationId);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls.every(([, , opts]) => opts.jobId === first.generationId)).toBe(
      true,
    );

    const stored = await rows(contractId);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.snapshot_encrypted).not.toContain('1000000001');
    const audits = await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: first.generationId } }),
    );
    expect(audits).toHaveLength(1);

    const latest = await inContext(() =>
      service.latest(contractId, orderId, { sub: actorId } as never),
    );
    expect(latest?.generationId).toBe(first.generationId);
  });

  it('registra FAILED OPERATOR_DATA_MISSING con la lista y permite una generación posterior', async () => {
    const contractId = await fixture();
    operator.getForTenant.mockResolvedValueOnce({
      profile,
      missingFields: ['qualityAndCoverageUrl', 'reconnectionFee'],
    });
    const failed = await inContext(() =>
      service.request(contractId, orderId, { sub: actorId } as never),
    );
    expect(failed).toMatchObject({
      status: 'FAILED',
      failureReason: 'OPERATOR_DATA_MISSING',
      missingOperatorFields: ['qualityAndCoverageUrl', 'reconnectionFee'],
    });
    const ok = await inContext(() =>
      service.request(contractId, orderId, { sub: actorId } as never),
    );
    expect(ok.status).toBe('PENDING');
    expect((await rows(contractId)).map((row) => row.status)).toEqual(['FAILED', 'PENDING']);
  });

  it('los CHECK rechazan READY sin huella y FAILED sin motivo', async () => {
    const contractId = await fixture();
    const insert = (status: string, reason: string | null) =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `INSERT INTO contract_document_generations
             (tenant_id, contract_id, status, failure_reason, requested_by, completed_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [tenantId, contractId, status, reason, actorId],
        ),
      );
    await expect(insert('READY', null)).rejects.toThrow(/chk_cdg_ready/);
    await expect(insert('FAILED', null)).rejects.toThrow(/chk_cdg_failed/);
    await expect(insert('FAILED', 'OPERATOR_DATA_MISSING')).rejects.toThrow(
      /chk_cdg_missing_fields/,
    );
    await expect(insert('PENDING', null)).rejects.toThrow(/chk_cdg_pending_snapshot/);
  });
});
