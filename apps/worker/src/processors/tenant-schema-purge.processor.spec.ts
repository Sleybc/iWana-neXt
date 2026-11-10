import { Pool } from 'pg';
import { MissingPurgeCredentialsError } from '@iwana/db';
import { TenantSchemaPurgeProcessor } from './tenant-schema-purge.processor';

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
}));

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

const LIST_SQL =
  'SELECT id::text AS id FROM public.iwana_list_purge_candidates($1::int, $2::int) AS id';
const PURGE_SQL = 'SELECT public.iwana_purge_tenant_schema($1::uuid, $2::int) AS outcome';

function buildProcessor(values: Record<string, unknown> = {}): TenantSchemaPurgeProcessor {
  const env: Record<string, unknown> = {
    DB_USER: 'iwana_app',
    DB_PASSWORD: 'app',
    DB_PURGER_USER: 'iwana_purger',
    DB_PURGER_PASSWORD: 'purger',
    ...values,
  };
  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => env[key] ?? defaultValue),
  };
  return new TenantSchemaPurgeProcessor(config as never);
}

function pgError(message: string, code = 'P0001'): Error {
  return Object.assign(new Error(message), { code });
}

describe('TenantSchemaPurgeProcessor (R7 / ADR-108)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('conecta con el rol de purga, no con DB_USER', () => {
    buildProcessor();
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'iwana_purger', password: 'purger' }),
    );
  });

  it('en producción no arranca sin DB_PURGER_USER', () => {
    expect(() => buildProcessor({ NODE_ENV: 'production', DB_PURGER_USER: undefined })).toThrow(
      MissingPurgeCredentialsError,
    );
    expect(Pool).not.toHaveBeenCalled();
  });

  it('fuera de producción, sin DB_PURGER_USER, usa DB_USER y lo avisa', () => {
    buildProcessor({ NODE_ENV: 'development', DB_PURGER_USER: undefined });
    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({ user: 'iwana_app' }));
  });

  it('lista candidatos y purga cada uno con la función de la base, sin DDL propio', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }, { id: 'tenant-2' }] })
      .mockResolvedValueOnce({ rows: [{ outcome: 'PURGED' }] })
      .mockResolvedValueOnce({ rows: [{ outcome: 'SKIPPED_LOCKED' }] });

    await buildProcessor().process({} as never);

    expect(mockClient.query).toHaveBeenNthCalledWith(1, LIST_SQL, [30, 20]);
    expect(mockClient.query).toHaveBeenNthCalledWith(2, PURGE_SQL, ['tenant-1', 30]);
    expect(mockClient.query).toHaveBeenNthCalledWith(3, PURGE_SQL, ['tenant-2', 30]);
    const statements = mockClient.query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => /DROP|DELETE|INSERT|BEGIN|advisory/i.test(sql))).toBe(false);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('respeta retención y lote configurados como strings de entorno', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    await buildProcessor({
      TENANT_PURGE_RETENTION_DAYS: '45',
      TENANT_PURGE_BATCH_SIZE: '3',
    }).process({} as never);
    expect(mockClient.query).toHaveBeenNthCalledWith(1, LIST_SQL, [45, 3]);
  });

  it('un rechazo de la base no detiene el lote y el job termina en error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }, { id: 'tenant-2' }, { id: 'tenant-3' }] })
      .mockRejectedValueOnce(pgError('TENANT_PURGE_EXTERNAL_DEPENDENCY'))
      .mockResolvedValueOnce({ rows: [{ outcome: 'PURGED' }] })
      .mockRejectedValueOnce(pgError('permission denied for function', '42501'));

    const processor = buildProcessor();
    const errorSpy = jest
      .spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(processor.process({} as never)).rejects.toBeInstanceOf(Error);

    expect(mockClient.query).toHaveBeenCalledTimes(4);
    expect(mockClient.query).toHaveBeenNthCalledWith(3, PURGE_SQL, ['tenant-2', 30]);
    const logged = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(logged).toEqual([
      expect.stringContaining('codigo=TENANT_PURGE_EXTERNAL_DEPENDENCY'),
      expect.stringContaining('codigo=SQLSTATE_42501'),
    ]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['la constancia no está registrada o está revocada', pgError('TENANT_PURGE_EVIDENCE_REQUIRED')],
    [
      'la transacción de la constancia no corre en READ COMMITTED',
      pgError('TENANT_PURGE_EVIDENCE_ISOLATION'),
    ],
  ])('resume los rechazos de evidencia D-2 con su codigo cerrado, %s', async (_caso, rechazo) => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockRejectedValueOnce(rechazo);
    const processor = buildProcessor();
    const errorSpy = jest
      .spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(processor.process({} as never)).rejects.toBeInstanceOf(Error);

    const logged = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('codigo=TENANT_PURGE_EVIDENCE_');
    expect(logged[0]).not.toContain('tenant_x');
    expect(logged[0]).not.toContain('P0001');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'un error del driver con el esquema en el mensaje y un SQLSTATE fuera de la lista cerrada',
      pgError('relation "tenant_x.customers" does not exist', '42P01'),
    ],
    [
      'un valor que no es Error, aunque traiga mensaje y código con el esquema',
      { message: 'relation "tenant_x.customers" does not exist', code: '42P01' },
    ],
    ['una cadena suelta con el esquema', 'tenant_x.customers: boom'],
  ])('resume como TENANT_PURGE_FAILURE %s, sin filtrar el esquema', async (_caso, rechazo) => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockRejectedValueOnce(rechazo);

    const processor = buildProcessor();
    const errorSpy = jest
      .spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    const failure = await processor.process({} as never).then(
      () => undefined,
      (error: unknown) => error as Error,
    );

    const logged = errorSpy.mock.calls.map((call) => String(call[0]));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('codigo=TENANT_PURGE_FAILURE');
    expect(logged[0]).not.toContain('tenant_x');
    expect(logged[0]).not.toContain('42P01');
    // El mensaje del job lo reduce el decorador de failedReason; aquí solo importa que falle.
    expect(failure).toBeInstanceOf(Error);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('el failedReason no expone el mensaje original ni el esquema', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockRejectedValueOnce(pgError('TENANT_PURGE_RETENTION_NOT_MET'));
    const processor = buildProcessor();
    jest
      .spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    const failure = await processor.process({} as never).then(
      () => undefined,
      (error: unknown) => error as Error,
    );
    expect(failure?.message).not.toMatch(/tenant_/);
  });
});
