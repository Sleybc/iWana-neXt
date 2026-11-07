import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import {
  AccessPermissionKey,
  DocumentTypeParty,
  ExpedienteStatus,
  normalizeDocumentNumber,
  SlaBreachStatus,
  TicketStatus,
  UserRole,
} from '@iwana/shared';
import {
  AuditLog,
  SupportTicket,
  TenantContext,
  TicketComment,
  runInTenantSchema,
} from '@iwana/db';
import { resolveMigrationDbCredentials } from '../../../../../../packages/database/src/db-credentials';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { hmacPii } from '../../../common/crypto/pii-hash-key.util';
import { encryptAes256Gcm } from '../../../common/crypto/aes-gcm.util';
import { AuditService } from '../../audit/audit.service';
import type { PlatformAuditService } from '../../audit/platform-audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { MediaService } from '../../media/media.service';
import { CrmPersonalDataErasureAdapter } from '../../crm/privacy-adapters/crm-personal-data-erasure.adapter';
import { CrmTitularErasureParticipant } from '../../crm/privacy-adapters/titular-erasure/crm-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { IBillingStandingReadPort } from './ports/billing-standing-read.port';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { IPersonalDataErasurePort } from '../ports/personal-data-erasure.port';
import { IContractStandingReadPort } from './ports/contract-standing-read.port';
import { PrivacyRequestsService } from './requests.service';
import { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { assertTitularWritable } from '../../crm/subscribers/guards/assert-titular-writable';
import type { TitularWriteReference } from '../../crm/ports/titular-write-reference';
import { ExpedienteRecord } from '../../crm/expedientes/entities/expediente-record.entity';
import { StatusChange } from '../../crm/expedientes/entities/status-change.entity';
import { ContactAttempt } from '../../crm/expedientes/entities/contact-attempt.entity';
import { CoverageCheck } from '../../crm/expedientes/entities/coverage-check.entity';
import { ConsentRecord } from '../../crm/expedientes/entities/consent-record-v2.entity';
import { OperationalResponsibilityHistory } from '../../crm/responsibilities/entities/operational-responsibility-history.entity';
import { SalesAttribution } from '../../crm/attributions/entities/sales-attribution.entity';
import { ExpedienteService } from '../../crm/expedientes/expediente.service';
import { TicketsService } from '../../assurance/services/tickets.service';
import { CommentsService } from '../../assurance/services/comments.service';
import type { TimelineService } from '../../assurance/services/timeline.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  anonymizeTitularInTenantSchema,
  listFindingRequestIds,
  toVerificationOutput,
  verifyAnonymizedTenant,
} from '../../../cli/anonymize-titular';

