import { Injectable } from '@nestjs/common';
import type { RouterInstruction } from '@iwana/shared';
import type {
  RouterProvisioningInput,
  RouterProvisioningPort,
} from '../ports/router-provisioning.port';

@Injectable()
export class ManualRouterProvisioningAdapter implements RouterProvisioningPort {
  async apply(input: RouterProvisioningInput): Promise<RouterInstruction> {
    if (input.controlParams.method === 'PCQ_ADDRESS_LIST') {
      return {
        mode: 'MANUAL',
        steps: [
          `/ip firewall address-list add list=${input.controlParams.addressList} address=${input.ip}`,
        ],
      };
    }
    if (input.downloadMbps === undefined || input.uploadMbps === undefined) {
      return {
        mode: 'MANUAL',
        steps: [
          `Configurar la cola ${input.controlParams.queueName} para ${input.ip}/32 con los límites del plan.`,
        ],
      };
    }
    return {
      mode: 'MANUAL',
      steps: [
        `/queue simple add name=${input.controlParams.queueName} target=${input.ip}/32 max-limit=${input.uploadMbps}M/${input.downloadMbps}M`,
      ],
    };
  }

  async remove(
    input: Pick<RouterProvisioningInput, 'routerId' | 'ip' | 'controlParams'>,
  ): Promise<RouterInstruction> {
    const step =
      input.controlParams.method === 'PCQ_ADDRESS_LIST'
        ? `/ip firewall address-list remove [find list=${input.controlParams.addressList} address=${input.ip}]`
        : `/queue simple remove [find name=${input.controlParams.queueName} target=${input.ip}/32]`;
    return { mode: 'MANUAL', steps: [step] };
  }

  async suspend(
    input: Pick<RouterProvisioningInput, 'routerId' | 'ip' | 'controlParams'>,
  ): Promise<RouterInstruction> {
    return this.remove(input);
  }

  async sync(_routerId: string): Promise<{ supported: false }> {
    return { supported: false };
  }
}
