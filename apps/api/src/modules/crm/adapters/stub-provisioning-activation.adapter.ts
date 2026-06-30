import { Injectable } from '@nestjs/common';
import { ProvisioningActivationPort } from '../ports/provisioning-activation.port';

@Injectable()
export class StubProvisioningActivationAdapter extends ProvisioningActivationPort {
  async activate(): Promise<void> {}
}
