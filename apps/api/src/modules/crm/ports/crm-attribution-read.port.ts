import { Injectable } from '@nestjs/common';

export interface CrmCurrentAttributionSnapshot {
  id: string;
  expedienteId: string;
  attributionRole: string;
  actorRole: string;
  actorName: string;
  acquisitionChannel: string;
  attributedAt: Date;
  revokedAt: Date | null;
}

@Injectable()
export abstract class CrmAttributionReadPort {
  abstract getCurrentAttribution(
    expedienteId: string,
  ): Promise<CrmCurrentAttributionSnapshot | null>;
}
