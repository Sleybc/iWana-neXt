import type { EntityManager } from 'typeorm';

export interface ProspectDiscardRow {
  expedienteId: string;
  /** Instante del descarte solo si el estado es DESCARTADO; nunca se inventa. */
  discardedAt: string | null;
  hasContract: boolean;
}

export abstract class IContractStandingReadPort {
  abstract standing(
    partyId: string | null,
    ctx: { manager: EntityManager; requesterDocumentHmac?: string | null },
  ): Promise<{
    subscriberIds: string[];
    contractIds: string[];
    expedienteIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
    /**
     * Reloj contractual sin conciliar (H-EXP B2-R3 P1, D-EXP-1, B-2):
     * algún contrato terminal carece de `terminated_at` válido (basta uno:
     * `terminalWithClock < terminalCount`). Obligatorio: todo puerto lo
     * informa siempre y ningún camino lo interpreta como plazo cero.
     */
    unreconciledContractClock: boolean;
  }>;

  /**
   * Descarte verificable del prospecto (H-EXP, D-EXP-1). Obligatorio: un puerto
   * sin este método no compila, así ningún camino omite la prueba del descarte.
   */
  abstract findProspectDiscard(
    expedienteIds: string[],
    ctx: { manager: EntityManager },
  ): Promise<ProspectDiscardRow[]>;

  /**
   * Barrido de prospectos descartados (H-EXP B2-R3 B1). El motor enumera y
   * revalida prospectos solo por este puerto, nunca con SQL directo a
   * `expediente_records` (boundary CRM). Obligatorio, por la misma razón.
   */
  abstract listProspectDiscard(ctx: { manager: EntityManager }): Promise<ProspectDiscardRow[]>;
}
