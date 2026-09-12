import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Pipe genérico para validación Zod en boundaries HTTP.
 * Mapea ZodError a BadRequestException con mensaje y detalles.
 *
 * El parámetro acepta `ZodType<T, ZodTypeDef, unknown>` (entrada libre) y no
 * `ZodSchema<T>` (entrada = salida): los esquemas afirmados contra contratos
 * congelados con transformaciones (p. ej. MOD12 Fase 30, adjudicaciones —
 * cantidad número|cadena → cadena decimal) tienen Input ≠ Output y ese era el
 * único obstáculo para usarlos directamente en el boundary.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no cumplen con las reglas de validación.',
        details: result.error.flatten(),
      });
    }

    return result.data;
  }
}
