import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import { DocumentTypeParty } from '@iwana/shared';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { MediaService } from '../../media/media.service';
import { CommercialCatalogReadPort } from '../../commercial/ports/commercial-catalog-read.port';
import { ContractsService } from '../../crm/contracts/contracts.service';
import { Contract } from '../../crm/contracts/entities/contract.entity';
import { ContractStatus } from '../../crm/enums/contract-status.enum';
import { Subscriber } from '../../crm/subscribers/entities/subscriber.entity';
import { SubscriberFiscalCompletenessService } from '../../crm/subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../crm/subscribers/subscriber-lifecycle.service';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { InternetVatResolverAdapter } from '../../taxation/ports/internet-vat-resolver.adapter';
import { IPrivacyMarksReadPort } from '../ports/privacy-marks-read.port';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { bogotaCivilDate } from '../ports/privacy-tenant-query';
import { PrivacyRequestsService } from './requests.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * O-1 (retención del suscriptor) contra PostgreSQL real.
 *
 * El esquema se crea con la cadena de migraciones del tenant (incluida la 170). Los adaptadores
 * de CRM son los reales: `CrmContractStandingReadAdapter`, `ContractsService` y
 * `SubscriberLifecycleService`. El servicio de solicitudes es el real, así que `resolve` y
 * `create` pasan por la misma lógica que en producción. Los puertos de auditoría, medios e
 * impersonación se dejan como dobles. El de borrado de titular también es un doble: el resultado
 * de `plan` no influye en el deber de conservación, que se evalúa antes de `anonymize`. Solo se
 * usan datos sintéticos.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_retention_clock_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = '70000000-0000-4000-8000-000000000001';
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración retención O-1: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

const quote = (identifier: string) => `"${identifier}"`;
const yearsAgo = (years: number): Date => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date;
};
const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

