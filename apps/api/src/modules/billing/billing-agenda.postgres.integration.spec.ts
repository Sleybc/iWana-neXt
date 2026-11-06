import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  AuditLog,
  dataSourceOptions,
  MediaAsset,
  runInTenantSchema,
  TenantContext,
} from '@iwana/db';
import { AuditService } from '../audit/audit.service';
import { billingPostgresIntegrationEnabled } from '../../../../../packages/database/src/migrations/tenant/billing-migration.integration-helpers';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../packages/database/src/migrations/tenant/runner';
import { BillingContractReadAdapter } from '../crm/contracts/billing-contract-read.adapter';
import { ContractsService } from '../crm/contracts/contracts.service';
import { ContractStatus } from '../crm/enums/contract-status.enum';
import { Contract } from '../crm/contracts/entities/contract.entity';
import { Subscriber } from '../crm/subscribers/entities/subscriber.entity';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsService } from './payments/billing-payments.service';

const quote = (value: string) => `"${value.replace(/"/gu, '""')}"`;

/**
 * BR-4.1: la agenda de CRM lee el estado de pago por el puerto REAL de Billing, sin doble
 * de `periodStates`, contra el esquema completo del tenant (todas las migraciones).
 */
const describeDb = billingPostgresIntegrationEnabled ? describe : describe.skip;
describeDb('BR-4.1 agenda de corte con el puerto real de Billing', () => {
  let ds: DataSource;
  const tenantId = randomUUID();
  const slug = `br4-agenda-${tenantId.slice(0, 8)}`;
  const schemaName = `tenant_br4_agenda_${randomUUID().replace(/-/gu, '')}`;
  const actorId = randomUUID();
  const settings = {
    getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
    getTimezone: jest.fn().mockResolvedValue('America/Bogota'),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const privacy = { activeMarks: jest.fn().mockResolvedValue({}) };
  const issuer = {
    getIssuerIdentity: jest.fn().mockResolvedValue({
      legalName: 'Operador sintético',
      nit: '900000000',
      verificationDigit: null,
    }),
  };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '12'.repeat(32),
    MFA_ENCRYPTION_KEY: '12'.repeat(32),
    PII_HASH_KEY: '34'.repeat(32),
    NODE_ENV: 'test',
  });
  let generation: BillingGenerationService;
  let documents: BillingDocumentsService;
  let payments: BillingPaymentsService;
  let agenda: ContractsService;
  const context = () => ({ tenantId, schemaName, tenantSlug: slug });
  const run = <T>(fn: () => Promise<T>) => TenantContext.run(context(), fn);
  const sql = <T = Record<string, unknown>>(query: string, args: unknown[] = []) =>
    runInTenantSchema(ds, schemaName, (qr) => qr.query(query, args) as Promise<T[]>);

  async function seedContract() {
    const subscriberId = randomUUID();
    const tag = subscriberId.slice(0, 8);
    await sql(
      `INSERT INTO subscribers (
         id, tenant_id, party_id, person_type, customer_segment, document_type,
         document_number_encrypted, first_name, last_name, stratum, nit, business_name,
         email_encrypted, phone_encrypted, vat_treatment, tax_regime, vat_responsibility,
         rut_responsibilities, address, created_by
       ) VALUES ($1,$2,$3,'NATURAL','RESIDENTIAL','CC',$4,'Fixture','Agenda',2,$5,
                 'Fixture Agenda SAS',$4,$4,'STANDARD','SIMPLIFIED','RESPONSABLE',
                 ARRAY['O-13']::text[],'Dirección sintética',$6)`,
      [subscriberId, tenantId, randomUUID(), `cifrado-${tag}`, `900000000-${tag}`, actorId],
    );
    const contractId = randomUUID();
    await runInTenantSchema(ds, schemaName, async (qr) => {
      const contract = Object.assign(new Contract(), {
        id: contractId,
        tenantId,
        quoteId: null,
        subscriberId,
        planId: 'plan-agenda',
        planSnapshotJson: { name: 'Plan sintético', monthlyPrice: '100.00' },
        status: ContractStatus.ACTIVE,
        alias: 'Servicio de agenda',
        installationAddress: null,
        installationCity: null,
        installationDepartment: null,
        installationPostalCode: null,
        installationNotes: null,
        customerSegment: null,
        serviceUsage: null,
        installationStratum: null,
        stratumEvidenceMediaId: null,
        vatSnapshot: {
          treatment: 'STANDARD',
          legalBasis: 'ET-468',
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-01T00:00:00Z',
        },
        additionalProductIds: [],
        additionalServiceIds: [],
        paymentMethod: null,
        billingCycle: null,
        billingCycleDay: 1,
        fiscalName: null,
        fiscalDocument: '900000001',
        fiscalAddress: null,
        startDate: '2026-10-01',
        endDate: null,
        deletedAt: null,
      } as never);
      await qr.manager.save(Contract, contract);
    });
    return { contractId, subscriberId };
  }

  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [Contract, Subscriber, AuditLog, MediaAsset],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 10, min: 1 },
    });
    await ds.initialize();
    await ds.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'BR-4 agenda sintético', $2, $3, 'ACTIVE', 'br4-agenda@example.invalid')`,
      [tenantId, slug, schemaName],
    );
    await ds.query(`CREATE SCHEMA ${quote(schemaName)}`);
    const tenantDataSource = createTenantDataSource(ds, schemaName, slug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    const adapter = new BillingContractReadAdapter(ds, config, settings as never);
    payments = new BillingPaymentsService(
      ds,
      adapter,
      audit as never,
      new EventEmitter2(),
      privacy as never,
      settings as never,
    );
    documents = new BillingDocumentsService(
      ds,
      audit as never,
      adapter,
      issuer as never,
      config,
      { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) } as never,
      settings as never,
      privacy as never,
      payments,
    );
    generation = new BillingGenerationService(
      ds,
      adapter,
      settings as never,
      documents,
      audit as never,
      privacy as never,
    );
    // Solo el puerto de Billing es real; el resto de dependencias de CRM no interviene en la agenda.
    agenda = new ContractsService(
      ds,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      config,
      {} as never,
      {} as never,
      undefined,
      privacy as never,
      settings as never,
      payments,
    );
  }, 180_000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query(`DROP SCHEMA IF EXISTS ${quote(schemaName)} CASCADE`);
      await ds.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await ds.destroy();
    }
  });

  it.each([
    ['VENCIMIENTO_MAS_GRACIA', 'VENCIDO', true],
    ['VENCIMIENTO_MAS_GRACIA', 'ANTICIPADO', true],
    ['VENCIMIENTO_MAS_GRACIA', 'VENCIDO', false],
    ['DIA_FIJO_CICLO', 'ANTICIPADO', false],
  ])(
    'CA-FAC-10 con %s y cobro %s (corte %s) muestra pagado, pendiente, vencido y sin documento',
    async (cutoffMode, timing, cutoffEnabled) => {
      await sql(
        `UPDATE billing_policy SET cutoff_mode=$1, period_timing=$2, cutoff_enabled=$3,
                approval_mode='BORRADOR', first_period_mode='SEPARADO', payment_term_days=14, grace_days=0`,
        [cutoffMode, timing, cutoffEnabled],
      );
      await sql(
        'TRUNCATE billing_period_signals,billing_payment_allocations,billing_payments,billing_documents,billing_periods,billing_contract_policy CASCADE',
      );
      await sql('DELETE FROM contracts');
      await sql('DELETE FROM subscribers');
      const [paid, pending, overdue, bare] = [
        await seedContract(),
        await seedContract(),
        await seedContract(),
        await seedContract(),
      ];
      const generationDate = timing === 'VENCIDO' ? '2026-11-01' : '2026-10-01';
      const draftIds: string[] = [];
      for (const item of [paid, pending, overdue, bare]) {
        await run(() =>
          generation.generate({ contractId: item.contractId, date: generationDate, actorId }),
        );
        const [draft] = await sql<{ id: string }>(
          `SELECT id FROM billing_documents WHERE contract_id=$1 AND status='BORRADOR'`,
          [item.contractId],
        );
        draftIds.push(draft!.id);
      }
      await run(() => documents.issue(draftIds.slice(0, 3), actorId));
      // La agenda del ciclo 1 es el 2026-11-15; solo se mueve el vencimiento, no el corte.
      await sql("UPDATE billing_periods SET due_date='2026-11-25'");
      await sql("UPDATE billing_periods SET due_date='2026-11-01' WHERE contract_id=$1", [
        overdue.contractId,
      ]);
      await run(() =>
        payments.registerPayment(
          {
            subscriberId: paid.subscriberId,
            amount: '119.00',
            method: 'TRANSFERENCIA',
            paidAt: '2026-11-05',
          },
          `agenda-${cutoffMode}-${timing}-${String(cutoffEnabled)}`,
          actorId,
        ),
      );

      const response = await run(() =>
        agenda.getCutoffAgenda({ date: '2026-11-15', page: 1, limit: 25 }, 'ADMIN', false),
      );
      const stateOf = (contractId: string) =>
        response.items.find((item) => item.contractId === contractId)?.paymentState;
      expect({
        paid: stateOf(paid.contractId),
        pending: stateOf(pending.contractId),
        overdue: stateOf(overdue.contractId),
        bare: stateOf(bare.contractId),
      }).toEqual({
        paid: 'PAGADO',
        pending: 'PENDIENTE',
        overdue: 'VENCIDO',
        bare: 'SIN_DOCUMENTO',
      });
      expect(response.items.find((item) => item.contractId === bare.contractId)).toMatchObject({
        paymentPaidAmount: null,
        paymentTotalAmount: null,
      });
      expect(response.items.find((item) => item.contractId === paid.contractId)).toMatchObject({
        paymentPaidAmount: '119.00',
        paymentTotalAmount: '119.00',
      });
    },
  );

  it('BR-8.1 la agenda audita antes de responder: sin escritura no hay datos (503)', async () => {
    const realAudit = new AuditService(ds, { log: jest.fn() } as never);
    const agendaReal = new ContractsService(
      ds,
      {} as never,
      {} as never,
      realAudit,
      {} as never,
      config,
      {} as never,
      {} as never,
      undefined,
      privacy as never,
      settings as never,
      payments,
    );
    const { contractId, subscriberId } = await seedContract();
    const [partyRow] = await sql<{ party_id: string }>(
      `SELECT party_id::text AS party_id FROM subscribers WHERE id = $1`,
      [subscriberId],
    );
    privacy.activeMarks.mockResolvedValue({ [partyRow!.party_id]: ['DATOS_BLOQUEADOS'] });
    try {
      // Control: con la escritura disponible, la agenda responde y deja el registro.
      const before = await sql<{ total: string }>(
        `SELECT COUNT(*)::int AS total FROM audit_logs WHERE entity_type = 'BillingCycleCutoffAgenda'`,
      );
      const ok = await run(() =>
        agendaReal.getCutoffAgenda(
          { date: '2026-11-15', page: 1, limit: 25 },
          'ADMIN',
          true,
          actorId,
        ),
      );
      expect(ok.items.some((item) => item.contractId === contractId)).toBe(true);
      const after = await sql<{ total: string }>(
        `SELECT COUNT(*)::int AS total FROM audit_logs WHERE entity_type = 'BillingCycleCutoffAgenda'`,
      );
      expect(Number(after[0]!.total)).toBe(Number(before[0]!.total) + 1);

      // La escritura real falla: la agenda no puede entregar datos sin auditar.
      await ds.query(
        `ALTER TABLE "${schemaName}".audit_logs ADD CONSTRAINT br8_no_audit CHECK (false) NOT VALID`,
      );
      try {
        await expect(
          run(() =>
            agendaReal.getCutoffAgenda(
              { date: '2026-11-15', page: 1, limit: 25 },
              'ADMIN',
              true,
              actorId,
            ),
          ),
        ).rejects.toMatchObject({
          status: 503,
          response: { code: 'PRIVACY_AUDIT_UNAVAILABLE' },
        });
      } finally {
        await ds.query(
          `ALTER TABLE "${schemaName}".audit_logs DROP CONSTRAINT IF EXISTS br8_no_audit`,
        );
      }
    } finally {
      privacy.activeMarks.mockResolvedValue({});
    }
  });
});
