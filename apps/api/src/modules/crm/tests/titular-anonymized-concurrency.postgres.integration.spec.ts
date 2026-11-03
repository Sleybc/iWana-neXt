import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { APP_FILTER, Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import request, { type Response as SupertestResponse } from 'supertest';
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { SubscriberStatus, TaxProfileStatus, UserRole } from '@iwana/shared';
import { AbacGuard } from '../../auth/guards/abac.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { TenantContextMissingFilter } from '../../../common/filters/tenant-context-missing.filter';
import { ContractStatus } from '../enums/contract-status.enum';
import { Contract } from '../contracts/entities/contract.entity';
import { ContractsController } from '../contracts/contracts.controller';
import { ContractsService } from '../contracts/contracts.service';
import { ContractsBlockedTitularGuard } from '../contracts/guards/contracts-blocked-titular.guard';
import { SubscribersService } from '../subscribers/subscribers.service';
import { Subscriber } from '../subscribers/entities/subscriber.entity';
import { SubscribersBlockedTitularGuard } from '../subscribers/guards/subscribers-blocked-titular.guard';
import { SubscriberFiscalCompletenessService } from '../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../subscribers/subscriber-lifecycle.service';
import { SubscriberTaxProfile } from '../subscribers/entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from '../subscribers/entities/subscriber-tax-assignment.entity';
import { SubscriberTaxProfileService } from '../subscribers/subscriber-tax-profile.service';
import { CommercialCatalogReadAdapter } from '../../commercial/ports/commercial-catalog-read.adapter';
import { InternetVatResolverAdapter } from '../../taxation/ports/internet-vat-resolver.adapter';
import { TaxCatalogReadAdapter } from '../../taxation/ports/tax-catalog-read.adapter';
import { TaxApplicationService } from '../../taxation/services/tax-application.service';
import { AssetLoanReadPortAdapter } from '../../inventory/ports/asset-loan-read.port';
import { AssetLoanService } from '../../inventory/services/asset-loan.service';
import { ExecutionOrdersService } from '../../tasks/services/execution-orders.service';
import { IPrivacyAuthorizationReadPort } from '../../privacy/ports/privacy-authorization-read.port';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { IContractImpersonationPort } from '../../privacy/ports/contract-impersonation.port';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';
import { IPersonalDataErasurePort } from '../../privacy/ports/personal-data-erasure.port';
import { PrivacyRequestsController } from '../../privacy/requests/requests.controller';
import { PrivacyRequestsService } from '../../privacy/requests/requests.service';
import { PrivacyMarksAdapter } from '../../privacy/marks/privacy-marks.adapter';
import { PrivacyAuthorizationAdapter } from '../../privacy/authorizations/privacy-authorization.adapter';
import { CrmContractImpersonationAdapter } from '../privacy-adapters/crm-contract-impersonation.adapter';
import { CrmContractStandingReadAdapter } from '../privacy-adapters/crm-contract-standing-read.adapter';
import { CrmPersonalDataErasureAdapter } from '../privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { AuditActorResolver } from '../../audit/audit-actor.resolver';
import { AuditService } from '../../audit/audit.service';
import { PlatformAuditService } from '../../audit/platform-audit.service';
import { AuditLog, MediaAsset, PlatformAuditLog } from '@iwana/db';
import { PartyPrivacyMarkEntity } from '../../privacy/entities/party-privacy-mark.entity';
import { MediaService } from '../../media/media.service';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
  TENANT_MIGRATIONS,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { PreventAnonymizedCrmMutations1690000000000 } from '../../../../../../packages/database/src/migrations/tenant/169_prevent_anonymized_crm_mutations';

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;
const lockNamespace = 728173;
const contractGateKey = 41001;
const erasureGateKey = 41002;
const contractRedactedColumns = [
  'installation_address',
  'installation_postal_code',
  'installation_notes',
  'fiscal_name',
  'fiscal_document',
  'fiscal_document_encrypted',
  'fiscal_document_hmac',
  'fiscal_address',
  'alias',
  'vat_snapshot',
  'plan_snapshot_json',
] as const;

interface TestRequest {
  user?: JwtPayload;
}

interface PgActivity {
  pid: number;
}

interface SubjectFixture {
  partyId: string;
  subscriberId: string;
  contractId: string | null;
  document: string;
}

interface ReadySuppression {
  requestId: string;
  expedienteIds: string[];
}

interface PendingResponse {
  response?: SupertestResponse;
  error?: unknown;
}

interface SqlWriterResult {
  error?: unknown;
  affectedRows?: number;
}

interface SqlWriterHandle {
  pid: number;
  result: Promise<SqlWriterResult>;
}

interface ContractRowLock {
  pid: number;
  release(): Promise<void>;
}

async function expectPrivacyAnonymizedConflict(action: () => Promise<unknown>): Promise<void> {
  let failure: unknown;
  try {
    await action();
  } catch (error: unknown) {
    failure = error;
  }

  if (!(failure instanceof ConflictException)) {
    throw failure ?? new Error('La escritura de un titular anonimizado no fue rechazada.');
  }
  expect(failure.getStatus()).toBe(409);
  expect(failure.getResponse()).toMatchObject({ code: 'PRIVACY_TITULAR_ANONYMIZED' });
}

describeWithDb('DT-3 RER: concurrencia de titular anonimizado contra PostgreSQL real', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let migrationDataSource: DataSource;
  let tenantId: string;
  let tenantSlug: string;
  let schemaName: string;
  let actorId: string;
  let previousPgOptions: string | undefined;
  let contractImpersonationAdapter: CrmContractImpersonationAdapter;
  let subscriberTaxProfileService: SubscriberTaxProfileService;
  let subscriberLifecycleService: SubscriberLifecycleService;

  const context = () => ({ tenantId, schemaName, tenantSlug });
  const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

  function authed(method: 'get' | 'post' | 'patch', path: string) {
    return request(app.getHttpServer())[method](`/api/v1${path}`).set('x-tenant-slug', tenantSlug);
  }

  async function createSubject(
    contractStatus: ContractStatus | null = ContractStatus.ARCHIVED,
  ): Promise<SubjectFixture> {
    const subscriberId = randomUUID();
    const partyId = randomUUID();
    const tag = [...subscriberId.replaceAll('-', '').slice(0, 10)]
      .map((character) => String(parseInt(character, 16) % 10))
      .join('');
    const document = `900${tag}`;

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, 'Fixture DT3')`,
        [partyId, document],
      );
      await qr.query(
        `INSERT INTO subscribers (
           id, tenant_id, party_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, nit, business_name,
           email_encrypted, phone_encrypted, vat_treatment, tax_regime,
           vat_responsibility, rut_responsibilities, address, created_by
         ) VALUES (
           $1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', $4, 'Fixture', 'DT3', 2,
           $5, 'Fixture DT3 SAS', $4, $4, 'STANDARD', 'SIMPLIFIED',
           'RESPONSABLE', ARRAY['O-13']::text[], 'Dirección sintética', $6
         )`,
        [subscriberId, tenantId, partyId, `encrypted-${tag}`, `900000000-${tag}`, actorId],
      );
    });

    let contractId: string | null = null;
    if (contractStatus) {
      contractId = randomUUID();
      const terminalAt =
        contractStatus === ContractStatus.TERMINATED || contractStatus === ContractStatus.ARCHIVED
          ? new Date('2020-01-01T00:00:00.000Z')
          : null;
      await runInTenantSchema(dataSource, schemaName, async (qr) => {
        const contract = Object.assign(new Contract(), {
          id: contractId,
          tenantId,
          quoteId: null,
          subscriberId,
          planId: 'plan-dt3-fixture',
          planSnapshotJson: { id: 'plan-dt3-fixture', name: 'Fixture DT3' },
          status: contractStatus,
          statusReasonCode: null,
          statusChangedAt: new Date('2020-01-01T00:00:00.000Z'),
          terminatedAt: terminalAt,
          alias: 'Servicio sintético DT3',
          installationAddress: 'Dirección sintética DT3',
          installationCity: 'Bogotá',
          installationDepartment: 'Cundinamarca',
          installationPostalCode: '110111',
          installationNotes: 'Notas sintéticas DT3',
          customerSegment: null,
          serviceUsage: 'RESIDENTIAL',
          installationStratum: 2,
          stratumEvidenceMediaId: null,
          vatSnapshot: null,
          additionalProductIds: [],
          additionalServiceIds: [],
          paymentMethod: null,
          billingCycle: null,
          billingCycleDay: null,
          fiscalName: 'Fixture DT3',
          fiscalDocument: '9000000000',
          fiscalAddress: 'Dirección fiscal sintética',
          startDate: null,
          endDate: null,
          deletedAt: null,
        });
        await qr.manager.save(Contract, contract);
        if (contractStatus === ContractStatus.TERMINATED) {
          // Sitúa la terminación fuera del plazo de conservación configurado.
          await qr.query(
            `UPDATE contracts SET updated_at = clock_timestamp() - interval '30 years'
              WHERE id = $1`,
            [contractId],
          );
        }
      });
    }

    return { partyId, subscriberId, contractId, document };
  }

  async function createReadySuppression(subject: SubjectFixture): Promise<ReadySuppression> {
    const create = await authed('post', '/privacy/requests').send({
      kind: 'CONSULTA',
      right: 'SUPRIMIR',
      requesterKind: 'TITULAR',
      requesterName: 'Fixture titular DT3',
      requesterDocumentType: 'CC',
      requesterDocument: subject.document,
      requesterContact: 'fixture-dt3@example.invalid',
      partyId: subject.partyId,
    });
    expect(create.status).toBe(201);
    const requestId = String(create.body.data.request.id);

    const verified = await authed('post', `/privacy/requests/${requestId}/verify-identity`).send({
      identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
    });
    expect(verified.status).toBe(201);

    const completed = await authed('post', `/privacy/requests/${requestId}/complete`).send({});
    expect(completed.status).toBe(201);

    const preview = await authed('get', `/privacy/requests/${requestId}/erasure-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.eligible).toBe(true);
    return {
      requestId,
      expedienteIds: preview.body.data.candidateExpedienteIds as string[],
    };
  }

  function captureResponse(pending: PromiseLike<SupertestResponse>): Promise<PendingResponse> {
    return Promise.resolve(pending).then(
      (response) => ({ response }),
      (error: unknown) => ({ error }),
    );
  }

  function beginResolve(suppression: ReadySuppression): Promise<PendingResponse> {
    return captureResponse(
      authed('post', `/privacy/requests/${suppression.requestId}/resolve`).send({
        responseText: 'Solicitud sintética resuelta conforme al procedimiento.',
        responseChannel: 'EMAIL',
        erasure: { confirm: true, expedienteIds: suppression.expedienteIds },
      }),
    );
  }

  async function beginSubscriberSqlWriter(
    subscriberId: string,
    firstName: string,
  ): Promise<SqlWriterHandle> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO ${quote(schemaName)}`);
    const pidRows = (await runner.query('SELECT pg_backend_pid() AS pid')) as PgActivity[];
    const pid = Number(pidRows[0]?.pid);
    const result = runner
      .query('UPDATE subscribers SET first_name = $2 WHERE id = $1', [subscriberId, firstName])
      .then(async () => {
        const rows = (await runner.query('SELECT id FROM subscribers WHERE id = $1', [
          subscriberId,
        ])) as Array<{ id: string }>;
        await runner.commitTransaction();
        return { affectedRows: rows.length };
      })
      .catch(async (error: unknown) => {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        return { error };
      })
      .finally(async () => runner.release());
    return { pid, result };
  }

  function postgresCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('driverError' in error)) return undefined;
    const driverError = (error as { driverError?: { code?: unknown } }).driverError;
    return typeof driverError?.code === 'string' ? driverError.code : undefined;
  }

  async function waitForBlockedBackend(queryPattern: string): Promise<number> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const rows = (await dataSource.query(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query ILIKE $1
          ORDER BY query_start LIMIT 1`,
        [queryPattern],
      )) as PgActivity[];
      if (rows[0]) return Number(rows[0].pid);
      await dataSource.query('SELECT pg_sleep(0.01)');
    }
    throw new Error(`PostgreSQL no mostró una conexión esperando por ${queryPattern}.`);
  }

  async function waitUntilBlockedBy(blockerPid: number, queryPattern = '%'): Promise<number> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const rows = (await dataSource.query(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
            AND query ILIKE $2
          ORDER BY query_start LIMIT 1`,
        [blockerPid, queryPattern],
      )) as PgActivity[];
      if (rows[0]) return Number(rows[0].pid);
      await dataSource.query('SELECT pg_sleep(0.01)');
    }
    throw new Error(`No apareció una espera bloqueada por el backend ${blockerPid}.`);
  }

  async function waitUntilPidBlockedBy(blockerPid: number, waitingPid: number): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const rows = (await dataSource.query(
        `SELECT $2 = ANY(pg_blocking_pids(pid)) AS blocked
           FROM pg_stat_activity WHERE pid = $1 AND datname = current_database()
             AND wait_event_type = 'Lock'`,
        [waitingPid, blockerPid],
      )) as Array<{ blocked: boolean }>;
      if (rows[0]?.blocked) return;
      await dataSource.query('SELECT pg_sleep(0.01)');
    }
    throw new Error(`El backend ${waitingPid} no quedó bloqueado por ${blockerPid}.`);
  }

  async function waitForBlockedMutationOrResponse(
    blockerPid: number,
    queryPattern: string,
    pending: Promise<PendingResponse>,
  ): Promise<{ kind: 'blocked'; pid: number } | { kind: 'completed'; result: PendingResponse }> {
    let completed: PendingResponse | undefined;
    void pending.then((result) => {
      completed = result;
    });
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (completed) return { kind: 'completed', result: completed };
      const rows = (await dataSource.query(
        `SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
            AND query ILIKE $2
          ORDER BY query_start LIMIT 1`,
        [blockerPid, queryPattern],
      )) as PgActivity[];
      if (rows[0]) return { kind: 'blocked', pid: Number(rows[0].pid) };
      await dataSource.query('SELECT pg_sleep(0.01)');
    }
    if (completed) return { kind: 'completed', result: completed };
    throw new Error(`No apareció una espera bloqueada por el backend ${blockerPid}.`);
  }

  async function holdAdvisoryGate(key: number) {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query('SELECT pg_advisory_lock($1, $2)', [lockNamespace, key]);
    return {
      release: async () => {
        await runner.query('SELECT pg_advisory_unlock($1, $2)', [lockNamespace, key]);
        await runner.release();
      },
    };
  }

  async function holdContractRow(contractId: string): Promise<ContractRowLock> {
    const runner = dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query(`SET LOCAL search_path TO ${quote(schemaName)}`);
      const rows = (await runner.query('SELECT pg_backend_pid() AS pid')) as PgActivity[];
      await runner.query('SELECT id FROM contracts WHERE id = $1 FOR UPDATE', [contractId]);
      let released = false;

      return {
        pid: Number(rows[0]?.pid),
        release: async () => {
          if (released) return;
          released = true;
          if (runner.isTransactionActive) await runner.commitTransaction();
          await runner.release();
        },
      };
    } catch (error: unknown) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (!runner.isReleased) await runner.release();
      throw error;
    }
  }

  function redactedContractSnapshot(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(contractRedactedColumns.map((column) => [column, row[column]]));
  }

  async function contractSnapshot(contractId: string) {
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT to_jsonb(c) AS row, c.updated_at AS updated_at
           FROM contracts c WHERE c.id = $1`,
        [contractId],
      ),
    )) as Array<{ row: Record<string, unknown>; updated_at: Date }>;
    return rows[0]!;
  }

  async function subscriberSnapshot(subscriberId: string) {
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT to_jsonb(s) AS row FROM subscribers s WHERE s.id = $1', [subscriberId]),
    )) as Array<{ row: Record<string, unknown> }>;
    return rows[0]!;
  }

  async function taxProfileSnapshot(subscriberId: string) {
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        'SELECT to_jsonb(p) AS row FROM subscriber_tax_profiles p WHERE p.subscriber_id = $1',
        [subscriberId],
      ),
    )) as Array<{ row: Record<string, unknown> }>;
    return rows[0]!;
  }

  beforeAll(async () => {
    previousPgOptions = process.env['PGOPTIONS'];
    process.env['PGOPTIONS'] = [previousPgOptions, '-c statement_timeout=20000']
      .filter(Boolean)
      .join(' ');

    migrationDataSource = new DataSource({
      ...(dataSourceOptions as PostgresConnectionOptions),
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 20, min: 1 },
    });
    await migrationDataSource.initialize();
    tenantId = randomUUID();
    tenantSlug = `dt3-rer-${tenantId.slice(0, 8)}`;
    schemaName = `tenant_dt3_rer_${randomUUID().replaceAll('-', '')}`;
    actorId = randomUUID();
    await migrationDataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'DT-3 synthetic', tenantSlug, schemaName, 'dt3@example.invalid'],
    );
    await migrationDataSource.query(`CREATE SCHEMA ${quote(schemaName)}`);
    const tenantDataSource = createTenantDataSource(migrationDataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      const migration169Name = new PreventAnonymizedCrmMutations1690000000000().name;
      const migration169Registered = TENANT_MIGRATIONS.some(
        (MigrationClass) => new MigrationClass().name === migration169Name,
      );
      if (!migration169Registered) {
        throw new Error('[B3 fixture] La migración 169 no está registrada en TENANT_MIGRATIONS.');
      }
      await applyTenantMigrationsInOrder(tenantDataSource);
      const appliedMigrationRows = (await tenantDataSource.query(
        'SELECT name FROM typeorm_migrations WHERE name = $1',
        [migration169Name],
      )) as Array<{ name: string }>;
      if (appliedMigrationRows.length !== 1) {
        throw new Error('[B3 fixture] La cadena no aplicó la migración 169.');
      }
    } finally {
      await tenantDataSource.destroy();
    }

    dataSource = new DataSource({
      ...(dataSourceOptions as PostgresConnectionOptions),
      entities: [
        Contract,
        Subscriber,
        SubscriberTaxProfile,
        SubscriberTaxAssignment,
        AuditLog,
        PlatformAuditLog,
        MediaAsset,
        PartyPrivacyMarkEntity,
      ],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 20, min: 1 },
    });
    await dataSource.initialize();

    const config = new ConfigService({
      PII_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
      PII_HASH_KEY: 'fedcba9876543210'.repeat(4),
      STORAGE_DRIVER: 'local',
    });
    const auditActorResolver = new AuditActorResolver(dataSource);
    const platformAuditService = new PlatformAuditService(dataSource, auditActorResolver);
    const auditService = new AuditService(dataSource, platformAuditService);
    const privacyMarksAdapter = new PrivacyMarksAdapter(dataSource);
    const privacyAuthorizationAdapter = new PrivacyAuthorizationAdapter(dataSource);
    const eventEmitter = new EventEmitter2();
    contractImpersonationAdapter = new CrmContractImpersonationAdapter(
      dataSource,
      eventEmitter,
      auditService,
    );
    const taxCatalogReadAdapter = new TaxCatalogReadAdapter(dataSource);
    subscriberTaxProfileService = new SubscriberTaxProfileService(
      dataSource,
      taxCatalogReadAdapter,
      new TaxApplicationService(dataSource, taxCatalogReadAdapter),
      auditService,
    );
    subscriberLifecycleService = new SubscriberLifecycleService(
      dataSource,
      auditService,
      new AssetLoanReadPortAdapter(new AssetLoanService(dataSource)),
      new ExecutionOrdersService(dataSource),
      config,
    );
    const erasureAdapter = new CrmPersonalDataErasureAdapter(
      new CrmTitularErasureParticipant(config),
      new PartyTitularErasureParticipant(config),
      new UserAccountErasureParticipant(config),
      new WfmTitularErasureParticipant(config),
      new ExecutionOrderTitularErasureParticipant(config),
      new OperationalTaskTitularErasureParticipant(config),
      new MediaTitularErasureParticipant(),
    );
    const storage = {} as StoragePort;
    const mediaService = new MediaService(dataSource.getRepository(MediaAsset), storage, config);
    const requestsService = new PrivacyRequestsService(
      dataSource,
      config,
      auditService,
      contractImpersonationAdapter,
      new CrmContractStandingReadAdapter(),
      mediaService,
      undefined,
      erasureAdapter,
    );
    const contractsService = new ContractsService(
      dataSource,
      new CommercialCatalogReadAdapter(dataSource),
      new InternetVatResolverAdapter(),
      auditService,
      mediaService,
      config,
      new SubscriberFiscalCompletenessService(),
      {} as SubscriberLifecycleService,
      privacyAuthorizationAdapter,
      privacyMarksAdapter,
    );
    const subscriberReadService = {
      findById: async (id: string) => {
        const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
          qr.manager.findOne(Subscriber, { where: { id } }),
        )) as Subscriber | null;
        if (!rows) throw new Error(`No existe el suscriptor fixture ${id}.`);
        return rows;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ContractsController, PrivacyRequestsController],
      providers: [
        { provide: APP_FILTER, useClass: TenantContextMissingFilter },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ContractsService, useValue: contractsService },
        { provide: PrivacyRequestsService, useValue: requestsService },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: async () => [] },
        },
        { provide: IPrivacyMarksReadPort, useValue: privacyMarksAdapter },
        { provide: IPrivacyAuthorizationReadPort, useValue: privacyAuthorizationAdapter },
        { provide: IContractImpersonationPort, useValue: contractImpersonationAdapter },
        { provide: IContractStandingReadPort, useValue: new CrmContractStandingReadAdapter() },
        { provide: IPersonalDataErasurePort, useValue: erasureAdapter },
        { provide: AuditService, useValue: auditService },
        { provide: MediaService, useValue: mediaService },
        { provide: STORAGE_PORT, useValue: storage },
        { provide: ConfigService, useValue: config },
        { provide: SubscribersService, useValue: subscriberReadService },
        {
          provide: Reflector,
          useValue: new Reflector(),
        },
        ContractsBlockedTitularGuard,
        {
          provide: SubscribersBlockedTitularGuard,
          useFactory: (reflector: Reflector) =>
            new SubscribersBlockedTitularGuard(
              reflector,
              subscriberReadService as unknown as SubscribersService,
              privacyMarksAdapter,
            ),
          inject: [Reflector],
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (execution: {
          switchToHttp: () => { getRequest: <T extends TestRequest>() => T };
        }) => {
          const req = execution.switchToHttp().getRequest<TestRequest>();
          req.user = {
            sub: actorId,
            email: 'dt3-integration-user',
            role: UserRole.ADMIN,
            tenantId,
            schemaName,
            jti: randomUUID(),
            type: 'tenant',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AbacGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.use((_request: ExpressRequest, _response: ExpressResponse, next: NextFunction) =>
      TenantContext.run(context(), next),
    );
    await app.init();

    const apiRole = String((dataSource.options as PostgresConnectionOptions).username ?? '');
    const migrationRole = String(
      (migrationDataSource.options as PostgresConnectionOptions).username ?? '',
    );
    if (apiRole && migrationRole && apiRole !== migrationRole) {
      await migrationDataSource.query(
        `GRANT USAGE ON SCHEMA ${quote(schemaName)} TO ${quote(apiRole)}`,
      );
      await migrationDataSource.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${quote(schemaName)} TO ${quote(apiRole)}`,
      );
      await migrationDataSource.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${quote(schemaName)} TO ${quote(apiRole)}`,
      );
    }

    await migrationDataSource.query(`
      CREATE FUNCTION ${quote(schemaName)}.dt3_contract_gate()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.alias LIKE 'DT3_GATE%' THEN
          PERFORM pg_advisory_xact_lock(${lockNamespace}, ${contractGateKey});
        END IF;
        RETURN NEW;
      END;
      $function$`);
    await migrationDataSource.query(`
      CREATE TRIGGER dt3_contract_gate BEFORE UPDATE OF alias ON ${quote(schemaName)}.contracts
      FOR EACH ROW EXECUTE FUNCTION ${quote(schemaName)}.dt3_contract_gate()`);
    await migrationDataSource.query(`
      CREATE FUNCTION ${quote(schemaName)}.dt3_erasure_gate()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
          PERFORM pg_advisory_xact_lock(${lockNamespace}, ${erasureGateKey});
        END IF;
        RETURN NEW;
      END;
      $function$`);
    await migrationDataSource.query(`
      CREATE TRIGGER dt3_erasure_gate BEFORE UPDATE OF anonymized_at ON ${quote(schemaName)}.subscribers
      FOR EACH ROW EXECUTE FUNCTION ${quote(schemaName)}.dt3_erasure_gate()`);
    await migrationDataSource.query(`
      CREATE FUNCTION ${quote(schemaName)}.dt3_subscriber_gate()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF NEW.first_name LIKE 'DT3_GATE%' THEN
          PERFORM pg_advisory_xact_lock(${lockNamespace}, ${contractGateKey});
        END IF;
        RETURN NEW;
      END;
      $function$`);
    await migrationDataSource.query(`
      CREATE TRIGGER dt3_subscriber_gate BEFORE UPDATE OF first_name ON ${quote(schemaName)}.subscribers
      FOR EACH ROW EXECUTE FUNCTION ${quote(schemaName)}.dt3_subscriber_gate()`);

    const mutationTriggers = (await migrationDataSource.query(
      `SELECT count(*)::int AS count
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND t.tgname LIKE 'trg_%_prevent_anonymized_mutation'`,
      [schemaName],
    )) as Array<{ count: number }>;
    expect(Number(mutationTriggers[0]?.count)).toBe(3);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (migrationDataSource?.isInitialized) {
      await migrationDataSource.query(`DROP SCHEMA IF EXISTS ${quote(schemaName)} CASCADE`);
      await migrationDataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await migrationDataSource.destroy();
    }
    if (previousPgOptions === undefined) delete process.env['PGOPTIONS'];
    else process.env['PGOPTIONS'] = previousPgOptions;
  });

  it('CA-RER-08: migration 169 queda aplicada por la cadena tenant', async () => {
    const migration169Name = new PreventAnonymizedCrmMutations1690000000000().name;
    const rows = (await runInTenantSchema(migrationDataSource, schemaName, (qr) =>
      qr.query('SELECT name FROM typeorm_migrations WHERE name = $1', [migration169Name]),
    )) as Array<{ name: string }>;
    expect(rows).toEqual([{ name: migration169Name }]);
  });

  it('CA-RER-01: resolve real suprime y el PATCH HTTP conserva las columnas redactadas byte por byte', async () => {
    const subject = await createSubject();
    const suppression = await createReadySuppression(subject);
    const resolved = await beginResolve(suppression);
    expect(resolved.response?.status).toBe(201);
    expect(resolved.response?.body.data.request.erasedAt).toBeTruthy();

    const before = await contractSnapshot(subject.contractId!);
    const patch = await authed('patch', `/crm/contracts/${subject.contractId}`).send({
      alias: 'Intento de restaurar alias',
      installationNotes: 'Intento de restaurar notas',
    });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('PRIVACY_TITULAR_ANONYMIZED');
    expect(await contractSnapshot(subject.contractId!)).toEqual(before);
    expect(before.row['alias']).toBe('ANONIMIZADO');
    expect(before.row['installation_notes']).toBeNull();
  });

  it('CA-RER-03: archive HTTP de un contrato TERMINATED solo modifica las cuatro columnas permitidas', async () => {
    const subject = await createSubject(ContractStatus.TERMINATED);
    const suppression = await createReadySuppression(subject);
    const resolved = await beginResolve(suppression);
    expect(resolved.response?.status).toBe(201);

    const before = await contractSnapshot(subject.contractId!);
    const archive = await authed('post', `/crm/contracts/${subject.contractId}/archive`).send({});
    expect(archive.status).toBe(200);

    const after = await contractSnapshot(subject.contractId!);
    expect(after.row['status']).toBe(ContractStatus.ARCHIVED);
    const mutableColumns = ['status', 'status_reason_code', 'status_changed_at', 'updated_at'];
    const beforeStable = Object.fromEntries(
      Object.entries(before.row).filter(([key]) => !mutableColumns.includes(key)),
    );
    const afterStable = Object.fromEntries(
      Object.entries(after.row).filter(([key]) => !mutableColumns.includes(key)),
    );
    expect(afterStable).toEqual(beforeStable);
  });

  it('B3-R: confirmar perfil tributario de un titular anonimizado responde 409 y conserva la fila', async () => {
    const subject = await createSubject(null);
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.manager.save(
        SubscriberTaxProfile,
        Object.assign(new SubscriberTaxProfile(), {
          tenantId,
          subscriberId: subject.subscriberId,
          segment: 'RESIDENTIAL',
          stratumAtSuggestion: 2,
          profileStatus: TaxProfileStatus.PENDING_REVIEW,
          confirmedAt: null,
          confirmedBy: null,
        }),
      );
    });
    const suppression = await createReadySuppression(subject);
    expect((await beginResolve(suppression)).response?.status).toBe(201);

    const before = await taxProfileSnapshot(subject.subscriberId);
    await expectPrivacyAnonymizedConflict(() =>
      TenantContext.run(context(), () =>
        subscriberTaxProfileService.confirmProfile(subject.subscriberId, actorId),
      ),
    );
    expect(await taxProfileSnapshot(subject.subscriberId)).toEqual(before);
  });

  it('B3-R: cancelar el ciclo de vida de un titular anonimizado responde 409 y conserva la fila', async () => {
    const subject = await createSubject(null);
    const suppression = await createReadySuppression(subject);
    expect((await beginResolve(suppression)).response?.status).toBe(201);

    const before = await subscriberSnapshot(subject.subscriberId);
    await expectPrivacyAnonymizedConflict(() =>
      TenantContext.run(context(), () =>
        subscriberLifecycleService.cancelSubscriber(
          subject.subscriberId,
          { targetStatus: SubscriberStatus.CANCELLED, reasonCode: 'SOLICITUD_TITULAR' },
          actorId,
        ),
      ),
    );
    expect(await subscriberSnapshot(subject.subscriberId)).toEqual(before);
  });

  it('B3-R: suspender por impersonation a un titular anonimizado responde 409 y conserva el contrato', async () => {
    const subject = await createSubject(ContractStatus.TERMINATED);
    const suppression = await createReadySuppression(subject);
    expect((await beginResolve(suppression)).response?.status).toBe(201);

    const before = await contractSnapshot(subject.contractId!);
    await expectPrivacyAnonymizedConflict(() =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        contractImpersonationAdapter.suspendForImpersonation(
          {
            partyId: subject.partyId,
            contractIds: [subject.contractId!],
            requestId: randomUUID(),
            actorId,
          },
          { manager: qr.manager },
        ),
      ),
    );
    expect(await contractSnapshot(subject.contractId!)).toEqual(before);
  });

  it('CA-RER-04: un PATCH que obtuvo primero los bloqueos confirma antes de resolve real', async () => {
    const subject = await createSubject();
    const suppression = await createReadySuppression(subject);
    const gate = await holdAdvisoryGate(contractGateKey);
    const writer = captureResponse(
      authed('patch', `/crm/contracts/${subject.contractId}`).send({ alias: 'DT3_GATE_WRITER' }),
    );
    let releaseGate = true;
    try {
      const writerPid = await waitForBlockedBackend('%UPDATE%contracts%');
      const resolver = beginResolve(suppression);
      await waitUntilBlockedBy(writerPid);
      await gate.release();
      releaseGate = false;

      const writerResult = await writer;
      const resolverResult = await resolver;
      expect(writerResult.response?.status).toBe(200);
      expect(resolverResult.response?.status).toBe(201);
      const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `SELECT c.alias, c.installation_notes, c.fiscal_name, s.anonymized_at,
                  r.erased_at
             FROM contracts c JOIN subscribers s ON s.id = c.subscriber_id
             CROSS JOIN data_subject_requests r
            WHERE c.id = $1 AND r.id = $2`,
          [subject.contractId, suppression.requestId],
        ),
      )) as Array<Record<string, unknown>>;
      expect(rows[0]).toMatchObject({
        alias: 'ANONIMIZADO',
        installation_notes: null,
        fiscal_name: null,
      });
      expect(rows[0]?.['anonymized_at']).toBeTruthy();
      expect(rows[0]?.['erased_at']).toBeTruthy();
      const residual = (await runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `SELECT count(*)::int AS count FROM contracts
            WHERE id = $1 AND (alias <> 'ANONIMIZADO' OR installation_notes IS NOT NULL
              OR fiscal_name IS NOT NULL OR fiscal_document IS NOT NULL OR fiscal_address IS NOT NULL)`,
          [subject.contractId],
        ),
      )) as Array<{ count: number }>;
      expect(Number(residual[0]?.count)).toBe(0);
    } finally {
      if (releaseGate) await gate.release();
    }
  });

  it('CA-RER-05: PATCH responde 409 y archive responde 200 sin restaurar campos redactados', async () => {
    const results: Array<{ operation: 'PATCH' | 'archive'; outcome: PendingResponse }> = [];
    for (const operation of ['PATCH', 'archive'] as const) {
      const subject = await createSubject(ContractStatus.TERMINATED);
      const suppression = await createReadySuppression(subject);
      const rowLock = await holdContractRow(subject.contractId!);
      let releaseRowLock = true;
      let resolver: Promise<PendingResponse> | undefined;
      let writer: Promise<PendingResponse> | undefined;
      try {
        resolver = beginResolve(suppression);
        const resolverPid = await waitUntilBlockedBy(rowLock.pid, '%contracts%');
        writer = captureResponse(
          operation === 'PATCH'
            ? authed('patch', `/crm/contracts/${subject.contractId}`).send({
                alias: 'Intento posterior a supresión',
              })
            : authed('post', `/crm/contracts/${subject.contractId}/archive`).send({}),
        );
        await waitUntilBlockedBy(resolverPid, '%FOR SHARE%');

        await rowLock.release();
        releaseRowLock = false;
        const resolveResult = await resolver;
        expect(resolveResult.response?.status).toBe(201);
        const postSuppressionSnapshot = await contractSnapshot(subject.contractId!);
        expect(redactedContractSnapshot(postSuppressionSnapshot.row)).toEqual({
          installation_address: null,
          installation_postal_code: null,
          installation_notes: null,
          fiscal_name: null,
          fiscal_document: null,
          fiscal_document_encrypted: null,
          fiscal_document_hmac: null,
          fiscal_address: null,
          alias: 'ANONIMIZADO',
          vat_snapshot: null,
          plan_snapshot_json: { id: 'plan-dt3-fixture' },
        });

        const outcome = await writer;
        results.push({ operation, outcome });
        expect(outcome.response?.status).toBe(operation === 'PATCH' ? 409 : 200);
        if (operation === 'PATCH') {
          expect(outcome.response?.body.code).toBe('PRIVACY_TITULAR_ANONYMIZED');
        }
        expect(postSuppressionSnapshot.row['alias']).toBe('ANONIMIZADO');
        expect(postSuppressionSnapshot.row['installation_notes']).toBeNull();
        expect(postSuppressionSnapshot.row['fiscal_name']).toBeNull();
        const finalSnapshot = await contractSnapshot(subject.contractId!);
        expect(redactedContractSnapshot(finalSnapshot.row)).toEqual(
          redactedContractSnapshot(postSuppressionSnapshot.row),
        );
        expect(finalSnapshot.row['status']).toBe(
          operation === 'archive' ? ContractStatus.ARCHIVED : ContractStatus.TERMINATED,
        );
      } finally {
        if (releaseRowLock) await rowLock.release();
        if (resolver) await resolver;
        if (writer) await writer;
      }
    }
    expect(results.map(({ outcome }) => outcome.response?.status)).toEqual([409, 200]);
    expect(results.map(({ outcome }) => outcome.response?.body.code)).toEqual([
      'PRIVACY_TITULAR_ANONYMIZED',
      undefined,
    ]);
  });

  it('CA-RER-09: un DRAFT creado en otra conexión después de la vista previa activa conservación y revierte resolve', async () => {
    const subject = await createSubject(null);
    const suppression = await createReadySuppression(subject);
    await createSubjectContract(subject.subscriberId, ContractStatus.DRAFT);

    const result = await beginResolve(suppression);
    expect(result.response?.status).toBe(409);
    expect(String(result.response?.body.message)).toContain('deber de conservación');
    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT s.anonymized_at, r.erased_at
           FROM subscribers s CROSS JOIN data_subject_requests r
          WHERE s.id = $1 AND r.id = $2`,
        [subject.subscriberId, suppression.requestId],
      ),
    )) as Array<{ anonymized_at: Date | null; erased_at: Date | null }>;
    expect(rows[0]).toEqual({ anonymized_at: null, erased_at: null });
  });

  it('CA-RER-10: 20 iteraciones alternando llegada de escritores y supresión sin deadlock', async () => {
    const deadlockBaseline = (await dataSource.query(
      'SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()',
    )) as Array<{ deadlocks: string | number }>;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const subject = await createSubject();
      const suppression = await createReadySuppression(subject);
      const startedAt = Date.now();

      if (iteration % 2 === 0) {
        const fichaWriter = await beginSubscriberSqlWriter(
          subject.subscriberId,
          'DT3_WRITER_FICHA',
        );
        const fichaWriterResult = await fichaWriter.result;
        expect(fichaWriterResult.error).toBeUndefined();
        expect(fichaWriterResult.affectedRows).toBe(1);

        const gate = await holdAdvisoryGate(contractGateKey);
        const writer = captureResponse(
          authed('patch', `/crm/contracts/${subject.contractId}`).send({
            alias: 'DT3_GATE_CONTRACT',
          }),
        );
        let releaseGate = true;
        try {
          const writerPid = await waitForBlockedBackend('%UPDATE%contracts%');
          const resolver = beginResolve(suppression);
          await waitUntilBlockedBy(writerPid, '%FROM subscribers%');
          await gate.release();
          releaseGate = false;
          const [contractResult, resolverResult] = await Promise.all([writer, resolver]);
          expect(contractResult.response?.status).toBe(200);
          expect(resolverResult.response?.status).toBe(201);
          expect(contractResult.response?.status).toBe(200);
        } finally {
          if (releaseGate) await gate.release();
        }
      } else {
        const gate = await holdAdvisoryGate(erasureGateKey);
        const resolver = beginResolve(suppression);
        let releaseGate = true;
        try {
          const resolverPid = await waitForBlockedBackend('%UPDATE%subscribers%');
          const contractWriter = captureResponse(
            authed('patch', `/crm/contracts/${subject.contractId}`).send({
              alias: 'DT3_CONTRACT_AFTER_ERASURE',
            }),
          );
          const fichaWriter = await beginSubscriberSqlWriter(
            subject.subscriberId,
            'DT3_FICHA_AFTER_ERASURE',
          );
          await waitUntilPidBlockedBy(resolverPid, fichaWriter.pid);
          await gate.release();
          releaseGate = false;
          const [resolverResult, contractResult, fichaResult] = await Promise.all([
            resolver,
            contractWriter,
            fichaWriter.result,
          ]);
          expect(resolverResult.response?.status).toBe(201);
          expect(contractResult.response ?? contractResult.error).toBeDefined();
          expect([undefined, '55000']).toContain(postgresCode(fichaResult.error));
        } finally {
          if (releaseGate) await gate.release();
        }
      }

      expect(Date.now() - startedAt).toBeLessThan(20_000);
    }
    const deadlockTotal = (await dataSource.query(
      'SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()',
    )) as Array<{ deadlocks: string | number }>;
    expect(Number(deadlockTotal[0]?.deadlocks) - Number(deadlockBaseline[0]?.deadlocks)).toBe(0);
  });

  async function createSubjectContract(
    subscriberId: string,
    status: ContractStatus,
  ): Promise<void> {
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.manager.save(
        Contract,
        Object.assign(new Contract(), {
          tenantId,
          quoteId: null,
          subscriberId,
          planId: 'plan-dt3-fixture',
          planSnapshotJson: { id: 'plan-dt3-fixture' },
          status,
          alias: 'Contrato DRAFT de fixture',
          installationAddress: null,
          installationCity: null,
          installationDepartment: null,
          installationPostalCode: null,
          installationNotes: null,
          customerSegment: null,
          serviceUsage: 'RESIDENTIAL',
          installationStratum: 2,
          stratumEvidenceMediaId: null,
          vatSnapshot: null,
          additionalProductIds: [],
          additionalServiceIds: [],
          paymentMethod: null,
          billingCycle: null,
          billingCycleDay: null,
          fiscalName: null,
          fiscalDocument: null,
          fiscalAddress: null,
          startDate: null,
          endDate: null,
          deletedAt: null,
        }),
      );
    });
  }
});
