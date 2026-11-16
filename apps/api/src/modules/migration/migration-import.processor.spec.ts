import { UnrecoverableError, type Job } from 'bullmq';
import { migrationMappingTargetError } from '@iwana/shared';
import { MigrationImportProcessor } from './migration-import.processor';
import { MigrationPurgeService } from './migration-purge.service';
import {
  MigrationBatchNotVisibleError,
  MigrationPermanentError,
  type MigrationSimulationService,
} from './migration-simulation.service';
import { MIGRATION_PURGE_BATCH_SIZE } from './migration.constants';

const tenantId = '69000000-0000-4000-8000-000000000001';
const batchId = '69000000-0000-4000-8000-000000000002';

function job(name: string, data: unknown, attemptsMade = 0, attempts = 5): Job<unknown> {
  return { name, data, attemptsMade, opts: { attempts } } as unknown as Job<unknown>;
}

describe('MigrationImportProcessor', () => {
  const queue = { add: jest.fn() };
  const simulation = {
    simulate: jest.fn(),
    markFailed: jest.fn().mockResolvedValue(undefined),
    resolveTenant: jest.fn().mockResolvedValue({ tenantId, schemaName: 'tenant_x' }),
  };
  const purge = { purgeTenant: jest.fn() };
  const promotion = {
    promote: jest.fn().mockResolvedValue('CONCILIADO'),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const uispUsers = {
    fetch: jest.fn().mockResolvedValue({}),
    recordFetchFailure: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = { query: jest.fn() };
  const processor = new MigrationImportProcessor(
    dataSource as never,
    queue as never,
    simulation as unknown as MigrationSimulationService,
    purge as unknown as MigrationPurgeService,
    promotion as never,
    uispUsers as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('registra la purga diaria repetible', async () => {
    await processor.onApplicationBootstrap();
    expect(queue.add).toHaveBeenCalledWith(
      'purge-sweep',
      {},
      expect.objectContaining({ repeat: { pattern: '30 3 * * *', tz: 'America/Bogota' } }),
    );
  });

  it('rechaza payloads con campos extra o sin uuid (nunca PII en la cola)', async () => {
    await expect(
      processor.process(job('simulate-batch', { version: 1, tenantId, batchId, documento: 'x' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processor.process(job('simulate-batch', { version: 1, tenantId: 'tenant_x', batchId })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(simulation.simulate).not.toHaveBeenCalled();
  });

  it('simula con el tenant explícito del payload', async () => {
    simulation.simulate.mockResolvedValueOnce('SIMULADO');
    await processor.process(job('simulate-batch', { version: 1, tenantId, batchId }));
    expect(simulation.simulate).toHaveBeenCalledWith(tenantId, batchId);
    expect(simulation.markFailed).not.toHaveBeenCalled();
  });

  it('lote aún no visible: reintenta sin marcar fallo salvo en el último intento', async () => {
    simulation.simulate.mockRejectedValue(new MigrationBatchNotVisibleError());
    await expect(
      processor.process(job('simulate-batch', { version: 1, tenantId, batchId }, 0)),
    ).rejects.toBeInstanceOf(MigrationBatchNotVisibleError);
    expect(simulation.markFailed).not.toHaveBeenCalled();
    await expect(
      processor.process(job('simulate-batch', { version: 1, tenantId, batchId }, 4)),
    ).rejects.toBeInstanceOf(MigrationBatchNotVisibleError);
    expect(simulation.markFailed).toHaveBeenCalledWith(tenantId, batchId);
    simulation.simulate.mockReset();
  });

  it('error permanente: marca FALLIDO y no reintenta', async () => {
    simulation.simulate.mockRejectedValueOnce(
      new MigrationPermanentError('MIGRATION_OBJECT_UNREADABLE'),
    );
    await expect(
      processor.process(job('simulate-batch', { version: 1, tenantId, batchId })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(simulation.markFailed).toHaveBeenCalledWith(tenantId, batchId);
  });

  const actorId = '69000000-0000-4000-8000-0000000000aa';

  it('promueve con tenant y actor explícitos del payload', async () => {
    await processor.process(job('promote-batch', { version: 1, tenantId, batchId, actorId }));
    expect(promotion.promote).toHaveBeenCalledWith(tenantId, batchId, actorId);
    expect(promotion.markFailed).not.toHaveBeenCalled();
  });

  it('rechaza un payload de promoción sin actor o con datos extra', async () => {
    await expect(
      processor.process(job('promote-batch', { version: 1, tenantId, batchId })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processor.process(
        job('promote-batch', { version: 1, tenantId, batchId, actorId, nombre: 'x' }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(promotion.promote).not.toHaveBeenCalled();
  });

  it('promoción: error transitorio reintenta y solo el último intento marca FALLIDO', async () => {
    promotion.promote.mockRejectedValue(new Error('transitorio'));
    await expect(
      processor.process(job('promote-batch', { version: 1, tenantId, batchId, actorId }, 0, 3)),
    ).rejects.toThrow('class=Error');
    expect(promotion.markFailed).not.toHaveBeenCalled();
    await expect(
      processor.process(job('promote-batch', { version: 1, tenantId, batchId, actorId }, 2, 3)),
    ).rejects.toThrow('class=Error');
    expect(promotion.markFailed).toHaveBeenCalledWith(tenantId, batchId);
    promotion.promote.mockReset();
  });

  it('promoción: error permanente no se reintenta', async () => {
    promotion.promote.mockRejectedValueOnce(
      new MigrationPermanentError('MIGRATION_OBJECT_UNREADABLE'),
    );
    await expect(
      processor.process(job('promote-batch', { version: 1, tenantId, batchId, actorId })),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(promotion.markFailed).toHaveBeenCalledWith(tenantId, batchId);
  });

  it('el barrido encola un job por tenant activo con solo identificadores', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: tenantId }]);
    await processor.process(job('purge-sweep', {}));
    expect(queue.add).toHaveBeenCalledWith(
      'purge-tenant',
      { version: 1, tenantId, runId: expect.any(String) },
      expect.objectContaining({ jobId: expect.stringContaining(`migration-purge-${tenantId}-`) }),
    );
  });

  it('la purga continúa en otro job si llenó el lote', async () => {
    purge.purgeTenant.mockResolvedValueOnce(MIGRATION_PURGE_BATCH_SIZE);
    await processor.process(
      job('purge-tenant', { version: 1, tenantId, runId: '69000000-0000-4000-8000-000000000003' }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'purge-tenant',
      expect.objectContaining({ tenantId }),
      expect.anything(),
    );
    purge.purgeTenant.mockResolvedValueOnce(2);
    queue.add.mockClear();
    await processor.process(
      job('purge-tenant', { version: 1, tenantId, runId: '69000000-0000-4000-8000-000000000003' }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('tenant inactivo en la purga: fallo definitivo', async () => {
    simulation.resolveTenant.mockRejectedValueOnce(
      new MigrationPermanentError('MIGRATION_TENANT_INACTIVE'),
    );
    await expect(
      processor.process(
        job('purge-tenant', {
          version: 1,
          tenantId,
          runId: '69000000-0000-4000-8000-000000000003',
        }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('ignora jobs desconocidos', async () => {
    await expect(processor.process(job('otro', {}))).resolves.toBeUndefined();
  });

  describe('lectura de usuarios de UISP (ADR-110 D15)', () => {
    const actorId = '69000000-0000-4000-8000-000000000003';

    it('resuelve el tenant y ejecuta la lectura con el actor del payload', async () => {
      await processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId }));

      expect(simulation.resolveTenant).toHaveBeenCalledWith(tenantId);
      expect(uispUsers.fetch).toHaveBeenCalledWith({ tenantId, schemaName: 'tenant_x' }, actorId);
    });

    it('un payload con más que ids es irrecuperable y no lee nada', async () => {
      await expect(
        processor.process(
          job('fetch-uisp-users', { version: 1, tenantId, actorId, appKey: 'secreta' }),
        ),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(uispUsers.fetch).not.toHaveBeenCalled();
    });

    it('un error permanente (clave rechazada) no se reintenta', async () => {
      uispUsers.fetch.mockRejectedValueOnce(
        new MigrationPermanentError('MIGRATION_SOURCE_UNAUTHORIZED'),
      );

      await expect(
        processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId })),
      ).rejects.toBeInstanceOf(UnrecoverableError);
    });

    it('un error transitorio se propaga para que BullMQ reintente', async () => {
      uispUsers.fetch.mockRejectedValueOnce(new Error('pool agotado'));

      const error = await processor
        .process(job('fetch-uisp-users', { version: 1, tenantId, actorId }))
        .catch((caught: unknown) => caught);

      expect(error).not.toBeInstanceOf(UnrecoverableError);
      // Quedan reintentos: todavía no se registra el fallo (el portal sigue esperando).
      expect(uispUsers.recordFetchFailure).not.toHaveBeenCalled();
    });

    it('en el último intento registra el fallo para que el portal deje de sondear', async () => {
      const failure = new Error('pool agotado');
      uispUsers.fetch.mockRejectedValueOnce(failure);

      await expect(
        processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId }, 2, 3)),
      ).rejects.not.toBeInstanceOf(UnrecoverableError);
      expect(uispUsers.recordFetchFailure).toHaveBeenCalledWith(
        { tenantId, schemaName: 'tenant_x' },
        actorId,
        failure,
      );
    });

    it('un error permanente también pasa por el registro del fallo', async () => {
      const failure = new MigrationPermanentError('MIGRATION_SOURCE_NOT_CONFIGURED');
      uispUsers.fetch.mockRejectedValueOnce(failure);

      await expect(
        processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId })),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(uispUsers.recordFetchFailure).toHaveBeenCalledWith(
        { tenantId, schemaName: 'tenant_x' },
        actorId,
        failure,
      );
    });

    it('si registrar el fallo falla, se conserva el error original', async () => {
      const failure = new Error('pool agotado');
      uispUsers.fetch.mockRejectedValueOnce(failure);
      uispUsers.recordFetchFailure.mockRejectedValueOnce(new Error('sin base'));

      await expect(
        processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId }, 2, 3)),
      ).rejects.not.toBeInstanceOf(UnrecoverableError);
    });

    it('sin tenant resuelto no intenta registrar nada', async () => {
      simulation.resolveTenant.mockRejectedValueOnce(
        new MigrationPermanentError('MIGRATION_BATCH_NOT_FOUND'),
      );
      await expect(
        processor.process(job('fetch-uisp-users', { version: 1, tenantId, actorId })),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(uispUsers.recordFetchFailure).not.toHaveBeenCalled();
    });
  });
});

describe('MigrationPurgeService — guarda de clave', () => {
  it('no borra objetos cuyo prefijo no es el del lote y tenant', async () => {
    const storage = { deleteObject: jest.fn() };
    const qr = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {},
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT')
          ? [{ id: 'b1', counts: {}, source_object_key: 'tenant_otro/migration/b1/' }]
          : [],
      ),
    };
    const service = new MigrationPurgeService(
      { createQueryRunner: () => qr } as never,
      storage as never,
      { logWithin: jest.fn() } as never,
    );
    await expect(service.purgeTenant({ tenantId, schemaName: 'tenant_x' })).resolves.toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('migrationMappingTargetError (contrato compartido)', () => {
  it.each([
    ['PLAN', 'EQUIVALE', '69000000-0000-4000-8000-000000000009', null],
    ['PLAN', 'EQUIVALE', 'plan-basico', 'MIGRATION_MAPPING_TARGET_INVALID'],
    ['PLAN', 'DESCARTAR', null, 'MIGRATION_MAPPING_TARGET_INVALID'],
    ['METODO_PAGO', 'EQUIVALE', 'EFECTIVO', null],
    ['METODO_PAGO', 'EQUIVALE', 'TARJETA', 'MIGRATION_MAPPING_TARGET_INVALID'],
    ['CICLO', 'EQUIVALE', '28', null],
    ['CICLO', 'EQUIVALE', '29', 'MIGRATION_MAPPING_TARGET_INVALID'],
    ['ETIQUETA', 'NOTA', null, null],
    [
      'ETIQUETA',
      'DESCARTAR',
      '69000000-0000-4000-8000-000000000009',
      'MIGRATION_MAPPING_TARGET_INVALID',
    ],
    ['ETIQUETA', 'EQUIVALE', null, 'MIGRATION_MAPPING_TARGET_INVALID'],
  ] as const)('%s %s %s → %s', (kind, action, target, expected) => {
    expect(migrationMappingTargetError(kind, action, target)).toBe(expected);
  });
});
