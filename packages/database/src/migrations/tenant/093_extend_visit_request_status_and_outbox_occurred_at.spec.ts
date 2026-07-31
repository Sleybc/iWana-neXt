import { ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 } from './093_extend_visit_request_status_and_outbox_occurred_at';

describe('ExtendVisitRequestStatusAndOutboxOccurredAt093', () => {
  let migration: ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000;

  beforeEach(() => {
    migration = new ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000();
  });

  describe('up', () => {
    it('ejecuta ALTER TYPE visit_request_status para los 3 nuevos valores', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            "ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'IN_EXECUTION'",
          ),
          expect.stringContaining(
            "ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'CLOSED'",
          ),
          expect.stringContaining(
            "ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'REQUIRES_RESCHEDULE'",
          ),
        ]),
      );

      const addColumn = queries.find((q) => q.includes('ADD COLUMN IF NOT EXISTS occurred_at'));
      expect(addColumn).toBeDefined();
      expect(addColumn).not.toContain('NOT NULL DEFAULT NOW()');
      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ALTER COLUMN occurred_at SET DEFAULT NOW()'),
          expect.stringContaining('ALTER COLUMN occurred_at SET NOT NULL'),
        ]),
      );
    });

    it('crea el nuevo índice idx_execution_order_outbox_pending con la columna lease_until', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const createIndex = queries.find(
        (q) => q.includes('CREATE INDEX') && q.includes('lease_until'),
      );
      expect(createIndex).toBeDefined();
      expect(createIndex).toContain('published_at');
      expect(createIndex).toContain('available_at');
      expect(createIndex).toContain('lease_until');
    });

    it('backfill occurred_at = created_at en ventanas de 500 filas', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const updateQ = queries.find((q) => q.includes('SET occurred_at') && q.includes('LIMIT 500'));
      expect(updateQ).toBeDefined();
    });
  });

  describe('down', () => {
    it('reconstruye el índice pending a su forma anterior y elimina occurred_at', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([expect.stringContaining('DROP COLUMN IF EXISTS occurred_at')]),
      );

      // Reconstruye índice con (tenant_id, published_at, available_at)
      const newIndex = queries.find(
        (q) => q.includes('CREATE INDEX') && q.includes('tenant_id') && q.includes('published_at'),
      );
      expect(newIndex).toBeDefined();
    });

    it('reconstruye el enum histórico en vez de dejar valores nuevos huérfanos', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          return [];
        }),
      } as never;

      await migration.down(queryRunner);

      const all = queries.join(' ');
      expect(all).toContain(
        'ALTER TYPE visit_request_status RENAME TO visit_request_status_093_extended',
      );
      expect(all).toContain('CREATE TYPE visit_request_status AS ENUM');
      expect(all).toContain('USING status::text::visit_request_status');
      expect(all).toContain('DROP TYPE visit_request_status_093_extended');
    });

    it('bloquea si quedan estados nuevos porque no hace un mapeo semántico implícito', async () => {
      const query = jest.fn(async (sql: string) => {
        if (sql.includes('status::text IN')) return [{ total: 1 }];
        return [];
      });

      await expect(migration.down({ query } as never)).rejects.toThrow(
        /Reconcilie esos estados a un valor histórico/,
      );
      expect(query.mock.calls.map(([sql]) => String(sql)).join(' ')).not.toContain('DROP COLUMN');
    });
  });
});
