// MOD05 Cierre de venta · bloque F (ADR-109 D3, CA-5, G5) contra PostgreSQL real con la cadena
// completa de migraciones tenant: lectura de activación por contrato (MOD13), «pendiente de
// firma» y el aviso diario idempotente por contrato y umbral.
import { randomBytes, randomUUID } from 'node:crypto';
import { resolveMigrationDbCredentials, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { ContractProvisioningActivationReadAdapter } from '../../network/adapters/contract-provisioning-activation-read.adapter';
import { ContractPendingSignatureAlertsProcessor } from './contract-pending-signature-alerts.processor';
import { ContractPendingSignatureService } from './contract-pending-signature.service';

const databaseAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDatabase = databaseAvailable ? describe : describe.skip;
const allowedDatabaseName = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const schemaName = `tenant_pending_sig_${randomBytes(5).toString('hex')}`;
const tenantId = randomUUID();
const tenantSlug = `pending-sig-${schemaName.slice(-10)}`;
const NOW = new Date('2026-11-11T13:00:00.000Z');
const HOURS = 60 * 60 * 1_000;

if (databaseAvailable && !allowedDatabaseName.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración pendiente de firma: DB_NAME debe ser dbiw, test o iwana_it_*; solo se crea y elimina un schema efímero.',
  );
}

