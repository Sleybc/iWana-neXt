import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccessProfile,
  AccessProfilePermission,
  dataSourceOptions,
  NetworkRouter,
  OrganizationSite,
  TenantContext,
  User,
  UserAccessProfile,
} from '@iwana/db';
import {
  AccessPermissionKey,
  CONTROL_METHODS,
  UserRole,
  type CreateRouterBody,
} from '@iwana/shared';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { EffectivePermissionScopeAdapter } from '../../access-control/ports/effective-permission-scope.adapter';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { NetworkCatalogController } from '../network-catalog.controller';
import { NetworkCatalogService } from '../network-catalog.service';
import { NetworkInterfaceCatalogService } from '../network-interface-catalog.service';
import { NetworkAuthorizationFacade } from '../authorization/network-authorization.facade';
import { NetworkTenantGuard } from '../guards/network-tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { NetworkActorReadPort } from '../ports/network-actor-read.port';
import { OrganizationSiteReadPort } from '../../organization/ports/organization-site-read.port';
import { CommercialNodeReadPort } from '../../tenant/ports/commercial-node-read.port';
import { AuditService } from '../../audit/audit.service';
import { IpamService } from '../ipam.service';
import { OrganizationSiteReadAdapter } from '../../organization/ports/organization-site-read.adapter';
import { OrganizationService } from '../../organization/organization.service';
import { CommercialNode } from '../../tenant/entities/commercial-node.entity';
import { CommercialNodeReadAdapter } from '../../tenant/ports/commercial-node-read.adapter';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error('D23 HTTP integrado solo permite fixtures en dbiw, test o iwana_it_*');
}

