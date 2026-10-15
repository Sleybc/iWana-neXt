import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { ConsentStatus, ConsentType, ExpedienteStatus } from '@iwana/shared';
import { ExpedienteDetailBootstrapService } from '../expediente-detail-bootstrap.service';
import { ExpedienteService } from '../expediente.service';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { CrmConversionFailure } from '../entities/crm-conversion-failure.entity';
import { ConsentRecord } from '../entities/consent-record-v2.entity';
import { ContactAttempt } from '../entities/contact-attempt.entity';
import { CoverageCheck } from '../entities/coverage-check.entity';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { StatusChange } from '../entities/status-change.entity';
import { SalesAttribution } from '../../attributions/entities/sales-attribution.entity';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('G1 autorización y fallo de conversión contra PostgreSQL real', () => {
  const syntheticAesKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const syntheticHashKey = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const actorId = '00000000-0000-4000-8000-0000000000a1';
  const configService = {
    getOrThrow: jest.fn((key: string) =>
      key === 'PII_HASH_KEY' ? syntheticHashKey : syntheticAesKey,
    ),
    get: jest.fn(() => undefined),
  } as unknown as ConfigService;

  let dataSource: DataSource;
  let tenantDataSource: DataSource | undefined;
  let tenantId: string;
  let testSchemaName: string;
  let testTenantSlug: string;
  let completenessCalculator: CompletenessCalculator;
  let auditService: { log: jest.Mock };
  let eventEmitter: { emitAsync: jest.Mock };
  let subscribersService: {
    findByExpedienteId: jest.Mock;
    findSummaryByExpedienteId: jest.Mock;
  };
  let expedienteService: ExpedienteService;
  let bootstrapService: ExpedienteDetailBootstrapService;

  const completenessResult = {
    commercial: 80,
    legal: 80,
    technical: 80,
    operational: 80,
    overall: 80,
    sectionCompleteness: [],
    installationReadiness: {
      status: 'READY',
      canTransition: true,
      title: 'Listo',
      message: 'Puede continuar.',
    },
    missingRequirements: [],
  };

  const context = () => ({
    tenantId,
    schemaName: testSchemaName,
    tenantSlug: testTenantSlug,
  });

  function quoteIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  async function countRows(table: string, where = '', parameters: unknown[] = []): Promise<number> {
    const rows = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(`SELECT COUNT(*)::int AS count FROM ${table} ${where}`, parameters),
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  async function createExpediente(): Promise<ExpedienteRecord> {
    const expediente = Object.assign(new ExpedienteRecord(), {
      id: randomUUID(),
      tenantId,
      status: ExpedienteStatus.EN_COTIZACION,
      previousStatus: null,
      statusChangedAt: new Date('2026-10-15T10:00:00.000Z'),
      fullName: 'Persona sintética G1',
      firstName: 'Persona',
      lastName: 'Sintética',
      documentType: 'CC',
      personType: 'PERSONA_NATURAL',
      source: 'G1_INTEGRATION',
      createdBy: actorId,
    });
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.save(ExpedienteRecord, expediente),
    );
    return expediente;
  }

  async function captureAcceptedTreatmentConsent(expedienteId: string): Promise<void> {
    const consent = Object.assign(new ConsentRecord(), {
      tenantId,
      expedienteId,
      legacyProspectId: expedienteId,
      consentType: ConsentType.TRATAMIENTO_DATOS,
      status: ConsentStatus.ACEPTADO,
      legacyAccepted: true,
      channel: 'WEB',
      obtainedAt: new Date('2026-10-15T10:05:00.000Z'),
      ipAddress: null,
      legalTextVersion: 'g1-synthetic-v1',
      evidenceRef: null,
      revokedAt: null,
      revokedReason: null,
      revokedBy: null,
    });
    await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.manager.save(ConsentRecord, consent),
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        AuditLog,
        ConsentRecord,
        ContactAttempt,
        CoverageCheck,
        CrmConversionFailure,
        ExpedienteRecord,
        StatusChange,
        SalesAttribution,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 8, min: 1 },
    });
    await dataSource.initialize();
    tenantId = randomUUID();
    testTenantSlug = `g1-${randomUUID().slice(0, 8)}`;
    testSchemaName = `tenant_g1_${randomUUID().replace(/-/g, '')}`;
    const target = quoteIdentifier(testSchemaName);
    await dataSource.query(`CREATE SCHEMA ${target}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'G1 integration synthetic', testTenantSlug, testSchemaName, 'g1@example.invalid'],
    );
    // Schema independiente: instala la cadena tenant vigente desde cero, sin
    // consultar el tenant de origen ni su ledger de migraciones.
    tenantDataSource = createTenantDataSource(dataSource, testSchemaName, `g1-${testSchemaName}`);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource);
    await tenantDataSource.destroy();
    tenantDataSource = undefined;

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    subscribersService = {
      findByExpedienteId: jest.fn().mockResolvedValue(null),
      findSummaryByExpedienteId: jest.fn().mockResolvedValue(null),
    };
    completenessCalculator = {
      calculate: jest.fn().mockResolvedValue(completenessResult),
      calculateBatch: jest.fn().mockResolvedValue(new Map()),
      loadRelatedContext: jest
        .fn()
        .mockResolvedValue({ consents: [], quotes: [], coverageChecks: [] }),
      calculateFromContext: jest.fn().mockResolvedValue(completenessResult),
    } as unknown as CompletenessCalculator;
    const actorReadPort = {
      findById: jest.fn().mockResolvedValue({ id: actorId, name: 'Operador sintético' }),
      findByIds: jest.fn().mockResolvedValue([]),
    };
    expedienteService = new ExpedienteService(
      dataSource,
      configService,
      auditService as never,
      completenessCalculator,
      actorReadPort as never,
      eventEmitter as unknown as EventEmitter2,
      subscribersService as never,
    );
    bootstrapService = new ExpedienteDetailBootstrapService(
      dataSource,
      completenessCalculator,
      { getRecommendationFromContext: jest.fn().mockResolvedValue(null) } as never,
      { getCurrentAttribution: jest.fn().mockResolvedValue(null) } as never,
      { getResponsibility: jest.fn().mockResolvedValue(null) } as never,
      { findSummaryByExpedienteId: jest.fn().mockResolvedValue(null) } as never,
      actorReadPort as never,
      auditService as never,
    );
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (tenantDataSource?.isInitialized) await tenantDataSource.destroy();
      if (testSchemaName) {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(testSchemaName)} CASCADE`);
      }
      if (tenantId) await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter.emitAsync.mockResolvedValue([]);
    subscribersService.findByExpedienteId.mockResolvedValue(null);
    subscribersService.findSummaryByExpedienteId.mockResolvedValue(null);
  });

  it('rechaza R8 sin escritura y permite LISTO con consentimiento contractual aceptado', async () => {
    const expediente = await createExpediente();

    await expect(
      TenantContext.run(context(), () =>
        expedienteService.transitionStatus(
          expediente.id,
          { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
          actorId,
        ),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED',
        message:
          'Para pasar a Listo para instalación, registra la autorización de tratamiento de datos en Consentimientos.',
      },
      status: 422,
    });

    const unchanged = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT status FROM expediente_records WHERE id = $1', [expediente.id]),
    )) as Array<{ status: ExpedienteStatus }>;
    expect(unchanged[0]?.status).toBe(ExpedienteStatus.EN_COTIZACION);
    expect(await countRows('status_changes', 'WHERE expediente_id = $1', [expediente.id])).toBe(0);

    await captureAcceptedTreatmentConsent(expediente.id);
    eventEmitter.emitAsync.mockRejectedValueOnce(
      new UnprocessableEntityException({ code: 'Pii\nInjected', message: 'Fallo sintético' }),
    );
    const transitioned = await TenantContext.run(context(), () =>
      expedienteService.transitionStatus(
        expediente.id,
        { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
        actorId,
      ),
    );
    expect(transitioned.status).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);
    const savedStatus = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query('SELECT status FROM expediente_records WHERE id = $1', [expediente.id]),
    )) as Array<{ status: ExpedienteStatus }>;
    expect(savedStatus[0]?.status).toBe(ExpedienteStatus.LISTO_PARA_INSTALACION);
  });

  it('proyecta CONVERSION_FAILED sin PII y lo oculta al resolver el reintento', async () => {
    const expediente = await createExpediente();
    await captureAcceptedTreatmentConsent(expediente.id);
    eventEmitter.emitAsync.mockRejectedValueOnce(
      new UnprocessableEntityException({ code: 'Pii\nInjected', message: 'Fallo sintético' }),
    );

    await TenantContext.run(context(), () =>
      expedienteService.transitionStatus(
        expediente.id,
        { targetStatus: ExpedienteStatus.LISTO_PARA_INSTALACION },
        actorId,
      ),
    );

    const storedFailure = (await runInTenantSchema(dataSource, testSchemaName, (qr) =>
      qr.query(
        'SELECT error_code, attempts FROM crm_conversion_failures WHERE expediente_id = $1',
        [expediente.id],
      ),
    )) as Array<{ error_code: string; attempts: number }>;
    expect(storedFailure).toEqual([{ error_code: 'CONVERSION_FAILED', attempts: 1 }]);

    const pending = await TenantContext.run(context(), () =>
      bootstrapService.getDetailBootstrap(expediente.id, actorId),
    );
    expect(pending.conversionFailure).toEqual({
      eventName: 'crm.expediente.ready-for-installation',
      errorCode: 'CONVERSION_FAILED',
      attempts: 1,
      lastFailedAt: expect.any(Date),
    });
    expect(Object.keys(pending.conversionFailure ?? {}).sort()).toEqual(
      ['attempts', 'errorCode', 'eventName', 'lastFailedAt'].sort(),
    );

    eventEmitter.emitAsync.mockResolvedValueOnce([]);
    subscribersService.findByExpedienteId.mockResolvedValue({
      id: randomUUID(),
      status: 'PROSPECT',
    });
    await expect(
      TenantContext.run(context(), () =>
        expedienteService.retryConversionEvent(expediente.id, actorId),
      ),
    ).resolves.toMatchObject({ retried: true, resolved: true });

    const resolved = await TenantContext.run(context(), () =>
      bootstrapService.getDetailBootstrap(expediente.id, actorId),
    );
    expect(resolved.conversionFailure).toBeNull();
  });
});
