import { Injectable } from '@nestjs/common';
import { ReviewCause } from '../enums/review-cause.enum';

export interface ExpansionRequestReference {
  expansionRequestId: string;
  status: string;
}

@Injectable()
export abstract class ExpansionRequestPort {
  abstract createRequest(input: {
    tenantId: string;
    schemaName: string;
    prospectId: string;
    cause: ReviewCause;
    ticketId: string;
    workOrderId: string;
  }): Promise<ExpansionRequestReference>;
}
