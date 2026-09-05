/**
 * Tests de UsersService.changeLoginEmail — Ola 2 (P-02, P-09, C-2).
 *
 * Fija los invariantes:
 * - P-02: el cambio de email resetea `emailVerified`, genera token de
 *   re-verificacion, avisa a la direccion anterior sin exponer el email nuevo
 *   ni PII adicional, y envia la re-verificacion al email nuevo.
 * - C-2: el servidor decide la sincronizacion del contacto de la empresa
 *   (ignora `syncCompanyContactEmail` del cliente).
 * - P-09: contador de fallos de `currentPassword` por cuenta + lockout.
 *
 * SEGURIDAD: Sin PII real — todos los datos son ficticios de prueba.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, UserRole, UserStatus, USERS_BULK_CREATE_QUEUE } from '@iwana/shared';
import { UsersService } from './users.service';
import { hashEmail } from '../../common/crypto/hash-email.util';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
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
    email: 'anterior@empresa.com',
    emailHash: 'hash-anterior',
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
    firstName: null,
    lastName: null,
    phone: null,
    jobTitle: null,
    documentType: null,
    documentNumber: null,
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

describe('UsersService.changeLoginEmail (Ola 2)', () => {
  let service: UsersService;
  let auditServiceMock: { log: jest.Mock };
  let tenantServiceMock: { updateTenantSelfProfile: jest.Mock; getPrincipalAdminUserId: jest.Mock };
  let mailerServiceMock: { sendMail: jest.Mock };
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    mockRunInTenantSchema.mockReset();
    mockTenantContextGetOrThrow.mockReset();
    mockTenantContextGetOrThrow.mockReturnValue(MOCK_TENANT_CTX);

    auditServiceMock = { log: jest.fn().mockResolvedValue(undefined) };
    tenantServiceMock = {
      updateTenantSelfProfile: jest.fn().mockResolvedValue(undefined),
      getPrincipalAdminUserId: jest.fn().mockResolvedValue(null),
    };
    mailerServiceMock = { sendMail: jest.fn().mockResolvedValue(undefined) };
    configServiceMock = {
      get: jest.fn().mockImplementation((key: string, def?: unknown) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3001';
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: {} },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: TenantService, useValue: tenantServiceMock },
        {
          provide: SearchQueueService,
          useValue: { enqueueUserUpsert: jest.fn(), enqueueUserDelete: jest.fn() },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { invalidateUserPermissions: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MailerService, useValue: mailerServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: REDIS_CLIENT, useValue: { get: jest.fn(), set: jest.fn() } },
        {
          provide: getQueueToken(USERS_BULK_CREATE_QUEUE),
          useValue: { add: jest.fn(), getJob: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('P-02: resetea emailVerified, genera token y avisa sin exponer el email nuevo', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId });
    setupRunInTenantSchema({
      findOne: jest.fn().mockResolvedValueOnce(entity).mockResolvedValueOnce(null),
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

    const result = await service.changeLoginEmail(
      actorId,
      { email: 'nuevo@empresa.com', currentPassword: 'Actual1!Segura' },
      actorId,
    );

    expect(result.email).toBe('nuevo@empresa.com');
    expect(result.emailVerified).toBe(false);
    expect(entity['emailVerificationToken']).toEqual(expect.any(String));

    // Aviso a la direccion anterior: sin el email nuevo ni PII adicional.
    const sentMails = mailerServiceMock.sendMail.mock.calls.map(
      (call) => call[0] as { to: string; subject: string; html: string; text: string },
    );
    const noticeCall = sentMails.find((mail) => mail.to === 'anterior@empresa.com');
    expect(noticeCall).toBeDefined();
    expect(noticeCall?.subject).not.toContain('nuevo@empresa.com');
    expect(noticeCall?.html).not.toContain('nuevo@empresa.com');
    expect(noticeCall?.text).not.toContain('nuevo@empresa.com');

    // Re-verificacion al email nuevo con el token generado.
    const verifyCall = sentMails.find((mail) => mail.to === 'nuevo@empresa.com');
    expect(verifyCall).toBeDefined();
    expect(verifyCall?.html).toContain(String(entity['emailVerificationToken']));

    // Auditoria: el reseteo y el aviso quedan trazados sin PII.
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'UserLoginEmail',
        newValue: expect.objectContaining({
          loginEmailChanged: true,
          emailVerifiedReset: true,
          previousAddressNotified: true,
        }),
      }),
    );
  });

  it('P-02: no envia correos cuando el email no cambia', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({
      id: actorId,
      emailHash: hashEmail('anterior@empresa.com'),
    });
    setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

    await service.changeLoginEmail(
      actorId,
      { email: 'anterior@empresa.com', currentPassword: 'Actual1!Segura' },
      actorId,
    );

    // Sin cambio no hay token nuevo ni correos.
    expect(entity['emailVerificationToken']).toBeNull();
    expect(mailerServiceMock.sendMail).not.toHaveBeenCalled();
  });

  it('C-2: el servidor ignora syncCompanyContactEmail=false cuando es principal', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId });
    setupRunInTenantSchema({
      findOne: jest.fn().mockResolvedValueOnce(entity).mockResolvedValueOnce(null),
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
    tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue(actorId);

    await service.changeLoginEmail(
      actorId,
      {
        email: 'nuevo@empresa.com',
        currentPassword: 'Actual1!Segura',
        syncCompanyContactEmail: false,
      },
      actorId,
    );

    // El flag del cliente se ignora: el servidor decide por designacion.
    expect(tenantServiceMock.updateTenantSelfProfile).toHaveBeenCalledWith(
      MOCK_TENANT_CTX.tenantId,
      { contactEmail: 'nuevo@empresa.com' },
      actorId,
    );
  });

  it('C-2: no sincroniza cuando no es principal aunque el flag sea true', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId });
    setupRunInTenantSchema({
      findOne: jest.fn().mockResolvedValueOnce(entity).mockResolvedValueOnce(null),
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
    tenantServiceMock.getPrincipalAdminUserId.mockResolvedValue('usr-otro-principal');

    await service.changeLoginEmail(
      actorId,
      {
        email: 'nuevo@empresa.com',
        currentPassword: 'Actual1!Segura',
        syncCompanyContactEmail: true,
      },
      actorId,
    );

    expect(tenantServiceMock.updateTenantSelfProfile).not.toHaveBeenCalled();
  });

  it('P-09: cuenta el fallo de currentPassword y bloquea al quinto intento', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({ id: actorId, failedLoginAttempts: 4, lockedUntil: null });
    const manager = setupRunInTenantSchema({
      findOne: jest.fn().mockResolvedValue(entity),
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changeLoginEmail(
        actorId,
        { email: 'nuevo@empresa.com', currentPassword: 'Clave1!Errada' },
        actorId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      actorId,
      expect.objectContaining({ failedLoginAttempts: 5, lockedUntil: expect.any(Date) }),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.ACCOUNT_LOCKED }),
    );
  });

  it('P-09: rechaza con 401 cuando la cuenta esta en lockout', async () => {
    const actorId = 'usr-00000000-0000-4000-a000-000000000001';
    const entity = buildUserEntity({
      id: actorId,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
    });
    setupRunInTenantSchema({ findOne: jest.fn().mockResolvedValue(entity) });
    (bcrypt.compare as unknown as jest.Mock).mockClear();
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

    await expect(
      service.changeLoginEmail(
        actorId,
        { email: 'nuevo@empresa.com', currentPassword: 'Actual1!Segura' },
        actorId,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});
