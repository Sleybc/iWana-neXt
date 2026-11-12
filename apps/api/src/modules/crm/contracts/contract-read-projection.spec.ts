import type { EntityManager } from 'typeorm';
import { ContractStatus } from '../enums/contract-status.enum';
import { projectContractsForRead } from './contract-read-projection';
import { Contract } from './entities/contract.entity';

/** Spec MOD14 2026-11-12 R2: el IVA congelado no sobrevive a la anonimización del titular. */
describe('projectContractsForRead — IVA congelado de un titular anonimizado', () => {
  const subscriberId = '5e1d47e5-7241-4e63-9684-2b51ecee55ba';
  const frozen = {
    treatment: 'STANDARD',
    legalBasis: 'ET_468',
    ratePercent: 19,
    source: 'CATALOG',
    frozenAt: '2026-11-12T00:00:00.000Z',
  };

  function contract(): Contract {
    return Object.assign(new Contract(), {
      id: '6f2e58f6-8352-4f74-a795-3c62fdff66cb',
      subscriberId,
      status: ContractStatus.ACTIVE,
      billingCycleDay: 1,
      additionalProductIds: ['item-1'],
      additionalServiceIds: [],
      installationVatSnapshot: frozen,
      additionalVatSnapshot: [
        { ...frozen, itemId: 'item-1', itemType: 'PRODUCT', name: 'Router', unitPrice: '1.00' },
      ],
    });
  }

  function manager(anonymizedAt: Date | null): EntityManager {
    return {
      find: jest.fn(async () => [{ id: subscriberId, partyId: null, anonymizedAt }]),
      query: jest.fn(async () => []),
    } as unknown as EntityManager;
  }

  it('vacía installationVatSnapshot y additionalVatSnapshot como additionalProductIds', async () => {
    const { data } = await projectContractsForRead(
      manager(new Date('2026-11-01T00:00:00.000Z')),
      [contract()],
      false,
      {} as never,
    );
    expect(data[0]).toMatchObject({
      additionalProductIds: [],
      installationVatSnapshot: null,
      additionalVatSnapshot: [],
    });
  });

  it('con el titular vigente conserva el IVA congelado', async () => {
    const { data } = await projectContractsForRead(manager(null), [contract()], false, {} as never);
    expect(data[0]?.installationVatSnapshot).toEqual(frozen);
    expect(data[0]?.additionalVatSnapshot).toHaveLength(1);
  });
});
