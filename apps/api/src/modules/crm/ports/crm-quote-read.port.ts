import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export interface CrmQuoteSnapshot {
  id: string;
  expedienteId: string;
  status: string;
}

@Injectable()
export abstract class CrmQuoteReadPort {
  abstract findByExpedienteId(
    schemaName: string,
    expedienteId: string,
  ): Promise<CrmQuoteSnapshot[]>;

  /**
   * Batch: todas las cotizaciones de un conjunto de expedientes en una sola query.
   * Usa el `EntityManager` del llamador para no abrir conexión propia.
   */
  abstract findByExpedienteIds(
    manager: EntityManager,
    expedienteIds: string[],
  ): Promise<CrmQuoteSnapshot[]>;
}
