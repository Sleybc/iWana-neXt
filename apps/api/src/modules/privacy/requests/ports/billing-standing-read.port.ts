import type { EntityManager } from 'typeorm';

/** Puerto de Privacy para consultar la vigencia de soportes fiscales de Billing. */
export abstract class IBillingStandingReadPort {
  abstract lastFiscalDocumentAt(
    subscriberIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<string | null>;

  /**
   * Reloj fiscal sin conciliar (H-EXP B2-R3 P1, D-EXP-1): hay documentos
   * fiscales EMITIDO/ANULADO y al menos uno carece de `issue_date` válida.
   * `false` = sin documentos o todos con reloj válido. Obligatorio: un puerto
   * sin este método no compila, así ningún camino ignora el reloj fiscal.
   */
  abstract hasUnreconciledFiscalClock(
    subscriberIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<boolean>;
}
