import { SubscriberStatus } from '@iwana/shared';
import { ContractStatus } from '../../enums/contract-status.enum';
import { deriveSubscriberStatusFromContracts } from '../subscriber-lifecycle.util';

describe('deriveSubscriberStatusFromContracts', () => {
  it('does not derive before activation, for a cancelled subscriber, or without live contracts', () => {
    expect(
      deriveSubscriberStatusFromContracts(SubscriberStatus.PROSPECT, null, [ContractStatus.ACTIVE]),
    ).toBe(SubscriberStatus.PROSPECT);
    expect(
      deriveSubscriberStatusFromContracts(SubscriberStatus.CANCELLED, '2026-10-01T00:00:00.000Z', [
        ContractStatus.ACTIVE,
      ]),
    ).toBe(SubscriberStatus.CANCELLED);
    expect(
      deriveSubscriberStatusFromContracts(SubscriberStatus.SUSPENDED, '2026-10-01T00:00:00.000Z', [
        ContractStatus.TERMINATED,
        ContractStatus.ARCHIVED,
      ]),
    ).toBe(SubscriberStatus.SUSPENDED);
  });

  it('is ACTIVE when any live service is active and SUSPENDED when all live services are suspended', () => {
    const activatedAt = new Date('2026-10-01T00:00:00.000Z');
    expect(
      deriveSubscriberStatusFromContracts(SubscriberStatus.SUSPENDED, activatedAt, [
        ContractStatus.SUSPENDED,
        ContractStatus.ACTIVE,
      ]),
    ).toBe(SubscriberStatus.ACTIVE);
    expect(
      deriveSubscriberStatusFromContracts(SubscriberStatus.ACTIVE, activatedAt, [
        ContractStatus.SUSPENDED,
        ContractStatus.SUSPENDED,
      ]),
    ).toBe(SubscriberStatus.SUSPENDED);
  });
});
