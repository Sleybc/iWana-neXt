export abstract class IPersonalDataErasurePort {
  abstract anonymize(partyId: string, requestId: string): Promise<{ categories: string[] }>;
}
