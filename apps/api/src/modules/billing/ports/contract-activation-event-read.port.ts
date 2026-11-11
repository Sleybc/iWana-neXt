/**
 * Lectura del outbox `crm.contract.activated` para Billing (hallazgo SEC-3). CRM conserva el
 * ownership de `contract_activation_events` y `contracts`; Billing solo consulta este puerto.
 */
export interface ContractActivationEventRecord {
  eventId: string;
  tenantId: string;
  contractId: string;
  /** El outbox ya marcó el evento publicado. */
  published: boolean;
  /** Fecha civil de inicio de cobro escrita por CRM en la transacción de la activación. */
  billingStartDate: string | null;
  contractStatus: string;
}

export abstract class ContractActivationEventReadPort {
  /** Evento del tenant actual (TenantContext) por eventId; null si no existe. */
  abstract findActivationEvent(eventId: string): Promise<ContractActivationEventRecord | null>;
}
