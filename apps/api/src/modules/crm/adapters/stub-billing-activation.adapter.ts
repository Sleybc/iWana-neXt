import { Injectable } from '@nestjs/common';
import { BillingActivationPort } from '../ports/billing-activation.port';

@Injectable()
export class StubBillingActivationAdapter extends BillingActivationPort {
  async activate(): Promise<void> {}
}