describeWithDb('Retención del suscriptor (O-1) en PostgreSQL real', () => {
  let dataSource: DataSource;
  let contracts: ContractsService;
  let lifecycle: SubscriberLifecycleService;
  let privacy: PrivacyRequestsService;
  let standing: CrmContractStandingReadAdapter;

  const catalog = { getPlanById: jest.fn(), createSnapshot: jest.fn() };
  const marks: jest.Mocked<IPrivacyMarksReadPort> = {
    activeMarks: jest.fn().mockResolvedValue({}),
    partyIdsWithActiveMark: jest.fn().mockResolvedValue([]),
  } as never;
  const impersonationPort: jest.Mocked<IContractImpersonationPort> = {
    suspendForImpersonation: jest.fn(),
  } as never;
  const erasurePort = { plan: jest.fn(), anonymize: jest.fn() };
  const mediaService = { findOne: jest.fn(), getPrivacyEvidenceSignedUrl: jest.fn() };
  const effectivePermissionsService = { getEffectivePermissionsForUser: jest.fn() };
  const configService = new ConfigService({
    PII_ENCRYPTION_KEY: keyHex,
    MFA_ENCRYPTION_KEY: keyHex,
    PII_HASH_KEY: keyHex,
  });

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'retention-clock-test' }, operation);

  async function insertParty(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quote(schemaName)}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético O-1')`,
      [id, randomBytes(4).readUInt32BE(0).toString()],
    );
    return id;
  }

  async function insertSubscriber(partyId: string, anonymized = false): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quote(schemaName)}.subscribers
        (id, tenant_id, party_id, person_type, customer_segment, vat_treatment, address,
         document_type, document_number_encrypted, first_name, last_name, stratum,
         vat_responsibility, created_by, status, activated_at, anonymized_at, anonymized_request_id)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'Dirección sintética',
               'CC', 'sintetico-cifrado', 'Titular', 'Sintético', 3,
               'RESPONSABLE', $4, 'ACTIVE', now(), $5, $6)`,
      [
        id,
        tenantId,
        partyId,
        actorId,
        anonymized ? new Date() : null,
        anonymized ? randomUUID() : null,
      ],
    );
    return id;
  }

  async function insertContract(input: {
    subscriberId: string;
    status: ContractStatus;
    terminatedAt?: Date | null;
    statusChangedAt?: Date | null;
    updatedAt?: Date;
    deletedAt?: Date | null;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${quote(schemaName)}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, billing_cycle_day,
         alias, terminated_at, status_changed_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, 'fixture-plan', '{}'::jsonb, $4, 1, 'Servicio sintético',
               $5, $6, COALESCE($7, now()), $8)`,
      [
        id,
        tenantId,
        input.subscriberId,
        input.status,
        input.terminatedAt ?? null,
        input.statusChangedAt ?? null,
        input.updatedAt ?? null,
        input.deletedAt ?? null,
      ],
    );
    return id;
  }

  async function contractRow(id: string): Promise<{
    status: string;
    terminated_at: Date | null;
  }> {
    const [row] = (await dataSource.query(
      `SELECT status::text AS status, terminated_at FROM ${quote(schemaName)}.contracts WHERE id = $1`,
      [id],
    )) as Array<{ status: string; terminated_at: Date | null }>;
    return row!;
  }

  async function createSuppression(partyId: string) {
    const created = await inTenant(() =>
      privacy.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          requesterKind: 'TITULAR',
          requesterName: 'Titular sintético O-1',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: '1234567',
          requesterContact: 'titular-o1@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
          partyId,
          receivedAt: bogotaCivilDate(new Date()),
        },
        actorId,
      ),
    );
    await inTenant(() => privacy.transition(created.request.id, 'complete', {}, actorId));
    return created.request.id;
  }

  const standingOf = (partyId: string) =>
    inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        standing.standing(partyId, { manager: qr.manager }),
      ),
    );

  const resolveSuppression = (requestId: string) =>
    inTenant(() =>
      privacy.transition(
        requestId,
        'resolve',
        {
          responseText: 'Se resolvió la solicitud.',
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: [] },
        },
        actorId,
      ),
    );

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, AuditLog],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Retención O-1 sintético',
        `retention-clock-${tenantId.slice(0, 8)}`,
        schemaName,
        'retention-clock@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${quote(schemaName)}`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, 'retention-clock-test');
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const audit = new AuditService(dataSource, {} as PlatformAuditService);
    standing = new CrmContractStandingReadAdapter();
    contracts = new ContractsService(
      dataSource,
      catalog as unknown as CommercialCatalogReadPort,
      new InternetVatResolverAdapter(),
      audit,
      {} as MediaService,
      configService,
      {} as SubscriberFiscalCompletenessService,
      {} as SubscriberLifecycleService,
      undefined,
      marks as unknown as IPrivacyMarksReadPort,
    );
    lifecycle = new SubscriberLifecycleService(
      dataSource,
      audit,
      { findOpenContractIds: jest.fn().mockResolvedValue([]) } as never,
      { hasOpenWithdrawalOrders: jest.fn().mockResolvedValue(false) } as never,
      configService,
    );
    privacy = new PrivacyRequestsService(
      dataSource,
      configService,
      audit,
      impersonationPort,
      standing,
      mediaService as unknown as MediaService,
      effectivePermissionsService as never,
      erasurePort as unknown as IPersonalDataErasurePort,
      {
        lastFiscalDocumentAt: jest.fn().mockResolvedValue(null),
        hasUnreconciledFiscalClock: jest.fn().mockResolvedValue(false),
      },
      new PqrRetentionReadAdapter(),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.getPlanById.mockResolvedValue({ id: 'plan-o1', isActive: true });
    marks.activeMarks.mockResolvedValue({});
    erasurePort.plan.mockResolvedValue({
      candidateExpedienteIds: [],
      blockers: [],
      counts: {},
    });
    erasurePort.anonymize.mockResolvedValue({ categories: [], changedRows: 0 });
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    // La limpieza solo puede apuntar al schema aleatorio creado por esta suite.
    if (!/^tenant_retention_clock_[a-f0-9]{10}$/.test(schemaName))
      throw new Error('Schema de limpieza inválido.');
    await dataSource.query(`DROP SCHEMA IF EXISTS ${quote(schemaName)} CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('CA-O1-01: contrato terminado hace 2 años y archivado hoy bloquea SUPRIMIR por deber de conservación', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const terminatedAt = yearsAgo(2);
    const contractId = await insertContract({
      subscriberId,
      status: ContractStatus.TERMINATED,
      terminatedAt,
      statusChangedAt: terminatedAt,
    });

    await inTenant(() => contracts.archive(contractId, actorId));
    const requestId = await createSuppression(partyId);

    await expect(resolveSuppression(requestId)).rejects.toThrow(ConflictException);
    await expect(resolveSuppression(requestId)).rejects.toThrow(
      'La solicitud requiere una decisión de no procedencia por deber de conservación.',
    );
    expect(erasurePort.anonymize).not.toHaveBeenCalled();
  });

  it('CA-O1-02: SUSPENDED → ARCHIVED hace un año deja retención y terminated_at es la fecha de archivo', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract({
      subscriberId,
      status: ContractStatus.SUSPENDED,
      statusChangedAt: yearsAgo(1),
    });
    const before = Date.now();

    await inTenant(() => contracts.archive(contractId, actorId));

    const row = await contractRow(contractId);
    expect(row.status).toBe(ContractStatus.ARCHIVED);
    expect(row.terminated_at).toBeInstanceOf(Date);
    expect(row.terminated_at!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const requestId = await createSuppression(partyId);
    await expect(resolveSuppression(requestId)).rejects.toThrow(ConflictException);
  });

  it('CA-O1-03: terminado hace 6 años y editado ayer no retiene, y el reloj es la terminación y no la edición', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const terminatedAt = yearsAgo(6);
    const contractId = await insertContract({
      subscriberId,
      status: ContractStatus.TERMINATED,
      terminatedAt,
      statusChangedAt: terminatedAt,
    });
    // La escritura pasa por el trigger de 169, que resuelve `subscribers` sin esquema: se ejecuta
    // con el search_path del tenant.
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(`UPDATE contracts SET alias = 'Alias editado', updated_at = $2 WHERE id = $1`, [
        contractId,
        daysAgo(1),
      ]),
    );

    const result = await standingOf(partyId);

    expect(result.lastTerminatedAt).not.toBeNull();
    expect(new Date(result.lastTerminatedAt!).getTime()).toBe(terminatedAt.getTime());
    const requestId = await createSuppression(partyId);
    const resolved = await resolveSuppression(requestId);
    expect(resolved.request.status).toBe('RESUELTA');
  });

  it('CA-O1-04: borrador borrado lógicamente no cuenta como abierto y no bloquea SUPRIMIR', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const deletedDraftId = await insertContract({
      subscriberId,
      status: ContractStatus.DRAFT,
      deletedAt: daysAgo(3),
    });
    const terminatedAt = yearsAgo(6);
    await insertContract({
      subscriberId,
      status: ContractStatus.TERMINATED,
      terminatedAt,
      statusChangedAt: terminatedAt,
    });

    const result = await standingOf(partyId);

    expect(result.openContractIds).not.toContain(deletedDraftId);
    const requestId = await createSuppression(partyId);
    const resolved = await resolveSuppression(requestId);
    expect(resolved.request.status).toBe('RESUELTA');
  });

  it('CA-O1-06: TERMINATED → ARCHIVED sobre titular anonimizado conserva terminated_at', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId, true);
    const terminatedAt = yearsAgo(2);
    const contractId = await insertContract({
      subscriberId,
      status: ContractStatus.TERMINATED,
      terminatedAt,
      statusChangedAt: terminatedAt,
    });

    await inTenant(() => contracts.archive(contractId, actorId));

    const row = await contractRow(contractId);
    expect(row.status).toBe(ContractStatus.ARCHIVED);
    expect(row.terminated_at?.getTime()).toBe(terminatedAt.getTime());
  });

  it('CA-O1-08: el ciclo de vida fija terminated_at al terminar un contrato activo', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract({ subscriberId, status: ContractStatus.ACTIVE });

    await inTenant(() =>
      lifecycle.terminate(
        subscriberId,
        { reasonCode: 'SOLICITUD_TITULAR', contractIds: [contractId] },
        actorId,
      ),
    );

    const row = await contractRow(contractId);
    expect(row.status).toBe(ContractStatus.TERMINATED);
    expect(row.terminated_at).toBeInstanceOf(Date);
  });

  it('CA-O1-08: _transition fija terminated_at al archivar y el titular queda con su reloj', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract({
      subscriberId,
      status: ContractStatus.SUSPENDED,
      statusChangedAt: daysAgo(1),
    });

    await inTenant(() => contracts.archive(contractId, actorId));

    const row = await contractRow(contractId);
    expect(row.status).toBe(ContractStatus.ARCHIVED);
    expect(row.terminated_at).toBeInstanceOf(Date);
  });
});
