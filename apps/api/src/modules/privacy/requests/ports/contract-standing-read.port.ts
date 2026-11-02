import type { EntityManager } from 'typeorm';

export abstract class IContractStandingReadPort {
  abstract standing(
    partyId: string,
    ctx: { manager: EntityManager },
  ): Promise<{
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }>;
}
