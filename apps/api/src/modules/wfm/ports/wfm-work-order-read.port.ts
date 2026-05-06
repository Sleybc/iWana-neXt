import { WorkOrder } from '@iwana/db';

/** Proyeccion de referencia de Work Order para comunicacion inter-modulo. */
export interface WfmWorkOrderReference {
  id: string;
  tenantId: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  summary: string;
  assignedUserId: string | null;
}

/**
 * Puerto de lectura de Work Orders para CRM y otros modulos.
 * Las implementaciones concretas deben proveerse via DI en WfmModule.
 * Patron: abstract class como token de inyeccion (ADR-style, coherente con CRM ports).
 */
export abstract class WfmWorkOrderReadPort {
  /** Obtiene una referencia de Work Order por id. Devuelve null si no existe. */
  abstract getById(workOrderId: string): Promise<WfmWorkOrderReference | null>;

  /** Lanza NotFoundException si la Work Order no existe. */
  abstract ensureReference(workOrderId: string): Promise<WfmWorkOrderReference>;
}
