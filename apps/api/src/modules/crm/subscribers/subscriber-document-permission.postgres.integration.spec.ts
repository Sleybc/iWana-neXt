import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  AccessProfile,
  AccessProfilePermission,
  dataSourceOptions,
  TenantContext,
  User,
  UserAccessProfile,
} from '@iwana/db';
import {
  AccessPermissionKey,
  CustomerSegment,
  DocumentType,
  PersonType,
  SubscriberStatus,
  UserRole,
  VatTreatment,
} from '@iwana/shared';
import {
  applyTenantMigrationsInOrder,
  createTenantDataSource,
} from '../../../../../../packages/database/src/migrations/tenant/runner';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SubscribersController } from './subscribers.controller';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
if (dbAvailable && !/^(test|iwana_it_[a-z0-9_]+)$/u.test(process.env['DB_NAME'] ?? '')) {
  throw new Error('Permiso del documento: DB_NAME debe ser test o iwana_it_*.');
}
jest.setTimeout(900_000);

const PERMISSION = AccessPermissionKey.CRM_SUBSCRIBERS_DOCUMENT_READ;
const tenantId = randomUUID();
const schemaName = `tenant_mod05_docperm_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

/** Suscriptor ya descifrado que devuelve el servicio; el número es sintético. */
const subscriber = {
  id: randomUUID(),
  tenantId,
  partyId: null,
  userId: null,
  personType: PersonType.NATURAL,
  customerSegment: CustomerSegment.RESIDENTIAL,
  vatTreatment: VatTreatment.STANDARD,
  documentType: DocumentType.CC,
  documentNumber: '1020304050',
  firstName: 'Titular',
  lastName: 'Sintético',
  stratum: 3,
  status: SubscriberStatus.ACTIVE,
  emailEncrypted: 'cifrado',
  phoneEncrypted: null,
  rutResponsibilities: [],
  createdAt: new Date('2026-11-10T12:00:00.000Z'),
  updatedAt: new Date('2026-11-10T12:00:00.000Z'),
};

describeWithDb('Permiso crm.subscribers.document.read: catálogo migrado y API', () => {
  let dataSource: DataSource;
  let controller: SubscribersController;
  const audit = { log: jest.fn().mockResolvedValue(undefined), logWithin: jest.fn() };
  const subscribersService = {
    findById: jest.fn(async () => ({ ...subscriber })),
    search: jest.fn(async () => [{ ...subscriber }]),
    update: jest.fn(async () => ({ ...subscriber })),
  };

  const withTenant = <T>(callback: () => Promise<T>): Promise<T> =>
    TenantContext.run({ tenantId, schemaName, tenantSlug: 'docperm-fixture' }, callback);

  async function insertUser(role: UserRole, templateName: string | null): Promise<JwtPayload> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO "${schemaName}".users
        (id, email, email_hmac, password_hash, role, status, tenant_id)
       VALUES ($1, $2, $3, 'test-only-hash', $4, 'ACTIVE', $5)`,
      [
        id,
        `${id}@example.invalid`,
        randomUUID().replaceAll('-', '').padEnd(64, '0'),
        role,
        tenantId,
      ],
    );
    if (templateName) {
      await dataSource.query(
        `INSERT INTO "${schemaName}".user_access_profiles
          (id, tenant_id, user_id, profile_id, valid_from, is_active)
         SELECT $1, $2, $3, id, CURRENT_DATE, true
           FROM "${schemaName}".access_profiles
          WHERE tenant_id = $2 AND name = $4 AND deleted_at IS NULL`,
        [randomUUID(), tenantId, id, templateName],
      );
    }
    return {
      sub: id,
      email: 'hash',
      role,
      tenantId,
      schemaName,
      jti: randomUUID(),
      type: 'tenant',
    };
  }

  beforeAll(async () => {
    dataSource = new DataSource({
      ...dataSourceOptions,
      entities: [User, UserAccessProfile, AccessProfile, AccessProfilePermission],
      migrations: [],
      logging: false,
      extra: { ...dataSourceOptions.extra, max: 3, min: 1 },
    });
    await dataSource.initialize();
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Permiso documento sintético', $2, $3, 'ACTIVE', 'docperm@example.invalid')`,
      [tenantId, `docperm-${tenantId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query(`CREATE SCHEMA "${schemaName}"`);
    const tenantDataSource = createTenantDataSource(
      dataSource,
      schemaName,
      `docperm-${tenantId.slice(0, 8)}`,
    );
    await tenantDataSource.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDataSource);
    } finally {
      await tenantDataSource.destroy();
    }

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    controller = new SubscribersController(
      subscribersService as never,
      audit as never,
      new EffectivePermissionsService(dataSource, redis as never),
      {} as never,
      { activeMarks: jest.fn().mockResolvedValue({}) } as never,
      dataSource,
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('la cadena de migraciones concede el permiso solo a las cuatro plantillas estándar', async () => {
    const rows = (await dataSource.query(
      `SELECT p.name FROM "${schemaName}".access_profile_permissions app
         JOIN "${schemaName}".access_profiles p ON p.id = app.profile_id
        WHERE app.tenant_id = $1 AND app.permission_key = $2
        ORDER BY p.name`,
      [tenantId, PERMISSION],
    )) as Array<{ name: string }>;
    expect(rows.map(({ name }) => name)).toEqual([
      'Acceso estándar Comercial',
      'Acceso estándar Contable',
      'Acceso estándar Soporte',
      'Administrador general',
    ]);
    const catalog = (await dataSource.query(
      `SELECT availability, is_active FROM "${schemaName}".access_permission_catalog
        WHERE tenant_id = $1 AND permission_key = $2`,
      [tenantId, PERMISSION],
    )) as unknown[];
    expect(catalog).toEqual([{ availability: 'ASSIGNABLE', is_active: true }]);
  });

  it.each([
    [UserRole.SALES, 'Acceso estándar Comercial'],
    [UserRole.SUPPORT, 'Acceso estándar Soporte'],
    [UserRole.ACCOUNTANT, 'Acceso estándar Contable'],
  ])('%s con su plantilla estándar ve el documento completo', async (role, template) => {
    const user = await insertUser(role, template);

    const { data } = await withTenant(() => controller.findById(subscriber.id, user));

    expect(data.documentNumber).toBe('1020304050');
    expect(data.documentNumberRestricted).toBe(false);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RECORD_ACCESS',
        newValue: expect.objectContaining({ documentNumberAccess: 'FULL' }),
      }),
    );
  });

  it('ADMIN lo recibe por la línea base aunque no tenga plantilla asignada', async () => {
    const user = await insertUser(UserRole.ADMIN, null);

    const { data } = await withTenant(() => controller.findById(subscriber.id, user));

    expect(data.documentNumber).toBe('1020304050');
  });

  it('TECHNICIAN con su plantilla estándar lo recibe enmascarado y auditado como MASKED', async () => {
    const user = await insertUser(UserRole.TECHNICIAN, 'Acceso estándar Técnico');

    const { data } = await withTenant(() => controller.findById(subscriber.id, user));

    expect(data.documentNumber).toBe('••••••4050');
    expect(data.documentNumberRestricted).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ documentNumberAccess: 'MASKED' }),
      }),
    );
  });

  it('si el administrador retira el permiso de la plantilla Comercial, SALES pasa a enmascarado y no puede cambiarlo', async () => {
    await dataSource.query(
      `DELETE FROM "${schemaName}".access_profile_permissions app
        USING "${schemaName}".access_profiles p
        WHERE p.id = app.profile_id AND p.name = 'Acceso estándar Comercial'
          AND app.permission_key = $1`,
      [PERMISSION],
    );
    const user = await insertUser(UserRole.SALES, 'Acceso estándar Comercial');

    const { data } = await withTenant(() => controller.findById(subscriber.id, user));
    expect(data).toMatchObject({ documentNumber: '••••••4050', documentNumberRestricted: true });

    await expect(
      withTenant(() =>
        controller.update(subscriber.id, { documentNumber: '5040302010' } as never, user),
      ),
    ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_DOCUMENT_WRITE_FORBIDDEN' } });
    expect(subscribersService.update).not.toHaveBeenCalled();
  });
});
