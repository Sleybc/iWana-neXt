// MOD05 Cierre de venta fase 2 · bloques A+B (D3, D-F2; CA-1 a CA-3) contra PostgreSQL real.
//
// El contrato automático se crea tras el suscriptor, uno solo por expediente aunque el evento
// se repita (también en paralelo); sin ciclo se crea igual y la lectura marca
// `billingCycleMissing`; si falta otro dato no se crea, queda el aviso en el suscriptor y se
// avisa al responsable comercial; un contrato manual previo impide el automático y la creación
// manual limpia el aviso.
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import {
  CustomerSegment,
  NetworkType,
  PersonType,
  ServiceUsage,
  TaxRegime,
  VatConcept,
  VatTreatment,
  type ContractAutoCreationIssue,
} from '@iwana/shared';
import { ContractsService } from '../contracts.service';
import { ContractAutoCreationService } from '../contract-auto-creation.service';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import type { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';
import { Contract } from '../entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { ExpedienteRecord } from '../../expedientes/entities/expediente-record.entity';
import { ContactAttempt } from '../../expedientes/entities/contact-attempt.entity';
import { ConsentRecord } from '../../expedientes/entities/consent-record-v2.entity';
import { CoverageCheck } from '../../expedientes/entities/coverage-check.entity';
import { StatusChange } from '../../expedientes/entities/status-change.entity';
import { SalesAttribution } from '../../attributions/entities/sales-attribution.entity';
import type { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import type { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import type { AuditService } from '../../../audit/audit.service';
import type { MediaService } from '../../../media/media.service';
import type { MailerService } from '../../../mailer/mailer.service';
import type { IPrivacyAuthorizationReadPort } from '../../../privacy/ports/privacy-authorization-read.port';
import type { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';
import type { IActiveUserEmailReadPort } from '../../../access-control/ports/active-user-email-read.port';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const integrationCryptoKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
// Plan del catálogo (UUID) con tarifa vigente; el puerto de MOD06 se simula.
const PLAN_ID = '7d3f6b1e-2c4a-4e8b-9f10-5a6b7c8d9e01';

describeWithDb('Contrato automático desde la oportunidad (fase 2, A+B) con PostgreSQL real', () => {
  let dataSource: DataSource;
  let contracts: ContractsService;
  let autoCreation: ContractAutoCreationService;
  const tenantId = randomUUID();
  const tenantSlug = `contract-auto-${tenantId.slice(0, 8)}`;
  const schemaName = 'tenant_contract_auto_' + randomUUID().replace(/-/g, '');
  const actorId = '00000000-0000-4000-8000-000000000051';
  const ownerId = '00000000-0000-4000-8000-000000000052';
  const quoteIdentifier = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  const ctx = () => ({ tenantId, schemaName, tenantSlug });

  const authorizedParties = new Set<string>();
  const privacyAuthorization = {
    hasActive: jest.fn(async (partyId: string) => ({
      active: authorizedParties.has(partyId),
      authorizationId: null,
      legalTextVersion: null,
      legacyUnverified: false,
    })),
  };
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const userEmails = { emailOf: jest.fn().mockResolvedValue('responsable@example.test') };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const catalog = {
    createSnapshot: jest.fn(async (_tenant: string, _schema: string, planId: string) => {
      if (planId !== PLAN_ID) throw new NotFoundException('plan no encontrado');
      return {
        planId,
        name: 'Fibra sintética 300',
        downloadSpeed: 300,
        uploadSpeed: 150,
        technology: 'FTTH',
        monthlyPrice: 95000,
        installationFee: 60000,
        vatConcept: VatConcept.INTERNET_ACCESS,
        networkType: NetworkType.FIXED,
        snapshotAt: new Date('2026-11-11T00:00:00Z'),
      };
    }),
  };

  async function insertSale(input: {
    planId?: string | null;
    billingCycle?: string | null;
    authorized?: boolean;
    segment?: CustomerSegment;
    /** Estrato del expediente (el del suscriptor es siempre 3). */
    stratum?: number | null;
    subscriberAddress?: string;
    vatResponsibility?: string | null;
  }): Promise<{ subscriberId: string; expedienteId: string }> {
    const subscriberId = randomUUID();
    const partyId = randomUUID();
    const expedienteId = randomUUID();
    const tag = subscriberId.slice(0, 8);
    if (input.authorized !== false) authorizedParties.add(partyId);
    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query(
        `INSERT INTO expediente_records
           (id, tenant_id, full_name, interested_plan_id, created_by, address, stratum,
            billing_cycle, additional_service_ids, current_responsible_user_id)
         VALUES ($1, $2, 'Expediente sintetico', $3, $4, 'Dirección sintética 1', $7, $5,
                 '["svc-auto-1"]'::jsonb, $6)`,
        [
          expedienteId,
          tenantId,
          input.planId === undefined ? PLAN_ID : input.planId,
          actorId,
          input.billingCycle ?? null,
          ownerId,
          input.stratum === undefined ? 3 : input.stratum,
        ],
      );
      await qr.query(
        [
          'INSERT INTO subscribers (',
          'id, tenant_id, party_id, person_type, customer_segment,',
          'document_type, document_number_encrypted, first_name, last_name, stratum,',
          'email_encrypted, phone_encrypted, vat_treatment, tax_regime, vat_responsibility,',
          'rut_responsibilities, address, created_by, expediente_id',
          ') VALUES (',
          "$1, $2, $3, $4, $5, 'CC', $6, 'Fixture', 'Automatico', 3, $6, $6, $7, $8,",
          "$12, ARRAY['O-13']::text[], $11, $9, $10",
          ')',
        ].join('\n'),
        [
          subscriberId,
          tenantId,
          partyId,
          PersonType.NATURAL,
          input.segment === undefined ? CustomerSegment.RESIDENTIAL : input.segment,
          'cifrado-' + tag,
          VatTreatment.STANDARD,
          TaxRegime.SIMPLIFIED,
          actorId,
          expedienteId,
          input.subscriberAddress ?? 'Dirección sintética 1',
          input.vatResponsibility === undefined ? 'RESPONSABLE' : input.vatResponsibility,
        ],
      );
    });
    return { subscriberId, expedienteId };
  }

  async function liveContracts(subscriberId: string): Promise<Contract[]> {
    return runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.manager.find(Contract, { where: { subscriberId } }),
    );
  }

  async function issueOf(subscriberId: string): Promise<ContractAutoCreationIssue | null> {
    const [row] = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT contract_auto_creation_issue AS issue FROM subscribers WHERE id = $1', [
        subscriberId,
      ]),
    )) as Array<{ issue: ContractAutoCreationIssue | null }>;
    return row?.issue ?? null;
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        Contract,
        Subscriber,
        ExpedienteRecord,
        ContactAttempt,
        ConsentRecord,
        CoverageCheck,
        StatusChange,
        SalesAttribution,
        AuditLog,
      ],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 5, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'Contract auto synthetic', tenantSlug, schemaName, 'auto@example.invalid'],
    );
    await dataSource.query('CREATE SCHEMA ' + quoteIdentifier(schemaName));
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const config = {
      get: (key: string, fallback?: unknown) =>
        key === 'PII_ENCRYPTION_KEY' ? integrationCryptoKeyHex : fallback,
      getOrThrow: () => integrationCryptoKeyHex,
    } as unknown as ConfigService;
    contracts = new ContractsService(
      dataSource,
      catalog as unknown as CommercialCatalogReadPort,
      {} as IInternetVatResolverPort,
      audit as unknown as AuditService,
      {} as MediaService,
      config,
      new SubscriberFiscalCompletenessService(),
      {} as SubscriberLifecycleService,
      privacyAuthorization as unknown as IPrivacyAuthorizationReadPort,
      {
        activeMarks: jest.fn().mockResolvedValue({}),
        partyIdsWithActiveMark: jest.fn().mockResolvedValue([]),
      } as unknown as IPrivacyMarksReadPort,
    );
    autoCreation = new ContractAutoCreationService(
      dataSource,
      contracts,
      audit as unknown as AuditService,
      mailer as unknown as MailerService,
      config,
      userEmails as unknown as IActiveUserEmailReadPort,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DROP SCHEMA IF EXISTS ' + quoteIdentifier(schemaName) + ' CASCADE');
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  beforeEach(() => jest.clearAllMocks());

  it('CA-1: evento repetido (también en paralelo) → un solo contrato DRAFT con los datos de la oportunidad', async () => {
    const { subscriberId, expedienteId } = await insertSale({ billingCycle: '15' });
    const request = { subscriberId, expedienteId, actorId };

    await TenantContext.run(ctx(), async () => {
      await Promise.all([
        autoCreation.createForExpediente(request),
        autoCreation.createForExpediente(request),
      ]);
      await autoCreation.createForExpediente(request);
    });

    const rows = await liveContracts(subscriberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: ContractStatus.DRAFT,
      planId: PLAN_ID,
      billingCycleDay: 15,
      sourceExpedienteId: expedienteId,
      installationAddress: 'Dirección sintética 1',
      installationStratum: 3,
      additionalServiceIds: ['svc-auto-1'],
      // D1: uso derivado (NATURAL + segmento RESIDENTIAL → RESIDENTIAL, ADR-093).
      serviceUsage: ServiceUsage.RESIDENTIAL,
      installationFee: 60000,
    });
    // D2: snapshot completo del plan, el que lee el primer cobro (nombre y mensualidad).
    expect(rows[0]!.planSnapshotJson).toMatchObject({
      planId: PLAN_ID,
      name: 'Fibra sintética 300',
      monthlyPrice: 95000,
      installationFee: 60000,
      vatConcept: VatConcept.INTERNET_ACCESS,
      networkType: NetworkType.FIXED,
    });
    const read = await TenantContext.run(ctx(), () =>
      contracts.findOneForRead(rows[0]!.id, false, actorId),
    );
    expect(read).toMatchObject({ billingCycleMissing: false });
    expect(await issueOf(subscriberId)).toBeNull();
    expect(mailer.sendMail).not.toHaveBeenCalled();
    const creates = audit.log.mock.calls.filter(
      ([entry]) => (entry as { entityType: string }).entityType === 'Contract',
    );
    expect(creates).toHaveLength(1);
    expect(creates[0]![0]).toMatchObject({
      userId: actorId,
      newValue: { source: 'AUTOMATIC_FROM_EXPEDIENTE', expedienteId },
    });
  });

  it('el índice único impide un segundo contrato automático del mismo expediente', async () => {
    const { subscriberId, expedienteId } = await insertSale({ billingCycle: '15' });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    const [existing] = await liveContracts(subscriberId);
    await expect(
      runInTenantSchema(dataSource, schemaName, (qr) =>
        qr.query(
          `INSERT INTO contracts (tenant_id, subscriber_id, plan_id, plan_snapshot_json, alias,
                                  source_expediente_id)
           VALUES ($1, $2, $3, '{}'::jsonb, 'Duplicado', $4)`,
          [tenantId, subscriberId, PLAN_ID, existing!.sourceExpedienteId],
        ),
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
  });

  it('CA-2: sin ciclo (o ciclo no válido) en la oportunidad crea el DRAFT sin ciclo y la lectura marca billingCycleMissing', async () => {
    for (const billingCycle of [null, 'MENSUAL', '7']) {
      const { subscriberId, expedienteId } = await insertSale({ billingCycle });
      await TenantContext.run(ctx(), () =>
        autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
      );
      const rows = await liveContracts(subscriberId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.billingCycleDay).toBeNull();
      const read = await TenantContext.run(ctx(), () =>
        contracts.findOneForRead(rows[0]!.id, false, actorId),
      );
      expect(read).toMatchObject({ billingCycleMissing: true, status: ContractStatus.DRAFT });
    }
  });

  it('CA-3: dato faltante → no crea, deja el aviso con todo lo que falta y avisa al responsable; la creación manual lo limpia', async () => {
    const { subscriberId, expedienteId } = await insertSale({ planId: null, authorized: false });

    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );

    expect(await liveContracts(subscriberId)).toHaveLength(0);
    const issue = await issueOf(subscriberId);
    expect(issue).toMatchObject({
      reason: 'MISSING_DATA',
      missing: ['PLAN', 'CONTRACTUAL_AUTHORIZATION'],
    });
    expect(Number.isNaN(Date.parse(issue!.detectedAt))).toBe(false);
    expect(userEmails.emailOf).toHaveBeenCalledWith(ownerId, expect.anything());
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const mail = mailer.sendMail.mock.calls[0]![0] as { to: string; text: string };
    expect(mail.to).toBe('responsable@example.test');
    expect(mail.text).toContain(
      'No se pudo crear el contrato: falta plan de la oportunidad, autorización de tratamiento contractual.',
    );
    expect(mail.text).toContain(`/dashboard/crm/subscribers/${subscriberId}`);
    expect(mail.text).not.toContain('Fixture');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Subscriber',
        entityId: subscriberId,
        newValue: expect.objectContaining({
          contractAutoCreationIssue: {
            missing: ['PLAN', 'CONTRACTUAL_AUTHORIZATION'],
          },
        }),
      }),
    );

    // La creación manual sigue funcionando (con los datos completados) y limpia el aviso.
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('UPDATE expediente_records SET interested_plan_id = $2 WHERE id = $1', [
        expedienteId,
        PLAN_ID,
      ]),
    );
    const partyRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT party_id FROM subscribers WHERE id = $1', [subscriberId]),
    )) as Array<{ party_id: string }>;
    authorizedParties.add(partyRows[0]!.party_id);
    await TenantContext.run(ctx(), () =>
      contracts.createFromExpediente(subscriberId, { billingCycleDay: 1 }, actorId),
    );
    expect(await liveContracts(subscriberId)).toHaveLength(1);
    expect(await issueOf(subscriberId)).toBeNull();
  });

  it('un contrato creado a mano antes impide el automático', async () => {
    const { subscriberId, expedienteId } = await insertSale({ billingCycle: '1' });
    const manual = await TenantContext.run(ctx(), () =>
      contracts.createFromExpediente(subscriberId, {}, actorId),
    );
    expect(manual.sourceExpedienteId ?? null).toBeNull();

    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );

    const rows = await liveContracts(subscriberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(manual.id);
  });

  it('suscriptor cancelado: el rechazo de negocio no tumba la conversión ni crea contrato', async () => {
    const { subscriberId, expedienteId } = await insertSale({ billingCycle: '1' });
    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(`UPDATE subscribers SET status = 'CANCELLED' WHERE id = $1`, [subscriberId]),
    );

    await expect(
      TenantContext.run(ctx(), () =>
        autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
      ),
    ).resolves.toBeUndefined();
    expect(await liveContracts(subscriberId)).toHaveLength(0);
    expect(mailer.sendMail).not.toHaveBeenCalled();
  });
  it('D1: segmento no residencial → contrato con uso NON_RESIDENTIAL y sin estrato exigido', async () => {
    const { subscriberId, expedienteId } = await insertSale({
      billingCycle: '1',
      segment: CustomerSegment.PYME,
    });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    const rows = await liveContracts(subscriberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.serviceUsage).toBe(ServiceUsage.NON_RESIDENTIAL);
  });

  it('D1: residencial sin estrato del punto de servicio → no crea y avisa SERVICE_USAGE (nunca contrato sin uso)', async () => {
    const { subscriberId, expedienteId } = await insertSale({
      billingCycle: '1',
      stratum: null,
      subscriberAddress: 'Otra dirección sintética 9',
    });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    expect(await liveContracts(subscriberId)).toHaveLength(0);
    expect(await issueOf(subscriberId)).toMatchObject({ missing: ['SERVICE_USAGE'] });
  });

  it('D1: expediente sin estrato en el mismo punto del suscriptor → hereda el estrato del suscriptor', async () => {
    const { subscriberId, expedienteId } = await insertSale({ billingCycle: '1', stratum: null });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    const rows = await liveContracts(subscriberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      serviceUsage: ServiceUsage.RESIDENTIAL,
      installationStratum: 3,
    });
  });

  it('D2: plan sin tarifa vigente en el catálogo → no crea y avisa PLAN', async () => {
    const { subscriberId, expedienteId } = await insertSale({
      planId: '00000000-0000-4000-8000-0000000000aa',
    });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    expect(await liveContracts(subscriberId)).toHaveLength(0);
    expect(await issueOf(subscriberId)).toMatchObject({ missing: ['PLAN'] });
  });

  it('reintento: completar el dato faltante crea el contrato (idempotente) y limpia el aviso; si aún falta, no reenvía correo', async () => {
    const { subscriberId, expedienteId } = await insertSale({
      billingCycle: '1',
      vatResponsibility: null,
    });
    await TenantContext.run(ctx(), () =>
      autoCreation.createForExpediente({ subscriberId, expedienteId, actorId }),
    );
    expect(await issueOf(subscriberId)).toMatchObject({ missing: ['VAT_RESPONSIBILITY'] });
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    // Reintento sin completar: sigue el aviso y no hay segundo correo.
    await expect(
      TenantContext.run(ctx(), () =>
        autoCreation.retryPendingForSubscriber({ subscriberId, expedienteId, actorId }),
      ),
    ).resolves.toBe('MISSING_DATA');
    expect(mailer.sendMail).toHaveBeenCalledTimes(1);

    await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query(`UPDATE subscribers SET vat_responsibility = 'RESPONSABLE' WHERE id = $1`, [
        subscriberId,
      ]),
    );
    await expect(
      TenantContext.run(ctx(), () =>
        autoCreation.retryPendingForSubscriber({ subscriberId, expedienteId, actorId }),
      ),
    ).resolves.toBe('CREATED');
    await expect(
      TenantContext.run(ctx(), () =>
        autoCreation.retryPendingForSubscriber({ subscriberId, expedienteId, actorId }),
      ),
    ).resolves.toBe('EXISTING');
    const rows = await liveContracts(subscriberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceExpedienteId: expedienteId,
      serviceUsage: ServiceUsage.RESIDENTIAL,
    });
    expect(await issueOf(subscriberId)).toBeNull();
  });
});
