import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class ProvisioningActivationPort {
  abstract activate(input: {
    tenantId: string;
    schemaName: string;
    prospectId: string;
    customerActivationId: string;
  }): Promise<void>;
}
