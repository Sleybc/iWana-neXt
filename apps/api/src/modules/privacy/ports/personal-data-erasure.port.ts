import type { EntityManager } from 'typeorm';
import type { ErasureBlocker, ErasureCategory } from '@iwana/shared';

export interface PersonalDataErasureTarget {
  requestId: string;
  partyId: string | null;
  requesterDocumentHmac: string | null;
  /**
   * Alcance explícito de prospecto (H-EXP B2-R2, D-EXP-2): un único
   * expediente DESCARTADO sin suscriptor ni contrato enlazados. Con él,
   * `resolve()` toma solo ese expediente, lo revalida en la transacción con
   * `FOR UPDATE` y nunca amplía por HMAC. Sin él, el comportamiento es
   * idéntico al histórico (candidatos por HMAC del titular).
   */
  prospectExpedienteId?: string;
}
export interface PersonalDataErasurePlan {
  candidateExpedienteIds: string[];
  blockers: Extract<
    ErasureBlocker,
    'UNRECONCILED_TITULAR' | 'ACTIVE_USER_ACCOUNT' | 'SUPPLIER_PROFILE_LINKED'
  >[];
  counts: Record<ErasureCategory, number>;
}
export abstract class IPersonalDataErasurePort {
  abstract plan(
    target: PersonalDataErasureTarget,
    ctx: { manager: EntityManager },
  ): Promise<PersonalDataErasurePlan>;
  abstract anonymize(
    input: PersonalDataErasureTarget & { expedienteIds: string[]; actorId: string },
    ctx: { manager: EntityManager },
  ): Promise<{ categories: ErasureCategory[]; changedRows: number }>;
}
