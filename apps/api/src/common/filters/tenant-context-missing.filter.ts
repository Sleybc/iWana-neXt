import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
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
 *
 * El filtro es `@Catch()` (sin argumentos), es decir **atrapa toda excepción
 * del API**, y por eso extiende `BaseExceptionFilter`: delegar en
 * `super.catch()` es la única forma de devolver el resto de excepciones al
 * manejo estándar de Nest. Relanzarlas con `throw` las sacaba del pipeline y
 * las entregaba al manejador por defecto de Express, que responde **HTML con
 * el stack trace** en vez de JSON. Eso rompía a la vez el contrato de error de
 * todo el API — el portal leía `res.json()` sobre HTML, fallaba y mostraba
 * «Error del servidor» en lugar del mensaje real — y filtraba al navegador las
 * rutas absolutas del servidor. Lo destapó un 400 legítimo de salidas de
 * inventario que llegaba al portal sin mensaje.
 */
@Catch()
export class TenantContextMissingFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(TenantContextMissingFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!isTenantContextMissingError(exception)) {
      super.catch(exception, host);
      return;
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
