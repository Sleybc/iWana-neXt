import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Una etiqueta que un lote de importación asigna a un suscriptor (ADR-110 D3, D8). */
export interface ImportTagAssignmentInput {
  /** Explícito: el contexto de tenant no viaja solo a los jobs BullMQ. */
  tenantId: string;
  subscriberId: string;
  /**
   * Etiqueta del catálogo ya elegida en la equivalencia (`migration_mappings` `ETIQUETA` →
   * `EQUIVALE`). Si viene, se asigna esa (debe estar vigente) y `tagName`/`color` se ignoran.
   */
  tagId?: string;
  /** Nombre de la etiqueta en el sistema de origen; se busca sin distinguir mayúsculas. */
  tagName: string;
  /** `#RRGGBB`; solo se usa si la etiqueta no existe y hay que crearla. */
  color?: string;
  importBatchId: string;
  actorId: string;
}

export interface ImportTagAssignmentResult {
  tagId: string;
  /** true si la etiqueta no existía en el catálogo y se creó. */
  tagCreated: boolean;
  /** false si el suscriptor ya la tenía (la asignación previa no se toca). */
  assigned: boolean;
}

/**
 * Puerto de CRM para que la importación por lotes (ola C, módulo migration) asigne
 * etiquetas manuales sin tocar las tablas de CRM. Corre dentro de la transacción del
 * llamador: `manager` debe tener el `search_path` del tenant fijado (`runInTenantSchema`).
 * La auditoría del lote la registra el llamador; el puerto no escribe auditoría propia.
 */
@Injectable()
export abstract class SubscriberTagAssignmentPort {
  abstract assignForImport(
    input: ImportTagAssignmentInput,
    options: { manager: EntityManager },
  ): Promise<ImportTagAssignmentResult>;

  /** Reversión del lote (D7): quita solo las asignaciones que trajo ese lote. */
  abstract removeImportBatch(
    tenantId: string,
    importBatchId: string,
    options: { manager: EntityManager },
  ): Promise<{ removed: number }>;
}
