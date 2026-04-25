import { Injectable } from '@nestjs/common';
import {
  ExpansionRequestPort,
  type ExpansionRequestReference,
} from '../ports/expansion-request.port';

@Injectable()
export class StubExpansionRequestAdapter extends ExpansionRequestPort {
  async createRequest(input: { prospectId: string }): Promise<ExpansionRequestReference> {
    return { expansionRequestId: `exp-${input.prospectId}`, status: 'CREATED' };
  }
}
