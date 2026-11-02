import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuditLog, dataSourceOptions, runInTenantSchema, TenantContext } from '@iwana/db';
import { TaxProfileStatus } from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../../packages/database/src/migrations/tenant/runner';
import { AuditService } from '../../../audit/audit.service';
import { PlatformAuditService } from '../../../audit/platform-audit.service';
import { TaxCatalogReadPort } from '../../../taxation/ports/tax-catalog-read.port';
import { ITaxApplicationReadPort } from '../../../taxation/ports/tax-application-read.port';
import { SubscriberTaxProfileService } from '../subscriber-tax-profile.service';
import { SubscriberTaxProfile } from '../entities/subscriber-tax-profile.entity';
import { SubscriberTaxAssignment } from '../entities/subscriber-tax-assignment.entity';

const describeWithDb =
  process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true' ? describe : describe.skip;
describeWithDb('Confirmación tributaria atómica: PostgreSQL real', () => {
  let ds: DataSource;
  let audit: AuditService;
  let service: SubscriberTaxProfileService;
  const schemaName = 'tenant_tax_confirm_' + randomUUID().replace(/-/g, '');
  const tenantId = randomUUID();
  const actorId = randomUUID();
  const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
  const within = <T>(work: () => Promise<T>) =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'tax-confirm-synthetic' }, work);
  beforeAll(async () => {
    ds = new DataSource({
      ...dataSourceOptions,
      entities: [SubscriberTaxProfile, SubscriberTaxAssignment, AuditLog],
      migrations: [],
      logging: false,
    });
    await ds.initialize();
    await ds.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
      [
        tenantId,
        'Tax confirm synthetic',
        `tax-confirm-${tenantId}`,
        schemaName,
        'tax-confirm@example.invalid',
      ],
    );
    await ds.query('CREATE SCHEMA ' + quote(schemaName));
    const tenantDataSource = createTenantDataSource(ds, schemaName, `tax-confirm-${tenantId}`);
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }
    audit = new AuditService(ds, {} as PlatformAuditService);
    service = new SubscriberTaxProfileService(
      ds,
      {} as TaxCatalogReadPort,
      {} as ITaxApplicationReadPort,
      audit,
    );
  });
  afterAll(async () => {
    if (ds?.isInitialized) {
      await ds.query('DROP SCHEMA IF EXISTS ' + quote(schemaName) + ' CASCADE');
      await ds.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await ds.destroy();
    }
  });
  async function fixture() {
    return runInTenantSchema(ds, schemaName, (qr) =>
      qr.manager.save(
        SubscriberTaxProfile,
        Object.assign(new SubscriberTaxProfile(), {
          tenantId,
          subscriberId: randomUUID(),
          profileStatus: TaxProfileStatus.PENDING_REVIEW,
          confirmedAt: null,
          confirmedBy: null,
          assignments: [],
        }),
      ),
    );
  }
  it('revierte estado y confirmación si falla la auditoría después del save', async () => {
    const profile = await fixture();
    const fail = jest
      .spyOn(audit, 'logWithin')
      .mockRejectedValueOnce(new Error('synthetic audit failure'));
    try {
      await expect(
        within(() => service.confirmProfile(profile.subscriberId, actorId)),
      ).rejects.toThrow('synthetic audit failure');
    } finally {
      fail.mockRestore();
    }
    const persisted = await runInTenantSchema(ds, schemaName, (qr) =>
      qr.manager.findOneByOrFail(SubscriberTaxProfile, { id: profile.id }),
    );
    expect(persisted.profileStatus).toBe(TaxProfileStatus.PENDING_REVIEW);
    expect(persisted.confirmedAt).toBeNull();
    expect(persisted.confirmedBy).toBeNull();
  });
  it('revierte confirmación y auditoría real si falla después de insertar la entrada', async () => {
    const profile = await fixture();
    const logWithin = audit.logWithin.bind(audit);
    let auditEntryId: string | undefined;
    const failAfterAudit = jest
      .spyOn(audit, 'logWithin')
      .mockImplementationOnce(async (entry, manager) => {
        await logWithin(entry, manager);
        const entries = await manager.find(AuditLog, { where: { entityId: profile.id } });
        expect(entries).toHaveLength(1);
        auditEntryId = entries[0]!.id;
        expect(entries[0]!.newValue).toEqual({ profileStatus: TaxProfileStatus.CONFIGURED });
        const confirmed = await manager.findOneByOrFail(SubscriberTaxProfile, { id: profile.id });
        expect(confirmed.profileStatus).toBe(TaxProfileStatus.CONFIGURED);
        throw new Error('synthetic failure after real audit insert');
      });
    try {
      await expect(
        within(() => service.confirmProfile(profile.subscriberId, actorId)),
      ).rejects.toThrow('synthetic failure after real audit insert');
    } finally {
      failAfterAudit.mockRestore();
    }
    expect(auditEntryId).toBeDefined();
    const persisted = await runInTenantSchema(ds, schemaName, (qr) =>
      qr.manager.findOneByOrFail(SubscriberTaxProfile, { id: profile.id }),
    );
    expect(persisted).toMatchObject({
      profileStatus: TaxProfileStatus.PENDING_REVIEW,
      confirmedAt: null,
      confirmedBy: null,
    });
    const entries = await runInTenantSchema(ds, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: profile.id } }),
    );
    expect(entries).toEqual([]);
  });
  it('confirma y audita con campos cerrados sin duplicar auditoría al reintentar', async () => {
    const profile = await fixture();
    await within(() => service.confirmProfile(profile.subscriberId, actorId));
    await within(() => service.confirmProfile(profile.subscriberId, actorId));
    const rows = await runInTenantSchema(ds, schemaName, (qr) =>
      qr.manager.find(AuditLog, { where: { entityId: profile.id } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.oldValue).toEqual({ profileStatus: TaxProfileStatus.PENDING_REVIEW });
    expect(rows[0]?.newValue).toEqual({ profileStatus: TaxProfileStatus.CONFIGURED });
  });
});
