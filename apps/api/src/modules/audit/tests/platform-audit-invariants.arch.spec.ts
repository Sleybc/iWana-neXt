/**
 * S-8 — invariantes del audit trail de plataforma.
 *
 * Lo que se rompió y este archivo impide que vuelva a romperse: las operaciones
 * de plataforma no tienen `TenantContext`, así que `AuditService.log()` las
 * descartaba y la única fila que quedaba era la genérica del interceptor —con la
 * `action` derivada del verbo HTTP (un cambio de contraseña quedaba como
 * `CREATE`), `entity_id = 'unknown'` y el `entityType` en plural.
 *
 * Dos invariantes, por tanto:
 *
 * 1. Toda operación CUD de plataforma emite su propia entrada, con una `action`
 *    **semántica** —la que describe la operación, no la que se deduce del verbo—
 *    y un `entityId` que es un UUID real de la entidad afectada.
 * 2. Los handlers que emiten esa entrada llevan `@SkipAudit()`, para que el
 *    interceptor no añada encima la fila degradada que motivó el hallazgo.
 *
 * SEGURIDAD: sin PII real — correos y contraseñas ficticios, generados aquí.
 */

import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { PlatformUser } from '@iwana/db';
import { AuditAction } from '@iwana/shared';
import { Repository } from 'typeorm';
import { PLATFORM_USER_ENTITY_TYPE } from '../audit.constants';
import { AuditEntryInput } from '../interfaces/audit-entry.interface';
import { PlatformAuditService } from '../platform-audit.service';
import { SKIP_AUDIT_KEY } from '../decorators/skip-audit.decorator';
import { PlatformBootstrapService } from '../../auth/platform-bootstrap.service';
import { PlatformUsersController } from '../../platform-users/platform-users.controller';
import { PlatformUsersService } from '../../platform-users/platform-users.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// PlatformUsersController arrastra AuthService, y este otplib (ESM que ts-jest no
// transforma). Aqui solo se lee metadata del controlador, no se ejecuta: basta un
// doble de la clase para cortar la cadena de imports.
jest.mock('../../auth/auth.service', () => ({
  AuthService: class MockAuthService {},
}));

const AES_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acciones que NO describen la operación: son las que el interceptor deduce del
 * verbo HTTP. Un `UPDATE` legítimo existe (editar perfil), pero un cambio de
 * contraseña o de correo de acceso registrado como `CREATE`/`UPDATE` genérico es
 * exactamente el defecto que se corrigió.
 */
const ACCIONES_SEMANTICAS_POR_OPERACION: Record<string, AuditAction> = {
  updateProfile: AuditAction.UPDATE,
  changeLoginEmail: AuditAction.UPDATE,
  changePassword: AuditAction.PASSWORD_CHANGED,
  createBootstrapUser: AuditAction.CREATE,
  bootstrapPorEntorno: AuditAction.CREATE,
};

function buildPlatformUser(id: string): PlatformUser {
  return {
    id,
    email: 'cifrado-no-descifrable',
    emailHash: 'hash-ficticio',
    passwordHash: '$2b$12$hash',
    role: 'system_admin',
    status: 'active',
    mfaEnabled: false,
    mfaSecret: null,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    firstName: null,
    lastName: null,
    phone: null,
    timezone: 'America/Bogota',
    language: 'es-CO',
  } as unknown as PlatformUser;
}

