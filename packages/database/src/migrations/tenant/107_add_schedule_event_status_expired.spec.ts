import { AddScheduleEventStatusExpired107 } from './107_add_schedule_event_status_expired';

describe('107_add_schedule_event_status_expired', () => {
  it('up añade EXPIRED al enum schedule_event_status con IF NOT EXISTS', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    };

    const migration = new AddScheduleEventStatusExpired107();
    await migration.up(queryRunner as never);

    expect(queries).toEqual([`ALTER TYPE schedule_event_status ADD VALUE IF NOT EXISTS 'EXPIRED'`]);
  });

  it('down bloquea si hay filas EXPIRED sin flag destructivo', async () => {
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return [{ total: 2 }];
        }
        return [];
      }),
    };

    const migration = new AddScheduleEventStatusExpired107();
    await expect(migration.down(queryRunner as never)).rejects.toThrow(
      /EXPIRED|IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN/,
    );
  });

  it('down libera el DEFAULT antes de recastear la columna y lo restituye después', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('COUNT(*)')) {
          return [{ total: 0 }];
        }
        return [];
      }),
    };

    const migration = new AddScheduleEventStatusExpired107();
    await migration.down(queryRunner as never);

    const dropDefault = queries.findIndex((sql) => sql.includes('DROP DEFAULT'));
    const alterType = queries.findIndex((sql) => sql.includes('ALTER COLUMN status TYPE'));
    const setDefault = queries.findIndex((sql) => sql.includes('SET DEFAULT'));

    // Sin este orden Postgres aborta con
    // "default for column status cannot be cast automatically" (verificado contra PG).
    expect(dropDefault).toBeGreaterThanOrEqual(0);
    expect(dropDefault).toBeLessThan(alterType);
    expect(alterType).toBeLessThan(setDefault);
  });
});
