import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { NextFunction, Request as ExpressRequest, Response } from 'express';
import JSZip from 'jszip';
import request from 'supertest';
import { STORAGE_PORT } from '@iwana/storage';
import {
  AccessPermissionKey,
  MIGRATION_IMPORT_LIMITS,
  MIGRATION_IMPORT_QUEUE,
  TenantStatus,
  UserRole,
} from '@iwana/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JWT_CLAIMS_BY_TOKEN_TYPE } from '../auth/auth.constants';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantMiddleware } from '../tenant/tenant.middleware';
import { TenantService } from '../tenant/tenant.service';
import { MigrationBatchesController, MigrationMappingsController } from './migration.controller';
import { MigrationBatchesService } from './migration-batches.service';
import { MigrationCrypto } from './migration-crypto';
import { MigrationMappingsService } from './migration-mappings.service';
import { MigrationPromotionService } from './migration-promotion.service';
import { MigrationRevertService } from './migration-revert.service';
import { buildSyntheticUispZip } from './test/uisp-zip.fixture';

const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const tenantId = '68000000-0000-4000-8000-000000000001';
const schemaName = 'tenant_migration_guard_test';
const adminId = '68000000-0000-4000-8000-000000000010';
const adminWithoutPermissionId = '68000000-0000-4000-8000-000000000011';
const nocId = '68000000-0000-4000-8000-000000000012';
const tenant = { id: tenantId, schemaName, slug: 'migration-guard', status: TenantStatus.ACTIVE };

/**
 * Seguridad HTTP de la importación (ADR-110 D9): solo ADMIN con `migration.import.manage`;
 * tipo, tamaño, cantidad y ZIP malicioso se rechazan antes de tocar storage o la base.
 */
