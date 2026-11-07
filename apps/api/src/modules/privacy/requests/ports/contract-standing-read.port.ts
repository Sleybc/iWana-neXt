import type { EntityManager } from 'typeorm';

export abstract class IContractStandingReadPort {
  abstract standing(
    partyId: string | null,
    ctx: { manager: EntityManager; requesterDocumentHmac?: string | null },
  ): Promise<{
    subscriberIds: string[];
    contractIds: string[];
    expedienteIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }>;
}
