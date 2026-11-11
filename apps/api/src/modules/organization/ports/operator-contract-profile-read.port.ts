import type { OperatorContractProfile, OperatorContractRequiredField } from '@iwana/shared';

export interface OperatorContractProfileView {
  profile: OperatorContractProfile;
  /** Datos obligatorios que faltan para generar el contrato (CA-11), en el orden del formato. */
  missingFields: OperatorContractRequiredField[];
}

/**
 * Puerto de lectura de los datos del operador para el contrato. Lo consume MOD05 al
 * generar el contrato; el tenant se pasa explícito (también sirve desde un job).
 */
export abstract class OperatorContractProfileReadPort {
  abstract getForTenant(tenantId: string, schemaName: string): Promise<OperatorContractProfileView>;
}
