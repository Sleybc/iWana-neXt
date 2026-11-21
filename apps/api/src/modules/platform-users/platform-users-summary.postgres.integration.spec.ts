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
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { PlatformUser, resolveMigrationDbCredentials } from '@iwana/db';
import { PlatformRole } from '@iwana/shared';
import type { PlatformUsersSummary } from '@iwana/shared';
import { PlatformUsersService } from './platform-users.service';

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
      entities: [PlatformUser],
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
});
