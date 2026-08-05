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
});
