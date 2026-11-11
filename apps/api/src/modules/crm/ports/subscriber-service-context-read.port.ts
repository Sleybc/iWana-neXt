import type { TitularWriteReference } from './titular-write-reference';
import type { QueryRunner } from 'typeorm';
import { Injectable } from '@nestjs/common';

export interface SubscriberServiceContractRef {
  id: string;
  alias: string | null;
  status: string;
  planId: string;
  /** Borrador sin ciclo de facturación: la firma lo exige (fase 2, CA-2). */
  billingCycleMissing: boolean;
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
  abstract assertWritableReferences(
    references: TitularWriteReference[],
    qr: QueryRunner,
  ): Promise<void>;

  abstract getForSubscriber(subscriberId: string): Promise<SubscriberServiceContext | null>;
}
