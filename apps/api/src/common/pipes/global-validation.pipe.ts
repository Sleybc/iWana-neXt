import { ValidationPipe } from '@nestjs/common';

/** Configuración única de los pipes globales de validación de main.ts. */
export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}
