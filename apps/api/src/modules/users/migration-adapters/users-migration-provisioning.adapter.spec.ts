import { ConflictException, Logger, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditAction, UserRole, UserStatus, type MigrationImportableUserRole } from '@iwana/shared';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { hashOpaqueToken } from '../../../common/crypto/hash-opaque-token.util';
import {
  INVITATION_TOKEN_TTL_MS,
  UsersMigrationProvisioningAdapter,
  importedPlaceholderEmail,
  importedUserNames,
  splitImportedDisplayName,
} from './users-migration-provisioning.adapter';

const TENANT = '69200000-0000-4000-8000-000000000001';
const ACTOR = '69200000-0000-4000-8000-000000000002';
const NEW_ID = '69200000-0000-4000-8000-0000000000c1';
const EMAIL = 'tecnico.sintetico@example.test';

jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => '$2a$12$' + 'x'.repeat(53)) }));

describe('UsersMigrationProvisioningAdapter', () => {
  const previousKey = process.env['PII_HASH_KEY'];
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) };
  const search = { enqueueUserUpsert: jest.fn().mockResolvedValue(undefined) };
  /** Correos (o sus HMAC) que ya tiene algún usuario del schema. */
  let taken: Set<string>;
  let saved: Array<Record<string, unknown>>;
  let users: Array<{ id: string; email: string; status: string }>;
  let tokenUpdates: unknown[][];

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT 1 FROM users')) {
      return taken.has(params[0] as string) || taken.has(params[1] as string) ? [{}] : [];
    }
    if (sql.includes('FOR UPDATE')) {
      expect(params[0]).toBe(TENANT);
      return users.filter((user) => (params[1] as string[]).includes(user.id));
    }
    if (sql.trimStart().startsWith('UPDATE users')) {
      tokenUpdates.push(params);
      return [];
    }
    return [];
  });
  const manager = {
    query,
    create: jest.fn((_entity: unknown, state: Record<string, unknown>) => ({ ...state })),
    save: jest.fn(async (_entity: unknown, user: Record<string, unknown>) => {
      user['id'] = NEW_ID;
      saved.push(user);
      return user;
    }),
  };
  const ctx = {
    manager: manager as never,
    tenantId: TENANT,
    schemaName: 'tenant_x',
    actorId: ACTOR,
  };
  const adapter = new UsersMigrationProvisioningAdapter(
    audit as never,
    mailer as never,
    config as never,
    search as never,
  );

  const input = (overrides: Partial<Parameters<typeof adapter.createImportedUser>[1]> = {}) => ({
    uispUserId: 41,
    role: UserRole.TECHNICIAN as MigrationImportableUserRole,
    displayName: 'Ana  Maria   Sintetica',
    email: EMAIL,
    activeInUisp: true,
    ...overrides,
  });

  beforeAll(() => {
    process.env['PII_HASH_KEY'] = '6e'.repeat(32);
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env['PII_HASH_KEY'];
    else process.env['PII_HASH_KEY'] = previousKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    taken = new Set();
    saved = [];
    users = [];
    tokenUpdates = [];
  });

  describe('crear usuario importado', () => {
    it('activo en UISP: PENDING_VERIFICATION, correo de UISP y recurso operativo por rol', async () => {
      const result = await adapter.createImportedUser(ctx, input());

      expect(result).toEqual({
        userId: NEW_ID,
        status: 'PENDING_VERIFICATION',
        isOperationalResource: true,
        placeholderEmail: false,
      });
      expect(saved[0]).toMatchObject({
        email: EMAIL,
        emailHash: hashEmail(EMAIL),
        role: UserRole.TECHNICIAN,
        status: UserStatus.PENDING_VERIFICATION,
        tenantId: TENANT,
        firstName: 'Ana',
        lastName: 'Maria Sintetica',
        isOperationalResource: true,
        passwordResetRequired: true,
        emailVerified: false,
        emailVerificationToken: null,
      });
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('la contraseña es el hash bcrypt (costo del alta) de un secreto aleatorio descartado', async () => {
      await adapter.createImportedUser(ctx, input());
      await adapter.createImportedUser(ctx, input({ uispUserId: 42 }));
      const secrets = (bcrypt.hash as jest.Mock).mock.calls.map(([secret]) => secret);
      expect((bcrypt.hash as jest.Mock).mock.calls.every(([, rounds]) => rounds === 12)).toBe(true);
      expect(secrets[0]).toMatch(/^[0-9a-f]{64}$/u);
      expect(secrets[0]).not.toBe(secrets[1]);
      expect(JSON.stringify(saved)).not.toContain(secrets[0]);
    });

    it('activo con recurso operativo elegido respeta la elección', async () => {
      await adapter.createImportedUser(
        ctx,
        input({ role: UserRole.SUPPORT, isOperationalResource: true }),
      );
      expect(saved[0]).toMatchObject({ isOperationalResource: true });
      await adapter.createImportedUser(ctx, input({ role: UserRole.SUPPORT, uispUserId: 50 }));
      expect(saved[1]).toMatchObject({ isOperationalResource: false });
    });

    it('inactivo en UISP: INACTIVE y nunca recurso operativo, aunque se pida', async () => {
      const result = await adapter.createImportedUser(
        ctx,
        input({ activeInUisp: false, isOperationalResource: true }),
      );
      expect(result).toMatchObject({ status: 'INACTIVE', isOperationalResource: false });
      expect(saved[0]).toMatchObject({
        status: UserStatus.INACTIVE,
        isOperationalResource: false,
      });
    });

    it('sin correo de UISP usa uisp-<id>@importado.invalid', async () => {
      const result = await adapter.createImportedUser(ctx, input({ email: null }));
      expect(result.placeholderEmail).toBe(true);
      expect(saved[0]).toMatchObject({
        email: 'uisp-41@importado.invalid',
        emailHash: hashEmail('uisp-41@importado.invalid'),
      });
    });

    it('si el correo ya es de otro usuario (vigente o borrado) usa el provisional', async () => {
      taken.add(hashEmail(EMAIL));
      const result = await adapter.createImportedUser(
        ctx,
        input({ email: ` ${EMAIL.toUpperCase()} ` }),
      );
      expect(result.placeholderEmail).toBe(true);
      expect(saved[0]?.['email']).toBe(importedPlaceholderEmail(41));
    });

    it('si el provisional también existe responde 409 sin crear', async () => {
      taken.add(hashEmail(importedPlaceholderEmail(41)));
      await expect(adapter.createImportedUser(ctx, input({ email: null }))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(saved).toHaveLength(0);
    });

    it('rechaza un rol fuera del tenant con MIGRATION_USER_ROLE_NOT_ALLOWED', async () => {
      const error = await adapter
        .createImportedUser(ctx, input({ role: 'SYSTEM_ADMIN' as MigrationImportableUserRole }))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'MIGRATION_USER_ROLE_NOT_ALLOWED',
      });
    });

    it.each([UserRole.SUBSCRIBER, UserRole.PARTNER, UserRole.INVESTOR])(
      'S-6: rechaza el rol no importable %s aunque el tenant lo admita',
      async (role) => {
        const error = await adapter
          .createImportedUser(ctx, input({ role: role as MigrationImportableUserRole }))
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
          code: 'MIGRATION_USER_ROLE_NOT_ALLOWED',
        });
        expect(saved).toHaveLength(0);
      },
    );

    it('la unicidad del correo se comprueba en todo el schema, sin filtrar tenant_id', async () => {
      // `uq_users_email_hash` y `uq_users_email_hmac` son únicos por schema (no por tenant_id):
      // filtrar por tenant dejaría pasar un choque que el INSERT rechazaría.
      await adapter.createImportedUser(ctx, input());
      const check = query.mock.calls.find(([sql]) => sql.includes('SELECT 1 FROM users'));
      expect(String(check?.[0])).not.toContain('tenant_id');
      expect(check?.[1]).toEqual([hashEmail(EMAIL), EMAIL]);
    });

    it('audita la creación en la transacción, sin nombre ni correo', async () => {
      await adapter.createImportedUser(ctx, input());
      expect(audit.logWithin).toHaveBeenCalledWith(
        {
          action: AuditAction.CREATE,
          entityType: 'User',
          entityId: NEW_ID,
          userId: ACTOR,
          tenantId: TENANT,
          schemaName: 'tenant_x',
          newValue: {
            role: UserRole.TECHNICIAN,
            status: UserStatus.PENDING_VERIFICATION,
            tenantId: TENANT,
            isOperationalResource: true,
            origen: 'UISP',
            correoProvisional: false,
          },
        },
        manager,
      );
      const audited = JSON.stringify(audit.logWithin.mock.calls);
      expect(audited).not.toContain(EMAIL);
      expect(audited).not.toContain('Sintetica');
    });
  });

  describe('invitar', () => {
    const PENDING = '69200000-0000-4000-8000-0000000000d1';
    const INACTIVE = '69200000-0000-4000-8000-0000000000d2';
    const PLACEHOLDER = '69200000-0000-4000-8000-0000000000d3';
    const ACTIVE = '69200000-0000-4000-8000-0000000000d4';

    beforeEach(() => {
      config.get.mockImplementation((_key: string, fallback?: string) => fallback);
      users = [
        { id: PENDING, email: EMAIL, status: UserStatus.PENDING_VERIFICATION },
        { id: INACTIVE, email: 'otro@example.test', status: UserStatus.INACTIVE },
        {
          id: PLACEHOLDER,
          email: 'uisp-9@importado.invalid',
          status: UserStatus.PENDING_VERIFICATION,
        },
        { id: ACTIVE, email: 'activo@example.test', status: UserStatus.ACTIVE },
      ];
    });

    /** Token en claro del enlace enviado, leído del correo despachado. */
    const sentToken = (call = 0): string => {
      const [message] = mailer.sendMail.mock.calls[call] as [{ text: string }];
      return /reset-password\?(?:tenant=[^&]+&)?token=([0-9a-f]+)/u.exec(message.text)?.[1] ?? '';
    };

    it('guarda solo el hash del token de creación de contraseña, con vencimiento a 7 días', async () => {
      const before = Date.now();
      const prepared = await adapter.prepareInvitations(ctx, [
        PENDING,
        INACTIVE,
        PLACEHOLDER,
        ACTIVE,
      ]);
      const after = Date.now();

      expect(prepared.invited).toEqual([PENDING]);
      expect(tokenUpdates).toHaveLength(1);
      const [tenant, id, tokenHash, expiresAt] = tokenUpdates[0] as [string, string, string, Date];
      expect(tenant).toBe(TENANT);
      expect(id).toBe(PENDING);
      expect(tokenHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(INVITATION_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + INVITATION_TOKEN_TTL_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + INVITATION_TOKEN_TTL_MS);

      prepared.dispatch();
      const token = sentToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/u);
      expect(tokenHash).toBe(hashOpaqueToken(token));
      expect(tokenHash).not.toBe(token);
    });

    it('la actualización usa el token de restablecimiento y retira el de verificación', async () => {
      await adapter.prepareInvitations(ctx, [PENDING]);
      const update = query.mock.calls.find(([sql]) => sql.trimStart().startsWith('UPDATE users'));
      const sql = String(update?.[0]);
      expect(sql).toContain('password_reset_token = $3');
      expect(sql).toContain('password_reset_token_expires_at = $4');
      expect(sql).toContain('email_verification_token = NULL');
      expect(sql).toContain('tenant_id = $1');
    });

    it('envía la invitación al portal empresarial solo tras dispatch (después del COMMIT)', async () => {
      config.get.mockImplementation((key: string, fallback?: string) =>
        key === 'PORTAL_URL' ? 'https://portal.ejemplo.example' : fallback,
      );
      const prepared = await adapter.prepareInvitations(ctx, [PENDING]);
      expect(mailer.sendMail).not.toHaveBeenCalled();

      prepared.dispatch();
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      const [message] = mailer.sendMail.mock.calls[0] as [
        { to: string; text: string; html: string; subject: string },
      ];
      expect(message.to).toBe(EMAIL);
      expect(message.subject).toBe('Te invitaron a iWana');
      expect(message.text).toContain(
        `https://portal.ejemplo.example/auth/reset-password?token=${sentToken()}&origen=invitacion`,
      );
      expect(message.text).toContain('7 días');
      expect(message.text).not.toContain('verify-email');
      expect(message.html).not.toContain('registrarte');
      const audited = JSON.stringify(audit.logWithin.mock.calls);
      expect(audited).not.toContain(sentToken());
      expect(audited).not.toContain(String(tokenUpdates[0]?.[2]));
      config.get.mockImplementation((_key: string, fallback?: string) => fallback);
    });

    it('el enlace lleva la empresa del contexto para que la persona no la escriba', async () => {
      const prepared = await adapter.prepareInvitations({ ...ctx, tenantSlug: 'empresa demo' }, [
        PENDING,
      ]);
      prepared.dispatch();
      const [message] = mailer.sendMail.mock.calls[0] as [{ text: string }];
      expect(message.text).toContain(
        `/auth/reset-password?tenant=empresa%20demo&token=${sentToken()}&origen=invitacion`,
      );
    });

    it('sin PORTAL_URL usa FRONTEND_URL', async () => {
      config.get.mockImplementation((key: string, fallback?: string) =>
        key === 'FRONTEND_URL' ? 'https://app.ejemplo.example' : fallback,
      );
      const prepared = await adapter.prepareInvitations(ctx, [PENDING]);
      prepared.dispatch();
      const [message] = mailer.sendMail.mock.calls[0] as [{ text: string }];
      expect(message.text).toContain('https://app.ejemplo.example/auth/reset-password?token=');
      config.get.mockImplementation((_key: string, fallback?: string) => fallback);
    });

    it('reenviar emite un token nuevo cada vez', async () => {
      await adapter.prepareInvitations(ctx, [PENDING]);
      await adapter.prepareInvitations(ctx, [PENDING]);
      expect(tokenUpdates[0]?.[2]).not.toBe(tokenUpdates[1]?.[2]);
    });

    it('sin ids no consulta ni envía', async () => {
      const prepared = await adapter.prepareInvitations(ctx, []);
      prepared.dispatch();
      expect(query).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    it('un fallo del correo se registra sin el destinatario', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      mailer.sendMail.mockRejectedValueOnce(new Error('smtp caído'));
      const prepared = await adapter.prepareInvitations(ctx, [PENDING]);
      prepared.dispatch();
      await new Promise((resolve) => setImmediate(resolve));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).not.toContain(EMAIL);
      warn.mockRestore();
    });
  });

  it('publica los creados en el índice de búsqueda sin lanzar', async () => {
    search.enqueueUserUpsert.mockRejectedValueOnce(new Error('cola caída'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    adapter.publishCreatedUsers(TENANT, [NEW_ID, ACTOR]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(search.enqueueUserUpsert).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('con nombre y apellido de UISP los guarda tal cual, sin partir por espacios', async () => {
    await adapter.createImportedUser(
      ctx,
      input({
        displayName: 'Ana Maria Sintetica Dos',
        firstName: 'Ana Maria',
        lastName: 'Sintetica Dos',
      }),
    );

    expect(saved[0]).toMatchObject({ firstName: 'Ana Maria', lastName: 'Sintetica Dos' });
  });

  it.each([
    [
      { firstName: 'Ana Maria', lastName: null },
      { firstName: 'Ana Maria', lastName: null },
    ],
    [
      { firstName: null, lastName: 'Sintetica' },
      { firstName: 'Sintetica', lastName: null },
    ],
    [
      { firstName: '  ', lastName: '' },
      { firstName: 'Nombre', lastName: 'De Respaldo' },
    ],
    [{}, { firstName: 'Nombre', lastName: 'De Respaldo' }],
  ])('partes %j → %j', (parts, expected) => {
    expect(importedUserNames({ displayName: 'Nombre De Respaldo', ...parts })).toEqual(expected);
  });

  it('acota cada parte de UISP a 100 caracteres', () => {
    const names = importedUserNames({
      displayName: 'x',
      firstName: 'a'.repeat(150),
      lastName: 'b'.repeat(150),
    });
    expect(names.firstName).toHaveLength(100);
    expect(names.lastName).toHaveLength(100);
  });

  describe('reparar nombres partidos', () => {
    const original = query.getMockImplementation()!;
    afterEach(() => query.mockImplementation(original));

    it('corrige solo si sigue el nombre partido y audita sin nombres', async () => {
      query.mockImplementation(async (sql: string, params: unknown[] = []) =>
        sql.includes('UPDATE users SET first_name') && params[0] === 'usr-partido'
          ? [[{ id: 'usr-partido' }], 1]
          : [[], 0],
      );

      const repaired = await adapter.repairImportedUserNames(ctx, [
        {
          userId: 'usr-partido',
          legacyDisplayName: 'Ana Maria Sintetica',
          firstName: 'Ana Maria',
          lastName: 'Sintetica',
        },
        {
          userId: 'usr-editado',
          legacyDisplayName: 'Otra Persona Dos',
          firstName: 'Otra Persona',
          lastName: 'Dos',
        },
        // Ya bien partido: «Uno» + «Sintetico Dos» coincide con UISP, no se consulta.
        {
          userId: 'usr-bien',
          legacyDisplayName: 'Uno Sintetico Dos',
          firstName: 'Uno',
          lastName: 'Sintetico Dos',
        },
        // Sin partes en UISP (solo usuario): nada que corregir.
        { userId: 'usr-sin', legacyDisplayName: 'pdos', firstName: null, lastName: null },
      ]);

      expect(repaired).toEqual(['usr-partido']);
      const updates = query.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE users SET first_name'),
      );
      expect(updates.map(([, params]) => params)).toEqual([
        ['usr-partido', 'Ana Maria', 'Sintetica', 'Ana', 'Maria Sintetica', TENANT],
        ['usr-editado', 'Otra Persona', 'Dos', 'Otra', 'Persona Dos', TENANT],
      ]);
      expect(updates[0]![0]).toContain('last_name IS NOT DISTINCT FROM $5');
      expect(audit.logWithin).toHaveBeenCalledTimes(1);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityId: 'usr-partido',
          newValue: {
            campos: ['firstName', 'lastName'],
            origen: 'UISP',
            motivo: 'NOMBRE_SEPARADO',
          },
        }),
        manager,
      );
      expect(JSON.stringify(audit.logWithin.mock.calls)).not.toContain('Ana');
    });
  });

  it('separa el nombre en nombre y apellidos acotados a 100 caracteres', () => {
    expect(splitImportedDisplayName('Solo')).toEqual({ firstName: 'Solo', lastName: null });
    const long = splitImportedDisplayName(`${'a'.repeat(120)} ${'b'.repeat(120)}`);
    expect(long.firstName).toHaveLength(100);
    expect(long.lastName).toHaveLength(100);
  });
});