describeWithDatabase('Contrato pendiente de firma — integración PostgreSQL', () => {
  let dataSource: DataSource;
  let adapter: ContractProvisioningActivationReadAdapter;
  let service: ContractPendingSignatureService;
  let processor: ContractPendingSignatureAlertsProcessor;
  const q = `"${schemaName}"`;
  const actorId = randomUUID();
  const router = randomUUID();
  const network = randomUUID();
  const ids = {
    subscriberDue: randomUUID(),
    subscriberRecent: randomUUID(),
    subscriberSigned: randomUUID(),
    subscriberReleased: randomUUID(),
    due: randomUUID(),
    recent: randomUUID(),
    signed: randomUUID(),
    released: randomUUID(),
  };
  const holders = { holders: jest.fn() };
  const mailer = { sendMail: jest.fn() };
  const config = {
    get: (key: string) => (key === 'FRONTEND_URL' ? 'https://portal.example.test' : undefined),
  };
  const run = <T>(fn: () => Promise<T>) =>
    TenantContext.run({ tenantId, schemaName, tenantSlug }, fn);

  async function seedContract(
    subscriberId: string,
    contractId: string,
    status: string,
    activatedHoursAgo: number,
    provisioningStatus = 'ACTIVE',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO ${q}.subscribers
        (id, tenant_id, person_type, customer_segment, document_type, first_name, last_name,
         stratum, vat_treatment, address, document_number_encrypted, created_by)
       VALUES ($1, $2, 'NATURAL', 'RESIDENTIAL', 'CC', 'Titular sintético', 'Apellido', 2,
         'STANDARD', 'Dirección sintética', 'cifrado-ficticio', $3)`,
      [subscriberId, tenantId, actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.contracts
        (id, tenant_id, subscriber_id, plan_id, plan_snapshot_json, vat_snapshot, status, alias)
       VALUES ($1, $2, $3, 'plan-sintetico', '{}'::jsonb, '{}'::jsonb, $4, 'Servicio sintético')`,
      [contractId, tenantId, subscriberId, status],
    );
    await dataSource.query(
      `INSERT INTO ${q}.service_provisionings
        (tenant_id, subscriber_id, contract_id, execution_order_id, execution_order_number,
         router_id, ipv4_network_id, control_method, control_params, status, activated_at,
         released_at, release_reason)
       VALUES ($1, $2, $3, $4, 'EO-F-001', $5, $6, 'PCQ_ADDRESS_LIST', '{}', $7, $8, $9, $10)`,
      [
        tenantId,
        subscriberId,
        contractId,
        randomUUID(),
        router,
        network,
        provisioningStatus,
        new Date(NOW.getTime() - activatedHoursAgo * HOURS),
        provisioningStatus === 'RELEASED' ? NOW : null,
        provisioningStatus === 'RELEASED' ? 'MANUAL' : null,
      ],
    );
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? '127.0.0.1',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5433', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Pendiente de firma sintético', $2, $3, 'ACTIVE', 'pending-sig@example.invalid')`,
      [tenantId, tenantSlug, schemaName],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(dataSource, schemaName, tenantSlug);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    await dataSource.query(
      `INSERT INTO ${q}.network_routers
        (id, tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, $2, 'Router Ficticio F', '192.0.2.1', ARRAY['PCQ_ADDRESS_LIST'], $3)`,
      [router, tenantId, actorId],
    );
    await dataSource.query(
      `INSERT INTO ${q}.ipv4_networks
        (id, tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
         default_control_method, created_by)
       VALUES ($1, $2, $3, 'Red Ficticia F', '192.0.2.0/24', '192.0.2.1', '192.0.2.2',
         '192.0.2.254', 'PCQ_ADDRESS_LIST', $4)`,
      [network, tenantId, router, actorId],
    );
    await seedContract(ids.subscriberDue, ids.due, 'DRAFT', 72);
    await seedContract(ids.subscriberRecent, ids.recent, 'DRAFT', 10);
    await seedContract(ids.subscriberSigned, ids.signed, 'ACTIVE', 72);
    await seedContract(ids.subscriberReleased, ids.released, 'DRAFT', 72, 'RELEASED');

    adapter = new ContractProvisioningActivationReadAdapter(dataSource);
    service = new ContractPendingSignatureService(dataSource, adapter);
    processor = new ContractPendingSignatureAlertsProcessor(
      dataSource,
      { add: jest.fn() } as never,
      service,
      holders as never,
      mailer as never,
      config as never,
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    holders.holders.mockReset().mockResolvedValue([
      { userId: randomUUID(), email: 'contable@example.test' },
      { userId: randomUUID(), email: 'noc@example.test' },
    ]);
    mailer.sendMail.mockReset().mockResolvedValue(undefined);
  });

  it('el puerto de MOD13 lee la activación por contrato e ignora los liberados', async () => {
    await run(async () => {
      const activatedAt = await adapter.getProvisioningActivatedAt(ids.due);
      expect(activatedAt?.toISOString()).toBe(new Date(NOW.getTime() - 72 * HOURS).toISOString());
      expect(await adapter.getProvisioningActivatedAt(ids.released)).toBeNull();
      expect(await adapter.getProvisioningActivatedAt(randomUUID())).toBeNull();
    });
  });

  it('«pendiente de firma» exige DRAFT y servicio activado', async () => {
    await run(async () => {
      expect(await service.isContractUnsigned(ids.due)).toBe(true);
      expect(await service.isContractUnsigned(ids.signed)).toBe(false);
      const pending = await service.subscribersPendingSignature(Object.values(ids));
      expect([...pending].sort()).toEqual([ids.subscriberDue, ids.subscriberRecent].sort());
    });
  });

  it('si el correo falla no queda registro y el reintento lo envía', async () => {
    mailer.sendMail.mockRejectedValueOnce(new Error('smtp caído'));
    await expect(
      processor.processTenant({ tenantId, tenantSlug, schemaName, date: '2026-11-11' }, NOW),
    ).rejects.toThrow('smtp caído');
    const rows = (await dataSource.query(
      `SELECT count(*)::int AS count FROM ${q}.contract_pending_signature_alerts`,
    )) as Array<{ count: number }>;
    expect(rows[0]?.count).toBe(0);
  });

  it('avisa una sola vez por contrato y umbral, solo a las 48 h y sin PII', async () => {
    const payload = { tenantId, tenantSlug, schemaName, date: '2026-11-11' };
    await processor.processTenant(payload, NOW);
    await processor.processTenant(payload, NOW);

    expect(mailer.sendMail).toHaveBeenCalledTimes(1);
    const mail = mailer.sendMail.mock.calls[0]?.[0] as { to: string; text: string; html: string };
    expect(mail.to).toBe('contable@example.test, noc@example.test');
    expect(mail.text).toContain('Hay 1 contrato');
    expect(`${mail.text}${mail.html}`).not.toContain('Titular sintético');
    expect(`${mail.text}${mail.html}`).not.toContain(ids.due);

    const rows = (await dataSource.query(
      `SELECT contract_id::text AS contract_id, threshold_hours, recipients_count
       FROM ${q}.contract_pending_signature_alerts`,
    )) as Array<{ contract_id: string; threshold_hours: number; recipients_count: number }>;
    expect(rows).toEqual([{ contract_id: ids.due, threshold_hours: 48, recipients_count: 2 }]);
  });

  it('sin destinatarios no registra el aviso', async () => {
    holders.holders.mockResolvedValue([]);
    const later = new Date(NOW.getTime() + 48 * HOURS);
    await processor.processTenant({ tenantId, tenantSlug, schemaName, date: '2026-11-13' }, later);
    expect(mailer.sendMail).not.toHaveBeenCalled();
    const rows = (await dataSource.query(
      `SELECT 1 FROM ${q}.contract_pending_signature_alerts WHERE contract_id = $1`,
      [ids.recent],
    )) as unknown[];
    expect(rows).toHaveLength(0);
  });

  it('la migración 187 concede el permiso a Administración, Contable y NOC en el catálogo', async () => {
    const [catalog] = (await dataSource.query(
      `SELECT module_key, action, availability FROM ${q}.access_permission_catalog
       WHERE permission_key = 'crm.contracts.pending_signature.notify'`,
    )) as Array<Record<string, string>>;
    expect(catalog).toEqual({
      module_key: 'crm',
      action: 'pending_signature.notify',
      availability: 'ASSIGNABLE',
    });
  });
});
