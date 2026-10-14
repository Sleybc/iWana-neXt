export abstract class IContractStandingReadPort {
  abstract standing(partyId: string): Promise<{
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }>;
}
