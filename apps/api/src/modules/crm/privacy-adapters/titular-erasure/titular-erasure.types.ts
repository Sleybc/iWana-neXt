import type { ErasureCategory } from '@iwana/shared';
import type { QueryRunner } from 'typeorm';
import type { ErasureKeys } from './titular-erasure-sql';

export interface TitularErasureScope {
  partyId: string | null;
  subscriberIds: string[];
  expedienteIds: string[];
  userIds: string[];
  /** Contexto interno requerido para la marca inmutable de anonimización. */
  requestId?: string;
  requesterDocumentHmac?: string | null;
  tenantSchema?: string;
  /** Claves ya cargadas por el CLI; la API las carga desde ConfigService. */
  cryptoKeys?: ErasureKeys;
  /** Identificadores internos que encadenan WFM, ejecución y tareas operativas. */
  relatedIds?: {
    visitRequestIds?: string[];
    scheduleEventIds?: string[];
    workOrderIds?: string[];
    executionOrderIds?: string[];
    operationalTaskIds?: string[];
    privacyEvidenceMediaIds?: string[];
    stratumEvidenceMediaIds?: string[];
    executionEvidenceMediaIds?: string[];
    taskOriginRefIds?: string[];
  };
}

export interface TitularErasureTableResult {
  table: string;
  category: ErasureCategory;
  selected: number;
  changed: number;
  residual: number;
}

export interface TitularErasureParticipant {
  resolveScope?(scope: TitularErasureScope, qr: QueryRunner): Promise<void>;
  plan(scope: TitularErasureScope, qr: QueryRunner): Promise<TitularErasureTableResult[]>;
  apply(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]>;
}
