import { EntityManager } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { CrmContractStandingReadAdapter } from './crm-contract-standing-read.adapter';

const tenantContext = {
  tenantId: 'tenant-test',
  schemaName: 'tenant_test',
  tenantSlug: 'tenant-test',
};

describe('CrmContractStandingReadAdapter retention clock', () => {
  it.each([new Date('2020-01-01T00:00:00Z'), '2020-01-01T00:00:00Z'])(
    'serializa el máximo terminal %s',
    async (date) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'subscriber-test' }])
        .mockResolvedValueOnce([
          {
            contract_ids: ['contract-test'],
            open_contract_ids: ['contract-test'],
            last_terminated_at: date,
          },
        ]);
      const result = await TenantContext.run(tenantContext, () =>
        new CrmContractStandingReadAdapter().standing('party-test', {
          manager: { query } as unknown as EntityManager,
        }),
      );
      expect(result).toEqual({
        contractIds: ['contract-test'],
        expedienteIds: [],
        subscriberIds: ['subscriber-test'],
        openContractIds: ['contract-test'],
        lastTerminatedAt: '2020-01-01T00:00:00.000Z',
        unreconciledContractClock: false,
      });
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0][0]).toContain('tenant_id = $2');
      expect(query.mock.calls[0][1]).toEqual(['party-test', 'tenant-test']);
      expect(query.mock.calls[1][0]).toContain('max(c.terminated_at)');
      expect(query.mock.calls[1][1]).toEqual(['party-test', 'tenant-test']);
      expect(query.mock.calls[1][0]).toContain('c.deleted_at IS NULL');
      expect(query.mock.calls[1][0]).toContain('WHERE s.party_id = $1 AND s.tenant_id = $2');
    },
  );

  it.each([{ rows: [] }, { rows: [{ open_contract_ids: [], last_terminated_at: null }] }])(
    'no inventa una fecha sin contratos terminales',
    async ({ rows }) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'subscriber-test' }])
        .mockResolvedValueOnce(rows);
      expect(
        await TenantContext.run(tenantContext, () =>
          new CrmContractStandingReadAdapter().standing('party-test', {
            manager: { query } as unknown as EntityManager,
          }),
        ),
      ).toEqual({
        contractIds: [],
        expedienteIds: [],
        subscriberIds: ['subscriber-test'],
        openContractIds: [],
        lastTerminatedAt: null,
        unreconciledContractClock: false,
      });
    },
  );
});
