import { Injectable } from '@nestjs/common';

export interface CrmSubscriberSummarySnapshot {
  id: string;
  status: string;
  fullName: string;
}

@Injectable()
export abstract class CrmSubscriberReadPort {
  abstract findSummaryByExpedienteId(
    expedienteId: string,
  ): Promise<CrmSubscriberSummarySnapshot | null>;
}
