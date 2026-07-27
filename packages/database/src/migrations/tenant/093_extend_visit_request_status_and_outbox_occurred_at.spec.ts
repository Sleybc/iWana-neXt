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

      expect(queries).toEqual(
        expect.arrayContaining([expect.stringContaining('ADD COLUMN IF NOT EXISTS occurred_at')]),
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

    it('actualiza occurred_at = created_at para eventos existentes que tengan occurred_at NULL', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const updateQ = queries.find(
        (q) => q.includes('SET occurred_at') && q.includes('WHERE occurred_at IS NULL'),
      );
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
  });
});
