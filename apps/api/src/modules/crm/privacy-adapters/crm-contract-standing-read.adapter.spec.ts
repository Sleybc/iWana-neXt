import { EntityManager } from 'typeorm';
import { CrmContractStandingReadAdapter } from './crm-contract-standing-read.adapter';

describe('CrmContractStandingReadAdapter retention clock', () => {
  it.each([new Date('2020-01-01T00:00:00Z'), '2020-01-01T00:00:00Z'])(
    'serializa el máximo terminal %s',
    async (date) => {
      const query = jest
        .fn()
        .mockResolvedValue([{ open_contract_ids: ['contract-test'], last_terminated_at: date }]);
      const result = await new CrmContractStandingReadAdapter().standing('party-test', {
        manager: { query } as unknown as EntityManager,
      });
      expect(result).toEqual({
        openContractIds: ['contract-test'],
        lastTerminatedAt: '2020-01-01T00:00:00.000Z',
      });
      expect(query).toHaveBeenCalledWith(expect.stringContaining('max(c.terminated_at)'), [
        'party-test',
      ]);
      expect(query.mock.calls[0][0]).toContain('c.deleted_at IS NULL');
      expect(query.mock.calls[0][0]).toContain("WHERE c.status IN ('TERMINATED', 'ARCHIVED')");
    },
  );

  it.each([{ rows: [] }, { rows: [{ open_contract_ids: [], last_terminated_at: null }] }])(
    'no inventa una fecha sin contratos terminales',
    async ({ rows }) => {
      const query = jest.fn().mockResolvedValue(rows);
      expect(
        await new CrmContractStandingReadAdapter().standing('party-test', {
          manager: { query } as unknown as EntityManager,
        }),
      ).toEqual({ openContractIds: [], lastTerminatedAt: null });
    },
  );
});
