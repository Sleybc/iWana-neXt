import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { isTenantContextMissingError } from '@iwana/db';

/**
 * Convierte la falta de contexto de tenant en un 400 explicativo.
 *
 * `TenantContext.getOrThrow()` lanzaba un `Error` genérico que NestJS servía
 * como **500 Internal Server Error**. El caso real que lo destapó: un token de
 * plataforma sin `X-Tenant-Slug` contra una ruta de tenant devolvía
 * `{"statusCode":500,"message":"Internal server error"}`. Una petición mal
 * formada por el cliente no es un fallo del servidor, y un 500 en superficie
 * pública además impide distinguir un error de uso de una caída real.
 *
 * El mensaje que se devuelve es el mismo que emite `TenantMiddleware` cuando
 * detecta el caso antes: el cliente recibe una indicación coherente sea cual
 * sea la capa que lo atrapa.
 */
@Catch()
export class TenantContextMissingFilter implements ExceptionFilter {
  private readonly logger = new Logger(TenantContextMissingFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!isTenantContextMissingError(exception)) {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; originalUrl?: string }>();

    // Se registra porque, aunque la respuesta sea 4xx, alcanzar este punto
    // significa que la ruta exige tenant y el middleware no lo resolvió: puede
    // ser uso incorrecto del cliente o una ruta mal clasificada en
    // `modules/tenant/public-routes.ts`.
    this.logger.warn(
      `Contexto de tenant ausente en ${request.method ?? '?'} ${request.originalUrl ?? '?'}`,
    );

    response.status(400).json({
      message: 'Debe indicar el tenant via header X-Tenant-Slug para este endpoint.',
      error: 'Bad Request',
      statusCode: 400,
    });
  }
}
