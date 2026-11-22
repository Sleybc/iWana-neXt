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
  summarizeErrorForLog: (error: unknown) =>
    `class=${error instanceof Error ? error.constructor.name : 'UnknownError'} sqlstate=none` +
    (typeof (error as { code?: unknown })?.code === 'string' &&
    /^[A-Z][A-Z0-9_]{2,63}$/u.test((error as { code: string }).code)
      ? ` code=${(error as { code: string }).code}`
      : ''),
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

  describe('onApplicationBootstrap', () => {
    it('reprograma el barrido con retención acotada de ejecuciones', async () => {
      const { ConfigService } = jest.requireMock('@nestjs/config') as {
        ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
      };
      const queue = {
        add: jest.fn().mockResolvedValue(undefined),
        removeRepeatable: jest.fn().mockResolvedValue(true),
      };
      const processor = new ExpiredScheduleEventsProcessor(
        new ConfigService() as never,
        queue as never,
      );

      await processor.onApplicationBootstrap();

      expect(queue.removeRepeatable).toHaveBeenCalledWith(
        'expired-sweep',
        { pattern: '*/15 * * * *' },
        'expired-schedule-events-sweep',
      );
      expect(queue.add).toHaveBeenCalledWith(
        'expired-sweep',
        {},
        {
          repeat: { pattern: '*/15 * * * *' },
          jobId: 'expired-schedule-events-sweep',
          // B(b) familia M: 7 días y 50 fallidos (antes, solo 100 por cantidad).
          removeOnComplete: { count: 50 },
          removeOnFail: { age: 7 * 86_400, count: 50 },
        },
      );
      expect(queue.removeRepeatable.mock.invocationCallOrder[0]).toBeLessThan(
        queue.add.mock.invocationCallOrder[0] as number,
      );
    });
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
        "SELECT id::text AS id, schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name",
      );
    });

    it('un schema inválido no se interpola: barre las demás y el job falla nombrando la empresa', async () => {
      // Regla AI-EM-ARCH (2026-11-22): un schema inválido nunca se omite en silencio; cuenta
      // como fallo de esa empresa (antes se omitía con aviso y el job terminaba bien).
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { id: 'tenant-ok', schema_name: 'tenant_001' },
          { id: 'tenant-evil', schema_name: "'; DROP TABLE --" },
        ],
        rowCount: 2,
      });
      mockTenantSweep({ rows: [], rowCount: 0 });

      const processor = buildProcessor();
      const { isValidSchemaName } = jest.requireMock('@iwana/db') as {
        isValidSchemaName: jest.Mock;
      };
      isValidSchemaName.mockImplementation((name: string) => name === 'tenant_001');

      const thrown = await processor.process({} as never).catch((error: unknown) => error);

      // tenants + BEGIN + SET + UPDATE + COMMIT de la empresa válida; nada de la inválida
      expect(mockClient.query).toHaveBeenCalledTimes(5);
      const sqls = mockClient.query.mock.calls.map(([sql]) => String(sql));
      expect(sqls.some((sql) => sql.includes('DROP TABLE'))).toBe(false);
      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as Error).message).toContain('tenant=tenant-evil');
      expect((thrown as Error).message).toContain('code=TENANT_SCHEMA_INVALID');
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

    it('un schema incompleto no detiene a las demás y el motivo del job nombra la empresa', async () => {
      const incompleta = '22222222-2222-4222-8222-222222222222';
      const { isValidSchemaName } = jest.requireMock('@iwana/db') as {
        isValidSchemaName: jest.Mock;
      };
      isValidSchemaName.mockImplementation((name: string) => /^[a-z][a-z0-9_]*$/i.test(name));
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { id: '11111111-1111-4111-8111-111111111111', schema_name: 'tenant_001' },
          { id: incompleta, schema_name: 'tenant_incompleto' },
          { id: '33333333-3333-4333-8333-333333333333', schema_name: 'tenant_003' },
        ],
        rowCount: 3,
      });
      mockTenantSweep({ rows: [{ id: 'ev-a' }], rowCount: 1 });
      // tenant_incompleto: BEGIN + SET + UPDATE falla (sin schedule_events) + ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
      mockClient.query.mockRejectedValueOnce(
        Object.assign(new Error('relation "schedule_events" does not exist'), { code: '42P01' }),
      );
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
      mockTenantSweep({ rows: [{ id: 'ev-c' }], rowCount: 1 });

      const processor = buildProcessor();
      const thrown = await processor.process({} as never).catch((error: unknown) => error);

      // La empresa siguiente se barrió (BEGIN/SET/UPDATE/COMMIT) pese al fallo anterior.
      const updates = mockClient.query.mock.calls.filter(([sql]) =>
        String(sql).includes('UPDATE schedule_events'),
      );
      expect(updates).toHaveLength(3);
      expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL search_path TO "tenant_003"');
      // Lo que BullMQ guarda como failedReason identifica la empresa sin el texto del driver.
      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as Error).message).toContain(`tenant=${incompleta}`);
      expect((thrown as Error).message).not.toContain('schedule_events');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
