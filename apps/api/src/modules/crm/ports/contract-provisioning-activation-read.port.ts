/**
 * Fecha de activación del aprovisionamiento por contrato (cierre de venta, bloque F; ADR-109
 * D2/D3). MOD13 es dueño de `service_provisionings`; CRM solo lee por este puerto, en el tenant
 * del `TenantContext` activo (nunca recibe el tenant por argumento).
 */
export const CONTRACT_PROVISIONING_ACTIVATION_READ_PORT = Symbol(
  'CONTRACT_PROVISIONING_ACTIVATION_READ_PORT',
);

export interface ContractProvisioningActivationReadPort {
  /**
   * Primera `activated_at` entre los aprovisionamientos no liberados del contrato; `null` si
   * el contrato no tiene servicio activado.
   */
  getProvisioningActivatedAt(contractId: string): Promise<Date | null>;

  /** Igual que `getProvisioningActivatedAt` para varios contratos; omite los sin activación. */
  listProvisioningActivatedAt(contractIds: readonly string[]): Promise<Map<string, Date>>;

  /**
   * Aprovisionamientos activados del contrato con activación comercial BLOCKED por
   * CONTRACT_UNSIGNED (bloque D: la firma los pasa a DONE).
   */
  listUnsignedBlockedProvisioningIds?(contractId: string): Promise<string[]>;
}
