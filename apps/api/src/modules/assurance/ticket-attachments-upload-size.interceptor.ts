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
import { TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES } from '@iwana/shared';

/**
 * Rechaza el comentario con adjuntos por su `Content-Length` **antes** de que multer lea el
 * cuerpo a memoria (spec MOD09 adjuntos §2.5, mismo criterio que la subida de lotes UISP).
 * Sin `Content-Length` (cuerpo chunked) no se acepta: no se puede acotar sin leerlo.
 */
@Injectable()
export class TicketAttachmentsUploadSizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['content-length'];
    const length =
      typeof header === 'string' && /^\d+$/u.test(header) ? Number(header) : Number.NaN;
    if (!Number.isFinite(length)) {
      throw new HttpException(
        {
          code: 'TICKET_ATTACHMENTS_LENGTH_REQUIRED',
          message: 'La subida debe declarar su tamaño.',
        },
        HttpStatus.LENGTH_REQUIRED,
      );
    }
    if (length > TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES) {
      throw new PayloadTooLargeException({
        code: 'TICKET_ATTACHMENTS_TOO_LARGE',
        message: 'Los archivos del comentario superan 110 MB en total. No se guardó nada.',
      });
    }
    return next.handle();
  }
}
