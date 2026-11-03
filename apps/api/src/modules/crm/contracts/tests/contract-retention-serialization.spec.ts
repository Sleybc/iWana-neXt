import { Contract } from '../entities/contract.entity';

describe('Contract retention serialization', () => {
  it('conserva el ancla en la entidad sin exponerla en JSON HTTP', () => {
    const contract = Object.assign(new Contract(), {
      id: 'contract-test',
      status: 'TERMINATED',
      terminatedAt: new Date('2020-01-01T00:00:00Z'),
    });
    expect(JSON.parse(JSON.stringify(contract)) as Record<string, unknown>).toEqual({
      id: 'contract-test',
      status: 'TERMINATED',
      titularAnonymizedAt: null,
    });
    expect(contract.terminatedAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });
});
