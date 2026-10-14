import type { RequestSummary } from '@iwana/shared';

export abstract class IPrivacyRequestsReadPort {
  abstract listForParty(partyId: string): Promise<RequestSummary[]>;
  abstract dueCounts(today: string): Promise<{
    overdue: number;
    dueSoon: number;
    overdueTasks: number;
  }>;
}
