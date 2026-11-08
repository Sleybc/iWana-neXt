import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantContext, dataSourceOptions, runInTenantSchema } from '@iwana/db';
import { PqrRetentionReadAdapter } from '../../assurance/privacy/pqr-retention-read.adapter';
import { BillingStandingReadAdapter } from '../../billing/privacy/billing-standing-read.adapter';
import { CrmContractStandingReadAdapter } from '../../crm/privacy-adapters/crm-contract-standing-read.adapter';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ConservationDutyService } from './conservation-duty.service';

/**
 * H-EXP B2-R4 (P1, D-EXP-1) contra PostgreSQL real: el reloj se declara sin
 * conciliar cuando CUALQUIER terminal o documento fiscal carece de fecha, no
 * solo cuando ninguno la tiene. El caso mixto no puede dejar vencer al titular
 * con la fecha del otro registro. Solo datos sintéticos.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_clock_mixed_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const actorId = '70000000-0000-4000-8000-000000000001';

if (dbAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración reloj mixto: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

const q = `"${schemaName}"`;

describeWithDb('Reloj de conservación mixto (B2-R4) en PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: ConservationDutyService;

  const inTenant = <T>(operation: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'clock-mixed-test' }, operation);

  const evaluate = (partyId: string) =>
    inTenant(() =>
      runInTenantSchema(dataSource, schemaName, (qr) => service.evaluate(qr.manager, partyId)),
    );

  async function insertParty(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.party (id, party_type, document_type, document_number, display_name)
       VALUES ($1, 'NATURAL', 'CC', $2, 'Titular sintético B2-R4')`,
      [id, randomBytes(4).readUInt32BE(0).toString()],
    );
    return id;
  }

  async function insertSubscriber(partyId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, party_id, person_type, customer_segment, vat_treatment, address,
         document_type, document_number_encrypted, first_name, last_name, stratum,
         vat_responsibility, created_by, status, activated_at)
       VALUES ($1, $2, $3, 'NATURAL', 'RESIDENTIAL', 'STANDARD', 'Dirección sintética',
               'CC', 'sintetico-cifrado', 'Titular', 'Sintético', 3,
               'RESPONSABLE', $4, 'ACTIVE', now())`,
      [id, tenantId, partyId, actorId],
    );
    return id;
  }

  async function insertContract(
    subscriberId: string,
    status: string,
    terminatedAt: string | null,
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, status, billing_cycle_day,
         alias, terminated_at)
       VALUES ($1, $2, $3, 'fixture-plan', '{}'::jsonb, $4, 1, 'Servicio sintético',
               $5::timestamptz)`,
      [id, tenantId, subscriberId, terminatedAt ? status : 'ACTIVE', terminatedAt],
    );
    if (!terminatedAt) {
      // Datos heredados: la inserción terminal sin fecha está vetada, pero una
      // fila vieja puede llegar a terminal sin `terminated_at` por actualización.
      // El trigger se suspende solo en el schema efímero de la suite y se restablece.
      await dataSource.query(`ALTER TABLE ${q}.contracts DISABLE TRIGGER USER`);
      try {
        await dataSource.query(`UPDATE ${q}.contracts SET status = $2 WHERE id = $1`, [id, status]);
      } finally {
        await dataSource.query(`ALTER TABLE ${q}.contracts ENABLE TRIGGER USER`);
      }
    }
    return id;
  }

  async function insertFiscalDocument(
    contractId: string,
    subscriberId: string,
    status: 'EMITIDO' | 'ANULADO',
    issueDate: string | null,
    periodStart: string,
  ): Promise<void> {
    const periodId = randomUUID();
    await dataSource.query(
      `INSERT INTO ${q}.billing_periods
        (id, tenant_id, contract_id, subscriber_id, period_start, period_end, covered_start,
         generation_date, due_date, effective_policy)
       VALUES ($1,$2,$3,$4,$5,$5,$5,$5,$5,'{}'::jsonb)`,
      [periodId, tenantId, contractId, subscriberId, periodStart],
    );
    await dataSource.query(
      `INSERT INTO ${q}.billing_documents
        (id, tenant_id, period_id, contract_id, subscriber_id, status, issue_date, due_date,
         subtotal, tax_total, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,CURRENT_DATE,10,0,10)`,
      [randomUUID(), tenantId, periodId, contractId, subscriberId, status, issueDate],
    );
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [],
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
        'Reloj mixto B2-R4 sintético',
        `clock-mixed-${tenantId.slice(0, 8)}`,
        schemaName,
        'clock-mixed@example.invalid',
      ],
    );
    await dataSource.query(`CREATE SCHEMA ${q}`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, 'clock-mixed-test');
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    service = new ConservationDutyService(
      new CrmContractStandingReadAdapter(),
      new BillingStandingReadAdapter(),
      new PqrRetentionReadAdapter(),
    );
  }, 180_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    if (!/^tenant_clock_mixed_[a-f0-9]{10}$/.test(schemaName)) {
      throw new Error('Schema de limpieza inválido.');
    }
    await dataSource.query(`DROP SCHEMA IF EXISTS ${q} CASCADE`);
    await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    await dataSource.destroy();
  });

  it('contratos: un terminado fechado en 2018 y otro sin terminated_at → CONTRACT_UNRECONCILED', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertContract(subscriberId, 'TERMINATED', null);

    const error = await evaluate(partyId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toMatch(/CONTRACT_UNRECONCILED/);
  });

  it('contratos: todos terminados sin reloj siguen en CONTRACT_UNRECONCILED (B2-R3)', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    await insertContract(subscriberId, 'TERMINATED', null);
    await insertContract(subscriberId, 'ARCHIVED', null);

    await expect(evaluate(partyId)).rejects.toThrow(/CONTRACT_UNRECONCILED/);
  });

  it('contratos: todos fechados no son incidencia', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertContract(subscriberId, 'ARCHIVED', '2019-03-01T12:00:00Z');

    const result = await evaluate(partyId);
    expect(result.clocks.contract?.anchor).toBe('2019-03-01');
  });

  it('fiscal: un EMITIDO fechado y un ANULADO sin issue_date → FISCAL_UNRECONCILED', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    // Fechado y ya vencido (2014 + 10 años): nada más conserva, así que el
    // reloj mixto debe seguir en 409 (B4-R2 M-1 solo cede ante otro deber vigente).
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', '2014-04-01', '2014-04-01');
    await insertFiscalDocument(contractId, subscriberId, 'ANULADO', null, '2014-05-01');

    const error = await evaluate(partyId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toMatch(/FISCAL_UNRECONCILED/);
  });

  it('fiscal: un EMITIDO fechado y otro EMITIDO sin issue_date → FISCAL_UNRECONCILED', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', '2014-04-01', '2014-04-01');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', null, '2014-05-01');

    await expect(evaluate(partyId)).rejects.toThrow(/FISCAL_UNRECONCILED/);
  });

  it('fiscal (B4-R2 M-1): un EMITIDO vigente y otro sin issue_date conserva por el fiscal, sin 409', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', '2018-04-01', '2018-04-01');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', null, '2018-05-01');

    const result = await evaluate(partyId);
    expect(result).toMatchObject({ applies: true, openContract: false, fiscalRetained: true });
    expect(result.clocks.fiscal?.expiresOn).toBe('2028-04-01');
  });

  it('contratos (B4-R2 M-1): uno abierto y otro terminado sin fecha conserva por el abierto, sin 409', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    await insertContract(subscriberId, 'ACTIVE', null);
    await insertContract(subscriberId, 'TERMINATED', null);

    const result = await evaluate(partyId);
    expect(result).toMatchObject({ applies: true, openContract: true });
  });

  it('fiscal: todos sin reloj siguen en FISCAL_UNRECONCILED (B2-R3)', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', null, '2018-04-01');

    await expect(evaluate(partyId)).rejects.toThrow(/FISCAL_UNRECONCILED/);
  });

  it('fiscal: todos fechados no son incidencia', async () => {
    const partyId = await insertParty();
    const subscriberId = await insertSubscriber(partyId);
    const contractId = await insertContract(subscriberId, 'TERMINATED', '2018-03-01T12:00:00Z');
    await insertFiscalDocument(contractId, subscriberId, 'EMITIDO', '2018-04-01', '2018-04-01');
    await insertFiscalDocument(contractId, subscriberId, 'ANULADO', '2018-05-01', '2018-05-01');

    const result = await evaluate(partyId);
    expect(result.clocks.fiscal?.anchor).toBe('2018-05-01');
  });
});
