import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditAction } from '@iwana/shared';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { AuditService } from './audit.service';
import { PlatformAuditService } from './platform-audit.service';
import { CrmContractImpersonationAdapter } from '../crm/privacy-adapters/crm-contract-impersonation.adapter';
import { ContractStatus } from '../crm/enums/contract-status.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

describeWithDb('AuditService.logWithin con PostgreSQL real', () => {
  let dataSource: DataSource;
  const tenantId = randomUUID();
  const schemaName = `tenant_a25_${randomUUID().replace(/-/g, '')}`;
  const tenantContext = { tenantId, schemaName, tenantSlug: 'audit-a25-test' };

  function qSchema(): string {
    return `"${schemaName}"`;
  }

  function createAuditService(): AuditService {
    return new AuditService(dataSource, {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlatformAuditService);
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [AuditLog],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 4, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA ${qSchema()}`);
    await dataSource.query(`
      CREATE TABLE ${qSchema()}.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        user_id uuid,
        action varchar(50) NOT NULL,
        entity_type varchar(100) NOT NULL,
        entity_id varchar(100) NOT NULL,
        old_value jsonb,
        new_value jsonb,
        ip_address varchar(45),
        user_agent varchar(512),
        request_id varchar(100),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${qSchema()}.subscribers (
        id uuid PRIMARY KEY,
        party_id uuid NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE ${qSchema()}.contracts (
        id uuid PRIMARY KEY,
        subscriber_id uuid NOT NULL,
        status varchar(20) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${qSchema()} CASCADE`);
      await dataSource.destroy();
    }
  });

  it('persiste el payload saneado usando la transacción y el schema del llamador', async () => {
    const auditService = createAuditService();
    const entryId = randomUUID();

    await TenantContext.run(tenantContext, () =>
      runInTenantSchema(dataSource, schemaName, (qr) =>
        auditService.logWithin(
          {
            action: AuditAction.UPDATE,
            entityType: 'Contract',
            entityId: entryId,
            newValue: {
              status: ContractStatus.SUSPENDED,
              fullName: 'Nombre sintético de prueba',
              fiscalDocument: 'Documento sintético de prueba',
              requestId: 'request-synthetic',
            },
          },
          qr.manager,
        ),
      ),
    );

    const rows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT tenant_id, new_value FROM audit_logs WHERE entity_id = $1', [entryId]),
    )) as Array<{ tenant_id: string; new_value: Record<string, unknown> }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenant_id).toBe(tenantId);
    expect(rows[0]?.new_value).toEqual({
      status: ContractStatus.SUSPENDED,
      requestId: 'request-synthetic',
    });
  });

  it('revierte la suspensión y no emite evento cuando falla la auditoría', async () => {
    const subscriberId = randomUUID();
    const partyId = randomUUID();
    const contractId = randomUUID();
    const requestId = randomUUID();
    const actorId = randomUUID();
    const emitted = jest.fn().mockResolvedValue(undefined);
    const eventEmitter = { emitAsync: emitted } as unknown as EventEmitter2;
    const adapter = new CrmContractImpersonationAdapter(
      dataSource,
      eventEmitter,
      createAuditService(),
    );

    await runInTenantSchema(dataSource, schemaName, async (qr) => {
      await qr.query('INSERT INTO subscribers (id, party_id) VALUES ($1, $2)', [
        subscriberId,
        partyId,
      ]);
      await qr.query('INSERT INTO contracts (id, subscriber_id, status) VALUES ($1, $2, $3)', [
        contractId,
        subscriberId,
        ContractStatus.ACTIVE,
      ]);
      await qr.query(`
        CREATE FUNCTION ${qSchema()}.reject_audit_insert() RETURNS trigger
        LANGUAGE plpgsql AS $block$
        BEGIN
          RAISE EXCEPTION 'synthetic audit failure';
        END;
        $block$
      `);
      await qr.query(`
        CREATE TRIGGER reject_audit_insert
        BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION ${qSchema()}.reject_audit_insert()
      `);
    });

    await expect(
      TenantContext.run(tenantContext, () =>
        runInTenantSchema(dataSource, schemaName, (qr) =>
          adapter.suspendForImpersonation(
            { partyId, contractIds: [contractId], requestId, actorId },
            { manager: qr.manager },
          ),
        ),
      ),
    ).rejects.toThrow('synthetic audit failure');

    const state = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT status FROM contracts WHERE id = $1', [contractId]),
    )) as Array<{ status: ContractStatus }>;
    const auditRows = (await runInTenantSchema(dataSource, schemaName, (qr) =>
      qr.query('SELECT id FROM audit_logs WHERE entity_id = $1', [contractId]),
    )) as Array<{ id: string }>;

    expect(state[0]?.status).toBe(ContractStatus.ACTIVE);
    expect(auditRows).toHaveLength(0);
    expect(emitted).not.toHaveBeenCalled();
  });
});
