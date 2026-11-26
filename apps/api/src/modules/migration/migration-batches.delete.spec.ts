import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@iwana/shared';
import { MigrationBatchesService } from './migration-batches.service';
import { initialBatchCounts } from './migration.constants';

const TENANT = '00000000-0000-4000-8000-000000000001';
const BATCH = '00000000-0000-4000-8000-0000000000b1';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const scope = { tenantId: TENANT, schemaName: 'tenant_test' };
const PREFIX = `tenant_test/migration/${BATCH}/`;

const qr = { query: jest.fn(), manager: {} };

jest.mock('@iwana/db', () => ({
  ...jest.requireActual('@iwana/db'),
  runInTenantSchema: (_ds: unknown, _schema: string, fn: (runner: unknown) => unknown) => fn(qr),
}));

function counts(files: number, procesamiento: 'PENDIENTE' | 'COMPLETADO' | 'FALLIDO') {
  return { ...initialBatchCounts(files), procesamiento };
}

/** Eliminar lote (ADR-110 v1.4 D16). */
describe('MigrationBatchesService.deleteBatch', () => {
  const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  let service: MigrationBatchesService;

  function batchRow(status: string, procesamiento: 'PENDIENTE' | 'COMPLETADO' | 'FALLIDO') {
    qr.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT')) {
        return [{ status, counts: counts(2, procesamiento), source_object_key: PREFIX }];
      }
      return [];
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MigrationBatchesService(
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      audit as never,
    );
  });

  it.each([
    ['SIMULADO', 'COMPLETADO'],
    ['SIMULADO', 'FALLIDO'],
    ['REVERTIDO', 'COMPLETADO'],
  ] as const)('elimina un lote %s (%s): ZIP, fila y auditoría', async (status, processing) => {
    batchRow(status, processing);
    await service.deleteBatch(scope, BATCH, ACTOR);
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(storage.deleteObject).toHaveBeenCalledWith(expect.stringContaining(PREFIX));
    expect(qr.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM migration_batches'),
      [BATCH, TENANT],
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.DELETE,
        entityId: BATCH,
        userId: ACTOR,
        oldValue: { status, files: 2 },
      }),
      qr.manager,
    );
  });

  it.each([
    ['CARGADO', 'COMPLETADO', 'Revierte el lote antes de eliminarlo.'],
    ['PROMOVIDO', 'COMPLETADO', 'Revierte el lote antes de eliminarlo.'],
    ['CONCILIADO', 'COMPLETADO', 'Revierte el lote antes de eliminarlo.'],
    ['SIMULADO', 'PENDIENTE', 'La simulación del lote sigue en curso.'],
  ] as const)('rechaza un lote %s (%s) sin tocar nada', async (status, processing, message) => {
    batchRow(status, processing);
    const error = await service.deleteBatch(scope, BATCH, ACTOR).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toMatchObject({ response: { code: 'MIGRATION_BATCH_NOT_DELETABLE', message } });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('un lote inexistente responde 404', async () => {
    qr.query.mockResolvedValue([]);
    await expect(service.deleteBatch(scope, BATCH, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('si el borrado del ZIP falla, el lote se conserva', async () => {
    batchRow('REVERTIDO', 'COMPLETADO');
    storage.deleteObject.mockRejectedValueOnce(new Error('storage caído'));
    await expect(service.deleteBatch(scope, BATCH, ACTOR)).rejects.toThrow('storage caído');
    expect(qr.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM migration_batches'),
      expect.anything(),
    );
  });
});
