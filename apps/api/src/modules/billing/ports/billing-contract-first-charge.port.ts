import type {
  BillingFirstChargeAnchorSource,
  BillingFirstChargeFiscalField,
  BillingFirstChargeFiscalOutcome,
  BillingFirstChargeInstallationOutcome,
} from '@iwana/shared';

/** Fecha civil (zona del tenant) en que el contrato pasó a `ACTIVE` y de dónde salió. */
export interface ContractActivationAnchor {
  contractId: string;
  status: string;
  date: string | null;
  source: BillingFirstChargeAnchorSource | null;
}

export interface InstallationFeeFreezeResult {
  outcome: Exclude<BillingFirstChargeInstallationOutcome, 'NOT_APPLICABLE'>;
  /** Cargo congelado en el contrato tras la operación; null si sigue sin valor. */
  amount: string | null;
}

export interface FiscalDataFreezeResult {
  outcome: Exclude<BillingFirstChargeFiscalOutcome, 'NOT_APPLICABLE'>;
  /** Campos congelados ahora; nunca sus valores. */
  frozenFields: BillingFirstChargeFiscalField[];
  /** Campos que siguen vacíos en el contrato porque el suscriptor no los tiene. */
  missingFields: BillingFirstChargeFiscalField[];
}

/**
 * Puerto CRM para «Generar primer cobro» (spec 2026-11-11 R3/R4). CRM conserva el ownership de
 * `contracts`, del outbox de activación y de la resolución del cargo de instalación por el
 * catálogo de MOD06: Billing nunca lee ni escribe esas tablas.
 */
export abstract class BillingContractFirstChargePort {
  /**
   * Ancla del primer cobro, en orden de fiabilidad: `billingStartDate` del evento
   * `crm.contract.activated` (lo escribe la activación), `contracts.start_date` y, para los
   * contratos heredados sin ninguno de los dos, la fecha civil de `status_changed_at`.
   * Null si el contrato no existe en el tenant o su titular está anonimizado.
   */
  abstract findActivationAnchor(contractId: string): Promise<ContractActivationAnchor | null>;

  /**
   * R4: si `contracts.installation_fee` es NULL congela el vigente del plan y segmento con
   * auditoría; un valor existente (incluido `0`) no se toca.
   */
  abstract freezeInstallationFeeIfMissing(
    contractId: string,
    actorId: string,
  ): Promise<InstallationFeeFreezeResult>;

  /**
   * R7: congela en el contrato los datos fiscales que le falten (nombre o razón social,
   * documento cifrado con su HMAC y dirección) tomándolos del suscriptor, con auditoría sin PII.
   * Un campo ya presente no se toca.
   */
  abstract freezeFiscalDataIfMissing(
    contractId: string,
    actorId: string,
  ): Promise<FiscalDataFreezeResult>;
}
