/**
 * Tests de UsersService.updateMe — Ola 2 (P-07, condicion ADR-086 §5).
 *
 * Fija los invariantes:
 * - La auditoria de perfil propio va con `await` dentro de `runInTenantSchema`
 *   (igual que create/update/remove/resetPassword) y registra QUE cambio via
 *   `newValue.changedFields`.
 * - `changedFields` sobrevive a `sanitizeAuditPayload` mientras que los valores
 *   PII (e incluso un marcador por campo) se redactan — justificacion
 *   documentada de no persistir valores.
 *
 * SEGURIDAD: Sin PII real — todos los datos son ficticios de prueba.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DocumentType, UserRole, UserStatus, USERS_BULK_CREATE_QUEUE } from '@iwana/shared';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
import { sanitizeAuditPayload } from '../audit/audit-sanitize.policy';
import { SearchQueueService } from '../search/search-queue.service';
import { TenantService } from '../tenant/tenant.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';

jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs') as Record<string, unknown>;
  return {
    ...actual,
    compare: jest.fn(),
    hash: jest.fn(async (value: string) => `hashed:${value}`),
  };
});

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

const MOCK_TENANT_CTX = {
  tenantId: 'ten-00000000-0000-4000-a000-000000000001',
  schemaName: 'tenant_test',
  tenantSlug: 'test',
};

function buildUserEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'usr-00000000-0000-4000-a000-000000000001',
    email: 'usuario@empresa.com',
    emailHash: 'hash-mock',
    passwordHash: 'hashed-pw',
    role: UserRole.NOC,
    status: UserStatus.ACTIVE,
    tenantId: MOCK_TENANT_CTX.tenantId,
    mfaEnabled: false,
    mfaRequired: false,
    isOperationalResource: false,
    passwordResetRequired: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    emailVerified: true,
    emailVerificationToken: null,
    firstName: 'Nombre',
    lastName: 'Apellido',
    phone: '+573001234567',
    jobTitle: 'Soporte',
    documentType: DocumentType.CC,
    documentNumber: '12345678',
    avatarUrl: null,
    ...overrides,
  };
}

type ManagerMocks = Record<string, jest.Mock>;

function setupRunInTenantSchema(overrides: Partial<ManagerMocks> = {}): ManagerMocks {
  const manager: ManagerMocks = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((_e: unknown, data: unknown) => data),
    save: jest
      .fn()
      .mockImplementation(async (_e: unknown, entity: Record<string, unknown>) => entity),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };

  mockRunInTenantSchema.mockImplementation(
    async (
      _ds: unknown,
      _schema: string,
      callback: (qr: { manager: ManagerMocks }) => Promise<unknown>,
    ) => callback({ manager }),
  );

  return manager;
}

describe('UsersService.updateMe (Ola 2, P-07)', () => {
  let service: UsersService;
  let auditServiceMock: { log: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(MOCK_TENANT_CTX);

    auditServiceMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
        {
          provide: TenantService,
          useValue: {
            updateTenantSelfProfile: jest.fn(),
            getPrincipalAdminUserId: jest.fn().mockResolvedValue(null),
            setPrincipalAdminUserId: jest.fn(),
          },
        },
        {
          provide: SearchQueueService,
          useValue: { enqueueUserUpsert: jest.fn(), enqueueUserDelete: jest.fn() },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { invalidateUserPermissions: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailerService, useValue: { sendMail: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn(), set: jest.fn() } },
        {
          provide: getQueueToken(USERS_BULK_CREATE_QUEUE),
          useValue: { add: jest.fn(), getJob: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('audita con await dentro de la transaccion y registra los campos tocados', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId });
    const manager = setupRunInTenantSchema({
      findOne: jest.fn().mockResolvedValue(entity),
    });

    const result = await service.updateMe(
      actorId,
      { firstName: 'Otro', phone: null },
      '198.51.100.10',
    );

    // El borrado con null aplica (semantica informe §3.3).
    expect(result.firstName).toBe('Otro');
    expect(result.phone).toBeNull();

    // Auditoria: un solo llamado, con await (resuelto al retornar), con la
    // lista de campos — y despues del save dentro del mismo QR.
    expect(auditServiceMock.log).toHaveBeenCalledTimes(1);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'UserProfile',
        entityId: actorId,
        userId: actorId,
        newValue: { changedFields: ['firstName', 'phone'] },
        ipAddress: '198.51.100.10',
      }),
    );
    expect(manager.save).toHaveBeenCalled();
    expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
  });

  it('registra changedFields vacio cuando no hay cambios reales', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId });
    setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });

    await service.updateMe(actorId, { firstName: 'Nombre' }, '198.51.100.10');

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: { changedFields: [] } }),
    );
  });

  it('changedFields sobrevive al saneado mientras los valores PII se redactan', () => {
    // Justificacion PIN del formato elegido (ver comentario en updateMe).
    const sanitized = sanitizeAuditPayload({
      changedFields: ['firstName', 'phone', 'documentNumber'],
    });
    expect(sanitized).toEqual({ changedFields: ['firstName', 'phone', 'documentNumber'] });

    const redacted = sanitizeAuditPayload({
      firstName: 'Nombre',
      phone: '+573001234567',
      documentNumber: '12345678',
    });
    expect(redacted).toEqual({});

    const markers = sanitizeAuditPayload({ firstName: 'changed', phone: 'changed' });
    expect(markers).toEqual({});
  });
});
