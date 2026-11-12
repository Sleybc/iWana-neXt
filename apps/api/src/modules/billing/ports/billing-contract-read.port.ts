import type { EntityManager } from 'typeorm';

export type BillableContractStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED';

export interface ContractVatSnapshot {
  treatment: string;
  legalBasis: string;
  ratePercent: 0 | 19;
  requiresAccountantReview: boolean;
  resolvedAt: string;
}

export interface BillableContract {
  contractId: string;
  subscriberId: string;
  partyId: string | null;
  status: BillableContractStatus;
  statusReasonCode: string | null;
  terminatedAt: string | null;
  cycleDay: number | null;
  cutoffDay: number | null;
  activatedAt: string | null;
  endDate: string | null;
  planName: string | null;
  monthlyPrice: string | null;
  vatSnapshot: ContractVatSnapshot | null;
  unbilledAdditionalCount: number;
  /**
   * Cargo de instalación congelado en el contrato (`contracts.installation_fee`, migración 191).
   * Nulo o cero: el primer cobro no lleva línea de instalación.
   */
  installationFee?: string | null;
  /**
   * Valor descontado o diferido por permanencia aceptada
   * (`contract_permanence.discounted_amount` con `accepted = true`); nulo sin permanencia.
   */
  permanenceDiscount?: string | null;
  buyer: {
    displayName: string;
    documentType: string | null;
    documentNumber: string | null;
    /** Hay un documento fiscal registrado; se sabe sin descifrarlo. */
    hasDocumentNumber: boolean;
    /** Solo con `revealDocument: false`: descifra bajo demanda y sin consultar la base. */
    revealDocumentNumber?: () => string | null;
    address: string | null;
    rutResponsibilities: string[];
  };
}

/** Puerto de lectura CRM para Billing. CRM conserva el ownership de sus tablas. */
export abstract class BillingContractReadPort {
  abstract findBillableForDate(
    localDate: string,
    page: { afterContractId?: string; limit: number },
  ): Promise<BillableContract[]>;

  /**
   * Revelado perezoso por defecto: `findByContractId` NO descifra salvo que se
   * pida con `{ revealDocument: true }`. Con el defecto, el número no se descifra:
   * `buyer.hasDocumentNumber` dice si existe y `buyer.revealDocumentNumber()` lo
   * descifra únicamente para el documento que de verdad se va a emitir.
   */
  abstract findByContractId(
    contractId: string,
    options?: { revealDocument?: boolean },
  ): Promise<BillableContract | null>;

  /**
   * Señal de suspensión de cobro por suplantación (RS-7/RS-22): algún contrato del
   * suscriptor en `SUSPENDED` con `SUPLANTACION`. Vive en CRM (ownership de
   * `contracts`); Billing la consume fuera de sus transacciones.
   */
  abstract hasImpersonationSuspension(subscriberId: string): Promise<boolean>;

  /**
   * Contratos `ACTIVE` del suscriptor (sin borrados), para señalar en el estado de cuenta los
   * que aún no tienen ningún periodo de cobro (spec 2026-11-11 R1). Solo identificadores.
   */
  abstract findActiveContractIds(subscriberId: string): Promise<string[]>;

  /** Proyección mínima sin PII para previsualizar el ciclo de un contrato. */
  abstract findBillingCycleByContractId(
    contractId: string,
  ): Promise<{ cycleDay: number | null; cutoffDay: number | null } | null>;

  /** Ciclos activos del CRM, para la vista previa de política sin contrato. */
  abstract listBillingCycles(): Promise<Array<{ cycleDay: number; cutoffDay: number }>>;

  /** Referencias sin PII: un ID ausente no existe en el tenant; máximo 200 IDs. */
  abstract findTitularRefs(
    subscriberIds: string[],
  ): Promise<Array<{ subscriberId: string; partyId: string | null; anonymized: boolean }>>;

  /** Nombres para la lista de pagos (RS-22): máximo 200 IDs, sin bloqueo; nulo para anonimizado. */
  abstract findTitularDisplayNames(
    subscriberIds: string[],
  ): Promise<Array<{ subscriberId: string; displayName: string | null }>>;

  /** Reutiliza el manager de la transacción Billing que protege el alta de pago. */
  abstract lockTitularForBillingWrite(
    subscriberId: string,
    ctx: { manager: EntityManager },
  ): Promise<{ exists: boolean; partyId: string | null; anonymized: boolean }>;
}
