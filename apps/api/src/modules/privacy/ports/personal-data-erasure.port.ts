import type { EntityManager } from 'typeorm';
import type { ErasureBlocker, ErasureCategory } from '@iwana/shared';

export interface PersonalDataErasureTarget {
  requestId: string;
  partyId: string | null;
  requesterDocumentHmac: string | null;
}
export interface PersonalDataErasurePlan {
  candidateExpedienteIds: string[];
  blockers: Extract<ErasureBlocker, 'UNRECONCILED_TITULAR' | 'ACTIVE_USER_ACCOUNT'>[];
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
