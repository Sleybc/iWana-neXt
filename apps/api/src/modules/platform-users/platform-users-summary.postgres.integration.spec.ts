/**
 * `PlatformUsersService.getSummary()` contra PostgreSQL real
 * (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE2 §A.5). Solo `public.platform_users`.
 * La base puede traer usuarios previos: se mide una línea base y se exige el
 * delta exacto. Bordes: usuario borrado, `lastLoginAt` nulo, acceso viejo.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test pnpm --filter @iwana/api exec jest \
 *     --config jest.integration.config.js platform-users-summary
 */
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NobleCryptoPlugin, ScureBase32Plugin, TOTP } from 'otplib';
import { DataSource } from 'typeorm';
import { PlatformAuditLog, PlatformUser, resolveMigrationDbCredentials } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';
import type { PlatformUsersSummary } from '@iwana/shared';
import { PlatformUsersService } from './platform-users.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { AuthService } from '../auth/auth.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// El cargador de Node 24 admite la dependencia ESM de otplib. Jest 29 en CJS no.
jest.mock('otplib', () =>
  process.getBuiltinModule('node:module')!.createRequire(__filename)('otplib'),
);

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const RUN = randomBytes(4).toString('hex');

/** [rol, mfa, last_login_at SQL, deleted_at SQL]. */
const ROWS: Array<[PlatformRole, boolean, string, string]> = [
  [PlatformRole.SYSTEM_ADMIN, false, 'NULL', 'NULL'],
  [PlatformRole.IWANA_SUPPORT, true, 'now()', 'NULL'],
  [PlatformRole.IWANA_SUPPORT, true, "now() - interval '40 days'", 'NULL'],
  [PlatformRole.SYSTEM_ADMIN, false, 'NULL', 'now()'],
];

