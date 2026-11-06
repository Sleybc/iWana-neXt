import type { EntityManager } from 'typeorm';

/** Puerto de Privacy para consultar la vigencia de soportes fiscales de Billing. */
export abstract class IBillingStandingReadPort {
  abstract lastFiscalDocumentAt(
    subscriberIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<string | null>;
}
