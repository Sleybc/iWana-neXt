import { randomBytes, randomUUID } from 'node:crypto';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { AccessPermissionKey, DocumentTypeParty } from '@iwana/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { MediaService } from '../../media/media.service';
import { IContractImpersonationPort } from '../ports/contract-impersonation.port';
import { PrivacyRequestsController } from './requests.controller';
import { PrivacyRequestsService } from './requests.service';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';

/**
 * H-EXP B4-R2 (M-1, B-1) por la ruta HTTP de supresión contra PostgreSQL real:
 * `POST /privacy/requests/:id/reject` con el controlador, el servicio y los
 * adaptadores reales de CRM, Billing y PQR. Un contrato abierto conserva por
 * sí mismo aunque otro registro carezca de fecha; el 409 codificado
 * (CONTRACT_UNRECONCILED / FISCAL_UNRECONCILED) solo aparece cuando nada más
 * justifica conservar. Solo datos sintéticos.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(test|iwana_it_[a-z0-9_]+)$/u;
const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.setTimeout(300_000);

describeWithDb('Supresión por HTTP — reloj sin conciliar (B4-R2) en PostgreSQL real', () => {
  const schemaName = `tenant_erasure_http_${randomBytes(5).toString('hex')}`;
  const s = `"${schemaName}"`;
  const tenantId = randomUUID();
  const tenantSlug = `erasure-http-${schemaName.slice(-10)}`;
  const actorId = randomUUID();

  let dataSource: DataSource;
  let service: PrivacyRequestsService;
  let app: INestApplication;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, operation);

  async function q(sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
    return (await dataSource.query(sql, params)) as Array<Record<string, unknown>>;
  }

  async function makeTitular(): Promise<{ partyId: string; subscriberId: string }> {
    const partyId = randomUUID();
    const subscriberId = randomUUID();
    await q(
      `INSERT INTO ${s}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', 'sintetico', 'Titular sintético HTTP')`,
      [partyId],
    );
    await q(
      `INSERT INTO ${s}.subscribers
         (id, tenant_id, party_id, person_type, customer_segment, document_type,
          document_number_encrypted, first_name, last_name, stratum, email_encrypted,
          phone_encrypted, vat_treatment, tax_regime, vat_responsibility, address, created_by)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'CC', 'sintetico',
         'Nombre sintético', 'Apellido sintético', 3, 'sintetico',
         'sintetico', 'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', 'Dirección sintética', $4)`,
      [subscriberId, tenantId, partyId, actorId],
    );
    return { partyId, subscriberId };
  }

  async function insertContract(
    subscriberId: string,
    kind: 'OPEN' | 'TERMINATED_2015' | 'TERMINATED_NO_DATE',
  ): Promise<string> {
    const id = randomUUID();
    await q(
      `INSERT INTO ${s}.contracts
         (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, terminated_at,
          additional_product_ids, additional_service_ids)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, $4,
         ${kind === 'TERMINATED_2015' ? "'2015-03-01T12:00:00Z'::timestamptz" : 'NULL'},
         '{}', '{}')`,
      [id, tenantId, subscriberId, kind === 'TERMINATED_2015' ? 'TERMINATED' : 'ACTIVE'],
    );
    if (kind === 'TERMINATED_NO_DATE') {
      // Dato heredado: la 170 veta el terminal sin fecha; el trigger se
      // suspende solo en este schema efímero y se restablece.
      await q(`ALTER TABLE ${s}.contracts DISABLE TRIGGER USER`);
      try {
        await q(`UPDATE ${s}.contracts SET status = 'TERMINATED' WHERE id = $1`, [id]);
      } finally {
        await q(`ALTER TABLE ${s}.contracts ENABLE TRIGGER USER`);
      }
    }
    return id;
  }

  async function insertFiscalDocumentWithoutDate(
    contractId: string,
    subscriberId: string,
  ): Promise<void> {
    const periodId = randomUUID();
    await q(
      `INSERT INTO ${s}.billing_periods
         (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
          generation_date, due_date, effective_policy)
       VALUES ($1, $2, $3, $4, '2015-01-01', '2015-01-01', '2015-01-01', '2015-01-01',
         '2015-01-01', '{}'::jsonb)`,
      [periodId, tenantId, contractId, subscriberId],
    );
    await q(
      `INSERT INTO ${s}.billing_documents
         (id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date, due_date,
          subtotal, tax_total, total)
       VALUES ($1, $2, $3, $4, $5, 'EMITIDO', NULL, CURRENT_DATE, 10, 0, 10)`,
      [randomUUID(), tenantId, periodId, contractId, subscriberId],
    );
  }

  async function verifiedSuppression(partyId: string): Promise<string> {
    const created = await inTenant(() =>
      service.create(
        {
          kind: 'CONSULTA',
          right: 'SUPRIMIR',
          partyId,
          requesterKind: 'TITULAR',
          requesterName: 'Titular sintético HTTP',
          requesterDocumentType: DocumentTypeParty.CC,
          requesterDocument: String(randomBytes(4).readUInt32BE(0)),
          requesterContact: 'titular-http@example.invalid',
          identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        },
        actorId,
      ),
    );
    await inTenant(() => service.transition(created.request.id, 'complete', {}, actorId));
    return created.request.id;
  }

  function reject(requestId: string, legalBasis: string) {
    return request(app.getHttpServer()).post(`/privacy/requests/${requestId}/reject`).send({
      responseText: 'Respuesta sintética de conservación.',
      responseChannel: 'EMAIL',
      legalBasis,
    });
  }

  async function requestState(
    requestId: string,
  ): Promise<{ status: string; legal_basis: string | null }> {
    const rows = (await q(
      `SELECT status, legal_basis FROM ${s}.data_subject_requests WHERE id = $1`,
      [requestId],
    )) as Array<{ status: string; legal_basis: string | null }>;
    return rows[0] ?? { status: 'AUSENTE', legal_basis: null };
  }

  beforeAll(async () => {
    const databaseName = process.env['DB_NAME'] ?? '';
    if (!allowedDatabaseName.test(databaseName)) {
      throw new Error(
        'Integración supresión HTTP B4-R2: DB_NAME debe ser test o iwana_it_*; nunca desarrollo.',
      );
    }
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: databaseName,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${s}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Supresión HTTP B4-R2 sintético', $2, $3, 'ACTIVE', 'erasure-http@example.invalid')`,
      [tenantId, tenantSlug, schemaName],
    );
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const configService = {
      getOrThrow: (key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY' || key === 'PII_HASH_KEY') return keyHex;
        throw new Error('Clave sintética no configurada.');
      },
      get: (key: string) => (key === 'PII_ENCRYPTION_KEY' ? keyHex : undefined),
    } as unknown as ConfigService;
    service = new PrivacyRequestsService(
      dataSource,
      configService,
      {
        log: jest.fn(async () => undefined),
        logWithin: jest.fn(async () => undefined),
      } as unknown as AuditService,
      { suspendForImpersonation: jest.fn() } as unknown as IContractImpersonationPort,
      new CrmContractStandingReadAdapter(),
      { findOne: jest.fn() } as unknown as MediaService,
      {
        getEffectivePermissionsForUser: jest
          .fn()
          .mockResolvedValue([
            AccessPermissionKey.PRIVACY_READ,
            AccessPermissionKey.PRIVACY_MANAGE,
          ]),
      } as unknown as EffectivePermissionsService,
      undefined,
      new BillingStandingReadAdapter(),
      new PqrRetentionReadAdapter(),
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [PrivacyRequestsController],
      providers: [{ provide: PrivacyRequestsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: actorId,
            type: 'tenant',
            role: 'AUDITOR',
          };
          return true;
        },
      })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    // El tenant del JWT lo fija en producción el middleware de tenancy.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      TenantContext.run({ tenantId, schemaName, tenantSlug }, next),
    );
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_erasure_http_[a-f0-9]{10}$/u.test(schemaName)) {
      throw new Error('Schema de limpieza inválido.');
    }
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('M-1: contrato abierto y otro terminado sin fecha → conserva por DEBER_CONTRACTUAL, sin 409', async () => {
    const titular = await makeTitular();
    await insertContract(titular.subscriberId, 'OPEN');
    await insertContract(titular.subscriberId, 'TERMINATED_NO_DATE');
    const requestId = await verifiedSuppression(titular.partyId);
    const response = await reject(requestId, 'DEBER_CONTRACTUAL');
    expect(response.status).toBe(201);
    expect(await requestState(requestId)).toEqual({
      status: 'NO_PROCEDENTE',
      legal_basis: 'DEBER_CONTRACTUAL',
    });
  });

  it('M-1: contrato abierto y documento fiscal sin fecha → conserva por DEBER_CONTRACTUAL, sin 409', async () => {
    const titular = await makeTitular();
    const open = await insertContract(titular.subscriberId, 'OPEN');
    await insertFiscalDocumentWithoutDate(open, titular.subscriberId);
    const requestId = await verifiedSuppression(titular.partyId);
    const response = await reject(requestId, 'DEBER_CONTRACTUAL');
    expect(response.status).toBe(201);
    expect(await requestState(requestId)).toMatchObject({ status: 'NO_PROCEDENTE' });
  });

  it('B-1: solo un terminado sin fecha → 409 CONTRACT_UNRECONCILED y la solicitud no cambia', async () => {
    const titular = await makeTitular();
    await insertContract(titular.subscriberId, 'TERMINATED_NO_DATE');
    const requestId = await verifiedSuppression(titular.partyId);
    const before = await requestState(requestId);
    const response = await reject(requestId, 'DEBER_LEGAL_CONSERVACION');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CONTRACT_UNRECONCILED' });
    expect(JSON.stringify(response.body)).not.toContain('sintetico');
    expect(await requestState(requestId)).toEqual(before);
  });

  it('B-1: terminado vencido y documento fiscal sin fecha → 409 FISCAL_UNRECONCILED y la solicitud no cambia', async () => {
    const titular = await makeTitular();
    const old = await insertContract(titular.subscriberId, 'TERMINATED_2015');
    await insertFiscalDocumentWithoutDate(old, titular.subscriberId);
    const requestId = await verifiedSuppression(titular.partyId);
    const before = await requestState(requestId);
    const response = await reject(requestId, 'DEBER_LEGAL_CONSERVACION');
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'FISCAL_UNRECONCILED' });
    expect(await requestState(requestId)).toEqual(before);
  });
});
