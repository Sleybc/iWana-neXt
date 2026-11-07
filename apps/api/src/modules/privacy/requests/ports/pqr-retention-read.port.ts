import type { EntityManager } from 'typeorm';

export interface PqrRetentionScope {
  subscriberIds: string[];
  contractIds: string[];
  expedienteIds: string[];
}
export interface PqrRetentionStanding {
  hasUnanswered: boolean;
  lastResponseAt: string | null;
}
export abstract class IPqrRetentionReadPort {
  abstract read(
    scope: PqrRetentionScope,
    ctx: { manager: EntityManager },
  ): Promise<PqrRetentionStanding>;
}
