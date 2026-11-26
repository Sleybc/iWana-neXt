import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';
import { PlatformUser } from '@iwana/db';
import { AuditAction, PlatformRole, UserStatus } from '@iwana/shared';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  DIRECTORY_PAGE_SIZE,
  SearchPlatformUserDirectorySchema,
} from './dto/platform-user-directory.dto';
import { PlatformUsersController } from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';

jest.mock('../auth/auth.service', () => ({ AuthService: class AuthService {} }));

// Contrato de POST /platform-users/search. Los permisos HTTP (401/403/roles) viven en
// platform-users.controller.spec.ts; aquí, el DTO, la paginación y la ausencia de PII.
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / DIRECTORY_PAGE_SIZE);
const SEARCH_TERM = 'Nombre De Prueba';
const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('POST /platform-users/search — contrato', () => {
  describe('SearchPlatformUserDirectorySchema', () => {
    const parse = (body: unknown) => SearchPlatformUserDirectorySchema.safeParse(body);

    it('usa la página 1 por defecto y deja los filtros sin definir', () => {
      expect(parse({})).toEqual({ success: true, data: { page: 1 } });
    });

    it.each([0, -1, 1.5, MAX_PAGE + 1, '2', null])('rechaza la página %p', (page) => {
      expect(parse({ page }).success).toBe(false);
    });

    it('acepta la última página representable', () => {
      expect(parse({ page: MAX_PAGE })).toEqual({ success: true, data: { page: MAX_PAGE } });
    });

    it('recorta y colapsa espacios del nombre', () => {
      expect(parse({ search: '  Nombre \t  De\nPrueba ' })).toEqual({
        success: true,
        data: { page: 1, search: 'Nombre De Prueba' },
      });
    });

    it('acepta 201 caracteres y rechaza 202', () => {
      expect(parse({ search: 'a'.repeat(201) }).success).toBe(true);
      expect(parse({ search: 'a'.repeat(202) }).success).toBe(false);
    });

    it('rechaza el carácter nulo, un estado desconocido y claves fuera del contrato', () => {
      expect(parse({ search: 'a\0b' }).success).toBe(false);
      expect(parse({ status: 'UNKNOWN' }).success).toBe(false);
      expect(parse({ email: 'cuenta@example.test' }).success).toBe(false);
    });

    it('acepta cada estado de cuenta', () => {
      for (const status of Object.values(UserStatus)) {
        expect(parse({ status })).toEqual({ success: true, data: { page: 1, status } });
      }
    });

    it('no repite el nombre buscado en los detalles del error', () => {
      const result = parse({ search: `${SEARCH_TERM}\0` });
      expect(result.success).toBe(false);
      expect(JSON.stringify(!result.success && result.error.flatten())).not.toContain(SEARCH_TERM);
    });
  });

  describe('PlatformUsersService.listDirectory con filtros', () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 45]),
    };
    const audit = { log: jest.fn(), logWithin: jest.fn() };
    let service: PlatformUsersService;

    const originalPiiHashKey = process.env.PII_HASH_KEY;

    afterAll(() => {
      if (originalPiiHashKey === undefined) delete process.env.PII_HASH_KEY;
      else process.env.PII_HASH_KEY = originalPiiHashKey;
    });

    beforeEach(async () => {
      jest.clearAllMocks();
      process.env.PII_HASH_KEY = TEST_KEY_HEX;
      const moduleRef = await Test.createTestingModule({
        providers: [
          PlatformUsersService,
          {
            provide: getRepositoryToken(PlatformUser),
            useValue: { createQueryBuilder: jest.fn().mockReturnValue(query) },
          },
          { provide: PlatformAuditService, useValue: audit },
          {
            provide: ConfigService,
            useValue: { getOrThrow: jest.fn().mockReturnValue(TEST_KEY_HEX) },
          },
        ],
      }).compile();
      service = moduleRef.get(PlatformUsersService);
    });

    it('filtra por nombre escapando comodines y por estado, y pagina de 20 en 20', async () => {
      await service.listDirectory(
        3,
        { sub: 'actor', role: PlatformRole.IWANA_SUPPORT },
        {},
        { search: '50%_a!b', status: UserStatus.SUSPENDED },
      );

      expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining("ESCAPE '!'"), {
        search: '%50!%!_a!!b%',
      });
      expect(query.andWhere).toHaveBeenCalledWith('account.status = :status', {
        status: UserStatus.SUSPENDED,
      });
      expect(query.skip).toHaveBeenCalledWith(40);
      expect(query.take).toHaveBeenCalledWith(DIRECTORY_PAGE_SIZE);
    });

    it('cada fila expone solo los campos del contrato del directorio', async () => {
      query.getManyAndCount.mockResolvedValueOnce([
        [
          {
            id: 'cuenta',
            firstName: 'Cuenta',
            lastName: 'Prueba',
            role: PlatformRole.IWANA_SUPPORT,
            status: UserStatus.ACTIVE,
            mfaEnabled: true,
            passwordResetRequired: false,
            lastLoginAt: null,
            email: 'cifrado',
            emailHash: 'hash',
            passwordHash: 'hash',
            mfaSecret: 'secreto',
            phone: 'telefono',
          },
        ],
        1,
      ]);

      const result = await service.listDirectory(1, { sub: 'actor', role: 'SYSTEM_ADMIN' }, {});

      expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(
        [
          'firstName',
          'id',
          'lastLoginAt',
          'lastName',
          'mfaEnabled',
          'passwordResetRequired',
          'role',
          'status',
        ].sort(),
      );
    });

    it('si la consulta falla no audita ni registra el nombre buscado', async () => {
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      );
      query.getManyAndCount.mockRejectedValueOnce(new Error('consulta caída'));

      await expect(
        service.listDirectory(
          1,
          { sub: 'actor', role: 'SYSTEM_ADMIN' },
          {},
          { search: SEARCH_TERM },
        ),
      ).rejects.toThrow('consulta caída');

      expect(audit.log).not.toHaveBeenCalled();
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(SEARCH_TERM);
        spy.mockRestore();
      }
    });

    it('sin filtros no añade condiciones', async () => {
      await service.listDirectory(1, { sub: 'actor', role: PlatformRole.SYSTEM_ADMIN }, {});
      expect(query.andWhere).not.toHaveBeenCalled();
      expect(query.skip).toHaveBeenCalledWith(0);
    });

    it('audita el acceso sin el nombre buscado y no lo escribe en logs', async () => {
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
      );

      await service.listDirectory(
        2,
        { sub: 'actor', role: PlatformRole.SYSTEM_ADMIN },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
        { search: SEARCH_TERM },
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LIST_ACCESS,
          newValue: {
            actorRole: PlatformRole.SYSTEM_ADMIN,
            page: 2,
            pageSize: 20,
            served: 0,
            total: 45,
          },
        }),
      );
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain(SEARCH_TERM);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(SEARCH_TERM);
        spy.mockRestore();
      }
    });
  });

  describe('origen de la petición para la auditoría', () => {
    const auditContext = (req: Partial<ExpressRequest>) =>
      PlatformUsersController['auditContext'](req as ExpressRequest);

    it('usa la IP de Express y el User-Agent cuando existen', () => {
      expect(auditContext({ ip: '10.1.1.1', headers: { 'user-agent': 'navegador' } })).toEqual({
        ipAddress: '10.1.1.1',
        userAgent: 'navegador',
      });
    });

    it('cae a la dirección del socket y descarta un User-Agent que no es texto', () => {
      expect(
        auditContext({
          socket: { remoteAddress: '10.2.2.2' } as ExpressRequest['socket'],
          headers: { 'user-agent': ['a', 'b'] as unknown as string },
        }),
      ).toEqual({ ipAddress: '10.2.2.2', userAgent: null });
    });

    it('sin IP ni socket deja ambos en null', () => {
      expect(auditContext({ headers: {} })).toEqual({ ipAddress: null, userAgent: null });
    });
  });
});
