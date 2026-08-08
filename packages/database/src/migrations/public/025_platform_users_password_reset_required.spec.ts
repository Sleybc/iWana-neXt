import { getMetadataArgsStorage } from 'typeorm';

import { PlatformUser } from '../../entities/platform-user.entity';
import { PlatformUsersPasswordResetRequired1784419213000 } from './025_platform_users_password_reset_required';
import { PUBLIC_MIGRATIONS } from './index';

interface QueryCall {
  sql: string;
}

function queryRunnerStub(): { runner: { query: jest.Mock }; calls: QueryCall[] } {
  const calls: QueryCall[] = [];

  const runner = {
    query: jest.fn(async (sql: string) => {
      calls.push({ sql });
      return [];
    }),
  };

  return { runner, calls };
}

/** SQL de una corrida, normalizado a una línea para poder afirmar sobre él. */
async function sqlOf(direction: 'up' | 'down'): Promise<string[]> {
  const { runner, calls } = queryRunnerStub();
  await new PlatformUsersPasswordResetRequired1784419213000()[direction](runner as never);
  return calls.map((call) => call.sql.replace(/\s+/gu, ' ').trim());
}

describe('025_platform_users_password_reset_required', () => {
  it('conserva un timestamp de 13 dígitos posterior a la 024', () => {
    const migration = new PlatformUsersPasswordResetRequired1784419213000();

    expect(migration.name).toBe('PlatformUsersPasswordResetRequired1784419213000');
    // Exactamente lo que hace TypeORM en MigrationExecutor.getMigrations.
    expect(parseInt(migration.name.substr(-13), 10)).toBeGreaterThan(1784419212000);
  });

  it('queda registrada en PUBLIC_MIGRATIONS y en último lugar', () => {
    // Sin el registro no se aplica: `data-source.ts` ya no usa glob.
    const ultima = PUBLIC_MIGRATIONS[PUBLIC_MIGRATIONS.length - 1];

    expect(ultima).toBe(PlatformUsersPasswordResetRequired1784419213000);
  });

  it('up añade la columna sobre public.platform_users, no sobre users de tenant', async () => {
    const sentencias = await sqlOf('up');
    const alter = sentencias.find((sql) => sql.includes('ADD COLUMN'));

    expect(alter).toContain('ALTER TABLE public.platform_users');
    expect(alter).toContain('password_reset_required BOOLEAN');
  });

  it('up crea la columna con DEFAULT false: un despliegue no bloquea a los usuarios ya existentes', async () => {
    // Entrar con `true` dejaría fuera de la consola a toda cuenta de plataforma
    // que ya eligió su contraseña. La marca la activa quien crea la credencial
    // de arranque, no la migración.
    const alter = (await sqlOf('up')).find((sql) => sql.includes('ADD COLUMN'));

    expect(alter).toContain('NOT NULL DEFAULT false');
    expect(alter).not.toContain('DEFAULT true');
  });

  it('up es idempotente y down revierte la columna', async () => {
    expect((await sqlOf('up')).find((sql) => sql.includes('ADD COLUMN'))).toContain(
      'IF NOT EXISTS',
    );

    const down = await sqlOf('down');
    expect(down).toHaveLength(1);
    expect(down[0]).toContain('ALTER TABLE public.platform_users');
    expect(down[0]).toContain('DROP COLUMN IF EXISTS password_reset_required');
  });

  it('la entidad PlatformUser mapea la columna con el mismo nombre físico y default false', () => {
    // Si el mapeo se desalinea, TypeORM lee siempre `false` y el primer ingreso
    // deja de exigir el cambio sin que falle nada visible.
    const columna = getMetadataArgsStorage().columns.find(
      (arg) => arg.target === PlatformUser && arg.propertyName === 'passwordResetRequired',
    );

    expect(columna).toBeDefined();
    expect(columna?.options.name).toBe('password_reset_required');
    expect(columna?.options.default).toBe(false);
  });
});
