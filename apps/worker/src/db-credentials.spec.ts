import {
  MissingPurgeCredentialsError,
  resolveMigrationDbCredentials,
  resolvePurgeDbCredentials,
} from '@iwana/db';

/**
 * R7 / ADR-108: credenciales de la purga de tenants.
 */
describe('resolvePurgeDbCredentials', () => {
  it('prefiere DB_PURGER_* cuando el rol de purga está definido', () => {
    expect(
      resolvePurgeDbCredentials({
        NODE_ENV: 'production',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'app',
        DB_PURGER_USER: ' iwana_purger ',
        DB_PURGER_PASSWORD: 'purger',
      }),
    ).toEqual({ username: 'iwana_purger', password: 'purger', fallback: false });
  });

  it('en producción, sin DB_PURGER_USER, falla en lugar de usar DB_USER', () => {
    expect(() =>
      resolvePurgeDbCredentials({ NODE_ENV: 'production', DB_USER: 'iwana_app', DB_PASSWORD: 'x' }),
    ).toThrow(MissingPurgeCredentialsError);
  });

  it('fuera de producción, sin DB_PURGER_USER, cae a DB_USER y lo marca', () => {
    expect(
      resolvePurgeDbCredentials({
        NODE_ENV: 'development',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'x',
      }),
    ).toEqual({ username: 'iwana_app', password: 'x', fallback: true });
  });
});

/**
 * Smoke SEC-04: sin DB_MIGRATOR_* el comportamiento histórico (DB_USER) no cambia.
 */
describe('resolveMigrationDbCredentials', () => {
  const keys = ['DB_USER', 'DB_PASSWORD', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD'] as const;
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of keys) {
      snapshot[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      const previous = snapshot[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('hace fallback a DB_USER / DB_PASSWORD cuando el migrator no está definido', () => {
    delete process.env['DB_MIGRATOR_USER'];
    delete process.env['DB_MIGRATOR_PASSWORD'];
    process.env['DB_USER'] = 'iwana';
    process.env['DB_PASSWORD'] = 'bootstrap';

    expect(resolveMigrationDbCredentials()).toEqual({
      username: 'iwana',
      password: 'bootstrap',
    });
  });

  it('prefiere DB_MIGRATOR_* cuando el usuario migrator está definido', () => {
    process.env['DB_USER'] = 'iwana_app';
    process.env['DB_PASSWORD'] = 'app';
    process.env['DB_MIGRATOR_USER'] = 'iwana_migrator';
    process.env['DB_MIGRATOR_PASSWORD'] = 'migrator';

    expect(resolveMigrationDbCredentials()).toEqual({
      username: 'iwana_migrator',
      password: 'migrator',
    });
  });

  it('si solo hay DB_MIGRATOR_USER, reusa DB_PASSWORD como password de migrator', () => {
    process.env['DB_USER'] = 'iwana_app';
    process.env['DB_PASSWORD'] = 'shared';
    process.env['DB_MIGRATOR_USER'] = 'iwana_migrator';
    delete process.env['DB_MIGRATOR_PASSWORD'];

    expect(resolveMigrationDbCredentials()).toEqual({
      username: 'iwana_migrator',
      password: 'shared',
    });
  });
});
