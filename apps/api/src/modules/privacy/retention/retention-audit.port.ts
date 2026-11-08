import type { EntityManager } from 'typeorm';
import type { AuditAction } from '@iwana/shared';

/** Entrada mínima de auditoría del vencimiento; `AuditService` la satisface por forma. */
export interface RetentionAuditEntry {
  action: typeof AuditAction.UPDATE;
  entityType: string;
  entityId: string;
  userId: string | null;
  newValue: Record<string, unknown>;
}

/**
 * Puerto de auditoría del barrido H-EXP. En Nest se enlaza al `AuditService`
 * real; el CLI aporta un escritor equivalente sobre el mismo `manager`.
 */
export abstract class RetentionAuditPort {
  abstract logWithin(entry: RetentionAuditEntry, manager: EntityManager): Promise<void>;
}
