import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

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
