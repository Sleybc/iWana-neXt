import type { CommercialActivationBlockReason, CommercialActivationStatus } from '@iwana/shared';

export const SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT = Symbol(
  'SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT',
);

export type ServiceProvisioningCommercialStatusDetail = CommercialActivationBlockReason | null;

export interface ServiceProvisioningCommercialStatusPort {
  record(
    serviceProvisioningId: string,
    status: CommercialActivationStatus,
    detail: ServiceProvisioningCommercialStatusDetail,
  ): Promise<void>;
}
