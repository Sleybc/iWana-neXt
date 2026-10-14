import { DataAuthorizationView, DataPurpose } from '@iwana/shared';

export abstract class IPrivacyAuthorizationReadPort {
  abstract hasActive(
    partyId: string,
    purpose: DataPurpose,
  ): Promise<{
    active: boolean;
    authorizationId: string | null;
    legalTextVersion: string | null;
    legacyUnverified: boolean;
  }>;

  abstract listForParty(partyId: string): Promise<DataAuthorizationView[]>;
}
