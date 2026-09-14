import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

/**
 * Versión del contrato de la OT de ejecución que identifica la representación
 * emitida por `ExecutionOrdersController`.
 *
 * Fuente normativa: `packages/shared/src/contracts/operations/execution-orders.ts`
 * v1.1 (cerrado — este archivo la duplica como constante local, no la redefine:
 * si el contrato se versiona, esta constante se actualiza al mismo tiempo para
 * invalidar toda caché HTTP existente).
 *
 * El ETag identifica la REPRESENTACIÓN (contrato + versión de la orden), no el
 * estado del recurso: subir el contrato invalida cachés aunque ninguna OT haya
 * cambiado de versión (MOD11 hallazgo de campo 2026-09-14). La concurrencia
 * optimista sigue usando `If-Match` con el número de versión, sin cambios.
 */
export const EXECUTION_ORDER_CONTRACT_VERSION = '1.1';

/**
 * Compone el ETag de una representación de OT: `"<contrato>-<versión>"`.
 * Barato y suficiente: la condición real es que dos representaciones con la
 * misma `version` pero distinto contrato nunca compartan ETag.
 */
export function buildExecutionOrderETag(
  version: number,
  contractVersion: string = EXECUTION_ORDER_CONTRACT_VERSION,
): string {
  return `"${contractVersion}-${version}"`;
}

type VersionedBody = { version?: unknown; number?: unknown; executionOrderNumber?: unknown };

/**
 * Predicado de representación de OT: detalle (`number`) o entidad devuelta por
 * los comandos (`executionOrderNumber`), ambos con `version` numérica.
 *
 * Las vistas de plantillas (`ExecutionOrderTemplatesController`) comparten este
 * interceptor pero pertenecen a otro dominio de representación: conservan el
 * ETag heredado (`"<versión>"`) y NO se etiquetan con el contrato de la OT.
 */
export function isExecutionOrderRepresentation(body: unknown): body is { version: number } {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as VersionedBody;
  if (typeof candidate.version !== 'number') return false;
  return typeof candidate.number === 'string' || typeof candidate.executionOrderNumber === 'string';
}

@Injectable()
export class ExecutionOrderResponseHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader: (name: string, value: string) => void }>();
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, string | undefined> }>();
    const correlation = request.headers?.['x-correlation-id'];
    const correlationId =
      correlation &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(correlation)
        ? correlation
        : randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    return next.handle().pipe(
      tap((body: unknown) => {
        if (isExecutionOrderRepresentation(body))
          response.setHeader('ETag', buildExecutionOrderETag(body.version));
        else if (
          body &&
          typeof body === 'object' &&
          'version' in body &&
          typeof body.version === 'number'
        )
          response.setHeader('ETag', `"${body.version}"`);
        if (body && typeof body === 'object' && !('correlationId' in body))
          response.setHeader('X-Correlation-Id', correlationId);
      }),
    );
  }
}
