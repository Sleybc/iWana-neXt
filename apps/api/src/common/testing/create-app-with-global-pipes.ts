import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { createGlobalValidationPipe } from '../pipes/global-validation.pipe';

/** Monta un Nest test app con la misma validación global que usa main.ts. */
export async function createAppWithGlobalPipes(
  moduleRef: TestingModule,
): Promise<INestApplication> {
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.init();
  return app;
}
