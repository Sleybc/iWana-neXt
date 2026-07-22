import { QueryRunner } from 'typeorm';
import { PlatformRole, UserRole } from '@iwana/shared';

import { NarrowUsersRoleToTenantDomain0850000000000 } from '../../../../../../packages/database/src/migrations/tenant/085_narrow_users_role_to_tenant_domain';

/**
 * Regresión de la migración 085 — ADR-061 §4.
 *
 * Lo que se fija aquí es la **condición que el CTO puso al aprobar el ADR**: la
 * migración verifica primero y aborta si encuentra filas con un rol de
 * plataforma. Estrechar el dominio sobre datos sucios dejaría a esos usuarios
 * sin poder iniciar sesión, sin aviso previo.
 *
 * Se ejecuta contra un doble de `QueryRunner` que hace fallar la verificación
 * igual que lo haría PostgreSQL al alcanzar el `RAISE EXCEPTION`. Así se prueba
 * la propagación real —y que el `ALTER TABLE` no llega a emitirse— y no solo
 * que el texto SQL contenga la palabra correcta.
 *
 * El comportamiento contra la base real (aborto con datos sucios, incluidos los
 * soft-deleted, y rechazo posterior del `INSERT`) se verificó además contra
 * `tenant_iwana`; esta prueba es la que impide que el orden se invierta en un
 * refactor futuro.
 */

interface FakeQueryRunner {
  runner: QueryRunner;
  queries: string[];
}

function createFakeQueryRunner(options: { dirtyRows?: number } = {}): FakeQueryRunner {
  const dirtyRows = options.dirtyRows ?? 0;
  const queries: string[] = [];

  const query = jest.fn(async (sql: string): Promise<unknown> => {
    queries.push(sql);

    // La verificación previa vive en un bloque DO con RAISE EXCEPTION: sobre
    // datos sucios, PostgreSQL devuelve error y TypeORM lo propaga.
    if (dirtyRows > 0 && sql.includes('RAISE EXCEPTION')) {
      throw new Error(
        `085: ${dirtyRows} fila(s) de users con rol fuera del dominio de tenant en schema tenant_demo`,
      );
    }

    return [];
  });

  return { runner: { query } as unknown as QueryRunner, queries };
}

const ALTER_FRAGMENT = 'ADD CONSTRAINT chk_users_role_tenant_domain';

describe('Migración 085 — estrechamiento del dominio de users.role', () => {
  it('aborta y NO estrecha la columna cuando hay filas con rol de plataforma', async () => {
    const fake = createFakeQueryRunner({ dirtyRows: 3 });
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await expect(migration.up(fake.runner)).rejects.toThrow(/085: 3 fila\(s\)/);

    expect(fake.queries.some((sql) => sql.includes(ALTER_FRAGMENT))).toBe(false);
  });

  it('verifica ANTES de alterar: la comprobación es la primera sentencia', async () => {
    const fake = createFakeQueryRunner();
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await migration.up(fake.runner);

    const verificationIndex = fake.queries.findIndex((sql) => sql.includes('RAISE EXCEPTION'));
    const alterIndex = fake.queries.findIndex((sql) => sql.includes(ALTER_FRAGMENT));

    expect(verificationIndex).toBe(0);
    expect(alterIndex).toBeGreaterThan(verificationIndex);
  });

  it('la verificación cubre también las filas con soft-delete', async () => {
    const fake = createFakeQueryRunner();
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await migration.up(fake.runner);

    const verification = fake.queries[0] ?? '';

    // Un CHECK aplica a la fila exista o no `deleted_at`: filtrar por él dejaría
    // pasar un soft-deleted que rompería el ALTER a continuación.
    expect(verification).not.toContain('deleted_at');
  });

  it('el dominio del CHECK coincide exactamente con UserRole', async () => {
    const fake = createFakeQueryRunner();
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await migration.up(fake.runner);

    const alterSql = fake.queries.find((sql) => sql.includes(ALTER_FRAGMENT)) ?? '';

    for (const role of Object.values(UserRole)) {
      expect(alterSql).toContain(`'${role}'`);
    }

    // El acoplamiento en el otro sentido: un rol nuevo en el enum sin migración
    // provocaría un 23514 en producción. Que el conteo coincida lo detecta aquí.
    const declared = alterSql.match(/'[A-Z_]+'/g) ?? [];
    expect(declared).toHaveLength(Object.values(UserRole).length);
  });

  it('los roles de plataforma quedan FUERA del dominio de la columna', async () => {
    const fake = createFakeQueryRunner();
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await migration.up(fake.runner);

    const alterSql = fake.queries.find((sql) => sql.includes(ALTER_FRAGMENT)) ?? '';

    for (const role of Object.values(PlatformRole)) {
      expect(alterSql).not.toContain(`'${role}'`);
    }
  });

  it('down() retira el CHECK — la migración es reversible', async () => {
    const fake = createFakeQueryRunner();
    const migration = new NarrowUsersRoleToTenantDomain0850000000000();

    await migration.down(fake.runner);

    expect(
      fake.queries.some((sql) => sql.includes('DROP CONSTRAINT chk_users_role_tenant_domain')),
    ).toBe(true);
  });
});
