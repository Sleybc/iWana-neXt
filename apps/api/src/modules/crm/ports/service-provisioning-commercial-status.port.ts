import type { CommercialActivationStatus } from '@iwana/shared';

export const SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT = Symbol(
  'SERVICE_PROVISIONING_COMMERCIAL_STATUS_PORT',
);

export type ServiceProvisioningCommercialStatusDetail =
  | 'CONTACT_REQUIRED'
  | 'FISCAL_INCOMPLETE'
  | 'NO_EXPEDIENTE'
  | null;

export interface ServiceProvisioningCommercialStatusPort {
  record(
    serviceProvisioningId: string,
    status: CommercialActivationStatus,
    detail: ServiceProvisioningCommercialStatusDetail,
  ): Promise<void>;
}
