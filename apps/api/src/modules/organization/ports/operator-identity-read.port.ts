export interface OperatorIdentity {
  legalName: string | null;
  nit: string | null;
}

/**
 * Razón social y NIT de la empresa para el contrato (cierre de venta A0, CA-11).
 * Se leen del tenant y no se duplican en Organization; evita leer `public.tenants`.
 */
export abstract class OperatorIdentityReadPort {
  abstract getOperatorIdentity(tenantId: string): Promise<OperatorIdentity>;
}
