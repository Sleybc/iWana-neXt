import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  AuditLog,
  MediaAsset,
  MediaUsage,
  TenantContext,
  dataSourceOptions,
  runInTenantSchema,
} from '@iwana/db';
import {
  CatalogItemType,
  CustomerSegment,
  InstallationRule,
  NetworkType,
  PersonType,
  ServiceUsage,
  UserRole,
  VatConcept,
} from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import { MediaService } from '../../../media/media.service';
import { CommercialCatalogReadAdapter } from '../../../commercial/ports/commercial-catalog-read.adapter';
import { CatalogItem } from '../../../commercial/entities/catalog-item.entity';
import { CatalogPriceHistory } from '../../../commercial/entities/catalog-price-history.entity';
import { PlanDetail } from '../../../commercial/entities/plan-detail.entity';
import { ContractsService } from '../contracts.service';
import { Contract } from '../entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { Subscriber } from '../../subscribers/entities/subscriber.entity';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscribersService } from '../../subscribers/subscribers.service';
import { PrivacyMarksAdapter } from '../../../privacy/marks/privacy-marks.adapter';
import { PrivacyAuthorizationAdapter } from '../../../privacy/authorizations/privacy-authorization.adapter';
import { PartyPrivacyMarkEntity } from '../../../privacy/entities/party-privacy-mark.entity';
import { DataAuthorizationEntity } from '../../../privacy/entities/data-authorization.entity';
import { LegalTextEntity } from '../../../privacy/entities/legal-text.entity';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración marcas de privacidad: DB_NAME debe ser dbiw, test o iwana_it_*; el spec crea y limpia un schema efímero.',
  );
}

/** Clave hex de 32 bytes con entropía sintética: no es un secreto real. */
const integrationCryptoKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
/**
 * Espera máxima de una conexión del pool. Un pool de una sola conexión con
 * este límite convierte cualquier lectura anidada en un fallo visible en lugar
 * de una espera indefinida.
 */
const SINGLE_CONNECTION_TIMEOUT_MS = 1_500;
/** Pool por defecto de producción (DB_POOL_MAX) para CA-4. */
const POOL_MAX = 10;
const POOL_TIMEOUT_MS = 5_000;
/** Corte sintético: crm_billing_cycles siembra (cycle_day 1, cutoff_day 15). */
const CUTOFF_DATE = '2026-11-15';

interface AuditEntryLike {
  action: string;
  entityType: string;
  newValue?: Record<string, unknown>;
}

/**
 * Doble del catálogo comercial (D4 queda fuera de esta spec): el alta solo
 * necesita un plan válido para persistir el snapshot.
 */
function buildCommercialCatalogDouble() {
  return {
    getPlanById: async (_tenantId: string, _schemaName: string, planId: string) => ({
      id: planId,
      name: 'Plan sintético de integración',
      technology: 'FIBER',
      downloadSpeedMbps: 100,
      uploadSpeedMbps: 50,
      basePrice: 100,
      installationFee: 0,
      vatConcept: 'INTERNET_ACCESS',
      networkType: 'FIXED',
      isActive: true,
    }),
  };
}

function buildConfigService(): ConfigService {
  return {
    get: (key: string) => (key === 'NODE_ENV' ? 'test' : undefined),
    getOrThrow: () => integrationCryptoKeyHex,
  } as unknown as ConfigService;
}

