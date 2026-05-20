import { Injectable } from '@nestjs/common';

export interface CrmQuoteSnapshot {
  id: string;
  expedienteId: string;
  status: string;
}

@Injectable()
export abstract class CrmQuoteReadPort {
  abstract findByExpedienteId(
    schemaName: string,
    expedienteId: string,
  ): Promise<CrmQuoteSnapshot[]>;
}