/**
 * B4 — barrido de texto libre como integración normal (D-BT-10/12/13, CA-BT-01 a 14).
 *
 * Parte del runner desechable `barrido-b3.sweep.spec.ts.txt` (evidencia
 * 2026-11-03): registra billing y los participantes nuevos, pero siembra en
 * una ruta de integración normal contra migraciones tenant reales, con
 * DB_NAME=test, sin omisión esperada y skipped vacío.
 *
 * Cero PII: todo valor personal es sintético y los canarios llevan etiqueta
 * B4 rastreable (`B4CNR-...`).
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const databaseName = process.env['DB_NAME'] ?? '';
const supportedDatabaseName =
  databaseName === 'test' || /^iwana_it_g7_[a-z0-9_]+$/u.test(databaseName);
const describeWithDb = dbAvailable && supportedDatabaseName ? describe : describe.skip;

if (dbAvailable && !supportedDatabaseName) {
  console.warn(
    `[B4] Barrido omitido: DB_NAME debe ser test o iwana_it_g7_*; recibida ${databaseName || '(vacía)'}.`,
  );
}

jest.setTimeout(900_000);

const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const keyBuffer = Buffer.from(keyHex, 'hex');
const cliKeys = { hashKey: keyBuffer, activeEncryptionKey: keyBuffer, previousEncryptionKey: null };
const DOC_A = '90000111';
const DOC_B = '90000222';

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

interface FixtureIds {
  tenantId: string;
  actorId: string;
  partyA: string;
  partyB: string;
  expedienteA: string;
  expedienteB: string;
  subscriberA: string;
  subscriberB: string;
  contractRes: string;
  contractNonRes: string;
  contractB: string;
  visitA: string;
  scheduleA: string;
  workOrderA: string;
  workOrderLinked: string;
  workOrderAssurance: string;
  executionOrderMain: string;
  executionOrderDirect: string;
  itemUsageMain: string;
  operationalTaskA: string;
  ticket1: string;
  ticket2: string;
  ticketReal: string;
  ticketB: string;
  commentReal: string;
  taxProfile: string;
  taxDefinition: string;
  router: string;
  network: string;
  consent: string;
  requestA: string;
}

describeWithDb('B4 — barrido de texto libre por la API sobre migraciones reales', () => {
  const schemaName = `tenant_b4_sweep_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const q = quoteIdentifier(schemaName);
  const tenantSlug = `b4-sweep-${randomUUID().slice(0, 8)}`;
  const ids = {} as FixtureIds;
  ids.tenantId = randomUUID();
  ids.actorId = randomUUID();

  const skipped: Array<{ table: string; column: string; reason: string }> = [];
  const canaries: Array<{ table: string; column: string; tag: string }> = [];
  const tag = (code: string): string => `B4CNR-${code}`;
  const canary = (table: string, column: string, code: string): string => {
    const t = tag(code);
    canaries.push({ table, column, tag: t });
    return t;
  };

  let dataSource: DataSource;
  let service: PrivacyRequestsService;
  let expedienteService: ExpedienteService;
  let ticketsService: TicketsService;
  let commentsService: CommentsService;
  let auditLogCountBefore = 0;
  const tableCountsBefore = new Map<string, number>();
  const titularBSnapshot = new Map<string, unknown[]>();
  const actor: JwtPayload = {
    sub: ids.actorId,
    email: 'hash-sintetico',
    role: UserRole.ADMIN,
    tenantId: ids.tenantId,
    schemaName,
    jti: randomUUID(),
    type: 'tenant',
  };

  const configService = new ConfigService({
    PII_HASH_KEY: keyHex,
    PII_ENCRYPTION_KEY: keyHex,
    MFA_ENCRYPTION_KEY: keyHex,
  });
  const auditService = new AuditService(
    undefined as unknown as DataSource,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as PlatformAuditService,
  );
  const crmPort = {
    assertWritableReferences: (references: TitularWriteReference[], qr: QueryRunner) =>
      assertTitularWritable(references, qr),
  } as unknown as CrmSubscriberReadPort;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId: ids.tenantId, schemaName, tenantSlug }, operation);

  async function count(table: string): Promise<number> {
    const rows = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${q}."${table}"`,
    )) as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }

  async function firstEnum(label: string): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = $1 ORDER BY e.enumsortorder LIMIT 1`,
      [label],
    )) as Array<{ enumlabel: string }>;
    if (!rows[0]) throw new Error(`Sin etiquetas para el enum ${label}.`);
    return rows[0].enumlabel;
  }

  async function noCanarySurvives(): Promise<string[]> {
    const survivors: string[] = [];
    for (const c of canaries) {
      const rows = (await dataSource.query(
        `SELECT 1 FROM ${q}."${c.table}" WHERE "${c.column}"::text LIKE $1 LIMIT 1`,
        [`%${c.tag}%`],
      )) as Array<unknown>;
      if (rows.length > 0) survivors.push(`${c.table}.${c.column} (${c.tag})`);
    }
    return survivors;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [
        ExpedienteRecord,
        StatusChange,
        ContactAttempt,
        CoverageCheck,
        ConsentRecord,
        AuditLog,
        SupportTicket,
        TicketComment,
        OperationalResponsibilityHistory,
        SalesAttribution,
      ],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 5, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    (auditService as unknown as { dataSource: DataSource }).dataSource = dataSource;
    await dataSource.query(`CREATE SCHEMA ${q}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'B4 sweep synthetic fixture', $2, $3, 'ACTIVE', 'b4-sweep@invalid.example')`,
      [ids.tenantId, tenantSlug, schemaName],
    );
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: auditService },
        { provide: IContractImpersonationPort, useValue: { suspendForImpersonation: jest.fn() } },
        {
          provide: IContractStandingReadPort,
          useValue: {
            standing: jest.fn().mockResolvedValue({
              contractIds: [],
              expedienteIds: [],
              subscriberIds: [],
              openContractIds: [],
              lastTerminatedAt: null,
            }),
          },
        },
        { provide: MediaService, useValue: { findOne: jest.fn() } },
        {
          provide: EffectivePermissionsService,
          useValue: {
            getEffectivePermissionsForUser: jest
              .fn()
              .mockResolvedValue([
                AccessPermissionKey.PRIVACY_READ,
                AccessPermissionKey.PRIVACY_MANAGE,
              ]),
          },
        },
        CrmTitularErasureParticipant,
        PartyTitularErasureParticipant,
        UserAccountErasureParticipant,
        WfmTitularErasureParticipant,
        ExecutionOrderTitularErasureParticipant,
        OperationalTaskTitularErasureParticipant,
        MediaTitularErasureParticipant,
        BillingTitularErasureParticipant,
        BillingStandingReadAdapter,
        { provide: IBillingStandingReadPort, useExisting: BillingStandingReadAdapter },
        AssuranceTitularErasureParticipant,
        NetworkTitularErasureParticipant,
        SupplierProfileReadAdapter,
        CrmPersonalDataErasureAdapter,
        { provide: IPersonalDataErasurePort, useExisting: CrmPersonalDataErasureAdapter },
        {
          provide: PrivacyRequestsService,
          inject: [
            getDataSourceToken(),
            ConfigService,
            AuditService,
            IContractImpersonationPort,
            IContractStandingReadPort,
            MediaService,
            EffectivePermissionsService,
            IPersonalDataErasurePort,
            IBillingStandingReadPort,
          ],
          useFactory: (...deps: ConstructorParameters<typeof PrivacyRequestsService>) => {
            deps[9] = new PqrRetentionReadAdapter();
            return new PrivacyRequestsService(...deps);
          },
        },
      ],
    }).compile();
    service = moduleRef.get(PrivacyRequestsService);

    expedienteService = new ExpedienteService(
      dataSource,
      configService,
      auditService,
      {
        calculate: jest
          .fn()
          .mockResolvedValue({ commercial: 0, legal: 0, technical: 0, operational: 0 }),
      } as never,
      {
        findById: jest.fn().mockResolvedValue(null),
        findByIds: jest.fn().mockResolvedValue([]),
      } as never,
      { emitAsync: jest.fn().mockResolvedValue([]) } as never,
      { findByExpedienteId: jest.fn().mockResolvedValue(null) } as never,
    );
    ticketsService = new TicketsService(
      dataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      crmPort,
    );
    commentsService = new CommentsService(
      dataSource,
      { recordWithManager: jest.fn().mockResolvedValue(undefined) } as unknown as TimelineService,
      crmPort,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [ids.tenantId]);
      } finally {
        await dataSource.destroy();
      }
    }
  });

  it('siembra canarios R-1 a R-14, sondas A-1 a A-4 y un segundo titular completo', async () => {
    for (const key of [
      'partyA',
      'partyB',
      'expedienteA',
      'expedienteB',
      'subscriberA',
      'subscriberB',
      'contractRes',
      'contractNonRes',
      'contractB',
      'visitA',
      'scheduleA',
      'workOrderA',
      'workOrderLinked',
      'workOrderAssurance',
      'executionOrderMain',
      'executionOrderDirect',
      'itemUsageMain',
      'operationalTaskA',
      'ticket1',
      'ticket2',
      'ticketReal',
      'ticketB',
      'commentReal',
      'taxProfile',
      'taxDefinition',
      'router',
      'network',
      'consent',
      'requestA',
    ] as const) {
      (ids as unknown as Record<string, string>)[key] = randomUUID();
    }
    const hmacA = hmacPii(normalizeDocumentNumber(DocumentTypeParty.CC, DOC_A), keyBuffer);
    const hmacB = hmacPii(normalizeDocumentNumber(DocumentTypeParty.CC, DOC_B), keyBuffer);

    // Núcleo del titular A.
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular Ficticio B4')`,
      [ids.partyA, encryptAes256Gcm('synthetic-party-doc-a', keyBuffer)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Segundo Titular Ficticio B4')`,
      [ids.partyB, encryptAes256Gcm('synthetic-party-doc-b', keyBuffer)],
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
        (id, tenant_id, full_name, document_type, document_number_hmac, customer_segment, created_by,
         source, source_detail, discard_reason)
       VALUES ($1, $2, 'Titular Ficticio B4', 'CC', $3, 'RESIDENTIAL', $4, $5, $6, NULL)`,
      [
        ids.expedienteA,
        ids.tenantId,
        hmacA,
        ids.actorId,
        canary('expediente_records', 'source', 'R9-SOURCE'),
        canary('expediente_records', 'source_detail', 'R9-DETAIL'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.expediente_records
        (id, tenant_id, full_name, document_type, document_number_hmac, customer_segment, created_by,
         source, source_detail)
       VALUES ($1, $2, 'Segundo Titular Ficticio B4', 'CC', $3, 'RESIDENTIAL', $4, 'OTRO', $5)`,
      [ids.expedienteB, ids.tenantId, hmacB, ids.actorId, 'Detalle ficticio B'],
    );
    for (const [subscriber, party, expediente] of [
      [ids.subscriberA, ids.partyA, ids.expedienteA],
      [ids.subscriberB, ids.partyB, ids.expedienteB],
    ] as const) {
      await dataSource.query(
        `INSERT INTO ${q}.subscribers
          (id, tenant_id, party_id, expediente_id, person_type, customer_segment, document_type,
           document_number_encrypted, first_name, last_name, stratum, email_encrypted,
           phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
         VALUES ($1, $2, $3, $4, 'NATURAL', 'RESIDENTIAL', 'CC', $5,
           'Nombre Ficticio', 'Apellido Ficticio', 2, $6, $7, 'STANDARD', 'COMMON',
           'RESPONSABLE', 'Dirección ficticia', $8)`,
        [
          subscriber,
          ids.tenantId,
          party,
          expediente,
          encryptAes256Gcm('synthetic-subscriber-doc', keyBuffer),
          encryptAes256Gcm('synthetic-email', keyBuffer),
          encryptAes256Gcm('synthetic-phone', keyBuffer),
          ids.actorId,
        ],
      );
    }
    // D-BT-13: cada valor de service_usage queda sembrado; sin omisión.
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, vat_snapshot,
         installation_city, installation_department, installation_stratum, service_usage,
         fiscal_name, fiscal_document_encrypted, alias)
       VALUES ($1, $2, $3, 'plan-sintetico', $4::jsonb, $5::jsonb, $6, $7, 3, 'RESIDENTIAL',
         $8, $9, $10)`,
      [
        ids.contractRes,
        ids.tenantId,
        ids.subscriberA,
        JSON.stringify({
          phonePrimary: canary('contracts', 'plan_snapshot_json', 'R-PLAN'),
          code: 'keep',
        }),
        JSON.stringify({}),
        canary('contracts', 'installation_city', 'R14-CITY'),
        canary('contracts', 'installation_department', 'R14-DEPT'),
        canary('contracts', 'fiscal_name', 'R-FISCAL'),
        encryptAes256Gcm('synthetic-fiscal', keyBuffer),
        canary('contracts', 'alias', 'R-ALIAS'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, vat_snapshot,
         installation_city, installation_department, installation_stratum, service_usage)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, '{}'::jsonb, $4, $5, 5, 'NON_RESIDENTIAL')`,
      [
        ids.contractNonRes,
        ids.tenantId,
        ids.subscriberA,
        canary('contracts', 'installation_city', 'R14-CITY-NR'),
        canary('contracts', 'installation_department', 'R14-DEPT-NR'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, installation_city, service_usage)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, 'Ciudad Ficticia B', 'NON_RESIDENTIAL')`,
      [ids.contractB, ids.tenantId, ids.subscriberB],
    );
    const usages = (await dataSource.query(
      `SELECT DISTINCT service_usage FROM ${q}.contracts ORDER BY service_usage`,
    )) as Array<{ service_usage: string }>;
    expect(usages.map((row) => row.service_usage).sort()).toEqual([
      'NON_RESIDENTIAL',
      'RESIDENTIAL',
    ]);
    await dataSource.query(
      `INSERT INTO ${q}.crm_contract_alias_backup_168 (contract_id, alias)
       VALUES ($1, $2)`,
      [ids.contractRes, canary('crm_contract_alias_backup_168', 'alias', 'R10-ALIAS')],
    );
    // Hijas CRM.
    await dataSource.query(
      `INSERT INTO ${q}.contact_attempts
        (id, tenant_id, expediente_id, channel, result, advisor_id, notes)
       VALUES ($1, $2, $3, 'SYN', 'SYN', $4, $5)`,
      [randomUUID(), ids.tenantId, ids.expedienteA, ids.actorId, 'Nota de contacto ficticia'],
    );
    await dataSource.query(
      `INSERT INTO ${q}.consent_records
        (id, tenant_id, expediente_id, consent_type, status, channel, legal_text_version, ip_address)
       VALUES ($1, $2, $3, 'DATA_PROCESSING', 'ACEPTADO', 'PRESENCIAL', 'v-b4', '192.0.2.44')`,
      [ids.consent, ids.tenantId, ids.expedienteA],
    );
    await dataSource.query(
      `INSERT INTO ${q}.coverage_checks
        (id, tenant_id, expediente_id, result, checked_by, address_used, snapshot_json)
       VALUES ($1, $2, $3, 'SYN', $4, 'Dirección ficticia', $5::jsonb)`,
      [randomUUID(), ids.tenantId, ids.expedienteA, ids.actorId, JSON.stringify({})],
    );
    await dataSource.query(
      `INSERT INTO ${q}.quotes (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, monthly_amount)
       VALUES ($1, $2, $3, 'plan-sintetico', $4::jsonb, 1000)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.subscriberA,
        JSON.stringify({
          phonePrimary: canary('quotes', 'plan_snapshot_json', 'R-QUOTE'),
          code: 'keep',
        }),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.quotes (id, tenant_id, expediente_id, plan_id, plan_snapshot_json, monthly_amount)
       VALUES ($1, $2, $3, 'plan-sintetico', $4::jsonb, 2000)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.expedienteA,
        JSON.stringify({
          nested: { email: canary('quotes', 'plan_snapshot_json', 'R-QUOTE-EXP') },
        }),
      ],
    );
    // R-1, R-7 (SQL), R-8.
    await dataSource.query(
      `INSERT INTO ${q}.operational_responsibility_history
        (id, tenant_id, expediente_id, previous_responsible_user_id, new_responsible_user_id,
         changed_by, changed_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, now(), $7)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.expedienteA,
        ids.actorId,
        ids.actorId,
        ids.actorId,
        canary('operational_responsibility_history', 'notes', 'R1-NOTES'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.status_changes
        (id, tenant_id, expediente_id, from_status, to_status, changed_at, changed_by, reason)
       VALUES ($1, $2, $3, 'A', 'B', now(), $4, $5)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.expedienteA,
        ids.actorId,
        canary('status_changes', 'reason', 'R7-SQL'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.sales_attributions
        (id, tenant_id, expediente_id, actor_id, actor_role, actor_name, acquisition_channel,
         attributed_by, attributed_at, notes, revoked_reason)
       VALUES ($1, $2, $3, $4, 'SYN', 'Asesor Ficticio', 'SYN', $5, now(), $6, $7)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.expedienteA,
        ids.actorId,
        ids.actorId,
        canary('sales_attributions', 'notes', 'R8-NOTES'),
        canary('sales_attributions', 'revoked_reason', 'R8-REVOKED'),
      ],
    );
    // R-11.
    await dataSource.query(
      `INSERT INTO ${q}.tax_definitions (id, code, name, category, jurisdiction_level, treatment, context)
       VALUES ($1, 'SYN-B4', 'Tributo Ficticio', 'VAT', 'NATIONAL', 'STANDARD', 'SALES')`,
      [ids.taxDefinition],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscriber_tax_profiles (id, tenant_id, subscriber_id)
       VALUES ($1, $2, $3)`,
      [ids.taxProfile, ids.tenantId, ids.subscriberA],
    );
    await dataSource.query(
      `INSERT INTO ${q}.subscriber_tax_assignments
        (id, tenant_id, profile_id, tax_definition_id, tax_name_snapshot, reason)
       VALUES ($1, $2, $3, $4, 'Tributo Ficticio', $5)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.taxProfile,
        ids.taxDefinition,
        canary('subscriber_tax_assignments', 'reason', 'R11-REASON'),
      ],
    );
    // R-3 a R-6 por SQL.
    await dataSource.query(
      `INSERT INTO ${q}.support_tickets
        (id, tenant_id, ticket_number, type, subject, description, requester_type, requester_ref_id,
         subject_type, subject_ref_id, created_by_user_id)
       VALUES ($1, $2, 'T-B4-001', 'CUSTOMER_INCIDENT', $3, $4, 'SUBSCRIBER', $5,
         'SUBSCRIBER', $6, $7)`,
      [
        ids.ticket1,
        ids.tenantId,
        canary('support_tickets', 'subject', 'R3-SUBJECT'),
        canary('support_tickets', 'description', 'R3-DESC'),
        ids.subscriberA,
        ids.subscriberA,
        ids.actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.support_tickets
        (id, tenant_id, ticket_number, type, subject, description, requester_type,
         subject_type, subject_ref_id, created_by_user_id)
       VALUES ($1, $2, 'T-B4-002', 'CUSTOMER_INCIDENT', $3, $4, 'EXTERNAL',
         'CONTRACT', $5, $6)`,
      [
        ids.ticket2,
        ids.tenantId,
        canary('support_tickets', 'subject', 'R3-SUBJECT-CT'),
        canary('support_tickets', 'description', 'R3-DESC-CT'),
        ids.contractRes,
        ids.actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_comments (id, ticket_id, tenant_id, body, author_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        ids.ticket1,
        ids.tenantId,
        canary('ticket_comments', 'body', 'R4-BODY'),
        ids.actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_timeline_events (id, ticket_id, tenant_id, event_type, payload)
       VALUES ($1, $2, $3, 'CREATED', $4::jsonb)`,
      [
        randomUUID(),
        ids.ticket1,
        ids.tenantId,
        JSON.stringify({ notes: canary('ticket_timeline_events', 'payload', 'R5-PAYLOAD') }),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_work_order_links
        (id, ticket_id, tenant_id, work_order_id, requested_at, requested_by_user_id, notes)
       VALUES ($1, $2, $3, $4, now(), $5, $6)`,
      [
        randomUUID(),
        ids.ticket1,
        ids.tenantId,
        ids.workOrderLinked,
        ids.actorId,
        canary('ticket_work_order_links', 'notes', 'R6-NOTES'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_pqr_records
        (id, ticket_id, tenant_id, deadline_type, deadline_at, notes)
       VALUES ($1, $2, $3, 'INITIAL_RESPONSE', now(), 'Nota PQR ficticia')`,
      [randomUUID(), ids.ticket1, ids.tenantId],
    );
    // R-3 por el servicio real: el asunto guarda el nombre completo del titular.
    const created = await inTenant(() =>
      ticketsService.findOrCreateInstallationTicket(
        { expedienteId: ids.expedienteA, expedienteFullName: 'Titular Ficticio B4' },
        ids.actorId,
      ),
    );
    expect(created.created).toBe(true);
    ids.ticketReal = created.ticket.id;
    const [ticketRealRow] = (await dataSource.query(
      `SELECT subject FROM ${q}.support_tickets WHERE id = $1`,
      [ids.ticketReal],
    )) as Array<{ subject: string }>;
    expect(ticketRealRow?.subject).toContain('Titular Ficticio B4');
    canaries.push({ table: 'support_tickets', column: 'subject', tag: 'Titular Ficticio B4' });
    // R-4/R-14 por el servicio real de comentarios (CA-BT-14: bloquea antes).
    const comment = await inTenant(() =>
      commentsService.addComment(
        ids.ticket1,
        { body: canary('ticket_comments', 'body', 'R4-REAL') },
        actor,
      ),
    );
    ids.commentReal = comment.id;
    // R-7 por el servicio real: el motivo de descarte se copia a status_changes.
    await inTenant(() =>
      expedienteService.transitionStatus(
        ids.expedienteA,
        { targetStatus: ExpedienteStatus.DESCARTADO, reason: 'Motivo real de descarte B4' },
        ids.actorId,
      ),
    );
    canaries.push({ table: 'status_changes', column: 'reason', tag: 'Motivo real de descarte B4' });
    canaries.push({
      table: 'expediente_records',
      column: 'discard_reason',
      tag: 'Motivo real de descarte B4',
    });
    await inTenant(() =>
      expedienteService.revokeConsent(
        ids.expedienteA,
        ids.consent,
        'Motivo real de revocación B4',
        ids.actorId,
      ),
    );
    canaries.push({
      table: 'consent_records',
      column: 'revoked_reason',
      tag: 'Motivo real de revocación B4',
    });
    // Red de aprovisionamiento (R-2) y cadena WFM/tasks en alcance.
    await dataSource.query(
      `INSERT INTO ${q}.network_routers
        (id, tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, $2, 'Router Ficticio B4', '192.0.2.1', ARRAY['PCQ_ADDRESS_LIST'], $3)`,
      [ids.router, ids.tenantId, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ipv4_networks
        (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
         default_control_method, created_by)
       VALUES ($1, $2, $3, 'Red Ficticia B4', '192.0.2.0/24', '192.0.2.1', '192.0.2.2',
         '192.0.2.254', 'PCQ_ADDRESS_LIST', $4)`,
      [ids.network, ids.tenantId, ids.router, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_events
        (id, tenant_id, type, title, description, address, municipality, sector, scheduled_start_at,
         scheduled_end_at, assigned_user_id, created_by, expediente_id, subscriber_id, work_order_id,
         execution_order_id, failure_reason, review_notes)
       VALUES ($1, $2, 'INSTALLATION', $3, $4, $5, $6, $7, now(), now() + interval '1 hour',
         $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        ids.scheduleA,
        ids.tenantId,
        canary('schedule_events', 'title', 'WFM-TITLE'),
        canary('schedule_events', 'description', 'WFM-DESC'),
        canary('schedule_events', 'address', 'WFM-ADDR'),
        canary('schedule_events', 'municipality', 'WFM-MUNI'),
        canary('schedule_events', 'sector', 'WFM-SECTOR'),
        ids.actorId,
        ids.actorId,
        ids.expedienteA,
        ids.subscriberA,
        ids.workOrderA,
        ids.executionOrderMain,
        canary('schedule_events', 'failure_reason', 'WFM-FAIL'),
        canary('schedule_events', 'review_notes', 'WFM-REVIEW'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.visit_requests
        (id, tenant_id, status, origin_context, origin_label, work_type, priority, title, description,
         address, municipality, sector, requested_by_user_id, expediente_id, subscriber_id,
         schedule_event_id, work_order_id, execution_order_id, cancel_reason, additional_reason)
       VALUES ($1, $2, 'PENDING', 'MANUAL', $3, 'INSTALLATION', 'NORMAL', $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16)`,
      [
        ids.visitA,
        ids.tenantId,
        canary('visit_requests', 'origin_label', 'WFM-ORIGIN'),
        canary('visit_requests', 'title', 'WFM-VISIT'),
        canary('visit_requests', 'description', 'WFM-VDESC'),
        canary('visit_requests', 'address', 'WFM-VADDR'),
        canary('visit_requests', 'municipality', 'WFM-VMUNI'),
        canary('visit_requests', 'sector', 'WFM-VSECTOR'),
        ids.actorId,
        ids.expedienteA,
        ids.subscriberA,
        ids.scheduleA,
        ids.workOrderA,
        ids.executionOrderMain,
        canary('visit_requests', 'cancel_reason', 'WFM-CANCEL'),
        canary('visit_requests', 'additional_reason', 'WFM-ADD'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.work_orders
        (id, tenant_id, code, type, source_context, source_ref, summary, notes, created_by,
         assigned_user_id, scheduled_event_id)
       VALUES ($1, $2, 'WO-B4-001', 'INSTALLATION', 'CRM', $3, $4, $5, $6, $7, $8)`,
      [
        ids.workOrderA,
        ids.tenantId,
        ids.expedienteA,
        canary('work_orders', 'summary', 'WFM-SUMMARY'),
        canary('work_orders', 'notes', 'WFM-NOTES'),
        ids.actorId,
        ids.actorId,
        ids.scheduleA,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.work_orders
        (id, tenant_id, code, type, source_context, source_ref, summary, notes, created_by, assigned_user_id)
       VALUES ($1, $2, 'WO-B4-LINK', 'INSTALLATION', 'CRM', $3, 'Resumen Enlazado', 'Nota enlazada', $4, $5)`,
      [ids.workOrderLinked, ids.tenantId, ids.expedienteA, ids.actorId, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.work_orders
        (id, tenant_id, code, type, source_context, source_ref, summary, created_by, assigned_user_id)
       VALUES ($1, $2, 'WO-B4-ASSUR', 'INSTALLATION', 'ASSURANCE', $3, $4, $5, $6)`,
      [
        ids.workOrderAssurance,
        ids.tenantId,
        ids.ticket1,
        canary('work_orders', 'summary', 'WFM-SUMMARY-A3'),
        ids.actorId,
        ids.actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.work_order_tasks (id, tenant_id, work_order_id, title, description, result_notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.workOrderAssurance,
        canary('work_order_tasks', 'title', 'WFM-WT-A3'),
        canary('work_order_tasks', 'description', 'WFM-WTD-A3'),
        canary('work_order_tasks', 'result_notes', 'WFM-WTR-A3'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.execution_orders
        (id, tenant_id, execution_order_number, origin_context, customer_display_label, work_type,
         work_summary, service_address, municipality, sector, work_instructions, close_notes,
         template_label, template_requirements_snapshot, subscriber_id, visit_request_id,
         schedule_event_id)
       VALUES ($1, $2, 'EO-B4-MAIN', 'CRM', $3, 'INSTALLATION', $4, $5, $6, $7, $8, $9, $10,
         $11::jsonb, $12, $13, $14)`,
      [
        ids.executionOrderMain,
        ids.tenantId,
        canary('execution_orders', 'customer_display_label', 'EO-CUSTOMER'),
        canary('execution_orders', 'work_summary', 'EO-WORK'),
        canary('execution_orders', 'service_address', 'EO-ADDR'),
        canary('execution_orders', 'municipality', 'EO-MUNI'),
        canary('execution_orders', 'sector', 'EO-SECTOR'),
        canary('execution_orders', 'work_instructions', 'EO-INSTR'),
        canary('execution_orders', 'close_notes', 'EO-CLOSE'),
        canary('execution_orders', 'template_label', 'EO-TEMPLATE'),
        JSON.stringify({}),
        ids.subscriberA,
        ids.visitA,
        ids.scheduleA,
      ],
    );
    // A-1: OT directa por suscriptor, sin visita ni agenda.
    await dataSource.query(
      `INSERT INTO ${q}.execution_orders
        (id, tenant_id, execution_order_number, origin_context, customer_display_label, work_type,
         work_summary, subscriber_id)
       VALUES ($1, $2, 'EO-B4-DIRECT', 'MANUAL', $3, 'INSTALLATION', $4, $5)`,
      [
        ids.executionOrderDirect,
        ids.tenantId,
        canary('execution_orders', 'customer_display_label', 'EO-DIRECT'),
        canary('execution_orders', 'work_summary', 'EO-DIRECT-W'),
        ids.subscriberA,
      ],
    );
    for (const [orderId, code] of [
      [ids.executionOrderMain, 'ACT-MAIN'],
      [ids.executionOrderDirect, 'ACT-DIRECT'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO ${q}.execution_order_activities
          (id, tenant_id, execution_order_id, activity_type, description)
         VALUES ($1, $2, $3, 'SYN', $4)`,
        [
          randomUUID(),
          ids.tenantId,
          orderId,
          canary('execution_order_activities', 'description', code),
        ],
      );
    }
    await dataSource.query(
      `INSERT INTO ${q}.execution_order_evidence
        (id, tenant_id, execution_order_id, evidence_type, notes, file_name)
       VALUES ($1, $2, $3, 'SYN', $4, $5)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.executionOrderMain,
        canary('execution_order_evidence', 'notes', 'EO-EV'),
        canary('execution_order_evidence', 'file_name', 'EO-FILE'),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.execution_order_status_transitions
        (id, tenant_id, execution_order_id, from_status, to_status, changed_at, changed_by, reason)
       VALUES ($1, $2, $3, 'CREATED', 'ASSIGNED', now(), $4, $5)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.executionOrderMain,
        ids.actorId,
        canary('execution_order_status_transitions', 'reason', 'EO-TRANS'),
      ],
    );
    // R-12: reverso ligado a la OT principal.
    const action = await firstEnum('execution_order_item_action');
    const disposition = await firstEnum('inventory_disposition');
    await dataSource.query(
      `INSERT INTO ${q}.execution_order_item_usage
        (id, tenant_id, execution_order_id, item_id, technician_custody_id, action, final_disposition)
       VALUES ($1, $2, $3, 'SYN-ITEM-B4', $4, $5, $6)`,
      [ids.itemUsageMain, ids.tenantId, ids.executionOrderMain, ids.actorId, action, disposition],
    );
    await dataSource.query(
      `INSERT INTO ${q}.execution_order_item_usage_reversals
        (id, tenant_id, execution_order_id, item_usage_id, reversal_request_id, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.executionOrderMain,
        ids.itemUsageMain,
        randomUUID(),
        canary('execution_order_item_usage_reversals', 'reason', 'R12-REASON'),
        ids.actorId,
      ],
    );
    // R-13 + A-2/A-3/A-4 (contrato, ticket y OT de assurance).
    await dataSource.query(
      `INSERT INTO ${q}.visit_requests
        (id, tenant_id, status, origin_context, work_type, priority, title, contract_id,
         requested_by_user_id)
       VALUES ($1, $2, 'PENDING', 'MANUAL', 'INSTALLATION', 'NORMAL', 'Sonda visita contrato', $3, $4)`,
      [randomUUID(), ids.tenantId, ids.contractRes, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_events
        (id, tenant_id, type, title, scheduled_start_at, scheduled_end_at, assigned_user_id,
         contract_id, created_by)
       VALUES ($1, $2, 'INSTALLATION', 'Sonda agenda contrato', now(), now() + interval '1 hour',
         $3, $4, $5)`,
      [randomUUID(), ids.tenantId, ids.actorId, ids.contractRes, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_reschedule_logs
        (id, tenant_id, schedule_event_id, from_start_at, from_end_at, to_start_at, to_end_at,
         reason, notes, changed_by)
       VALUES ($1, $2, $3, '2026-01-01T08:00Z', '2026-01-01T09:00Z', '2026-01-02T08:00Z',
         '2026-01-02T09:00Z', $4, $5, $6)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.scheduleA,
        canary('schedule_reschedule_logs', 'reason', 'R13-REASON'),
        canary('schedule_reschedule_logs', 'notes', 'R13-NOTES'),
        ids.actorId,
      ],
    );
    const taskType = await firstEnum('task_type');
    const responsibleType = await firstEnum('task_responsible_type');
    const recipientType = await firstEnum('task_recipient_type');
    const executionMode = await firstEnum('task_execution_mode');
    await dataSource.query(
      `INSERT INTO ${q}.operational_tasks
        (id, tenant_id, task_number, type, title, description, origin_context, ticket_id,
         responsible_type, responsible_ref_id, recipient_type, recipient_label, execution_mode)
       VALUES ($1, $2, 'TSK-B4-001', $3, $4, $5, 'ASSURANCE', $6, $7, $8, $9, $10, $11)`,
      [
        ids.operationalTaskA,
        ids.tenantId,
        taskType,
        canary('operational_tasks', 'title', 'OT-TITLE'),
        canary('operational_tasks', 'description', 'OT-DESC'),
        ids.ticket1,
        responsibleType,
        ids.actorId,
        recipientType,
        canary('operational_tasks', 'recipient_label', 'OT-RECIP'),
        executionMode,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.task_timeline_events (id, task_id, tenant_id, event_type, payload)
       VALUES ($1, $2, $3, 'CREATED', $4::jsonb)`,
      [
        randomUUID(),
        ids.operationalTaskA,
        ids.tenantId,
        JSON.stringify({ description: canary('task_timeline_events', 'payload', 'OT-TL') }),
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.task_assignment_history
        (id, tenant_id, task_id, previous_responsible_type, previous_responsible_ref_id,
         new_responsible_type, new_responsible_ref_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        ids.tenantId,
        ids.operationalTaskA,
        responsibleType,
        ids.actorId,
        responsibleType,
        ids.actorId,
        canary('task_assignment_history', 'reason', 'OT-ASSIGN'),
      ],
    );
    // R-2: aprovisionamiento regularizado del titular.
    await dataSource.query(
      `INSERT INTO ${q}.service_provisionings
        (id, tenant_id, subscriber_id, contract_id, expediente_id, execution_order_id,
         execution_order_number, router_id, ipv4_network_id, control_method, control_params,
         status, origin, regularization_reason, regularized_by, regularized_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'EO-B4-001', $7, $8, 'PCQ_ADDRESS_LIST', '{}', 'ACTIVE',
         'REGULARIZED', $9, $10, now())`,
      [
        randomUUID(),
        ids.tenantId,
        ids.subscriberA,
        ids.contractRes,
        ids.expedienteA,
        ids.executionOrderMain,
        ids.router,
        ids.network,
        canary('service_provisionings', 'regularization_reason', 'R2-REASON'),
        ids.actorId,
      ],
    );
    // Segundo titular completo (CA-BT-03): ticket, OT, visita y aprovisionamiento.
    await dataSource.query(
      `INSERT INTO ${q}.support_tickets
        (id, tenant_id, ticket_number, type, subject, description, requester_type, requester_ref_id,
         subject_type, subject_ref_id, created_by_user_id)
       VALUES ($1, $2, 'T-B4-003', 'CUSTOMER_INCIDENT', 'Asunto Segundo Titular',
         'Descripción segundo titular', 'SUBSCRIBER', $3, 'SUBSCRIBER', $4, $5)`,
      [ids.ticketB, ids.tenantId, ids.subscriberB, ids.subscriberB, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_comments (id, ticket_id, tenant_id, body, author_user_id)
       VALUES ($1, $2, $3, 'Comentario segundo titular', $4)`,
      [randomUUID(), ids.ticketB, ids.tenantId, ids.actorId],
    );
    const [scheduleB] = (await dataSource.query(
      `INSERT INTO ${q}.schedule_events
        (id, tenant_id, type, title, scheduled_start_at, scheduled_end_at, assigned_user_id,
         subscriber_id, created_by)
       VALUES ($1, $2, 'INSTALLATION', 'Agenda segundo titular', now(),
         now() + interval '1 hour', $3, $4, $5) RETURNING id::text AS id`,
      [randomUUID(), ids.tenantId, ids.actorId, ids.subscriberB, ids.actorId],
    )) as Array<{ id: string }>;
    await dataSource.query(
      `INSERT INTO ${q}.visit_requests
        (id, tenant_id, status, origin_context, work_type, priority, title, subscriber_id,
         requested_by_user_id)
       VALUES ($1, $2, 'PENDING', 'MANUAL', 'INSTALLATION', 'NORMAL', 'Visita segundo titular',
         $3, $4)`,
      [randomUUID(), ids.tenantId, ids.subscriberB, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.service_provisionings
        (id, tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id,
         ipv4_network_id, control_method, control_params, status, origin, regularization_reason,
         regularized_by, regularized_at)
       VALUES ($1, $2, $3, $4, 'EO-B4-002', $5, $6, 'PCQ_ADDRESS_LIST', '{}', 'ACTIVE',
         'REGULARIZED', 'Motivo segundo titular', $7, now())`,
      [
        randomUUID(),
        ids.tenantId,
        ids.subscriberB,
        randomUUID(),
        ids.router,
        ids.network,
        ids.actorId,
      ],
    );
    void scheduleB;

    // Foto previa para CA-BT-01 (filas preservadas) y CA-BT-03 (titular B intacto).
    for (const table of [
      'support_tickets',
      'ticket_comments',
      'ticket_timeline_events',
      'ticket_work_order_links',
      'execution_orders',
      'execution_order_activities',
      'visit_requests',
      'schedule_events',
      'work_orders',
      'operational_tasks',
      'contracts',
      'status_changes',
    ]) {
      tableCountsBefore.set(table, await count(table));
    }
    for (const [key, table, column, value] of [
      ['ticketB', 'support_tickets', 'id', ids.ticketB],
      ['commentB', 'ticket_comments', 'ticket_id', ids.ticketB],
      ['subscriberB', 'subscribers', 'id', ids.subscriberB],
      ['expedienteB', 'expediente_records', 'id', ids.expedienteB],
      ['contractB', 'contracts', 'id', ids.contractB],
    ] as const) {
      titularBSnapshot.set(
        key,
        (await dataSource.query(`SELECT * FROM ${q}."${table}" WHERE "${column}" = $1`, [
          value,
        ])) as Array<Record<string, unknown>>,
      );
    }

    expect(skipped).toEqual([]);
    const [auditCount] = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${q}.audit_logs`,
    )) as Array<{ count: number }>;
    auditLogCountBefore = auditCount?.count ?? 0;
  });

  it('CA-BT-01/02/06/10/17: la supresión por la API no deja canarios y conserva filas', async () => {
    const created = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId: ids.partyA,
          requesterKind: 'TITULAR',
          requesterName: 'Titular Ficticio B4',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: DOC_A,
          requesterContact: 'titular-b4@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        } as never,
        ids.actorId,
      ),
    );
    ids.requestA = created.request.id;
    await inTenant(() => service.transition(created.request.id, 'complete', {}, ids.actorId));
    const preview = await inTenant(() => service.erasurePreview(created.request.id));
    expect(preview.eligible).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.candidateExpedienteIds).toEqual([ids.expedienteA]);
    expect(preview.categories).toEqual(
      expect.arrayContaining(['IDENTIFICACION', 'OPERACION_CAMPO']),
    );

    await inTenant(() =>
      service.transition(
        created.request.id,
        'resolve',
        {
          responseText: 'Supresión aplicada en la integración B4.',
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: preview.candidateExpedienteIds },
        } as never,
        ids.actorId,
      ),
    );

    expect(await noCanarySurvives()).toEqual([]);
    for (const [table, expected] of tableCountsBefore) {
      expect(await count(table)).toBe(expected);
    }
    // R-10: el respaldo se borra; R-14: ciudad/departamento a NULL y estrato a marca.
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM ${q}.crm_contract_alias_backup_168`,
      ),
    ).toEqual([{ count: 0 }]);
    expect(
      await dataSource.query(
        `SELECT installation_city, installation_department, installation_stratum, service_usage
           FROM ${q}.contracts WHERE id = ANY($1::uuid[]) ORDER BY service_usage`,
        [[ids.contractRes, ids.contractNonRes]],
      ),
    ).toEqual([
      {
        installation_city: null,
        installation_department: null,
        installation_stratum: null,
        service_usage: 'NON_RESIDENTIAL',
      },
      {
        installation_city: null,
        installation_department: null,
        installation_stratum: null,
        service_usage: 'RESIDENTIAL',
      },
    ]);
    // R-2: marca con ck_sp_regularized activo; R-4/R-6: NOT NULL a marca/NULL.
    expect(
      await dataSource.query(`SELECT regularization_reason FROM ${q}.service_provisionings`),
    ).toEqual(expect.arrayContaining([{ regularization_reason: 'ANONIMIZADO' }]));
    // CA-BT-10 (paridad API/CLI, R13): el mismo fixture queda en 0 por el CLI.
    const parity = await anonymizeTitularInTenantSchema(
      dataSource,
      schemaName,
      ids.requestA,
      [ids.expedienteA],
      false,
      cliKeys,
      'apply',
    );
    expect(parity.verification.residualFields).toBe(0);
    expect(parity.verification.activeMediaAssets).toBe(0);
    expect(await noCanarySurvives()).toEqual([]);
  });

  it('CA-BT-03: otro titular del mismo tenant, con ticket, OT, visita y aprovisionamiento, no cambia', async () => {
    for (const [key, table, column, value] of [
      ['ticketB', 'support_tickets', 'id', ids.ticketB],
      ['commentB', 'ticket_comments', 'ticket_id', ids.ticketB],
      ['subscriberB', 'subscribers', 'id', ids.subscriberB],
      ['expedienteB', 'expediente_records', 'id', ids.expedienteB],
      ['contractB', 'contracts', 'id', ids.contractB],
    ] as const) {
      expect(
        await dataSource.query(`SELECT * FROM ${q}."${table}" WHERE "${column}" = $1`, [value]),
      ).toEqual(titularBSnapshot.get(key));
    }
  });

  it('CA-BT-04: el timeline de un anonimizado responde 200 sin notas y sin 500 por los NULL', async () => {
    const page = await inTenant(() =>
      expedienteService.getTimelinePage(ids.expedienteA, 1, 50, 'all'),
    );
    const notes: Array<unknown> = [];
    for (const event of page.data.events) {
      if (event.kind === 'contact') notes.push(event.notes);
      if (event.kind === 'responsibility') notes.push(event.notes);
      if (event.kind === 'pipeline') notes.push(event.reason);
    }
    expect(page.data.events.length).toBeGreaterThan(0);
    expect(notes).not.toHaveLength(0);
    expect(notes.every((note) => note === null)).toBe(true);
    expect(JSON.stringify(page)).not.toContain('B4CNR-');
    expect(JSON.stringify(page)).not.toContain('Motivo real de descarte B4');
  });

  it('CA-BT-05: la lectura de red del anonimizado muestra ANONIMIZADO y el ticket ya no nombra', async () => {
    expect(
      await dataSource.query(
        `SELECT regularization_reason FROM ${q}.service_provisionings WHERE subscriber_id = $1`,
        [ids.subscriberA],
      ),
    ).toEqual([{ regularization_reason: 'ANONIMIZADO' }]);
    expect(
      await dataSource.query(`SELECT subject FROM ${q}.support_tickets WHERE id = $1`, [
        ids.ticketReal,
      ]),
    ).toEqual([{ subject: 'ANONIMIZADO' }]);
  });

  it('CA-BT-07: transición y rechazo de consentimiento no dejan el motivo en audit_logs', async () => {
    const rows = (await dataSource.query(
      `SELECT new_value FROM ${q}.audit_logs WHERE tenant_id = $1`,
      [ids.tenantId],
    )) as Array<{ new_value: unknown }>;
    expect(rows.length).toBeGreaterThan(auditLogCountBefore);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('Motivo real de descarte B4');
    expect(dump).not.toContain('Motivo real de revocación B4');
    const withReasonProvided = rows.filter((row) =>
      JSON.stringify(row.new_value).includes('reasonProvided'),
    );
    expect(withReasonProvided.length).toBeGreaterThan(0);
    for (const row of withReasonProvided) {
      expect(row.new_value).toMatchObject({ reasonProvided: true });
      expect(row.new_value).not.toHaveProperty('reason');
    }
  });

  it('CA-BT-09/14: lo escrito antes queda anonimizado y lo nuevo recibe 409 PRIVACY_TITULAR_ANONYMIZED', async () => {
    expect(
      await dataSource.query(`SELECT body FROM ${q}.ticket_comments WHERE id = $1`, [
        ids.commentReal,
      ]),
    ).toEqual([{ body: 'ANONIMIZADO' }]);
    await expect(
      inTenant(() =>
        commentsService.addComment(ids.ticket1, { body: 'Comentario tardío B4' }, actor),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
  });

  it('B5-R: update, requestFieldService y linkWorkOrder dan 409 sin escribir ni encolar; transitionStatus sigue cerrando', async () => {
    const fieldServiceRequest = jest.fn().mockResolvedValue(undefined);
    const guardedTicketsService = new TicketsService(
      dataSource,
      {
        findApplicablePolicy: jest.fn().mockResolvedValue(null),
        calculateDeadlines: jest
          .fn()
          .mockReturnValue({ slaFirstResponseAt: null, slaResolveByAt: null }),
        deriveBreachStatus: jest.fn().mockReturnValue(SlaBreachStatus.OK),
      } as never,
      { isPqrRecordComplete: jest.fn().mockResolvedValue(true) } as never,
      { recordWithManager: jest.fn().mockResolvedValue(undefined) } as never,
      { requestFieldService: fieldServiceRequest } as never,
      crmPort,
    );
    const linksBefore = (await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${q}.ticket_work_order_links WHERE ticket_id = $1`,
      [ids.ticket1],
    )) as Array<{ count: number }>;
    await expect(
      inTenant(() =>
        guardedTicketsService.update(ids.ticket1, { subject: 'Asunto tardío B4' } as never, actor),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
    await expect(
      inTenant(() => guardedTicketsService.requestFieldService(ids.ticket1, {} as never, actor)),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
    await expect(
      inTenant(() =>
        guardedTicketsService.linkWorkOrder(
          ids.ticket1,
          { workOrderId: randomUUID(), notes: 'Nota tardía B4' } as never,
          actor,
        ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRIVACY_TITULAR_ANONYMIZED' }),
    });
    expect(fieldServiceRequest).not.toHaveBeenCalled();
    expect(
      await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM ${q}.ticket_work_order_links WHERE ticket_id = $1`,
        [ids.ticket1],
      ),
    ).toEqual(linksBefore);
    expect(
      await dataSource.query(`SELECT subject FROM ${q}.support_tickets WHERE id = $1`, [
        ids.ticket1,
      ]),
    ).toEqual([{ subject: 'ANONIMIZADO' }]);
    const closed = await inTenant(() =>
      guardedTicketsService.transitionStatus(
        ids.ticket1,
        { status: TicketStatus.IN_PROGRESS } as never,
        actor,
      ),
    );
    expect(closed.status).toBe(TicketStatus.IN_PROGRESS);
    expect(
      await dataSource.query(`SELECT status FROM ${q}.support_tickets WHERE id = $1`, [
        ids.ticket1,
      ]),
    ).toEqual([{ status: TicketStatus.IN_PROGRESS }]);
  });

  it('CA-BT-13: proveedor del mismo Party bloquea; de otro Party no', async () => {
    // Otro Party: la vista previa del titular B sigue elegible.
    await dataSource.query(
      `INSERT INTO ${q}.supplier_profiles (id, tenant_id, party_ref_id, party_role_id, supplier_code)
       VALUES ($1, $2, $3, $4, 'SUP-B4-OTRO')`,
      [randomUUID(), ids.tenantId, randomUUID(), randomUUID()],
    );
    const createdB = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId: ids.partyB,
          requesterKind: 'TITULAR',
          requesterName: 'Segundo Titular Ficticio B4',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: DOC_B,
          requesterContact: 'segundo-b4@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        } as never,
        ids.actorId,
      ),
    );
    await inTenant(() => service.transition(createdB.request.id, 'complete', {}, ids.actorId));
    const previewB = await inTenant(() => service.erasurePreview(createdB.request.id));
    expect(previewB.blockers).not.toContain('SUPPLIER_PROFILE_LINKED');

    // Mismo Party: la vista previa del titular A se bloquea y el resolve rechaza.
    await dataSource.query(
      `INSERT INTO ${q}.supplier_profiles (id, tenant_id, party_ref_id, party_role_id, supplier_code)
       VALUES ($1, $2, $3, $4, 'SUP-B4-MISMO')`,
      [randomUUID(), ids.tenantId, ids.partyA, randomUUID()],
    );
    const createdA2 = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId: ids.partyA,
          requesterKind: 'TITULAR',
          requesterName: 'Titular Ficticio B4',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: DOC_A,
          requesterContact: 'titular-b4@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        } as never,
        ids.actorId,
      ),
    );
    await inTenant(() => service.transition(createdA2.request.id, 'complete', {}, ids.actorId));
    const previewA2 = await inTenant(() => service.erasurePreview(createdA2.request.id));
    expect(previewA2.eligible).toBe(false);
    expect(previewA2.blockers).toContain('SUPPLIER_PROFILE_LINKED');
    // El bloqueante también muerde en --apply (D-BT-8): el CLI rechaza 409.
    await expect(
      anonymizeTitularInTenantSchema(
        dataSource,
        schemaName,
        createdA2.request.id,
        [ids.expedienteA],
        false,
        cliKeys,
        'apply',
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'PRIVACY_ERASURE_SUPPLIER_PROFILE' }),
    });
    // Limpieza: el proveedor era sonda de este test; CA-BT-11 exige el titular sin bloqueos.
    await dataSource.query(`DELETE FROM ${q}.supplier_profiles WHERE party_ref_id = $1`, [
      ids.partyA,
    ]);
  });

  it('CA-BT-11 (D-BT-12): --verify-only delata canarios previos, --apply los limpia y otro --verify-only da 0', async () => {
    const priorTicket = randomUUID();
    const priorSchedule = randomUUID();
    const priorComment = tag('PRIOR-COMMENT');
    const priorSubject = tag('PRIOR-SUBJECT');
    const priorReason = tag('PRIOR-REASON');
    const priorReschedule = tag('PRIOR-RESCHED');
    canaries.push(
      { table: 'ticket_comments', column: 'body', tag: priorComment },
      { table: 'support_tickets', column: 'subject', tag: priorSubject },
      { table: 'support_tickets', column: 'description', tag: priorSubject },
      { table: 'status_changes', column: 'reason', tag: priorReason },
      { table: 'schedule_reschedule_logs', column: 'reason', tag: priorReschedule },
    );
    await dataSource.query(
      `INSERT INTO ${q}.support_tickets
        (id, tenant_id, ticket_number, type, subject, description, requester_type, requester_ref_id,
         subject_type, subject_ref_id, created_by_user_id)
       VALUES ($1, $2, 'T-B4-PRIOR', 'CUSTOMER_INCIDENT', $3, $4, 'SUBSCRIBER', $5,
         'SUBSCRIBER', $6, $7)`,
      [
        priorTicket,
        ids.tenantId,
        priorSubject,
        priorSubject,
        ids.subscriberA,
        ids.subscriberA,
        ids.actorId,
      ],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ticket_comments (id, ticket_id, tenant_id, body, author_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), priorTicket, ids.tenantId, priorComment, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.status_changes
        (id, tenant_id, expediente_id, from_status, to_status, changed_at, changed_by, reason)
       VALUES ($1, $2, $3, 'X', 'Y', now(), $4, $5)`,
      [randomUUID(), ids.tenantId, ids.expedienteA, ids.actorId, priorReason],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_events
        (id, tenant_id, type, title, scheduled_start_at, scheduled_end_at, assigned_user_id,
         subscriber_id, contract_id, created_by)
       VALUES ($1, $2, 'INSTALLATION', 'Agenda previa B4', now(), now() + interval '1 hour',
         $3, $4, $5, $6)`,
      [priorSchedule, ids.tenantId, ids.actorId, ids.subscriberA, ids.contractRes, ids.actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.schedule_reschedule_logs
        (id, tenant_id, schedule_event_id, from_start_at, from_end_at, to_start_at, to_end_at,
         reason, notes, changed_by)
       VALUES ($1, $2, $3, '2026-01-01T08:00Z', '2026-01-01T09:00Z', '2026-01-02T08:00Z',
         '2026-01-02T09:00Z', $4, NULL, $5)`,
      [randomUUID(), ids.tenantId, priorSchedule, priorReschedule, ids.actorId],
    );

    const before = await verifyAnonymizedTenant(dataSource, schemaName, cliKeys);
    expect(before.residualFields).toBeGreaterThan(0);
    expect(JSON.stringify(before.findings)).toContain('support_tickets');
    // P2 de seguridad (5d6a366b): la salida verify-only no lleva ids de titulares.
    expect(JSON.stringify(toVerificationOutput(before))).not.toContain(ids.subscriberA);
    expect(JSON.stringify(toVerificationOutput(before))).not.toContain(ids.expedienteA);
    expect(await listFindingRequestIds(dataSource, schemaName, before)).toEqual([ids.requestA]);

    const report = await anonymizeTitularInTenantSchema(
      dataSource,
      schemaName,
      ids.requestA,
      [ids.expedienteA],
      false,
      cliKeys,
      'apply',
    );
    expect(report.verification.residualFields).toBe(0);
    expect(await noCanarySurvives()).toEqual([]);

    const after = await verifyAnonymizedTenant(dataSource, schemaName, cliKeys);
    expect(after.residualFields).toBe(0);
    expect(after.findings).toEqual([]);
  });
});
