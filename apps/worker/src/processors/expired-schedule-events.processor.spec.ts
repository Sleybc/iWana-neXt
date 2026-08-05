import { Logger } from '@nestjs/common';
import {
  EXPIRED_SCHEDULE_EVENTS_DEFAULT_GRACE_MINUTES,
  ExpiredScheduleEventsProcessor,
} from './expired-schedule-events.processor';

// Mock de ConfigService de NestJS
jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
}));

// Mock del decorador @Processor y del inyector @InjectQueue de BullMQ
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
  InjectQueue: () => () => undefined,
}));

// Mock de @iwana/db — isValidSchemaName
jest.mock('@iwana/db', () => ({
  isValidSchemaName: jest
    .fn()
    .mockImplementation((name: string) => /^[a-z][a-z0-9_]*$/i.test(name)),
}));

// Mock del cliente pg — se reutiliza entre tests
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
  })),
}));

function buildProcessor(): ExpiredScheduleEventsProcessor {
  const { ConfigService } = jest.requireMock('@nestjs/config') as {
    ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
  };
  const config = new ConfigService();
  return new ExpiredScheduleEventsProcessor(config as never, {} as never);
}

/** Secuencia típica por tenant tras A1: BEGIN → SET LOCAL → UPDATE → COMMIT */
function mockTenantSweep(updateResult: { rows: Array<{ id: string }>; rowCount: number }) {
  mockClient.query.mockResolvedValueOnce({ rowCount: 0 }); // BEGIN
  mockClient.query.mockResolvedValueOnce({ rowCount: 0 }); // SET LOCAL
  mockClient.query.mockResolvedValueOnce(updateResult); // UPDATE
  mockClient.query.mockResolvedValueOnce({ rowCount: 0 }); // COMMIT
}

describe('ExpiredScheduleEventsProcessor', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue(mockClient);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('process', () => {
    it('debe conectar al pool, iterar tenants y liberar el cliente', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const processor = buildProcessor();
      await processor.process({} as never);

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT schema_name FROM public.tenants'),
      );
    });

    it('debe omitir schemas inválidos', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }, { schema_name: "'; DROP TABLE --" }],
        rowCount: 2,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      const { isValidSchemaName } = jest.requireMock('@iwana/db') as {
        isValidSchemaName: jest.Mock;
      };
      isValidSchemaName.mockImplementation((name: string) => name === 'tenant_001');

      await processor.process({} as never);

      // tenants + BEGIN + SET + UPDATE + COMMIT (sin query de timezone)
      expect(mockClient.query).toHaveBeenCalledTimes(5);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.stringContaining('Schema inválido omitido'),
      );
    });

    it('debe marcar como EXPIRED eventos SCHEDULED y DRAFT vencidos', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({
        rows: [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }],
        rowCount: 3,
      });

      const processor = buildProcessor();
      await processor.process({} as never);

      const updateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && String(call[0]).includes('UPDATE schedule_events'),
      );
      expect(updateCalls.length).toBe(1);

      const updateQuery = String(updateCalls[0][0]);
      expect(updateQuery).toContain("status IN ('SCHEDULED', 'DRAFT')");
      expect(updateQuery).toContain('LIMIT 100');
      expect(updateQuery).toContain('EXPIRED');

      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('3 eventos marcados EXPIRED'),
      );
    });

    it('tras barrido: marca EXPIRED y NO toca VisitRequest (D7 — el job no decide)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({
        rows: [{ id: 'ev-expired-only' }],
        rowCount: 1,
      });

      const processor = buildProcessor();
      await processor.process({} as never);

      const allSql = mockClient.query.mock.calls
        .map((call: unknown[]) => String(call[0] ?? ''))
        .join('\n');

      expect(allSql).toMatch(/UPDATE\s+schedule_events/i);
      expect(allSql).toContain('EXPIRED');
      expect(allSql).not.toMatch(/UPDATE\s+visit_requests/i);
      expect(allSql).not.toContain('REQUIRES_RESCHEDULE');
      expect(allSql).not.toContain('CANCELLED');
    });

    it('compara scheduled_end_at con NOW() timestamptz sin reinterpretar zona y con margen (A1)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      await processor.process({} as never);

      const updateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && String(call[0]).includes('UPDATE schedule_events'),
      );
      const updateQuery = String(updateCalls[0]?.[0] ?? '');
      const updateParams = updateCalls[0]?.[1] as unknown[] | undefined;

      expect(updateQuery).not.toMatch(/NOW\(\)\s+AT\s+TIME\s+ZONE/i);
      expect(updateQuery).toMatch(/scheduled_end_at\s*<\s*NOW\(\)\s*-\s*\(\$1/i);
      expect(updateParams?.[0]).toBe(processor.graceMinutes);
      expect(processor.graceMinutes).toBe(EXPIRED_SCHEDULE_EVENTS_DEFAULT_GRACE_MINUTES);
    });

    it('NO debe tocar eventos futuros', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      await processor.process({} as never);

      const updateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && String(call[0]).includes('UPDATE schedule_events'),
      );
      expect(updateCalls.length).toBe(1);

      const updateQuery = String(updateCalls[0][0]);
      expect(updateQuery).toContain('scheduled_end_at');
      expect(updateQuery).toContain('NOW()');
    });

    it('NO debe tocar eventos en estados terminales (COMPLETED, CANCELLED, NO_SHOW)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      await processor.process({} as never);

      const updateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && String(call[0]).includes('UPDATE schedule_events'),
      );
      const updateQuery = String(updateCalls[0][0]);
      expect(updateQuery).toContain("status IN ('SCHEDULED', 'DRAFT')");
      expect(updateQuery).not.toContain('COMPLETED');
    });

    it('debe limitar a 100 por tenant por ejecución', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ schema_name: 'tenant_001' }],
        rowCount: 1,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      await processor.process({} as never);

      const updateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && String(call[0]).includes('UPDATE schedule_events'),
      );
      const updateQuery = String(updateCalls[0][0]);
      expect(updateQuery).toContain('LIMIT 100');
    });

    it('debe manejar fallos en un tenant sin detener el barrido de otros', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { schema_name: 'tenant_001' },
          { schema_name: 'tenant_002' },
          { schema_name: 'tenant_003' },
        ],
        rowCount: 3,
      });
      // tenant_001: BEGIN + SET + UPDATE falla + ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
      mockClient.query.mockRejectedValueOnce(new Error('conexión perdida en tenant_001'));
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });

      // tenant_002
      mockTenantSweep({
        rows: [{ id: 'ev-a' }, { id: 'ev-b' }],
        rowCount: 2,
      });

      // tenant_003
      mockTenantSweep({
        rows: [{ id: 'ev-c' }],
        rowCount: 1,
      });

      const processor = buildProcessor();
      await expect(processor.process({} as never)).rejects.toThrow(AggregateError);
    });
  });
});
