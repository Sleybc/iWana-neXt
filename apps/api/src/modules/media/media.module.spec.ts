import { MODULE_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { STORAGE_PORT, type StoragePort } from '@iwana/storage';
import * as storagePackage from '@iwana/storage';
import { MediaModule } from './media.module';

describe('MediaModule storage provider', () => {
  const createStorageAdapter = jest
    .spyOn(storagePackage, 'createStorageAdapter')
    .mockReturnValue({} as StoragePort);

  afterEach(() => {
    createStorageAdapter.mockClear();
  });

  function invokeStorageFactory(settings: Record<string, unknown>): StoragePort {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, MediaModule) as Array<
      Record<string, unknown>
    >;
    const provider = providers.find((candidate) => candidate['provide'] === STORAGE_PORT);
    const factory = provider?.['useFactory'];
    if (typeof factory !== 'function') {
      throw new Error('No se encontró la factoría de STORAGE_PORT en MediaModule.');
    }

    const config = {
      get: jest.fn((key: string, fallback?: unknown) => settings[key] ?? fallback),
    } as unknown as ConfigService;
    return (factory as (config: ConfigService) => StoragePort)(config);
  }

  it('usa el adaptador local por defecto y convierte la opción string false', () => {
    invokeStorageFactory({ STORAGE_DRIVER: 'local', S3_FORCE_PATH_STYLE: 'false' });

    expect(createStorageAdapter).toHaveBeenCalledWith(expect.objectContaining({ driver: 'local' }));
  });

  it('configura MinIO con boolean false y omite la URL pública opcional', () => {
    invokeStorageFactory({
      STORAGE_DRIVER: 'minio',
      S3_FORCE_PATH_STYLE: false,
      S3_PUBLIC_BASE_URL: undefined,
    });

    expect(createStorageAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'minio',
        minio: expect.objectContaining({ forcePathStyle: false }),
      }),
    );
    expect(createStorageAdapter.mock.calls[0]?.[0]).not.toHaveProperty('minio.publicBaseUrl');
  });

  it('convierte string true y configura la URL pública opcional de MinIO', () => {
    invokeStorageFactory({
      STORAGE_DRIVER: 'minio',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BASE_URL: 'https://media.example.test',
    });

    expect(createStorageAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'minio',
        minio: expect.objectContaining({
          forcePathStyle: true,
          publicBaseUrl: 'https://media.example.test',
        }),
      }),
    );
  });
});
