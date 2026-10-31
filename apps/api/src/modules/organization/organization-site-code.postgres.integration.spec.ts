import { randomBytes, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { AppDataSource, OrganizationSite, TenantContext } from '@iwana/db';
import { OrganizationSiteType } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { OrganizationService, type OrganizationSiteDetail } from './organization.service';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_orgcode_concurrency_${randomBytes(6).toString('hex')}`;
const siteCount = 24;
const sameInitialNames = [
  'Nodo Santandercito',
  'Nube Sabaneta',
  'Norte Santander',
  'Nueva Sierra',
  'Nexo Sur',
  'Nacional Sevilla',
];

interface SiteDetailLoader {
  loadSiteDetail(
    manager: EntityManager,
    tenantId: string,
    id: string,
  ): Promise<OrganizationSiteDetail>;
}

describeWithDb('Organization site code allocation (PostgreSQL concurrency)', () => {
  let createdSchema = false;
  let initializedDataSource = false;
  let service: OrganizationService;
  let tenantId: string;

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      initializedDataSource = true;
    }

    await AppDataSource.query(`CREATE SCHEMA "${schemaName}"`);
    createdSchema = true;

    await AppDataSource.query(`
      CREATE TABLE "${schemaName}".organization_sites (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(160) NOT NULL,
        code VARCHAR(40) NOT NULL,
        site_type VARCHAR(40) NOT NULL,
        address VARCHAR(240),
        municipality VARCHAR(120),
        department VARCHAR(120),
        country VARCHAR(2) NOT NULL DEFAULT 'CO',
        latitude NUMERIC(10, 7),
        longitude NUMERIC(10, 7),
        contact_name VARCHAR(160),
        contact_phone VARCHAR(32),
        is_primary BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_organization_sites PRIMARY KEY (id)
      )
    `);
    await AppDataSource.query(`
      CREATE UNIQUE INDEX uq_organization_sites_tenant_code
        ON "${schemaName}".organization_sites (tenant_id, code)
        WHERE deleted_at IS NULL
    `);

    tenantId = randomUUID();
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    service = new OrganizationService(AppDataSource, auditService);

    const detailLoader = service as unknown as SiteDetailLoader;
    jest.spyOn(detailLoader, 'loadSiteDetail').mockImplementation(async (manager, idTenant, id) => {
      const site = await manager.findOneOrFail(OrganizationSite, {
        where: { tenantId: idTenant, id },
      });
      return {
        id: site.id,
        name: site.name,
        code: site.code,
        capabilities: [],
        isActive: site.isActive,
        siteType: site.siteType,
        address: site.address,
        municipality: site.municipality,
        department: site.department,
        country: site.country,
        latitude: site.latitude === null ? null : Number(site.latitude),
        longitude: site.longitude === null ? null : Number(site.longitude),
        contactName: site.contactName,
        contactPhone: site.contactPhone,
        isPrimary: site.isPrimary,
        businessHoursMode: 'BASE',
        businessHours: [],
        businessHoursResolved: [],
        assignments: [],
        responsibilities: [],
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
      };
    });
  }, 30_000);

  afterAll(async () => {
    if (createdSchema && AppDataSource.isInitialized) {
      await AppDataSource.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      createdSchema = false;
    }
    if (initializedDataSource && AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }, 30_000);

  it('asigna códigos distintos a sedes concurrentes con las mismas iniciales', async () => {
    const names = Array.from(
      { length: siteCount },
      (_, index) => sameInitialNames[index % sameInitialNames.length] ?? 'Nodo Santandercito',
    );
    expect(names.every((name) => name.startsWith('N'))).toBe(true);
    expect(names.every((name) => name.split(/\s+/u)[1]?.startsWith('S'))).toBe(true);

    const attempts = await TenantContext.run(
      { tenantId, schemaName, tenantSlug: 'orgcode-concurrency-test' },
      () =>
        Promise.allSettled(
          names.map((name) =>
            service.create({
              name,
              siteType: OrganizationSiteType.OFFICE,
              latitude: 4.6,
              longitude: -74.1,
              contactName: 'Prueba automatizada',
              contactPhone: '+570000000000',
            }),
          ),
        ),
    );

    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toEqual([]);

    const rows = (await AppDataSource.query(
      `SELECT code FROM "${schemaName}".organization_sites WHERE tenant_id = $1 ORDER BY code`,
      [tenantId],
    )) as Array<{ code: string }>;
    const expectedCodes = Array.from(
      { length: siteCount },
      (_, index) => `NS${String(index + 1).padStart(2, '0')}`,
    );
    const actualCodes = rows.map((row) => row.code);

    expect(rows).toHaveLength(siteCount);
    expect(new Set(actualCodes).size).toBe(siteCount);
    expect(actualCodes).toEqual(expectedCodes);
  }, 60_000);
});
