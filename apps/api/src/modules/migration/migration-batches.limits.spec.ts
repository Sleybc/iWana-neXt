import { BadRequestException } from '@nestjs/common';
import { MIGRATION_IMPORT_LIMITS } from '@iwana/shared';
import { MigrationBatchesService } from './migration-batches.service';
import { buildSyntheticUispZip } from './test/uisp-zip.fixture';

type UploadedZip = Parameters<MigrationBatchesService['validateUploads']>[0] extends
  | (infer T)[]
  | undefined
  ? T
  : never;

/**
 * Topes de tamaño de la subida (usuario 2026-11-15): un cliente con años de historial supera
 * 25 MB, así que el ZIP admite 100 MB y el lote 200 MB en total. `validateUploads` no usa
 * dependencias, por eso se prueba sin montar el servicio.
 */
describe('MigrationBatchesService — topes de tamaño', () => {
  const validate = (files: UploadedZip[]) =>
    MigrationBatchesService.prototype.validateUploads.call({}, files);

  async function zipOfSize(name: string, size: number): Promise<UploadedZip> {
    const buffer = await buildSyntheticUispZip();
    // El tamaño declarado es el que mide el tope; el contenido sigue siendo un ZIP válido.
    return { buffer, size, originalname: name, mimetype: 'application/zip' } as UploadedZip;
  }

  it('admite un ZIP de cliente de 27,7 MB', async () => {
    const file = await zipOfSize('client-export-22.zip', Math.round(27.7 * 1024 * 1024));
    await expect(validate([file])).resolves.toHaveLength(1);
  });

  it('rechaza un ZIP de más de 100 MB', async () => {
    const file = await zipOfSize('grande.zip', MIGRATION_IMPORT_LIMITS.maxZipBytes + 1);
    await expect(validate([file])).rejects.toMatchObject({
      response: { code: 'MIGRATION_FILE_TOO_LARGE' },
    });
  });

  it('rechaza un lote que suma más de 200 MB aunque cada ZIP quepa', async () => {
    const size = 90 * 1024 * 1024;
    const files = await Promise.all(['a', 'b', 'c'].map((name) => zipOfSize(`${name}.zip`, size)));
    const error = await validate(files).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toMatchObject({ response: { code: 'MIGRATION_BATCH_TOO_LARGE' } });
  });
});
