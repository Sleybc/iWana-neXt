/**
 * Ola E de MOD04 — asignacion de campos de perfil en `update()` y `updateMe()`.
 *
 * Ambos metodos distinguen tres cosas que es facil confundir: campo ausente
 * (no se toca), campo enviado en `null` (se borra) y campo enviado con espacios
 * (se recorta). El PATCH parcial se rompe en silencio si esa distincion se
 * pierde: el sintoma seria un campo que se borra solo al editar otro.
 *
 * SEGURIDAD: sin PII real.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext, User } from '@iwana/db';
import { DocumentType, USERS_BULK_CREATE_QUEUE, UserRole, UserStatus } from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { AuditService } from '../../audit/audit.service';
import { MailerService } from '../../mailer/mailer.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { SearchQueueService } from '../../search/search-queue.service';
import { TenantService } from '../../tenant/tenant.service';
import { UsersService } from '../users.service';

const TENANT = {
  tenantId: 'ten-00000000-0000-4000-a000-00000000000a',
  schemaName: 'tenant_alfa',
  tenantSlug: 'alfa',
};

const USER_ID = 'usr-00000000-0000-4000-a000-000000000001';
const ADMIN_ID = 'usr-00000000-0000-4000-a000-000000000099';

function buildUser(): User {
  return {
    id: USER_ID,
    email: 'tecnico.uno@empresa-demo.test',
    emailHash: 'hash-sintetico',
    passwordHash: 'hash-sintetico',
    role: UserRole.TECHNICIAN,
    status: UserStatus.ACTIVE,
    tenantId: TENANT.tenantId,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRequired: false,
    isOperationalResource: true,
    passwordResetRequired: false,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null,
    passwordResetExpiresAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    emailVerified: false,
    emailVerificationToken: null,
    firstName: 'Nombre',
    lastName: 'Apellido',
    phone: '+573001234567',
    jobTitle: 'Tecnico de campo',
    documentType: DocumentType.CC,
    documentNumber: '00000000',
    avatarUrl: 'https://cdn.example.test/a.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  } as unknown as User;
}

describe('UsersService — campos de perfil en update() y updateMe()', () => {
  let service: UsersService;
  let saved: User[];

  beforeEach(async () => {
    saved = [];
    const stored = buildUser();

    const managerMock = {
      findOne: jest.fn(async () => stored),
      save: jest.fn(async (_entity: unknown, value: User) => {
        saved.push(value);
        return value;
      }),
    };

    const queryRunnerMock = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      manager: managerMock,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DataSource, useValue: { createQueryRunner: () => queryRunnerMock } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: TenantService,
          useValue: {
            getPrincipalAdminUserId: jest.fn().mockResolvedValue(null),
            setPrincipalAdminUserId: jest.fn(),
            updateTenantSelfProfile: jest.fn(),
          },
        },
        {
          provide: SearchQueueService,
          useValue: {
            enqueueUserUpsert: jest.fn().mockResolvedValue(undefined),
            enqueueUserDelete: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EffectivePermissionsService,
          useValue: { invalidateUserPermissions: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MailerService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, def?: unknown) => {
              if (key === 'FRONTEND_URL') return 'http://localhost:3001';
              return def;
            }),
          },
        },
        {
          provide: REDIS_CLIENT,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
          },
        },
        {
          provide: getQueueToken(USERS_BULK_CREATE_QUEUE),
          useValue: { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update()', () => {
    it('aplica todos los campos de perfil enviados por un ADMIN', async () => {
      await TenantContext.run(TENANT, () =>
        service.update(
          USER_ID,
          {
            status: UserStatus.SUSPENDED,
            role: UserRole.SUPPORT,
            firstName: '  Nuevo  ',
            lastName: '  Apellido nuevo  ',
            phone: '+573009998877',
            jobTitle: 'Coordinador',
            documentType: DocumentType.CE,
            documentNumber: '  11111111  ',
            avatarUrl: 'https://cdn.example.test/b.png',
            mfaRequired: true,
            isOperationalResource: false,
          },
          ADMIN_ID,
          UserRole.ADMIN,
        ),
      );

      expect(saved[0]).toMatchObject({
        status: UserStatus.SUSPENDED,
        role: UserRole.SUPPORT,
        // Los campos de texto libre se recortan antes de persistir.
        firstName: 'Nuevo',
        lastName: 'Apellido nuevo',
        phone: '+573009998877',
        jobTitle: 'Coordinador',
        documentType: DocumentType.CE,
        documentNumber: '11111111',
        avatarUrl: 'https://cdn.example.test/b.png',
        mfaRequired: true,
        isOperationalResource: false,
      });
    });

    it('INVARIANTE: un campo enviado en null se borra, no se ignora', async () => {
      await TenantContext.run(TENANT, () =>
        service.update(
          USER_ID,
          {
            firstName: null,
            lastName: null,
            phone: null,
            jobTitle: null,
            documentType: null,
            documentNumber: null,
            avatarUrl: null,
          } as never,
          ADMIN_ID,
          UserRole.ADMIN,
        ),
      );

      expect(saved[0]).toMatchObject({
        firstName: null,
        lastName: null,
        phone: null,
        jobTitle: null,
        documentType: null,
        documentNumber: null,
        avatarUrl: null,
      });
    });

    it('INVARIANTE: un campo ausente conserva su valor previo', async () => {
      await TenantContext.run(TENANT, () =>
        service.update(USER_ID, { status: UserStatus.SUSPENDED }, ADMIN_ID, UserRole.ADMIN),
      );

      expect(saved[0]).toMatchObject({
        status: UserStatus.SUSPENDED,
        firstName: 'Nombre',
        lastName: 'Apellido',
        phone: '+573001234567',
        jobTitle: 'Tecnico de campo',
        documentNumber: '00000000',
        avatarUrl: 'https://cdn.example.test/a.png',
      });
    });
  });

  describe('updateMe()', () => {
    it('aplica los campos de perfil propio y los recorta', async () => {
      await TenantContext.run(TENANT, () =>
        service.updateMe(
          USER_ID,
          {
            firstName: '  Nuevo  ',
            lastName: '  Apellido nuevo  ',
            phone: '+573009998877',
            jobTitle: 'Coordinador',
            documentType: DocumentType.CE,
            documentNumber: '  11111111  ',
            avatarUrl: 'https://cdn.example.test/b.png',
          },
          '10.0.0.1',
        ),
      );

      expect(saved[0]).toMatchObject({
        firstName: 'Nuevo',
        lastName: 'Apellido nuevo',
        phone: '+573009998877',
        jobTitle: 'Coordinador',
        documentType: DocumentType.CE,
        documentNumber: '11111111',
        avatarUrl: 'https://cdn.example.test/b.png',
      });
    });

    it('INVARIANTE: en el perfil propio, null tambien borra el campo', async () => {
      await TenantContext.run(TENANT, () =>
        service.updateMe(
          USER_ID,
          {
            firstName: null,
            lastName: null,
            phone: null,
            jobTitle: null,
            documentType: null,
            documentNumber: null,
            avatarUrl: null,
          } as never,
          '10.0.0.1',
        ),
      );

      expect(saved[0]).toMatchObject({
        firstName: null,
        lastName: null,
        phone: null,
        jobTitle: null,
        documentType: null,
        documentNumber: null,
        avatarUrl: null,
      });
    });

    it('INVARIANTE: un perfil propio sin campos no altera nada del usuario', async () => {
      await TenantContext.run(TENANT, () => service.updateMe(USER_ID, {}, '10.0.0.1'));

      expect(saved[0]).toMatchObject({
        firstName: 'Nombre',
        lastName: 'Apellido',
        phone: '+573001234567',
        jobTitle: 'Tecnico de campo',
        documentNumber: '00000000',
      });
    });
  });
});
