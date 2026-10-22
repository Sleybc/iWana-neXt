import type { ControlParams, RouterInstruction } from '@iwana/shared';

export interface RouterProvisioningInput {
  routerId: string;
  ip: string;
  controlParams: ControlParams;
  macAddress?: string;
  downloadMbps?: number;
  uploadMbps?: number;
}

export interface RouterProvisioningPort {
  apply(input: RouterProvisioningInput): Promise<RouterInstruction>;
  remove(
    input: Pick<RouterProvisioningInput, 'routerId' | 'ip' | 'controlParams'>,
  ): Promise<RouterInstruction>;
  suspend(
    input: Pick<RouterProvisioningInput, 'routerId' | 'ip' | 'controlParams'>,
  ): Promise<RouterInstruction>;
  sync(routerId: string): Promise<{ supported: false }>;
}

export const ROUTER_PROVISIONING_PORT = Symbol('ROUTER_PROVISIONING_PORT');