describe('Importación UISP — seguridad HTTP', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  const storage = { putObject: jest.fn(), deleteObject: jest.fn() };
  const queue = { add: jest.fn() };
  const audit = { log: jest.fn(), logWithin: jest.fn() };
  const promotion = {
    requestPromotion: jest.fn(async (_scope: unknown, id: string) => ({ id, status: 'CARGADO' })),
    reconcile: jest.fn(),
  };
  const reversion = { revert: jest.fn() };
  const queries: string[] = [];
  const fakeQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {},
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (sql.includes('INSERT INTO migration_batches')) {
        return [
          {
            id: params[0],
            source: 'UISP_ZIP',
            status: 'SIMULADO',
            counts: JSON.parse(params[2] as string),
            rejections: {},
            created_by: params[4],
            created_at: new Date('2026-11-12T10:00:00Z'),
            purge_after: new Date('2026-12-12T10:00:00Z'),
            purged_at: null,
          },
        ];
      }
      return [];
    }),
  };
  const dataSource = { createQueryRunner: () => fakeQueryRunner };
  const effectivePermissions = {
    getEffectivePermissionsForUser: jest.fn(async (userId: string) =>
      userId === adminWithoutPermissionId ? [] : [AccessPermissionKey.MIGRATION_IMPORT_MANAGE],
    ),
  };
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '34'.repeat(32),
    MFA_ENCRYPTION_KEY: '56'.repeat(32),
    PII_HASH_KEY: '78'.repeat(32),
    NODE_ENV: 'test',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          privateKey: keyPair.privateKey,
          publicKey: keyPair.publicKey,
          signOptions: { algorithm: 'RS256' },
          verifyOptions: { algorithms: ['RS256'] },
        }),
      ],
      controllers: [MigrationBatchesController, MigrationMappingsController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        RolesGuard,
        PermissionsGuard,
        TenantMiddleware,
        MigrationBatchesService,
        { provide: MigrationCrypto, useValue: new MigrationCrypto(config) },
        { provide: ConfigService, useValue: { getOrThrow: () => keyPair.publicKey } },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn().mockResolvedValue(null) } },
        {
          provide: TenantService,
          useValue: {
            findById: jest.fn().mockResolvedValue(tenant),
            findBySlug: jest.fn().mockResolvedValue(tenant),
          },
        },
        { provide: EffectivePermissionsService, useValue: effectivePermissions },
        { provide: AuditService, useValue: audit },
        { provide: STORAGE_PORT, useValue: storage },
        { provide: getQueueToken(MIGRATION_IMPORT_QUEUE), useValue: queue },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: MigrationMappingsService, useValue: { list: jest.fn().mockResolvedValue([]) } },
        { provide: MigrationPromotionService, useValue: promotion },
        { provide: MigrationRevertService, useValue: reversion },
      ],
    }).compile();

    jwtService = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    const tenantMiddleware = moduleRef.get(TenantMiddleware);
    app.use((req: ExpressRequest, res: Response, next: NextFunction) => {
      void tenantMiddleware.use(req, res, next).catch(next);
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queries.length = 0;
  });

  function token(role: string, sub: string): string {
    const claims = JWT_CLAIMS_BY_TOKEN_TYPE.tenant;
    return jwtService.sign(
      {
        sub,
        email: 'a'.repeat(64),
        role,
        tenantId,
        schemaName,
        jti: `migration-${randomUUID()}`,
        type: 'tenant',
      },
      { issuer: claims.issuer, audience: claims.audience },
    );
  }

  function upload(sub: string, role: string = UserRole.ADMIN) {
    return request(app.getHttpServer())
      .post('/migration/batches')
      .set('Authorization', `Bearer ${token(role, sub)}`)
      .set('X-Tenant-Slug', tenant.slug);
  }

  it('monta JwtAuthGuard, RolesGuard y PermissionsGuard en ambos controladores', () => {
    for (const controller of [MigrationBatchesController, MigrationMappingsController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
      ]);
    }
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).get('/migration/batches').expect(401);
  });

  it('un rol distinto de ADMIN recibe 403 aunque tenga el permiso', async () => {
    await upload(nocId, UserRole.NOC)
      .attach('files', await buildSyntheticUispZip(), 'cliente.zip')
      .expect(403);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('ADMIN sin migration.import.manage recibe 403', async () => {
    await upload(adminWithoutPermissionId)
      .attach('files', await buildSyntheticUispZip(), 'cliente.zip')
      .expect(403);
    await request(app.getHttpServer())
      .get('/migration/mappings')
      .set('Authorization', `Bearer ${token(UserRole.ADMIN, adminWithoutPermissionId)}`)
      .set('X-Tenant-Slug', tenant.slug)
      .expect(403);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('ADMIN con permiso crea el lote: ZIP cifrado, auditoría y job sin PII', async () => {
    const zip = await buildSyntheticUispZip();
    const response = await upload(adminId)
      .attach('files', zip, 'cliente-a.zip')
      .attach('files', await buildSyntheticUispZip({ clientId: 9002 }), 'cliente-b.zip')
      .expect(202);
    expect(response.body.data).toMatchObject({
      status: 'SIMULADO',
      processing: 'PENDIENTE',
      filesReceived: 2,
      createdBy: adminId,
    });
    const batchId = response.body.data.id as string;
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    const [key, body] = storage.putObject.mock.calls[0] as [string, Buffer];
    expect(key).toBe(`${schemaName}/migration/${batchId}/0.zip.enc`);
    expect(body.subarray(0, 4).toString('ascii')).toBe('IWE1');
    expect(body.includes(zip.subarray(0, 64))).toBe(false);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'MigrationBatch',
        entityId: batchId,
      }),
      fakeQueryRunner.manager,
    );
    expect(queue.add).toHaveBeenCalledWith(
      'simulate-batch',
      { version: 1, tenantId, batchId },
      expect.objectContaining({ jobId: `migration-simulate-${batchId}` }),
    );
    expect(fakeQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(queries.some((sql) => sql.includes('SET LOCAL search_path'))).toBe(true);
  });

  it('si no se puede encolar, revierte la transacción y borra los objetos (503)', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis caído'));
    const response = await upload(adminId)
      .attach('files', await buildSyntheticUispZip(), 'cliente.zip')
      .expect(503);
    expect(response.body.code ?? response.body.message?.code).toBeDefined();
    expect(fakeQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
  });

  it('sin archivos responde 400 MIGRATION_FILES_REQUIRED', async () => {
    const response = await upload(adminId).expect(400);
    expect(JSON.stringify(response.body)).toContain('MIGRATION_FILES_REQUIRED');
  });

  it('un archivo que no es ZIP responde 400 sin tocar storage', async () => {
    const response = await upload(adminId)
      .attach('files', Buffer.from('%PDF-1.4 falso'), 'cliente.zip')
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('MIGRATION_FILE_TYPE_NOT_ALLOWED');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('un ZIP con extensión distinta responde 400', async () => {
    const response = await upload(adminId)
      .attach('files', await buildSyntheticUispZip(), 'cliente.exe')
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('MIGRATION_FILE_TYPE_NOT_ALLOWED');
  });

  it('un ZIP con path traversal responde 400 MIGRATION_ZIP_REJECTED', async () => {
    const zip = new JSZip();
    zip.file('client.json', '{"id":1}');
    zip.file('../../etc/cron.d/x', 'malicioso');
    const response = await upload(adminId)
      .attach('files', await zip.generateAsync({ type: 'nodebuffer' }), 'cliente.zip')
      .expect(400);
    expect(JSON.stringify(response.body)).toContain('ZIP_RUTA_NO_PERMITIDA');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('una bomba de compresión responde 400 sin descomprimirla', async () => {
    const zip = new JSZip();
    zip.file('client.json', '{"id":1}');
    zip.file('relleno.bin', Buffer.alloc(30 * 1024 * 1024));
    const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(bomb.length).toBeLessThan(MIGRATION_IMPORT_LIMITS.maxZipBytes);
    const response = await upload(adminId).attach('files', bomb, 'cliente.zip').expect(400);
    expect(JSON.stringify(response.body)).toContain('ZIP_COMPRESION_SOSPECHOSA');
  });

  it('más ZIP de los permitidos por lote se rechaza', async () => {
    const zip = await buildSyntheticUispZip();
    let req = upload(adminId);
    for (let index = 0; index <= MIGRATION_IMPORT_LIMITS.maxZipsPerBatch; index += 1) {
      req = req.attach('files', zip, `cliente-${index}.zip`);
    }
    const response = await req;
    expect([400, 413]).toContain(response.status);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  function post(path: string, sub: string, role: string = UserRole.ADMIN) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(role, sub)}`)
      .set('X-Tenant-Slug', tenant.slug);
  }

  it('promover, conciliar y revertir exigen ADMIN con migration.import.manage', async () => {
    const id = randomUUID();
    for (const action of ['promote', 'reconcile', 'revert']) {
      await post(`/migration/batches/${id}/${action}`, nocId, UserRole.NOC).expect(403);
      await post(`/migration/batches/${id}/${action}`, adminWithoutPermissionId).expect(403);
      await request(app.getHttpServer()).post(`/migration/batches/${id}/${action}`).expect(401);
    }
    expect(promotion.requestPromotion).not.toHaveBeenCalled();
    expect(promotion.reconcile).not.toHaveBeenCalled();
    expect(reversion.revert).not.toHaveBeenCalled();
  });

  it('promover responde 202 con el tenant del JWT y el actor', async () => {
    const id = randomUUID();
    const response = await post(`/migration/batches/${id}/promote`, adminId).expect(202);
    expect(response.body.data).toEqual({ id, status: 'CARGADO' });
    expect(promotion.requestPromotion).toHaveBeenCalledWith({ tenantId, schemaName }, id, adminId);
  });

  it('conciliar y revertir delegan con el tenant del JWT; un id no UUID responde 400', async () => {
    const id = randomUUID();
    promotion.reconcile.mockResolvedValueOnce({ resultado: 'CONCILIADO' });
    reversion.revert.mockResolvedValueOnce({ id, status: 'REVERTIDO' });
    await post(`/migration/batches/${id}/reconcile`, adminId).expect(200);
    await post(`/migration/batches/${id}/revert`, adminId).expect(200);
    expect(promotion.reconcile).toHaveBeenCalledWith({ tenantId, schemaName }, id, adminId);
    expect(reversion.revert).toHaveBeenCalledWith({ tenantId, schemaName }, id, adminId);
    await post('/migration/batches/no-es-uuid/revert', adminId).expect(400);
  });

  it('el id de lote no UUID responde 400', async () => {
    await request(app.getHttpServer())
      .get('/migration/batches/no-es-uuid')
      .set('Authorization', `Bearer ${token(UserRole.ADMIN, adminId)}`)
      .set('X-Tenant-Slug', tenant.slug)
      .expect(400);
  });
});
