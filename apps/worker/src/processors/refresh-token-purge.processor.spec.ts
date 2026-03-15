import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { RefreshTokenPurgeProcessor } from './refresh-token-purge.processor';

// Mock de ConfigService de NestJS
jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
}));

// Mock del decorador @Processor de BullMQ (no necesita instanciar BullMQ en tests unitarios)
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {
    worker = undefined;
  },
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

// Helper para construir el processor con el ConfigService mockeado
function buildProcessor(): RefreshTokenPurgeProcessor {
  const { ConfigService } = jest.requireMock('@nestjs/config') as {
    ConfigService: jest.MockedClass<new () => { get: jest.Mock }>;
  };
  const config = new ConfigService();
  return new RefreshTokenPurgeProcessor(config as never);
}

describe('RefreshTokenPurgeProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('elimina refresh tokens expirados de tenants activos', async () => {
    // Simular: 1 tenant activo con 5 tokens a eliminar
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 'tenant-uuid-1', schema_name: 'tenant_isp_co' }],
      })
      .mockResolvedValueOnce({ rowCount: 5 });

    const processor = buildProcessor();
    await processor.process({} as never);

    // Verificar que se consultaron los tenants activos
    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      "SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'",
    );

    // Verificar que el DELETE usa el schema validado
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM tenant_isp_co.refresh_tokens WHERE expires_at < NOW() AND revoked_at IS NOT NULL',
    );

    // Verificar que el cliente siempre se libera al pool
    expect(mockClient.release).toHaveBeenCalledTimes(1);

    // Verificar que Pool fue instanciado una vez al crear el processor
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it('no lanza error cuando no hay tokens que purgar (rowCount = 0)', async () => {
    // Simular: 1 tenant activo, ningún token a eliminar
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 'tenant-uuid-2', schema_name: 'tenant_sin_tokens' }],
      })
      .mockResolvedValueOnce({ rowCount: 0 });

    const processor = buildProcessor();

    // No debe lanzar ningún error
    await expect(processor.process({} as never)).resolves.toBeUndefined();

    expect(mockClient.query).toHaveBeenCalledTimes(2);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('lanza UnrecoverableError si el schema_name es inválido', async () => {
    // Simular: 1 tenant con schema_name malicioso (SQL injection attempt)
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-evil', schema_name: 'public; DROP TABLE users' }],
    });

    const processor = buildProcessor();

    await expect(processor.process({} as never)).rejects.toBeInstanceOf(UnrecoverableError);

    // El DELETE nunca debe ejecutarse si el schema_name falla la validación
    expect(mockClient.query).toHaveBeenCalledTimes(1);

    // El cliente debe liberarse incluso al lanzar UnrecoverableError (bloque finally)
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('libera el cliente al pool aunque el DELETE falle con error transitorio', async () => {
    // Simular: 1 tenant activo, el DELETE lanza un error de conexión
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 'tenant-uuid-3', schema_name: 'tenant_error' }],
      })
      .mockRejectedValueOnce(new Error('connection reset'));

    const processor = buildProcessor();

    await expect(processor.process({} as never)).rejects.toThrow('connection reset');

    // El cliente debe liberarse siempre (bloque finally garantiza esto)
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('procesa múltiples tenants y acumula el total de tokens eliminados', async () => {
    // Simular: 3 tenants activos con 2, 0 y 3 tokens respectivamente
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'tenant-uuid-a', schema_name: 'tenant_a' },
          { id: 'tenant-uuid-b', schema_name: 'tenant_b' },
          { id: 'tenant-uuid-c', schema_name: 'tenant_c' },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 3 });

    const processor = buildProcessor();

    // No debe lanzar error — los 5 tokens en total deben procesarse
    await expect(processor.process({} as never)).resolves.toBeUndefined();

    // 1 query para obtener tenants + 3 DELETE (uno por tenant)
    expect(mockClient.query).toHaveBeenCalledTimes(4);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
