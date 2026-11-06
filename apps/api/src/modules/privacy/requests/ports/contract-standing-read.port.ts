import type { EntityManager } from 'typeorm';

export abstract class IContractStandingReadPort {
  abstract standing(
    partyId: string,
    ctx: { manager: EntityManager },
  ): Promise<{
    subscriberIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }>;
}
