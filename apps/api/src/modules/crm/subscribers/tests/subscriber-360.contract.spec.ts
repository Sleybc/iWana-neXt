import { SUBSCRIBER_360_QUOTE_STATUSES } from '@iwana/shared';
import { QuoteStatus } from '../../enums/quote-status.enum';

describe('Subscriber360 shared contract', () => {
  it('mantiene paridad entre estados de cotización compartidos y QuoteStatus de CRM', () => {
    expect([...SUBSCRIBER_360_QUOTE_STATUSES].sort()).toEqual(Object.values(QuoteStatus).sort());
  });
});
