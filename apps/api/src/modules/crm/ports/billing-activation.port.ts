import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class BillingActivationPort {
  abstract activate(input: {
    tenantId: string;
    schemaName: string;
    prospectId: string;
    customerActivationId: string;
  }): Promise<void>;
}
