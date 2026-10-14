export abstract class IPersonalDataBlockPort {
  abstract block(partyId: string, requestId: string): Promise<void>;
  abstract unblock(partyId: string, requestId: string): Promise<void>;
}
