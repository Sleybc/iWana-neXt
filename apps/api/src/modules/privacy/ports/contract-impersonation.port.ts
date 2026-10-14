import type { EntityManager } from 'typeorm';

export abstract class IContractImpersonationPort {
  abstract suspendForImpersonation(
    input: {
      partyId: string;
      contractIds: string[];
      requestId: string;
      actorId: string;
    },
    ctx: { manager: EntityManager },
  ): Promise<{ suspendedContractIds: string[] }>;
}
