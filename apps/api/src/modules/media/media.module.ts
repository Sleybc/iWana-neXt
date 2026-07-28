import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from '@iwana/db';
import { createStorageAdapter, STORAGE_PORT } from '@iwana/storage';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { EvidenceAssetProvider } from './evidence-asset.provider';
import { EVIDENCE_ASSET_PORT } from '../tasks/ports/evidence-asset.port';

/**
 * Módulo Media — MOD03 Media/Assets.
 *
 * Provee:
 * - MediaService: subida, consulta, signed URLs y soft delete de assets
 * - MediaController: endpoints REST /api/v1/media/...
 * - STORAGE_PORT: adaptador de almacenamiento (MinIO o FS local según STORAGE_DRIVER)
 *
 * El provider STORAGE_PORT es un singleton global dentro del módulo.
 * Se instancia según la variable de entorno STORAGE_DRIVER:
 * - 'minio' (defecto producción): usa @aws-sdk/client-s3 contra MinIO
 * - 'local' (dev sin MinIO): usa el sistema de archivos del contenedor
 *
 * ADR-033 + ADR-034
 */
@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset]), ConfigModule],
  providers: [
    // Provider del StoragePort — selecciona adaptador según STORAGE_DRIVER
    {
      provide: STORAGE_PORT,
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local') as 'minio' | 'local';

        if (driver === 'minio') {
          return createStorageAdapter({
            driver: 'minio',
            minio: {
              endpoint: config.get<string>('S3_ENDPOINT', 'http://minio:9000'),
              region: config.get<string>('S3_REGION', 'us-east-1'),
              accessKeyId: config.get<string>('S3_ACCESS_KEY_ID', ''),
              secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY', ''),
              bucket: config.get<string>('S3_BUCKET', 'iwana-media'),
              forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE', 'true') === 'true',
              // publicBaseUrl es opcional — solo se incluye si está configurada
              ...(config.get<string>('S3_PUBLIC_BASE_URL')
                ? { publicBaseUrl: config.get<string>('S3_PUBLIC_BASE_URL') as string }
                : {}),
            },
          });
        }

        // Fallback local — solo desarrollo sin MinIO
        return createStorageAdapter({
          driver: 'local',
          localBasePath: join(process.cwd(), 'storage', 'media'),
          localPublicBaseUrl: `${config.get('API_PUBLIC_BASE_URL', `http://localhost:${config.get('PORT', 3000)}`)}/storage`,
        });
      },
      inject: [ConfigService],
    },
    MediaService,
    EvidenceAssetProvider,
    {
      provide: EVIDENCE_ASSET_PORT,
      useExisting: EvidenceAssetProvider,
    },
  ],
  controllers: [MediaController],
  exports: [MediaService, STORAGE_PORT, EVIDENCE_ASSET_PORT],
})
export class MediaModule {}
