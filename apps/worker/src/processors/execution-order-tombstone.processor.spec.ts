import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ExecutionOrderTombstoneProcessor } from './execution-order-tombstone.processor';

// Mock de ConfigService de NestJS
jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
}));

// Mock del decorador @Processor y del inyector @InjectQueue de BullMQ
// (no se instancia BullMQ real en tests unitarios)
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
  InjectQueue: () => () => undefined,
}));

// Mock del cliente pg — se reutiliza entre tests con clearAllMocks
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

// Helper para construir el processor con el ConfigService mockeado.
// La cola inyectada por @InjectQueue no se usa en process(), se pasa vacía.
function buildProcessor(): ExecutionOrderTombstoneProcessor {
  const { ConfigService } = jest.requireMock('@nestjs/config') as {
    ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
  };
  const config = new ConfigService();
  return new ExecutionOrderTombstoneProcessor(config as never, {} as never);
}

describe('ExecutionOrderTombstoneProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('barre solo tenants ACTIVE ordenados por schema_name', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_co' }] });

    const processor = buildProcessor();
    await processor.process({} as never);

    // El barrido debe filtrar por ACTIVE (solo schemas migrados) y ser determinista
    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY schema_name`,
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('procesa un tenant ACTIVE con transaccion completa y purge calificado por schema', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_co' }] })
      .mockResolvedValue({ rowCount: 1 });

    const processor = buildProcessor();
    await processor.process({} as never);

    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(3, `SET LOCAL search_path TO "tenant_isp_co"`);
    expect(mockClient.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE execution_order_idempotency_records'),
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      5,
      `SELECT * FROM "tenant_isp_co".purge_execution_order_retention_batch($1)`,
      [500],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(6, 'COMMIT');
    expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it('salta un tenant con schema invalido sin ejecutar queries en su nombre', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ schema_name: 'public; DROP TABLE users' }],
    });

    const processor = buildProcessor();
    await expect(processor.process({} as never)).resolves.toBeUndefined();

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('si falla un tenant, hace ROLLBACK, continúa y propaga un error agregado', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ schema_name: 'tenant_roto' }, { schema_name: 'tenant_sano' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN tenant_roto
        .mockResolvedValueOnce({ rowCount: 1 }) // SET LOCAL tenant_roto
        .mockRejectedValueOnce(
          new Error('relation "execution_order_idempotency_records" does not exist'),
        ) // UPDATE tenant_roto falla
        .mockResolvedValueOnce({ rowCount: 1 }) // ROLLBACK tenant_roto
        .mockResolvedValue({ rowCount: 1 }); // tenant_sano continúa

      const processor = buildProcessor();
      const rejection = processor.process({} as never).catch((error: unknown) => error);
      const error = await rejection;

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).toHaveBeenCalledWith(`SET LOCAL search_path TO "tenant_sano"`);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('schema=tenant_roto'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
      expect(error).toBeInstanceOf(AggregateError);
      if (error instanceof AggregateError) {
        expect(error.errors).toHaveLength(1);
        expect(error.errors[0]).toBeInstanceOf(Error);
        expect((error.errors[0] as Error).message).toContain('schema=tenant_roto');
        expect((error.errors[0] as Error).message).toContain('does not exist');
      }
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('libera el cliente al pool si falla la query de tenants', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('connection reset'));

    const processor = buildProcessor();
    await expect(processor.process({} as never)).rejects.toThrow('connection reset');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('una corrida con conteos distintos de cero loguea los seis y el tenant procesado', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    try {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_co' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // SET LOCAL
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE tombstone
        .mockResolvedValueOnce({
          rows: [
            {
              idempotency_records_deleted: '3',
              outbox_events_deleted: '2',
              inbox_events_deleted: 1,
              audit_intents_deleted: '0',
              evidence_upload_intents_deleted: '4',
              status_transitions_anonymized: '7',
            },
          ],
        }) // SELECT purge: una sola fila con seis conteos
        .mockResolvedValue({ rowCount: 1 }); // COMMIT

      const processor = buildProcessor();
      await processor.process({} as never);

      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('schema=tenant_isp_co'));
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('status_transitions_anonymized=7'),
      );
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Purga completada'));
      const summary = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(summary).toContain('1 tenant(s) procesados');
      for (const fragment of [
        'idempotency_records_deleted=3',
        'outbox_events_deleted=2',
        'inbox_events_deleted=1',
        'audit_intents_deleted=0',
        'evidence_upload_intents_deleted=4',
        'status_transitions_anonymized=7',
      ]) {
        expect(summary).toContain(fragment);
      }
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  it('una corrida con todos los conteos en cero también emite la línea de resumen', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_co' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // SET LOCAL
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE tombstone
        .mockResolvedValueOnce({
          rows: [
            {
              idempotency_records_deleted: '0',
              outbox_events_deleted: '0',
              inbox_events_deleted: '0',
              audit_intents_deleted: '0',
              evidence_upload_intents_deleted: '0',
              status_transitions_anonymized: '0',
            },
          ],
        })
        .mockResolvedValue({ rowCount: 1 }); // COMMIT

      const processor = buildProcessor();
      await processor.process({} as never);

      // Cero no equivale a silencio: la línea distingue «no purgó nada» de «no corrió»
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Purga completada'));
      const summary = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(summary).toContain('1 tenant(s) procesados');
      for (const key of [
        'idempotency_records_deleted',
        'outbox_events_deleted',
        'inbox_events_deleted',
        'audit_intents_deleted',
        'evidence_upload_intents_deleted',
        'status_transitions_anonymized',
      ]) {
        expect(summary).toContain(`${key}=0`);
      }
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('el texto emitido no contiene PII: solo identificadores operativos y conteos', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    try {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_co' }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // SET LOCAL
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE tombstone
        .mockResolvedValueOnce({
          rows: [
            {
              idempotency_records_deleted: '1',
              outbox_events_deleted: '1',
              inbox_events_deleted: '1',
              audit_intents_deleted: '1',
              evidence_upload_intents_deleted: '1',
              status_transitions_anonymized: '5',
            },
          ],
        })
        .mockResolvedValue({ rowCount: 1 }); // COMMIT

      const processor = buildProcessor();
      await processor.process({} as never);

      // Verificación sobre el texto emitido, no por inspección visual
      const emitted = [...logSpy.mock.calls, ...debugSpy.mock.calls]
        .map((call) => String(call[0]))
        .join('\n');
      expect(emitted).toContain('schema=tenant_isp_co');
      expect(emitted).not.toMatch(/reason|changed_by|actor/i);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });
});