describeWithDb('CRM · marcas de privacidad dentro de la transacción (PostgreSQL real)', () => {
  /** Pool de migración/observación: nunca el que se somete a la prueba. */
  let adminDataSource: DataSource;
  /** Pool de una sola conexión: reproduce la espera circular de CA-1. */
  let singleDataSource: DataSource;
  /** Pool con el tamaño de producción: CA-2, CA-3 y CA-4. */
  let poolDataSource: DataSource;

  let contractsOnSingle: ContractsService;
  let subscribersOnSingle: SubscribersService;
  let contractsOnPool: ContractsService;
  let auditEntries: AuditEntryLike[];

  const tenantId = randomUUID();
  const tenantSlug = `crm-marks-${tenantId.slice(0, 8)}`;
  const schemaName = `tenant_crm_marks_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

  const tenantContext = () => ({ tenantId, schemaName, tenantSlug });
  const quoteIdentifier = (value: string) => '"' + value.replace(/"/g, '""') + '"';

  function asTenant<T>(operation: () => Promise<T>): Promise<T> {
    return TenantContext.run(tenantContext(), operation);
  }

  function buildDataSources(): never[] {
    return [
      ...((dataSourceOptions.entities ?? []) as never[]),
      Contract,
      Subscriber,
      AuditLog,
      MediaAsset,
      PartyPrivacyMarkEntity,
      DataAuthorizationEntity,
      LegalTextEntity,
      CatalogItem,
      PlanDetail,
      CatalogPriceHistory,
    ] as never[];
  }

  function buildAuditDouble() {
    return {
      log: async (entry: AuditEntryLike) => {
        auditEntries.push(entry);
      },
      logWithin: async (entry: AuditEntryLike) => {
        auditEntries.push(entry);
      },
    };
  }

  function buildMediaService(source: DataSource): MediaService {
    return new MediaService(source.getRepository(MediaAsset), {} as never, buildConfigService());
  }

  function buildContractsService(source: DataSource, marksPort?: object): ContractsService {
    return new ContractsService(
      source,
      new CommercialCatalogReadAdapter(source),
      { resolve: () => ({ status: 'NOT_CANONICAL' }) } as never,
      buildAuditDouble() as never,
      buildMediaService(source),
      buildConfigService(),
      new SubscriberFiscalCompletenessService(),
      {} as never,
      new PrivacyAuthorizationAdapter(source),
      (marksPort ?? new PrivacyMarksAdapter(source)) as never,
    );
  }

  function buildSubscribersService(source: DataSource): SubscribersService {
    return new SubscribersService(
      source,
      buildConfigService(),
      {} as never,
      {} as never,
      buildAuditDouble() as never,
      {} as never,
      { getPlansByIds: async () => new Map() } as never,
      undefined,
      new PrivacyAuthorizationAdapter(source),
      undefined,
      new PrivacyMarksAdapter(source),
      undefined,
      undefined,
      { findForSubscriber: async () => [] } as never,
    );
  }

  async function insertSubscriber(): Promise<{ subscriberId: string; partyId: string }> {
    const subscriberId = randomUUID();
    const partyId = randomUUID();
    const tag = subscriberId.slice(0, 8);
    await runInTenantSchema(adminDataSource, schemaName, (qr) =>
      qr.query(
        [
          'INSERT INTO subscribers (',
          'id, tenant_id, party_id, person_type, customer_segment,',
          'document_type, document_number_encrypted, first_name, last_name, stratum,',
          'nit, business_name, email_encrypted, phone_encrypted,',
          'vat_treatment, tax_regime, vat_responsibility, rut_responsibilities, address, created_by',
          ') VALUES (',
          "$1, $2, $3, $4, 'RESIDENTIAL', 'CC', $5, 'Fixture', 'Marcas', 2,",
          "$6, 'Fixture Marcas SAS', $7, $7,",
          "'STANDARD', 'SIMPLIFIED', 'RESPONSABLE', ARRAY['O-13']::text[], $8, $9",
          ')',
        ].join('\n'),
        [
          subscriberId,
          tenantId,
          partyId,
          PersonType.NATURAL,
          'cifrado-' + tag,
          '900000000-' + tag,
          'cifrado-' + tag,
          'Dirección sintética de fixture',
          randomUUID(),
        ],
      ),
    );
    // Party real: data_authorizations referencia party(id) por FK.
    await runInTenantSchema(adminDataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO party (id, party_type, document_type, document_number, display_name)
         VALUES ($1, 'NATURAL', 'CC', $2, $3)`,
        [partyId, 'DOC-' + tag, 'Fixture Marcas'],
      ),
    );
    // Autorización contractual vigente: el alta la exige (R7). Se siembra el
    // registro real para que las rutas usen el adaptador real de Privacy.
    await runInTenantSchema(adminDataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO data_authorizations
           (party_id, purpose, kind, granted, channel, captured_at)
         VALUES ($1, 'TRATAMIENTO_CONTRACTUAL', 'GRANT', true, 'PRESENCIAL', now())`,
        [partyId],
      ),
    );
    return { subscriberId, partyId };
  }

  /** Plan real en el esquema de prueba: el catálogo ya no se sustituye por un doble. */
  async function seedCatalogPlan(name = 'Plan sintético de catálogo'): Promise<string> {
    const planId = randomUUID();
    await runInTenantSchema(adminDataSource, schemaName, async (qr) => {
      await qr.manager.save(
        CatalogItem,
        Object.assign(new CatalogItem(), {
          id: planId,
          tenantId,
          type: CatalogItemType.PLAN,
          vatConcept: VatConcept.INTERNET_ACCESS,
          name,
          description: null,
          taxClassificationId: null,
          retentionApplicable: false,
          isActive: true,
          deletedAt: null,
        }),
      );
      await qr.manager.save(
        PlanDetail,
        Object.assign(new PlanDetail(), {
          itemId: planId,
          downloadSpeedMbps: 100,
          uploadSpeedMbps: 50,
          networkType: NetworkType.FIXED,
          technology: 'FIBER',
          installationRule: InstallationRule.ALWAYS,
        }),
      );
      await qr.manager.save(
        CatalogPriceHistory,
        Object.assign(new CatalogPriceHistory(), {
          itemId: planId,
          tenantId,
          customerSegment: CustomerSegment.RESIDENTIAL,
          basePrice: '100.00',
          installationFee: '0.00',
          isCurrent: true,
          validTo: null,
          createdBy: randomUUID(),
        }),
      );
    });
    return planId;
  }

  /** Soporte de estrato real en public.media_assets para la ruta con evidencia. */
  async function seedStratumEvidence(): Promise<string> {
    const assetId = randomUUID();
    await runInTenantSchema(adminDataSource, schemaName, async (qr) => {
      await qr.manager.save(
        MediaAsset,
        Object.assign(new MediaAsset(), {
          id: assetId,
          tenantSchema: schemaName,
          usage: MediaUsage.STRATUM_EVIDENCE,
          themeVariant: null,
          originalFilename: 'soporte-sintetico.pdf',
          mimeType: 'application/pdf',
          ext: 'pdf',
          sizeBytes: 128,
          objectKey: `${schemaName}/stratum_evidence/${assetId}.pdf`,
          publicUrl: null,
          uploadedByUserId: null,
          assetStatus: 'AVAILABLE',
          claimRef: null,
          deletedAt: null,
        }),
      );
    });
    return assetId;
  }

  async function openBlockedMark(partyId: string): Promise<void> {
    await runInTenantSchema(adminDataSource, schemaName, (qr) =>
      qr.query(
        `INSERT INTO party_privacy_marks (party_id, mark, event, occurred_at)
         VALUES ($1, 'DATOS_BLOQUEADOS', 'OPEN', now())`,
        [partyId],
      ),
    );
  }

  async function insertContract(
    subscriberId: string,
    options: {
      status?: ContractStatus;
      billingCycleDay?: number | null;
      planId?: string;
      serviceUsage?: ServiceUsage | null;
      installationStratum?: number | null;
      stratumEvidenceMediaId?: string | null;
    } = {},
  ): Promise<string> {
    const contractId = randomUUID();
    await runInTenantSchema(adminDataSource, schemaName, async (qr) => {
      const contract = Object.assign(new Contract(), {
        id: contractId,
        tenantId,
        quoteId: null,
        subscriberId,
        planId: options.planId ?? 'plan-privacy-marks-integration',
        planSnapshotJson: { id: options.planId ?? 'plan-privacy-marks-integration' },
        status: options.status ?? ContractStatus.ACTIVE,
        alias: 'Servicio sintético de integración',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        customerSegment: null,
        serviceUsage: options.serviceUsage ?? null,
        installationStratum: options.installationStratum ?? null,
        stratumEvidenceMediaId: options.stratumEvidenceMediaId ?? null,
        vatSnapshot: null,
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        billingCycleDay: options.billingCycleDay === undefined ? 1 : options.billingCycleDay,
        fiscalName: null,
        fiscalDocument: null,
        fiscalAddress: null,
        startDate: new Date('2026-10-15T00:00:00Z'),
        endDate: null,
        deletedAt: null,
      });
      await qr.manager.save(Contract, contract);
    });
    return contractId;
  }

  async function countContractsOfSubscriber(subscriberId: string): Promise<number> {
    const rows = (await runInTenantSchema(adminDataSource, schemaName, (qr) =>
      qr.query('SELECT COUNT(*)::int AS total FROM contracts WHERE subscriber_id = $1', [
        subscriberId,
      ]),
    )) as Array<{ total: number }>;
    return rows[0]?.total ?? 0;
  }

  let seedSubscriberId: string;
  let seedContractId: string;

  beforeAll(async () => {
    adminDataSource = new DataSource({
      ...dataSourceOptions,
      entities: buildDataSources(),
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 2, min: 0 },
    });
    await adminDataSource.initialize();
    await adminDataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [tenantId, 'CRM marcas sintético', tenantSlug, schemaName, 'crm-marks@example.invalid'],
    );
    await adminDataSource.query('CREATE SCHEMA ' + quoteIdentifier(schemaName));
    const migrationDataSource = createTenantDataSource(adminDataSource, schemaName, tenantSlug);
    await migrationDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(migrationDataSource);
    } finally {
      await migrationDataSource.destroy();
    }

    singleDataSource = new DataSource({
      ...dataSourceOptions,
      entities: buildDataSources(),
      migrations: [],
      logging: false,
      extra: { max: 1, min: 0, connectionTimeoutMillis: SINGLE_CONNECTION_TIMEOUT_MS },
    });
    await singleDataSource.initialize();

    poolDataSource = new DataSource({
      ...dataSourceOptions,
      entities: buildDataSources(),
      migrations: [],
      logging: false,
      extra: { max: POOL_MAX, min: 0, connectionTimeoutMillis: POOL_TIMEOUT_MS },
    });
    await poolDataSource.initialize();

    auditEntries = [];
    contractsOnSingle = buildContractsService(singleDataSource);
    subscribersOnSingle = buildSubscribersService(singleDataSource);
    contractsOnPool = buildContractsService(poolDataSource);

    const seed = await insertSubscriber();
    seedSubscriberId = seed.subscriberId;
    seedContractId = await insertContract(seed.subscriberId);
  }, 180_000);

  afterAll(async () => {
    for (const source of [singleDataSource, poolDataSource]) {
      if (source?.isInitialized) await source.destroy();
    }
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(
        'DROP SCHEMA IF EXISTS ' + quoteIdentifier(schemaName) + ' CASCADE',
      );
      await adminDataSource.query('DELETE FROM public.media_assets WHERE tenant_schema = $1', [
        schemaName,
      ]);
      await adminDataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await adminDataSource.destroy();
    }
  });

  describe('CA-1 · pool de una sola conexión', () => {
    it('CA-1 · la agenda de corte responde sin pedir otra conexión', async () => {
      const agenda = await asTenant(() =>
        contractsOnSingle.getCutoffAgenda(
          { date: CUTOFF_DATE, page: 1, limit: 25 },
          UserRole.ADMIN,
          false,
        ),
      );
      expect(agenda.date).toBe(CUTOFF_DATE);
      expect(agenda.items.length).toBeGreaterThan(0);
    });

    it('CA-1 · el listado de contratos responde sin pedir otra conexión', async () => {
      const page = await asTenant(() => contractsOnSingle.findAll({}, false));
      expect(page.data.length).toBeGreaterThan(0);
      expect(page.meta.total).toBeGreaterThan(0);
    });

    it('CA-1 · el detalle de contrato responde sin pedir otra conexión', async () => {
      const contract = await asTenant(() =>
        contractsOnSingle.findOneForRead(seedContractId, false),
      );
      expect(contract.id).toBe(seedContractId);
    });

    it('CA-1 · la ficha 360° responde sin pedir otra conexión', async () => {
      const view = await asTenant(() => subscribersOnSingle.get360View(seedSubscriberId, false));
      expect(view.contracts.length).toBeGreaterThan(0);
    });

    it('CA-1 · el alta de contrato responde sin pedir otra conexión', async () => {
      const { subscriberId } = await insertSubscriber();
      const created = await asTenant(() =>
        contractsOnSingle.create(
          {
            subscriberId,
            planId: 'plan-privacy-marks-created',
            planSnapshotJson: { id: 'plan-privacy-marks-created' },
            billingCycleDay: 1,
            serviceUsage: ServiceUsage.RESIDENTIAL,
            installationStratum: 2,
          },
          randomUUID(),
        ),
      );
      expect(created.id).toBeDefined();
      expect(created.subscriberId).toBe(subscriberId);
    });

    it('CA-1 · el cambio de plan responde sin pedir otra conexión (catálogo real)', async () => {
      const seededPlanId = await seedCatalogPlan('Plan de cambio');
      // El contrato nace con otro plan: si no, `changePlan` cortocircuita sin tocar el catálogo.
      const contractId = await insertContract(seedSubscriberId, {
        status: ContractStatus.DRAFT,
        planId: 'plan-sintetico-previo',
      });
      const before = await asTenant(() => contractsOnSingle.findOneForRead(contractId, false));
      const changed = await asTenant(() =>
        contractsOnSingle.changePlan(
          contractId,
          {
            planId: seededPlanId,
            expectedUpdatedAt: before.updatedAt.toISOString(),
            expectedMonthlyPrice: 100,
          },
          randomUUID(),
        ),
      );
      expect(changed.planId).toBe(seededPlanId);
    });

    it('CA-1 · el punto de servicio con evidencia de estrato responde sin pedir otra conexión', async () => {
      const seededPlanId = await seedCatalogPlan('Plan con evidencia');
      const evidenceMediaId = await seedStratumEvidence();
      const contractId = await insertContract(seedSubscriberId, {
        status: ContractStatus.ACTIVE,
        planId: seededPlanId,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: evidenceMediaId,
      });
      const updated = await asTenant(() =>
        contractsOnSingle.updateServicePoint(
          contractId,
          { serviceUsage: ServiceUsage.RESIDENTIAL, installationStratum: 3 },
          randomUUID(),
        ),
      );
      expect(updated.installationStratum).toBe(3);
    });

    it('CA-1 · la actualización de contrato responde sin pedir otra conexión', async () => {
      const updated = await asTenant(() =>
        contractsOnSingle.update(
          seedContractId,
          { alias: 'Alias sintético actualizado' },
          randomUUID(),
        ),
      );
      expect(updated.alias).toBe('Alias sintético actualizado');
    });
  });

  describe('CA-2 · titular con DATOS_BLOQUEADOS conserva el bloqueo y el enmascarado', () => {
    let blockedSubscriberId: string;
    let blockedContractId: string;

    beforeAll(async () => {
      const blocked = await insertSubscriber();
      blockedSubscriberId = blocked.subscriberId;
      await openBlockedMark(blocked.partyId);
      blockedContractId = await insertContract(blocked.subscriberId, {
        status: ContractStatus.DRAFT,
      });
    });

    it('CA-2 · la mutación responde 409 PRIVACY_DATA_BLOCKED', async () => {
      await expect(
        asTenant(() =>
          contractsOnPool.update(blockedContractId, { alias: 'No debe aplicarse' }, randomUUID()),
        ),
      ).rejects.toMatchObject({ status: 409, response: { code: 'PRIVACY_DATA_BLOCKED' } });
    });

    it('CA-2 · la lectura enmascara el contrato del titular bloqueado', async () => {
      const page = await asTenant(() => contractsOnPool.findAll({}, false));
      const item = page.data.find((contract) => contract.id === blockedContractId);
      expect(item).toBeDefined();
      expect(item?.alias).toBe('Datos bloqueados');
      expect(item?.installationAddress).toBeNull();
    });

    it('CA-2 · la auditoría de blockedServed registra el acceso servido', async () => {
      auditEntries = [];
      const actorId = randomUUID();
      const page = await asTenant(() => contractsOnPool.findAll({}, true, actorId));
      expect(page.data.some((contract) => contract.id === blockedContractId)).toBe(true);
      const entry = auditEntries.find((row) => row.entityType === 'ContractList');
      expect(entry).toBeDefined();
      expect(entry?.newValue).toMatchObject({ blockedServed: 1 });
    });
  });

  describe('CA-3 · el fallo de la proyección revierte la escritura ya hecha', () => {
    /**
     * La primera lectura de marcas es la de la guarda (antes de escribir) y la
     * segunda la de la proyección (después del `save`, dentro de la misma
     * transacción). Solo así el fallo ocurre cuando la fila ya existe.
     */
    function buildProjectionFailingPort(probe: {
      sql: string;
      record: (rows: unknown[]) => void;
    }): object {
      const real = new PrivacyMarksAdapter(poolDataSource);
      let calls = 0;
      return {
        activeMarks: async (partyIds: string[], ctx?: { manager: EntityManager }) => {
          calls += 1;
          if (calls >= 2) {
            const rows = (await ctx!.manager.query(probe.sql)) as unknown[];
            probe.record(rows);
            throw new Error('PRIVACY_MARKS_READ_FAILED');
          }
          return real.activeMarks(partyIds, ctx);
        },
        partyIdsWithActiveMark: (mark: string) => real.partyIdsWithActiveMark(mark as never),
      };
    }

    it('CA-3 · el alta: la proyección falla después del save y no queda fila nueva', async () => {
      const probed: unknown[] = [];
      const { subscriberId } = await insertSubscriber();
      const failingContracts = buildContractsService(
        poolDataSource,
        buildProjectionFailingPort({
          sql: `SELECT COUNT(*)::int AS total FROM contracts WHERE subscriber_id = '${subscriberId}'`,
          record: (rows) => probed.push(...rows),
        }),
      );

      await expect(
        asTenant(() =>
          failingContracts.create(
            {
              subscriberId,
              planId: 'plan-privacy-marks-failing',
              planSnapshotJson: { id: 'plan-privacy-marks-failing' },
              billingCycleDay: 1,
              serviceUsage: ServiceUsage.RESIDENTIAL,
              installationStratum: 2,
            },
            randomUUID(),
          ),
        ),
      ).rejects.toThrow('PRIVACY_MARKS_READ_FAILED');

      // Dentro de la transacción, antes del commit, la fila ya existía.
      expect(probed).toEqual([{ total: 1 }]);
      await expect(countContractsOfSubscriber(subscriberId)).resolves.toBe(0);
    });

    it('CA-3 · la mutación: la proyección falla después del save y el contrato no cambia', async () => {
      const probed: Array<{ alias: string }> = [];
      const contractId = await insertContract(seedSubscriberId, {
        status: ContractStatus.DRAFT,
      });
      const failingContracts = buildContractsService(
        poolDataSource,
        buildProjectionFailingPort({
          sql: `SELECT alias FROM contracts WHERE id = '${contractId}'`,
          record: (rows) => probed.push(...(rows as Array<{ alias: string }>)),
        }),
      );

      await expect(
        asTenant(() =>
          failingContracts.update(contractId, { alias: 'Alias que debe revertirse' }, randomUUID()),
        ),
      ).rejects.toThrow('PRIVACY_MARKS_READ_FAILED');

      // El save llegó a escribir el alias nuevo dentro de la transacción...
      expect(probed).toEqual([{ alias: 'Alias que debe revertirse' }]);
      // ...y el rollback lo deshizo.
      const persisted = await asTenant(() => contractsOnPool.findOneForRead(contractId, false));
      expect(persisted.alias).not.toBe('Alias que debe revertirse');
    });

    it('CA-3 · PLAN_UNAVAILABLE ante 22P02 con la misma conexión y sin otra consulta', async () => {
      const seededPlanId = await seedCatalogPlan('Plan para el 22P02');
      const contractId = await insertContract(seedSubscriberId, {
        status: ContractStatus.DRAFT,
        planId: seededPlanId,
      });
      const before = await asTenant(() => contractsOnPool.findOneForRead(contractId, false));

      await expect(
        asTenant(() =>
          contractsOnPool.changePlan(
            contractId,
            {
              planId: 'no-es-un-uuid',
              expectedUpdatedAt: before.updatedAt.toISOString(),
              expectedMonthlyPrice: 100,
            },
            randomUUID(),
          ),
        ),
      ).rejects.toMatchObject({ status: 422, response: { code: 'PLAN_UNAVAILABLE' } });

      // Si otra consulta hubiera corrido, PostgreSQL habría respondido 25P02
      // en vez de dejar salir el 422; el contrato tampoco cambia.
      const after = await asTenant(() => contractsOnPool.findOneForRead(contractId, false));
      expect(after.planId).toBe(seededPlanId);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });
  });

  describe('CA-4 · concurrencia del listado con pool de producción', () => {
    it('CA-4 · 20 listados simultáneos con pool de 10 terminan sin error', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => asTenant(() => contractsOnPool.findAll({}, false))),
      );
      expect(results).toHaveLength(20);
      for (const page of results) {
        expect(page.data.length).toBeGreaterThan(0);
      }
    });
  });
});