describe('S-8 — invariantes del audit trail de plataforma', () => {
  let service: PlatformUsersService;
  let bootstrapService: PlatformBootstrapService;
  let repo: jest.Mocked<Repository<PlatformUser>>;
  let entradas: AuditEntryInput[];

  const configServiceMock = {
    getOrThrow: jest.fn().mockReturnValue(AES_KEY_HEX),
    get: jest.fn(),
  };

  beforeEach(async () => {
    entradas = [];
    const platformAuditServiceMock = {
      log: jest.fn((entry: AuditEntryInput) => {
        entradas.push(entry);
        return Promise.resolve();
      }),
    };

    configServiceMock.get.mockReset();
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as unknown as jest.Mock).mockResolvedValue('hash-generado');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformUsersService,
        PlatformBootstrapService,
        {
          provide: getRepositoryToken(PlatformUser),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
          },
        },
        { provide: PlatformAuditService, useValue: platformAuditServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get(PlatformUsersService);
    bootstrapService = module.get(PlatformBootstrapService);
    repo = module.get(getRepositoryToken(PlatformUser));
  });

  /** Prepara el repo para que devuelva y persista la misma entidad. */
  function prepararUsuarioExistente(id: string): void {
    const entity = buildPlatformUser(id);
    repo.findOne.mockResolvedValue(entity);
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (data: unknown) => ({ ...entity, ...(data as object) }) as PlatformUser,
    );
  }

  /** Prepara el repo para un alta desde cero con el id indicado. */
  function prepararAltaConId(id: string): void {
    repo.count.mockResolvedValue(0);
    repo.findOne.mockResolvedValue(null);
    (repo.create as unknown as jest.Mock).mockImplementation(
      (data: unknown) => data as PlatformUser,
    );
    (repo.save as unknown as jest.Mock).mockImplementation(
      async (user: unknown) => ({ ...(user as object), id }) as PlatformUser,
    );
  }

  /**
   * Cada entrada emitida por una operación CUD de plataforma debe cumplir los
   * dos invariantes a la vez. Se comprueban juntos a propósito: una `action`
   * correcta sobre `entity_id = 'unknown'` sigue sin identificar qué cambió.
   */
  function verificarInvariantes(
    operacion: keyof typeof ACCIONES_SEMANTICAS_POR_OPERACION,
  ): AuditEntryInput {
    expect(entradas).toHaveLength(1);
    const entrada = entradas[0];
    if (!entrada) {
      throw new Error(`La operacion ${operacion} no emitio ninguna entrada de auditoria.`);
    }

    expect(entrada.action).toBe(ACCIONES_SEMANTICAS_POR_OPERACION[operacion]);
    expect(entrada.entityType).toBe(PLATFORM_USER_ENTITY_TYPE);
    expect(entrada.entityId).toMatch(UUID_PATTERN);

    return entrada;
  }

  describe('cada operación CUD emite una entrada con action semántica y entityId UUID', () => {
    it('updateProfile', async () => {
      const id = randomUUID();
      prepararUsuarioExistente(id);

      await service.updateProfile(id, { language: 'en-US' });

      const entrada = verificarInvariantes('updateProfile');
      expect(entrada.entityId).toBe(id);
    });

    it('changeLoginEmail', async () => {
      const id = randomUUID();
      prepararUsuarioExistente(id);

      await service.changeLoginEmail(id, {
        email: 'nuevo-acceso@ejemplo.invalid',
        currentPassword: 'ClaveFicticiaDePrueba!1',
      });

      const entrada = verificarInvariantes('changeLoginEmail');
      expect(entrada.entityId).toBe(id);
      // El correo no puede persistirse en el trail: es PII
      expect(JSON.stringify(entradas)).not.toContain('nuevo-acceso@ejemplo.invalid');
    });

    it('changePassword — no queda como CREATE derivado del verbo HTTP', async () => {
      const id = randomUUID();
      prepararUsuarioExistente(id);

      await service.changePassword(id, {
        currentPassword: 'ClaveFicticiaDePrueba!1',
        newPassword: 'OtraClaveFicticia!2',
      });

      const entrada = verificarInvariantes('changePassword');
      expect(entrada.action).not.toBe(AuditAction.CREATE);
      expect(JSON.stringify(entradas)).not.toContain('OtraClaveFicticia!2');
    });

    it('createBootstrapUser', async () => {
      const id = randomUUID();
      prepararAltaConId(id);

      await service.createBootstrapUser({
        email: 'admin@iwana.co',
        password: 'ClaveFicticiaDePrueba!1',
        confirmPassword: 'ClaveFicticiaDePrueba!1',
      });

      const entrada = verificarInvariantes('createBootstrapUser');
      expect(entrada.entityId).toBe(id);
    });

    it('bootstrap por variables de entorno (PlatformBootstrapService)', async () => {
      const id = randomUUID();
      prepararAltaConId(id);
      configServiceMock.get.mockImplementation((key: string) =>
        key === 'PLATFORM_SUPER_ADMIN_EMAIL'
          ? 'admin@iwana.co'
          : key === 'PLATFORM_SUPER_ADMIN_PASSWORD'
            ? 'ClaveFicticiaDePrueba!1'
            : undefined,
      );

      await bootstrapService.onApplicationBootstrap();

      const entrada = verificarInvariantes('bootstrapPorEntorno');
      expect(entrada.entityId).toBe(id);
      // Actor del sistema: el arranque del proceso, no una persona
      expect(entrada.userId).toBeNull();
    });
  });

  describe('los handlers que emiten su propia entrada llevan @SkipAudit()', () => {
    // Sin esto el interceptor añade encima la fila degradada: action del verbo
    // HTTP, entity_id 'unknown' y entityType en plural.
    const handlersCud = [
      'createBootstrapUser',
      'updateMyProfile',
      'updateMyLoginEmail',
      'updateMyPassword',
    ] as const;

    it.each(handlersCud)('PlatformUsersController.%s', (handler) => {
      const descriptor = PlatformUsersController.prototype[handler];
      expect(Reflect.getMetadata(SKIP_AUDIT_KEY, descriptor)).toBe(true);
    });
  });
});
