import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PlanPermanenceOffer } from '@iwana/shared';

/**
 * Puerto de lectura de la oferta de permanencia de un plan (bloque H).
 * Implementado en CommercialModule; consumido por CRM (contratos).
 * El tenant sale de TenantContext; con `ctx` reutiliza la transacción del llamante.
 */
@Injectable()
export abstract class PlanPermanenceOfferReadPort {
  /** Null si el plan no existe en el tenant o fue eliminado. */
  abstract getOffer(
    planId: string,
    ctx?: { manager: EntityManager },
  ): Promise<PlanPermanenceOffer | null>;
}
