import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

/**
 * Versión del contrato de la OT de ejecución que identifica la representación
 * emitida por `ExecutionOrdersController`.
 *
 * Fuente normativa: `packages/shared/src/contracts/operations/execution-orders.ts`
 * v1.3 (cerrado — este archivo la duplica como constante local, no la redefine:
 * si el contrato se versiona, esta constante se actualiza al mismo tiempo para
 * invalidar toda caché HTTP existente).
 *
 * El ETag identifica la REPRESENTACIÓN (contrato + versión de la orden), no el
 * estado del recurso: subir el contrato invalida cachés aunque ninguna OT haya
 * cambiado de versión (MOD11 hallazgo de campo 2026-09-14). La concurrencia
 * optimista sigue usando `If-Match` con el número de versión, sin cambios.
 */
// v1.8 (2026-11-18): enlaces de la consola y `site.label` nulable. Sin subir
// esta constante el navegador reusa el detalle v1.3 cacheado sin los campos
// nuevos (QA2). Regla: debe coincidir con «fuente de verdad del contrato vX.Y»
// de packages/shared/src/contracts/operations/execution-orders.ts; lo vigila
// execution-order-etag-representation.spec.ts.
export const EXECUTION_ORDER_CONTRACT_VERSION = '1.8';

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

/**
 * ETag del DETALLE: `"<contrato>-<versión>-<huella>"`. El detalle incluye
 * partes derivadas que cambian sin subir `version` (completion: MOD13,
 * evidencias, consumos, reversos; syncState, inventoryReconciliation, enlaces,
 * allowedActions). La huella (sha256 del cuerpo serializado, 16 hex) evita que
 * un 304 sirva un completion viejo (2026-11-19). `If-Match` sigue siendo el
 * número de versión de la orden; este ETag nunca se usa para concurrencia.
 */
export function buildExecutionOrderDetailETag(body: { version: number }): string {
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `"${EXECUTION_ORDER_CONTRACT_VERSION}-${body.version}-${fingerprint}"`;
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
        if (
          isExecutionOrderRepresentation(body) &&
          typeof (body as VersionedBody).number === 'string'
        ) {
          // Detalle: siempre revalidar; el servidor recalcula la huella y
          // Express responde 304 solo si coincide con If-None-Match.
          response.setHeader('ETag', buildExecutionOrderDetailETag(body));
          response.setHeader('Cache-Control', 'private, no-cache');
        } else if (isExecutionOrderRepresentation(body))
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