describeWithDb('Network catalog D23 — HTTP real con permisos efectivos en PostgreSQL', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let actorId: string;
  let readOnlyActorId: string;
  let emptyScopeActorId: string;
  let emptyProfileActorId: string;
  let crossDomainActorId: string;
  let siteBManageActorId: string;
  let tenantWideReadActorId: string;
  let tenantWideManageActorId: string;
  let siteAId: string;
  let siteBId: string;
  let routerAId: string;
  let routerBId: string;
  let commercialNodeId: string;
  let schemaName: string;
  const tenantId = randomUUID();
  const queryLog: string[] = [];

  const queryLogger = {
    logQuery(query: string) {
      queryLog.push(query);
    },
    logQueryError() {},
    logQuerySlow() {},
    logSchemaBuild() {},
    logMigration() {},
    log() {},
  };

  const context = () => ({ tenantId, schemaName, tenantSlug: schemaName });
  let selectedActorId = '';
  let ownerSiteReadPort: {
    findReferenceById: jest.Mock;
    findRouterSummaryById: jest.Mock;
    listRouterOptions: jest.Mock;
  };
  let commercialNodeReadPort: {
    findReferenceById: jest.Mock;
    findRouterSummaryById: jest.Mock;
  };
  let organizationSiteReadAdapter: OrganizationSiteReadAdapter;
  let commercialNodeReadAdapter: CommercialNodeReadAdapter;
  let catalogService: NetworkCatalogService;
  let jwtTenantContextOverride: { tenantId: string; schemaName: string } | undefined;

  const createTables = async (): Promise<void> => {
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".users (
        id uuid PRIMARY KEY,
        email varchar(255) NOT NULL,
        email_hmac varchar(64) NOT NULL,
        password_hash varchar(60) NOT NULL,
        role varchar(20) NOT NULL,
        status varchar(30) NOT NULL,
        tenant_id uuid NOT NULL,
        mfa_enabled boolean NOT NULL DEFAULT false,
        mfa_secret varchar(512),
        mfa_required boolean NOT NULL DEFAULT false,
        is_operational_resource boolean NOT NULL DEFAULT false,
        password_reset_required boolean NOT NULL DEFAULT false,
        password_reset_token varchar(512),
        password_reset_expires_at timestamptz,
        password_reset_token_expires_at timestamptz,
        failed_login_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        last_login_at timestamptz,
        email_verified boolean NOT NULL DEFAULT false,
        email_verification_token varchar(512),
        first_name varchar(100),
        last_name varchar(100),
        phone varchar(20),
        job_title varchar(150),
        document_type varchar(20),
        document_number varchar(30),
        avatar_url varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".access_profiles (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        description text,
        base_role_constraint varchar(30),
        scope_site_id uuid,
        is_system boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".user_access_profiles (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        user_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        valid_from date NOT NULL DEFAULT CURRENT_DATE,
        valid_to date,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".access_profile_permissions (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        permission_key varchar(120) NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".network_routers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        organization_site_id uuid,
        commercial_node_id uuid,
        management_host varchar(255) NOT NULL,
        lan_interface varchar(64),
        legacy_lan_interface_id uuid,
        supported_control_methods varchar(40)[] NOT NULL,
        status varchar(16) NOT NULL,
        notes text,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".network_router_interfaces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        name varchar(64) NOT NULL,
        kind varchar(16) NOT NULL,
        notes text,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".ipv4_networks (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".organization_sites (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        name varchar(160) NOT NULL,
        code varchar(40) NOT NULL,
        site_type varchar(40) NOT NULL,
        address varchar(240),
        municipality varchar(120),
        department varchar(120),
        country varchar(2) NOT NULL DEFAULT 'CO',
        latitude numeric(10, 7),
        longitude numeric(10, 7),
        contact_name varchar(160),
        contact_phone varchar(32),
        is_primary boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
    await dataSource.query(`
      CREATE TABLE "${schemaName}".commercial_nodes (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        name varchar(150) NOT NULL,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
  };

  const insertUser = async (id: string): Promise<void> => {
    await dataSource.query(
      `INSERT INTO "${schemaName}".users
        (id, email, email_hmac, password_hash, role, status, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        `${id}@example.invalid`,
        randomUUID().replaceAll('-', '').padEnd(64, '0'),
        'test-only-hash',
        UserRole.NOC,
        'ACTIVE',
        tenantId,
      ],
    );
  };

  const insertProfile = async (
    userId: string,
    siteId: string | null,
    permissions: AccessPermissionKey[],
  ): Promise<void> => {
    const profileId = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".access_profiles
        (id, tenant_id, name, base_role_constraint, scope_site_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [profileId, tenantId, `profile-${profileId}`, UserRole.NOC, siteId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".user_access_profiles
        (id, tenant_id, user_id, profile_id, valid_from, is_active)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, true)`,
      [randomUUID(), tenantId, userId, profileId],
    );
    for (const permission of permissions) {
      await dataSource.query(
        `INSERT INTO "${schemaName}".access_profile_permissions
          (id, tenant_id, profile_id, permission_key)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), tenantId, profileId, permission],
      );
    }
  };

  beforeAll(async () => {
    schemaName = `tenant_mod13_d23_http_${randomUUID().replaceAll('-', '')}`;
    actorId = randomUUID();
    readOnlyActorId = randomUUID();
    emptyScopeActorId = randomUUID();
    emptyProfileActorId = randomUUID();
    crossDomainActorId = randomUUID();
    siteBManageActorId = randomUUID();
    tenantWideReadActorId = randomUUID();
    tenantWideManageActorId = randomUUID();
    siteAId = randomUUID();
    siteBId = randomUUID();
    routerAId = randomUUID();
    routerBId = randomUUID();
    commercialNodeId = randomUUID();

    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [
        NetworkRouter,
        User,
        AccessProfile,
        UserAccessProfile,
        AccessProfilePermission,
        OrganizationSite,
        CommercialNode,
      ],
      migrations: [],
      logging: ['query'],
      logger: queryLogger as never,
      extra: { ...dataSourceOptions.extra, max: 6, min: 1 },
    });
    await dataSource.initialize();
    await createTables();
    await dataSource.query(
      `INSERT INTO "${schemaName}".organization_sites
        (id, tenant_id, name, code, site_type, is_active)
       VALUES ($1, $3, 'Site A', 'SITE-A', 'OFFICE', true),
              ($2, $3, 'Site B', 'SITE-B', 'OFFICE', true)`,
      [siteAId, siteBId, tenantId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}".commercial_nodes
        (id, tenant_id, name, latitude, longitude, is_active)
       VALUES ($1, $2, 'Node A', 4.6, -74.1, true)`,
      [commercialNodeId, tenantId],
    );
    await insertUser(actorId);
    await insertUser(readOnlyActorId);
    await insertUser(emptyScopeActorId);
    await insertUser(emptyProfileActorId);
    await insertUser(crossDomainActorId);
    await insertUser(siteBManageActorId);
    await insertUser(tenantWideReadActorId);
    await insertUser(tenantWideManageActorId);
    await insertProfile(actorId, siteAId, [
      AccessPermissionKey.NETWORK_CATALOG_READ,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    ]);
    await insertProfile(readOnlyActorId, siteAId, [AccessPermissionKey.NETWORK_CATALOG_READ]);
    await insertProfile(emptyScopeActorId, randomUUID(), [
      AccessPermissionKey.NETWORK_CATALOG_READ,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    ]);
    await insertProfile(crossDomainActorId, siteAId, [
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
    ]);
    await insertProfile(siteBManageActorId, siteBId, [AccessPermissionKey.NETWORK_CATALOG_MANAGE]);
    await insertProfile(tenantWideReadActorId, null, [AccessPermissionKey.NETWORK_CATALOG_READ]);
    await insertProfile(tenantWideManageActorId, null, [
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    ]);
    await dataSource.query(
      `INSERT INTO "${schemaName}".network_routers
        (id, tenant_id, name, organization_site_id, commercial_node_id, management_host,
         supported_control_methods, status, created_by)
       VALUES
        ($1, $2, 'Router site A', $3, $4, 'router-a.example.invalid', '{}', 'ACTIVE', $5),
        ($6, $2, 'Router site B', $7, NULL, 'router-b.example.invalid', '{}', 'ACTIVE', $5)`,
      [routerAId, tenantId, siteAId, commercialNodeId, actorId, routerBId, siteBId],
    );

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const effectivePermissions = new EffectivePermissionsService(dataSource, redis as never);
    const scope = new EffectivePermissionScopeAdapter(dataSource, effectivePermissions);
    const networkAuthorization = new NetworkAuthorizationFacade(scope);
    organizationSiteReadAdapter = new OrganizationSiteReadAdapter(
      {} as OrganizationService,
      dataSource,
    );
    commercialNodeReadAdapter = new CommercialNodeReadAdapter(dataSource);
    ownerSiteReadPort = {
      findReferenceById: jest.fn((id: string) => organizationSiteReadAdapter.findReferenceById(id)),
      findRouterSummaryById: jest.fn((id: string) =>
        organizationSiteReadAdapter.findRouterSummaryById(id),
      ),
      listRouterOptions: jest.fn((input: never) =>
        organizationSiteReadAdapter.listRouterOptions(input),
      ),
    };
    commercialNodeReadPort = {
      findReferenceById: jest.fn((id: string) => commercialNodeReadAdapter.findReferenceById(id)),
      findRouterSummaryById: jest.fn((id: string) =>
        commercialNodeReadAdapter.findRouterSummaryById(id),
      ),
    };
    catalogService = new NetworkCatalogService(
      dataSource,
      { logWithin: jest.fn() } as unknown as AuditService,
      { findByIds: jest.fn().mockResolvedValue([]) } as unknown as NetworkActorReadPort,
      new IpamService(dataSource),
      networkAuthorization,
      ownerSiteReadPort as unknown as OrganizationSiteReadPort,
      commercialNodeReadPort as unknown as CommercialNodeReadPort,
    );
    const interfaceService = new NetworkInterfaceCatalogService(
      dataSource,
      { logWithin: jest.fn() } as unknown as AuditService,
      new IpamService(dataSource),
      networkAuthorization,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [NetworkCatalogController],
      providers: [
        { provide: NetworkCatalogService, useValue: catalogService },
        { provide: NetworkInterfaceCatalogService, useValue: interfaceService },
        NetworkTenantGuard,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (executionContext: {
          switchToHttp: () => { getRequest: () => { user?: JwtPayload } };
        }) => {
          const claims = jwtTenantContextOverride ?? { tenantId, schemaName };
          executionContext.switchToHttp().getRequest().user = {
            sub: selectedActorId,
            role: UserRole.NOC,
            type: 'tenant',
            tenantId: claims.tenantId,
            schemaName: claims.schemaName,
            jti: randomUUID(),
          } as JwtPayload;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use((_request: unknown, _response: unknown, next: () => void) =>
      TenantContext.run(context(), next),
    );
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    selectedActorId = actorId;
    jwtTenantContextOverride = undefined;
    queryLog.length = 0;
    jest.clearAllMocks();
    await dataSource.query(
      `UPDATE "${schemaName}".organization_sites SET is_active = true WHERE id = $1`,
      [siteAId],
    );
    await dataSource.query(
      `UPDATE "${schemaName}".commercial_nodes SET is_active = true, deleted_at = NULL WHERE id = $1`,
      [commercialNodeId],
    );
  });

  const createRouterInput = (
    name: string,
    references: { nodeId?: string } = {},
  ): CreateRouterBody => ({
    name,
    managementHost: `${name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}.example.invalid`,
    supportedControlMethods: [CONTROL_METHODS[0]!],
    organizationSiteId: siteAId,
    ...(references.nodeId ? { commercialNodeId: references.nodeId } : {}),
  });

  it('GET limita la consulta HTTP a los routers del site efectivo antes de contar y proyectar', async () => {
    const response = await request(app.getHttpServer()).get('/network/routers').expect(200);

    expect(response.body.data.map((router: { id: string }) => router.id)).toEqual([routerAId]);
    expect(response.body.data.map((router: { name: string }) => router.name)).toEqual([
      'Router site A',
    ]);
    const authorizationQueryIndex = queryLog.findIndex((query) =>
      query.includes('access_profile_permissions'),
    );
    const routerQueryIndex = queryLog.findIndex((query) => query.includes('network_routers'));
    expect(authorizationQueryIndex).toBeGreaterThanOrEqual(0);
    expect(routerQueryIndex).toBeGreaterThan(authorizationQueryIndex);
    expect(ownerSiteReadPort.findRouterSummaryById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findRouterSummaryById).not.toHaveBeenCalled();
  });

  it('rechaza claims de tenant B con contexto A antes de consultar o escribir en schema A', async () => {
    const claimsForTenantB = {
      tenantId: randomUUID(),
      schemaName: `tenant_mod13_d23_other_${randomUUID().replaceAll('-', '')}`,
    };
    const beforeRows = await dataSource.query(
      `SELECT id, tenant_id, name, version FROM "${schemaName}".network_routers ORDER BY id`,
    );
    jwtTenantContextOverride = claimsForTenantB;
    queryLog.length = 0;

    try {
      const response = await request(app.getHttpServer())
        .post('/network/routers')
        .send(createRouterInput('No escribir desde tenant B'));

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'FORBIDDEN',
        message: 'El contexto de empresa no corresponde a las credenciales autenticadas.',
      });
      expect(queryLog).toEqual([]);
    } finally {
      jwtTenantContextOverride = undefined;
    }

    const afterRows = await dataSource.query(
      `SELECT id, tenant_id, name, version FROM "${schemaName}".network_routers ORDER BY id`,
    );
    expect(afterRows).toEqual(beforeRows);
  });

  it('PATCH oculta el router fuera de scope como inexistente y distingue 403 para scope visible sin acción', async () => {
    const body = { version: 1, name: 'Nombre actualizado' };
    const outOfScope = await request(app.getHttpServer())
      .patch(`/network/routers/${routerBId}?siteId=${siteAId}`)
      .send(body)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .patch(`/network/routers/${randomUUID()}`)
      .send(body)
      .expect(404);

    expect(outOfScope.body).toEqual(missing.body);
    expect(outOfScope.body).toEqual({
      message: 'La referencia no está disponible para esta operación.',
      code: 'RESOURCE_NOT_FOUND',
    });
    expect(queryLog.some((query) => /^\s*UPDATE\s+.*network_routers/iu.test(query))).toBe(false);
    expect(ownerSiteReadPort.findReferenceById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findReferenceById).not.toHaveBeenCalled();

    selectedActorId = emptyProfileActorId;
    const emptyProfile = await request(app.getHttpServer())
      .patch(`/network/routers/${routerBId}`)
      .send(body)
      .expect(404);
    expect(emptyProfile.body).toEqual(missing.body);

    selectedActorId = crossDomainActorId;
    const crossDomainOnly = await request(app.getHttpServer())
      .patch(`/network/routers/${routerBId}`)
      .send(body)
      .expect(404);
    expect(crossDomainOnly.body).toEqual(missing.body);

    selectedActorId = readOnlyActorId;
    const visibleWithoutManage = await request(app.getHttpServer())
      .patch(`/network/routers/${routerAId}`)
      .send(body)
      .expect(403);
    expect(visibleWithoutManage.body).toEqual({
      message: 'No tienes autorización para esta operación.',
      code: 'FORBIDDEN',
    });
    expect(queryLog.some((query) => /^\s*UPDATE\s+.*network_routers/iu.test(query))).toBe(false);

    selectedActorId = siteBManageActorId;
    const siteBUpdate = await request(app.getHttpServer())
      .patch(`/network/routers/${routerBId}`)
      .send(body)
      .expect(200);
    expect(siteBUpdate.body.name).toBe(body.name);
    expect(queryLog.some((query) => /^\s*UPDATE\s+.*network_routers/iu.test(query))).toBe(true);
  });

  it('router site options exige manage, filtra el scope efectivo antes de contar y permite resultado vacío', async () => {
    selectedActorId = readOnlyActorId;
    await request(app.getHttpServer()).get('/network/router-site-options').expect(403);
    expect(ownerSiteReadPort.listRouterOptions).not.toHaveBeenCalled();

    queryLog.length = 0;
    selectedActorId = actorId;
    const scopedResponse = await request(app.getHttpServer())
      .get('/network/router-site-options')
      .expect(200);
    expect(scopedResponse.body.data.map((site: { id: string }) => site.id)).toEqual([siteAId]);
    expect(scopedResponse.body.meta.total).toBe(1);
    const permissionIndex = queryLog.findIndex((query) =>
      query.includes('access_profile_permissions'),
    );
    const siteCountIndex = queryLog.findIndex(
      (query) => query.includes('organization_sites') && query.includes('COUNT('),
    );
    expect(permissionIndex).toBeGreaterThanOrEqual(0);
    expect(siteCountIndex).toBeGreaterThan(permissionIndex);

    selectedActorId = emptyScopeActorId;
    const emptyResponse = await request(app.getHttpServer())
      .get('/network/router-site-options')
      .expect(200);
    expect(emptyResponse.body.data).toEqual([]);
    expect(emptyResponse.body.meta.total).toBe(0);
  });

  it('D10 autoriza antes de leer y solo expone las proyecciones allowlisted del detalle', async () => {
    ownerSiteReadPort.findRouterSummaryById.mockClear();
    commercialNodeReadPort.findRouterSummaryById.mockClear();
    selectedActorId = readOnlyActorId;

    const outOfScope = await request(app.getHttpServer())
      .get(`/network/routers/${routerBId}`)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/network/routers/${randomUUID()}`)
      .expect(404);
    expect(outOfScope.body).toEqual(missing.body);
    expect(ownerSiteReadPort.findRouterSummaryById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findRouterSummaryById).not.toHaveBeenCalled();

    selectedActorId = siteBManageActorId;
    await request(app.getHttpServer()).get(`/network/routers/${routerBId}`).expect(403);
    expect(ownerSiteReadPort.findRouterSummaryById).not.toHaveBeenCalled();
    expect(commercialNodeReadPort.findRouterSummaryById).not.toHaveBeenCalled();

    selectedActorId = readOnlyActorId;
    const response = await request(app.getHttpServer())
      .get(`/network/routers/${routerAId}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: routerAId,
      interfaceCount: 0,
      legacyLanInterfaceId: null,
      organizationSite: { name: 'Site A', siteType: 'OFFICE', isActive: true },
      commercialNode: { name: 'Node A', isActive: true },
    });
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'id',
        'name',
        'managementHost',
        'lanInterface',
        'supportedControlMethods',
        'organizationSiteId',
        'commercialNodeId',
        'organizationSite',
        'commercialNode',
        'status',
        'notes',
        'networkCount',
        'interfaceCount',
        'legacyLanInterfaceId',
        'version',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(ownerSiteReadPort.findRouterSummaryById).toHaveBeenCalledWith(siteAId);
    expect(commercialNodeReadPort.findRouterSummaryById).toHaveBeenCalledWith(commercialNodeId);
  });

  it('catalog meta requiere NETWORK_CATALOG_READ tenant-wide', async () => {
    selectedActorId = actorId;
    await request(app.getHttpServer()).get('/network/catalog-meta').expect(403);

    selectedActorId = tenantWideManageActorId;
    await request(app.getHttpServer()).get('/network/catalog-meta').expect(403);

    selectedActorId = tenantWideReadActorId;
    await request(app.getHttpServer())
      .get('/network/catalog-meta')
      .expect(200)
      .expect({ ipProtection: 'PENDING' });
  });

  it('oculta con el mismo 404 la red cuyo router está inactivo y la referencia inexistente', async () => {
    const networkBody = {
      routerId: routerAId,
      name: 'Network for inactive router',
      cidr: '192.0.2.0/24',
      gateway: '192.0.2.1',
      assignableFrom: '192.0.2.10',
      assignableTo: '192.0.2.20',
      defaultControlMethod: CONTROL_METHODS[0],
    };
    await dataSource.query(
      `UPDATE "${schemaName}".network_routers
          SET status = 'INACTIVE', supported_control_methods = $1
        WHERE id = $2`,
      [[CONTROL_METHODS[0]], routerAId],
    );

    try {
      const inactiveRouter = await request(app.getHttpServer())
        .post('/network/ipv4-networks')
        .send(networkBody)
        .expect(404);
      const missingRouter = await request(app.getHttpServer())
        .post('/network/ipv4-networks')
        .send({ ...networkBody, routerId: randomUUID() })
        .expect(404);

      expect(inactiveRouter.body).toEqual(missingRouter.body);
      expect(inactiveRouter.body).toEqual({
        message: 'La referencia no está disponible para esta operación.',
        code: 'RESOURCE_NOT_FOUND',
      });
      const networks = (await dataSource.query(
        `SELECT COUNT(*)::integer AS count FROM "${schemaName}".ipv4_networks`,
      )) as Array<{ count: number }>;
      expect(networks[0]?.count).toBe(0);
    } finally {
      await dataSource.query(
        `UPDATE "${schemaName}".network_routers
            SET status = 'ACTIVE', supported_control_methods = $1
          WHERE id = $2`,
        [[CONTROL_METHODS[0]], routerAId],
      );
    }
  });

  it('rechaza con 409 referencias propietarias ya inactivas y no persiste asociaciones', async () => {
    await dataSource.query(
      `UPDATE "${schemaName}".organization_sites SET is_active = false WHERE id = $1`,
      [siteAId],
    );
    await expect(
      TenantContext.run(context(), () =>
        catalogService.createRouter(createRouterInput('Inactive site fixture'), actorId),
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: 'SITE_OR_NODE_INACTIVE' } });
    let rows = (await dataSource.query(
      `SELECT id FROM "${schemaName}".network_routers WHERE name = $1`,
      ['Inactive site fixture'],
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(0);

    await dataSource.query(
      `UPDATE "${schemaName}".organization_sites SET is_active = true WHERE id = $1`,
      [siteAId],
    );
    await dataSource.query(
      `UPDATE "${schemaName}".commercial_nodes SET is_active = false WHERE id = $1`,
      [commercialNodeId],
    );
    await expect(
      TenantContext.run(context(), () =>
        catalogService.createRouter(
          createRouterInput('Inactive node fixture', { nodeId: commercialNodeId }),
          actorId,
        ),
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: 'SITE_OR_NODE_INACTIVE' } });
    rows = (await dataSource.query(
      `SELECT id FROM "${schemaName}".network_routers WHERE name = $1`,
      ['Inactive node fixture'],
    )) as Array<{ id: string }>;
    expect(rows).toHaveLength(0);
  });

  it('mantiene la referencia leída activa aunque el owner la desactive mientras MOD13 espera', async () => {
    let reachedOwnerRead!: () => void;
    let continueNetwork!: () => void;
    const ownerReadReached = new Promise<void>((resolve) => {
      reachedOwnerRead = resolve;
    });
    const continueAfterOwnerRead = new Promise<void>((resolve) => {
      continueNetwork = resolve;
    });
    const originalFindSite = organizationSiteReadAdapter.findReferenceById.bind(
      organizationSiteReadAdapter,
    );
    const siteReadSpy = jest
      .spyOn(organizationSiteReadAdapter, 'findReferenceById')
      .mockImplementationOnce(async (siteId) => {
        const reference = await originalFindSite(siteId);
        reachedOwnerRead();
        await continueAfterOwnerRead;
        return reference;
      });

    const creation = TenantContext.run(context(), () =>
      catalogService.createRouter(createRouterInput('Site deactivated after read'), actorId),
    );
    await ownerReadReached;
    await dataSource.query(
      `UPDATE "${schemaName}".organization_sites SET is_active = false WHERE id = $1`,
      [siteAId],
    );
    continueNetwork();
    const created = await creation;
    siteReadSpy.mockRestore();

    expect(created.organizationSiteId).toBe(siteAId);
    const siteRows = (await dataSource.query(
      `SELECT is_active FROM "${schemaName}".organization_sites WHERE id = $1`,
      [siteAId],
    )) as Array<{ is_active: boolean }>;
    expect(siteRows[0]?.is_active).toBe(false);
    const routerRows = (await dataSource.query(
      `SELECT organization_site_id FROM "${schemaName}".network_routers WHERE id = $1`,
      [created.id],
    )) as Array<{ organization_site_id: string }>;
    expect(routerRows[0]?.organization_site_id).toBe(siteAId);
  });

  it('mantiene la referencia de nodo leída activa aunque el owner lo desactive mientras MOD13 espera', async () => {
    let reachedOwnerRead!: () => void;
    let continueNetwork!: () => void;
    const ownerReadReached = new Promise<void>((resolve) => {
      reachedOwnerRead = resolve;
    });
    const continueAfterOwnerRead = new Promise<void>((resolve) => {
      continueNetwork = resolve;
    });
    const originalFindNode =
      commercialNodeReadAdapter.findReferenceById.bind(commercialNodeReadAdapter);
    const nodeReadSpy = jest
      .spyOn(commercialNodeReadAdapter, 'findReferenceById')
      .mockImplementationOnce(async (id) => {
        const reference = await originalFindNode(id);
        reachedOwnerRead();
        await continueAfterOwnerRead;
        return reference;
      });

    const creation = TenantContext.run(context(), () =>
      catalogService.createRouter(
        createRouterInput('Node deactivated after read', { nodeId: commercialNodeId }),
        actorId,
      ),
    );
    await ownerReadReached;
    await dataSource.query(
      `UPDATE "${schemaName}".commercial_nodes SET is_active = false WHERE id = $1`,
      [commercialNodeId],
    );
    continueNetwork();
    const created = await creation;
    nodeReadSpy.mockRestore();

    expect(created.commercialNodeId).toBe(commercialNodeId);
    const nodeRows = (await dataSource.query(
      `SELECT is_active FROM "${schemaName}".commercial_nodes WHERE id = $1`,
      [commercialNodeId],
    )) as Array<{ is_active: boolean }>;
    expect(nodeRows[0]?.is_active).toBe(false);
    const routerRows = (await dataSource.query(
      `SELECT commercial_node_id FROM "${schemaName}".network_routers WHERE id = $1`,
      [created.id],
    )) as Array<{ commercial_node_id: string }>;
    expect(routerRows[0]?.commercial_node_id).toBe(commercialNodeId);
  });
});
