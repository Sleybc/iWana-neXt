import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CustomerSegment, PlanPermanenceOffer } from '@iwana/shared';

/**
 * Puerto de lectura de la oferta de permanencia de un plan (bloque H).
 * Implementado en CommercialModule; consumido por CRM (contratos).
 * El tenant sale de TenantContext; con `ctx` reutiliza la transacción del llamante.
 * `installationFee` es el `installation_fee` vigente del plan para `segment`
 * (RESIDENTIAL por defecto, como el snapshot del catálogo).
 */
@Injectable()
export abstract class PlanPermanenceOfferReadPort {
  /** Null si el plan no existe en el tenant o fue eliminado. */
  abstract getOffer(
    planId: string,
    ctx?: { manager?: EntityManager; segment?: CustomerSegment | null },
  ): Promise<PlanPermanenceOffer | null>;
}
