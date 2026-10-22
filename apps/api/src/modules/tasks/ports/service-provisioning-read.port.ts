import type { ServiceProvisioningStatus } from '@iwana/shared';

export const SERVICE_PROVISIONING_READ_PORT = Symbol('SERVICE_PROVISIONING_READ_PORT');

/** Lectura de MOD13 usada por el gate de cierre de MOD11. */
export interface ServiceProvisioningReadPort {
  getGateStatus(
    executionOrderId: string,
  ): Promise<{ enforced: boolean; status: ServiceProvisioningStatus | null }>;
}
