export interface BillingIssuerIdentity {
  legalName: string | null;
  nit: string | null;
  verificationDigit: string | null;
}

/** Proyección fiscal mínima del tenant; evita que Billing lea tablas de Tenant. */
export abstract class BillingIssuerReadPort {
  abstract getIssuerIdentity(tenantId: string): Promise<BillingIssuerIdentity>;
}
