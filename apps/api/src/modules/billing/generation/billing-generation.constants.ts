export const BILLING_GENERATION_QUEUE = 'billing-generation';
export const BILLING_GENERATION_JOB = 'generate-billing-documents';
export const BILLING_GENERATION_RETRY_LIMIT = 3;

/**
 * Cola de eventos de contrato de CRM que consume MOD14 (ADR-109 D6). El productor
 * (relay del outbox de MOD05, bloque D) debe publicar aquí el envelope
 * `crm.contract.activated`; al construirlo, este nombre se mueve a
 * `@iwana/shared` (queue-names) para que CRM no importe de billing.
 */
export const CRM_CONTRACT_EVENTS_QUEUE = 'crm-contract-events';
