import { Injectable } from '@nestjs/common';

export interface CrmSubscriberSummarySnapshot {
  id: string;
  status: string;
  fullName: string;
}

/** Puerto de lectura CRM para módulos que necesitan una proyección del suscriptor. */
@Injectable()
export abstract class CrmSubscriberReadPort {
  abstract findSummaryByExpedienteId(
    expedienteId: string,
  ): Promise<CrmSubscriberSummarySnapshot | null>;

  abstract listContractIds(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<string[]>;

  abstract findExpedienteId(
    tenantId: string,
    schemaName: string,
    subscriberId: string,
  ): Promise<string | null>;

  abstract findExistingSubscriberIds(
    tenantId: string,
    schemaName: string,
    subscriberIds: string[],
  ): Promise<string[]>;
}
