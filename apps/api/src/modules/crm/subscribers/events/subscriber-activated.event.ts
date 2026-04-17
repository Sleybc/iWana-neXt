import { SubscriberStatus } from '@iwana/shared';

export class SubscriberActivatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly subscriberId: string,
    public readonly expedienteId: string,
    public readonly status: SubscriberStatus,
  ) {}
}
