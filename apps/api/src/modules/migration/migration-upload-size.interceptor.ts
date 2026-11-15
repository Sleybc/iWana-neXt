import {
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { MIGRATION_IMPORT_LIMITS } from '@iwana/shared';

/** Holgura para los delimitadores y cabeceras del multipart sobre la suma de los ZIP. */
export const MIGRATION_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/**
 * Rechaza la subida de un lote por su `Content-Length` **antes** de que multer lo lea a memoria
 * (`memoryStorage`): sin esto, 20 ZIP de 100 MB llegarían a RAM antes de validar el total
 * (deuda D2 del informe de complemento). Sin `Content-Length` (cuerpo chunked) no se acepta,
 * porque no se puede acotar sin leerlo.
 */
@Injectable()
export class MigrationUploadSizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['content-length'];
    const length = typeof header === 'string' ? Number(header) : Number.NaN;
    if (!Number.isFinite(length) || length < 0) {
      throw new HttpException(
        {
          code: 'MIGRATION_BATCH_TOO_LARGE',
          message: 'La subida debe declarar su tamaño.',
        },
        HttpStatus.LENGTH_REQUIRED,
      );
    }
    if (length > MIGRATION_IMPORT_LIMITS.maxBatchBytes + MIGRATION_MULTIPART_OVERHEAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'MIGRATION_BATCH_TOO_LARGE',
        message: 'Los archivos del lote superan el tamaño total permitido.',
      });
    }
    return next.handle();
  }
}
