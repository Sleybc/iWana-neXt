import type { QueryRunner } from 'typeorm';
import { ContractStatus } from '../modules/crm/enums/contract-status.enum';
import { SubscriberStatus } from '@iwana/shared';
import {
  analyzeLifecycleInconsistencies,
  parseLifecycleInconsistencyArgs,
} from './report-lifecycle-inconsistencies';

describe('analyzeLifecycleInconsistencies', () => {
  it('reports lifecycle mismatches using the shared B1 derivation and counts every contract status', async () => {
    const rows = [
      {
        subscriber_id: 'subscriber-1',
        subscriber_status: SubscriberStatus.ACTIVE,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.SUSPENDED,
        contract_count: 2,
      },
      {
        subscriber_id: 'subscriber-1',
        subscriber_status: SubscriberStatus.ACTIVE,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.DRAFT,
        contract_count: 1,
      },
      {
        subscriber_id: 'subscriber-2',
        subscriber_status: SubscriberStatus.SUSPENDED,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.ACTIVE,
        contract_count: 1,
      },
      {
        subscriber_id: 'subscriber-3',
        subscriber_status: SubscriberStatus.ACTIVE,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.ACTIVE,
        contract_count: 1,
      },
      {
        subscriber_id: 'subscriber-4',
        subscriber_status: SubscriberStatus.ACTIVE,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.DRAFT,
        contract_count: 1,
      },
      {
        subscriber_id: 'subscriber-5',
        subscriber_status: SubscriberStatus.PROSPECT,
        activated_at: null,
        contract_status: null,
        contract_count: 0,
      },
    ];
    const query = jest.fn().mockResolvedValue(rows);
    const queryRunner = { query } as unknown as Pick<QueryRunner, 'query'>;

    const report = await analyzeLifecycleInconsistencies(queryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(report).toEqual({
      subscribersScanned: 5,
      inconsistenciesFound: 2,
      inconsistencies: [
        {
          subscriberId: 'subscriber-1',
          currentStatus: SubscriberStatus.ACTIVE,
          derivedStatus: SubscriberStatus.SUSPENDED,
          contractsByStatus: {
            [ContractStatus.SUSPENDED]: 2,
            [ContractStatus.DRAFT]: 1,
          },
        },
        {
          subscriberId: 'subscriber-2',
          currentStatus: SubscriberStatus.SUSPENDED,
          derivedStatus: SubscriberStatus.ACTIVE,
          contractsByStatus: { [ContractStatus.ACTIVE]: 1 },
        },
      ],
    });
    expect(JSON.stringify(report)).not.toMatch(/email|phone|name|address/i);
    expect(query.mock.calls[0]?.[0]).toContain('FROM subscribers');
    expect(query.mock.calls[0]?.[0]).toContain('JOIN contracts');
    expect(query.mock.calls[0]?.[0]).toContain('deleted_at IS NULL');
  });

  it('preserves the behavior for cancelled subscribers and subscribers without live contracts', async () => {
    const rows = [
      {
        subscriber_id: 'subscriber-cancelled',
        subscriber_status: SubscriberStatus.CANCELLED,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.ACTIVE,
        contract_count: 1,
      },
      {
        subscriber_id: 'subscriber-no-live',
        subscriber_status: SubscriberStatus.SUSPENDED,
        activated_at: new Date('2026-01-01T00:00:00Z'),
        contract_status: ContractStatus.DRAFT,
        contract_count: 1,
      },
    ];
    const queryRunner = {
      query: jest.fn().mockResolvedValue(rows),
    } as unknown as Pick<QueryRunner, 'query'>;

    const report = await analyzeLifecycleInconsistencies(queryRunner);

    expect(report).toEqual({
      subscribersScanned: 2,
      inconsistenciesFound: 0,
      inconsistencies: [],
    });
  });
});

describe('parseLifecycleInconsistencyArgs', () => {
  it('requiere un tenant y deja la simulación como único modo', () => {
    expect(parseLifecycleInconsistencyArgs(['--tenant=tenant-demo'])).toEqual({
      tenant: 'tenant-demo',
      help: false,
    });
    expect(() => parseLifecycleInconsistencyArgs(['--apply'])).toThrow(
      'Argumento desconocido: --apply',
    );
    expect(() => parseLifecycleInconsistencyArgs(['--tenant='])).toThrow(
      '--tenant requiere un id o slug.',
    );
    expect(() =>
      parseLifecycleInconsistencyArgs(['--tenant=tenant-a', '--tenant=tenant-b']),
    ).toThrow('Usa --tenant una sola vez.');
  });
});
