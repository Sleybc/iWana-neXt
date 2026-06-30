import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Pipe genérico para validación Zod en boundaries HTTP.
 * Mapea ZodError a BadRequestException con mensaje y detalles.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

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
