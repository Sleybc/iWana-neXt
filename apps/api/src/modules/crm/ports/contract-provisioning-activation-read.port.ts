/**
 * Fecha efectiva de servicio activo por contrato (cierre de venta, bloques D y F; ADR-109
 * D2/D3). MOD13 es dueño de `service_provisionings`; CRM solo lee por este puerto, en el tenant
 * del `TenantContext` activo (nunca recibe el tenant por argumento).
 *
 * La fecha efectiva es `activated_at` (cierre de la OT) o, si aún no existe, `certified_at` del
 * aprovisionamiento CERTIFIED: el cobro corre desde que el servicio queda activo y la firma
 * ocurre en la visita, antes del cierre de la OT. No cambia la semántica de MOD13.
 */
export const CONTRACT_PROVISIONING_ACTIVATION_READ_PORT = Symbol(
  'CONTRACT_PROVISIONING_ACTIVATION_READ_PORT',
);

export type ContractServiceStartSource = 'ACTIVATED' | 'CERTIFIED';

export interface ContractServiceStart {
  at: Date;
  source: ContractServiceStartSource;
}

export interface ContractProvisioningActivationReadPort {
  /**
   * Fecha efectiva más temprana entre los aprovisionamientos no liberados del contrato con
   * servicio ACTIVE (`activated_at`) o CERTIFIED (`certified_at`); `null` si no hay ninguno.
   */
  getServiceStart(contractId: string): Promise<ContractServiceStart | null>;

  /** Igual que `getServiceStart` para varios contratos; omite los que no tienen servicio. */
  listServiceStart(contractIds: readonly string[]): Promise<Map<string, ContractServiceStart>>;

  /**
   * Aprovisionamientos activados del contrato con activación comercial BLOCKED por
   * CONTRACT_UNSIGNED (bloque D: la firma los pasa a DONE).
   */
  listUnsignedBlockedProvisioningIds(contractId: string): Promise<string[]>;
}
