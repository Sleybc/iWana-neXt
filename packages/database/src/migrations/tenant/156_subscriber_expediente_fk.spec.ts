import { QueryRunner } from 'typeorm';

import { SubscriberExpedienteForeignKey1560000000000 } from './156_subscriber_expediente_fk';

describe('Migración 156 — FK del expediente del suscriptor', () => {
  it('reporta ids huérfanos y no crea la FK', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('orphan_subscriber_id')) {
          return [
            {
              orphan_subscriber_id: '00000000-0000-0000-0000-000000000001',
              expediente_id: '00000000-0000-0000-0000-000000000002',
              orphan_count: 1,
            },
          ];
        }
        return [];
      }),
    } as unknown as QueryRunner;

    await expect(new SubscriberExpedienteForeignKey1560000000000().up(runner)).rejects.toThrow(
      /00000000-0000-0000-0000-000000000001.*00000000-0000-0000-0000-000000000002/,
    );
    expect(statements.join('\n')).not.toContain('ADD CONSTRAINT');
  });

  it('crea la FK después del preflight vacío y ofrece down', async () => {
    const statements: string[] = [];
    const runner = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        return [];
      }),
    } as unknown as QueryRunner;
    const migration = new SubscriberExpedienteForeignKey1560000000000();

    await migration.up(runner);
    expect(statements.join('\n')).toContain('REFERENCES expediente_records(id) ON DELETE RESTRICT');
    statements.length = 0;
    await migration.down(runner);
    expect(statements.join('\n')).toContain(
      'DROP CONSTRAINT IF EXISTS fk_subscribers_expediente_id',
    );
  });
});