describeWithDb('PlatformUsersService.getSummary — PostgreSQL real', () => {
  let dataSource: DataSource;
  let service: PlatformUsersService;
  let baseline: PlatformUsersSummary;
  const ids: string[] = [];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [PlatformUser, PlatformAuditLog],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();
    // El constructor exige claves; getSummary no las usa. Valores efímeros de prueba.
    const key = randomBytes(32).toString('hex');
    service = new PlatformUsersService(
      dataSource.getRepository(PlatformUser),
      undefined as never,
      { getOrThrow: () => key, get: () => undefined } as never,
    );

    baseline = await service.getSummary();

    for (const [index, [role, mfa, lastLogin, deletedAt]] of ROWS.entries()) {
      const id = randomUUID();
      ids.push(id);
      await dataSource.query(
        `INSERT INTO public.platform_users
           (id, email, email_hmac, password_hash, role, mfa_enabled, last_login_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${lastLogin}, ${deletedAt})`,
        [
          id,
          `cifrado-sintetico-${RUN}-${index}`,
          randomBytes(32).toString('hex'),
          'x'.repeat(60),
          role,
          mfa,
        ],
      );
    }
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      if (ids.length > 0) {
        await dataSource.query('DELETE FROM public.platform_users WHERE id = ANY($1::uuid[])', [
          ids,
        ]);
      }
    } finally {
      await dataSource.destroy();
    }
  });

  it('excluye borrados y cuenta por rol, sin MFA y sin acceso en 30 días', async () => {
    const summary = await service.getSummary();
    const admin = PlatformRole.SYSTEM_ADMIN;
    const support = PlatformRole.IWANA_SUPPORT;

    expect(summary.total - baseline.total).toBe(3);
    expect(summary.byRole[admin] - baseline.byRole[admin]).toBe(1);
    expect(summary.byRole[support] - baseline.byRole[support]).toBe(2);
    expect(summary.withoutMfa - baseline.withoutMfa).toBe(1);
    // lastLoginAt nulo + acceso de hace 40 días; el borrado no cuenta.
    expect(summary.withoutAccess30d - baseline.withoutAccess30d).toBe(2);
  });

  it('el total coincide con la tabla y la forma no expone PII', async () => {
    const summary = await service.getSummary();
    const rows: Array<{ count: string }> = await dataSource.query(
      'SELECT COUNT(*) AS count FROM public.platform_users WHERE deleted_at IS NULL',
    );

    expect(summary.total).toBe(Number(rows[0]?.count));
    expect(Object.keys(summary).sort()).toEqual(
      ['byRole', 'generatedAt', 'total', 'withoutAccess30d', 'withoutMfa'].sort(),
    );
    expect(Object.keys(summary.byRole).sort()).toEqual(Object.values(PlatformRole).sort());
  });

  it('activa cuentas nuevas y cuentas existentes con TOTP y actualiza el resumen', async () => {
    if (!/^(test|iwana_it_[\w]+)$/.test(dataSource.options.database as string)) {
      throw new Error('La prueba de alta requiere una base de integración.');
    }
    const transaction = dataSource.createQueryRunner();
    await transaction.connect();
    await transaction.startTransaction();
    try {
      const repo = transaction.manager.getRepository(PlatformUser);
      const audit = new PlatformAuditService(dataSource, undefined as never);
      // El trail real comparte la transacción que se revierte al finalizar la prueba.
      jest
        .spyOn(audit, 'log')
        .mockImplementation((entry) => audit.logWithin(entry, transaction.manager));
      const key = randomBytes(32).toString('hex');
      const config = new ConfigService({ MFA_ENCRYPTION_KEY: key, PII_HASH_KEY: key });
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwt = new JwtService({ privateKey, publicKey });
      const users = new PlatformUsersService(repo, audit, config);
      const stored = new Map<string, string>();
      const redis = {
        set: async (key: string, value: string, ...flags: unknown[]) => {
          if (flags.includes('NX') && stored.has(key)) return null;
          stored.set(key, value);
          return 'OK';
        },
        get: async (key: string) => stored.get(key) ?? null,
        del: async (key: string) => stored.delete(key),
        sadd: jest.fn(),
        expire: jest.fn(),
      };
      const auth = new AuthService(
        undefined as never,
        repo,
        undefined as never,
        jwt,
        config,
        dataSource,
        redis as never,
        undefined as never,
        audit,
        undefined as never,
      );
      const email = `activacion-${RUN}@example.test`;
      const input = {
        email,
        firstName: 'Cuenta',
        lastName: 'De prueba',
        role: PlatformRole.IWANA_SUPPORT,
      };
      const before = await users.getSummary();
      const account = await users.createDirectoryAccount(input, randomUUID(), {});
      await repo.update(account.id, { createdAt: new Date('2000-01-01T00:00:00Z') });
      const pending = await users.getSummary();
      const directory = await users.listDirectory(
        1,
        { sub: randomUUID(), role: PlatformRole.SYSTEM_ADMIN },
        {},
      );
      expect(directory.items[0]).toEqual(
        expect.objectContaining({
          id: account.id,
          status: UserStatus.PENDING_VERIFICATION,
          mfaEnabled: false,
          passwordResetRequired: true,
        }),
      );
      expect(directory.total).toBe(pending.total);
      expect(pending.total).toBe(before.total + 1);
      expect(pending.withoutMfa).toBe(before.withoutMfa + 1);
      await expect(users.createDirectoryAccount(input, randomUUID(), {})).rejects.toMatchObject({
        status: 409,
      });

      const initial = await auth.loginPlatform({ email, password: account.temporaryPassword });
      expect(initial).toMatchObject({ passwordResetRequired: true });
      expect(initial.refreshToken).toBeUndefined();
      const passwordActor = jwt.verify<JwtPayload>(initial.accessToken, { algorithms: ['RS256'] });
      expect(passwordActor.scope).toBe('password-change');
      const newPassword = `Demo!8a-${randomBytes(16).toString('hex')}`;
      await auth.changePassword(passwordActor, {
        currentPassword: account.temporaryPassword,
        newPassword,
      });
      await expect(
        auth.loginPlatform({ email, password: account.temporaryPassword }),
      ).rejects.toMatchObject({ status: 401 });

      const enrollment = await auth.loginPlatform({ email, password: newPassword });
      expect(enrollment).toMatchObject({ mfaSetupRequired: true });
      expect(enrollment.refreshToken).toBeUndefined();
      const enrollmentActor = jwt.verify<JwtPayload>(enrollment.accessToken, {
        algorithms: ['RS256'],
      });
      expect(enrollmentActor.scope).toBe('platform-mfa-setup');
      await expect(auth.setupPlatformMfa(passwordActor)).rejects.toMatchObject({ status: 403 });
      const { otpauthUri } = await auth.setupPlatformMfa(enrollmentActor);
      const repeated = await auth.setupPlatformMfa(enrollmentActor);
      expect(repeated.otpauthUri).toBe(otpauthUri);
      const secret = new URL(otpauthUri).searchParams.get('secret')!;
      const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
      const totpCode = await totp.generate({ secret });

      // Otro ingreso recibe otro secreto; el suyo no confirma este y viceversa.
      const otherLogin = await auth.loginPlatform({ email, password: newPassword });
      const otherActor = jwt.verify<JwtPayload>(otherLogin.accessToken, { algorithms: ['RS256'] });
      const otherUri = (await auth.setupPlatformMfa(otherActor)).otpauthUri;
      expect(otherUri).not.toBe(otpauthUri);
      await expect(auth.verifyPlatformMfa(otherActor, { totpCode }, {})).rejects.toMatchObject({
        status: 401,
      });
      // Un token emitido con la contraseña anterior ya no inscribe.
      await expect(
        auth.setupPlatformMfa({ ...enrollmentActor, credentialVersion: 'anterior' }),
      ).rejects.toMatchObject({ status: 403 });
      await auth.verifyPlatformMfa(enrollmentActor, { totpCode }, {});
      await expect(auth.setupPlatformMfa(enrollmentActor)).rejects.toMatchObject({ status: 403 });
      expect(stored.has(`jti:blacklist:${enrollmentActor.jti}`)).toBe(true);
      const otherCode2 = await totp.generate({
        secret: new URL(otherUri).searchParams.get('secret')!,
      });
      await expect(
        auth.verifyPlatformMfa(otherActor, { totpCode: otherCode2 }, {}),
      ).rejects.toMatchObject({ status: 403 });
      expect(await auth.loginPlatform({ email, password: newPassword })).toEqual({
        accessToken: '',
        mfaRequired: true,
      });
      const session = await auth.loginPlatform({ email, password: newPassword, totpCode });
      expect(session.refreshToken).toBeDefined();
      expect(
        jwt.verify<JwtPayload>(session.accessToken, { algorithms: ['RS256'] }).scope,
      ).toBeUndefined();

      const active = await users.getSummary();
      const updated = await users.listDirectory(
        1,
        { sub: randomUUID(), role: PlatformRole.SYSTEM_ADMIN },
        {},
      );
      expect(updated.items).toContainEqual(
        expect.objectContaining({ id: account.id, status: UserStatus.ACTIVE, mfaEnabled: true }),
      );
      expect(updated.total).toBe(active.total);
      expect(active.total).toBe(before.total + 1);
      expect(active.withoutMfa).toBe(before.withoutMfa);

      // CA-1: una cuenta ACTIVE sin MFA se inscribe con el alcance del login y entra con código.
      const activeEmail = `activa-sin-mfa-${RUN}@example.test`;
      const activeAccount = await users.createDirectoryAccount(
        { ...input, email: activeEmail },
        randomUUID(),
        {},
      );
      const activePassword = activeAccount.temporaryPassword;
      await repo.update(activeAccount.id, {
        status: UserStatus.ACTIVE,
        passwordResetRequired: false,
      });
      const activeLogin = await auth.loginPlatform({
        email: activeEmail,
        password: activePassword,
      });
      expect(activeLogin).toMatchObject({ mfaSetupRequired: true });
      expect(activeLogin.refreshToken).toBeUndefined();
      const activeActor = jwt.verify<JwtPayload>(activeLogin.accessToken, {
        algorithms: ['RS256'],
      });
      expect(activeActor.scope).toBe('platform-mfa-setup');
      const activeSecret = new URL(
        (await auth.setupPlatformMfa(activeActor)).otpauthUri,
      ).searchParams.get('secret')!;
      const activeCode = await totp.generate({ secret: activeSecret });
      await auth.verifyPlatformMfa(activeActor, { totpCode: activeCode }, {});
      expect(await repo.findOneByOrFail({ id: activeAccount.id })).toMatchObject({
        status: UserStatus.ACTIVE,
        mfaEnabled: true,
      });
      expect(await auth.loginPlatform({ email: activeEmail, password: activePassword })).toEqual({
        accessToken: '',
        mfaRequired: true,
      });
      const activeSession = await auth.loginPlatform({
        email: activeEmail,
        password: activePassword,
        totpCode: activeCode,
      });
      expect(activeSession.refreshToken).toBeDefined();
      expect(
        jwt.verify<JwtPayload>(activeSession.accessToken, { algorithms: ['RS256'] }).scope,
      ).toBeUndefined();

      const existingEmail = `mi-cuenta-${RUN}@example.test`;
      const existing = await users.createDirectoryAccount(
        { ...input, email: existingEmail, role: PlatformRole.SYSTEM_ADMIN },
        randomUUID(),
        {},
      );
      await repo.update(existing.id, { status: UserStatus.ACTIVE, passwordResetRequired: false });
      const existingLogin = await auth.loginPlatform({
        email: existingEmail,
        password: existing.temporaryPassword,
      });
      expect(existingLogin).toMatchObject({ mfaSetupRequired: true });
      expect(existingLogin.refreshToken).toBeUndefined();
      const activeEnrollment = jwt.verify<JwtPayload>(existingLogin.accessToken, {
        algorithms: ['RS256'],
      });
      // Sesión completa anterior al MFA obligatorio: conserva «Mi cuenta» hasta vencer.
      const existingActor: JwtPayload = { ...activeEnrollment };
      delete existingActor.scope;
      expect(existingActor.role).toBe(PlatformRole.SYSTEM_ADMIN);
      expect(existingActor.scope).toBeUndefined();
      await expect(
        auth.setupPlatformSelfMfa(existingActor, 'clave incorrecta'),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        auth.setupPlatformSelfMfa({ ...existingActor, type: 'tenant' }, existing.temporaryPassword),
      ).rejects.toMatchObject({ status: 403 });
      const selfSetup = await auth.setupPlatformSelfMfa(existingActor, existing.temporaryPassword);
      expect((await users.getProfile(existing.id)).mfaEnabled).toBe(false);
      const selfSecret = new URL(selfSetup.otpauthUri).searchParams.get('secret')!;
      const selfCode = await totp.generate({ secret: selfSecret });
      const verify = { challenge: selfSetup.challenge, totpCode: selfCode };
      await expect(
        auth.verifyPlatformSelfMfa({ ...existingActor, jti: randomUUID() }, verify, {}),
      ).rejects.toMatchObject({ status: 400 });
      const candidates = ['000000', '111111', '222222', '333333'];
      const results = await Promise.all(
        candidates.map((candidate) =>
          totp.verify(candidate, { secret: selfSecret, epochTolerance: 30 }),
        ),
      );
      const otherCode = candidates[results.findIndex((result) => !result.valid)];
      if (!otherCode) throw new Error('La prueba necesita un código fuera de la ventana admitida.');
      await expect(
        auth.verifyPlatformSelfMfa(existingActor, { ...verify, totpCode: otherCode }, {}),
      ).rejects.toMatchObject({ status: 401 });
      await auth.verifyPlatformSelfMfa(existingActor, verify, {});
      expect((await users.getProfile(existing.id)).mfaEnabled).toBe(true);
      await expect(auth.verifyPlatformSelfMfa(existingActor, verify, {})).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        auth.setupPlatformSelfMfa(existingActor, existing.temporaryPassword),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await auth.loginPlatform({ email: existingEmail, password: existing.temporaryPassword }),
      ).toMatchObject({ mfaRequired: true });
      expect(
        (
          await auth.loginPlatform({
            email: existingEmail,
            password: existing.temporaryPassword,
            totpCode: selfCode,
          })
        ).refreshToken,
      ).toBeDefined();
      expect((await users.getSummary()).withoutMfa).toBe(before.withoutMfa);
    } finally {
      await transaction.rollbackTransaction();
      await transaction.release();
    }
  });
});
