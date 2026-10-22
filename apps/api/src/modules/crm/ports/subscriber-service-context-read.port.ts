import { Injectable } from '@nestjs/common';

export interface SubscriberServiceContractRef {
  id: string;
  alias: string | null;
  status: string;
  planId: string;
}

export interface SubscriberServiceContext {
  expedienteId: string | null;
  planId: string | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  contracts: SubscriberServiceContractRef[];
}

/** Contexto comercial mínimo para aprovisionar, sin exponer datos personales. */
@Injectable()
export abstract class SubscriberServiceContextReadPort {
  abstract getForSubscriber(subscriberId: string): Promise<SubscriberServiceContext | null>;
}
