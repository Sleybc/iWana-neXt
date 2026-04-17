import { SubscriberStatus } from '@iwana/shared';

export class SubscriberConvertedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly subscriberId: string,
    public readonly expedienteId: string,
    public readonly status: SubscriberStatus,
  ) {}
}
