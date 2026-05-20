import type { FieldServiceRequest } from '@iwana/shared';

/**
 * Puerto de solicitud de trabajo de campo hacia WFM (MOD09).
 *
 * AssuranceModule usa este puerto para desacoplar la logica de negocio
 * de la implementacion concreta (BullMQ, REST, stub).
 *
 * Solo publica hacia WFM — no lee tablas de WFM directamente (ADR-038).
 */

export abstract class AssuranceFieldServicePort {
  abstract requestFieldService(req: FieldServiceRequest): Promise<void>;
}
