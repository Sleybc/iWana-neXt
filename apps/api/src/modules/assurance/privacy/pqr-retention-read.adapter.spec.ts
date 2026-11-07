import { TenantContext } from '@iwana/db';
import type { EntityManager } from 'typeorm';
import * as sql from '../../crm/privacy-adapters/titular-erasure/titular-erasure-sql';
import { PqrRetentionReadAdapter } from './pqr-retention-read.adapter';

describe('PqrRetentionReadAdapter — guardas de lectura', () => {
  const scope = { subscriberIds: ['subscriber'], contractIds: [], expedienteIds: [] };
  afterEach(() => jest.restoreAllMocks());

  it('no consulta datos sin un alcance atribuible', async () => {
    const query = jest.fn();
    const manager = { query } as unknown as EntityManager;
    expect(
      await new PqrRetentionReadAdapter().read(
        { subscriberIds: [], contractIds: [], expedienteIds: [] },
        { manager },
      ),
    ).toEqual({ hasUnanswered: false, lastResponseAt: null });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([undefined, { isTransactionActive: false }])(
    'falla cerrado sin transacción tenant activa: %s',
    async (queryRunner) => {
      const manager = { queryRunner, query: jest.fn() } as unknown as EntityManager;
      await expect(new PqrRetentionReadAdapter().read(scope, { manager })).rejects.toThrow(
        'transacción tenant activa',
      );
      expect(manager.query).not.toHaveBeenCalled();
    },
  );

  it.each(['sin tablas', 'sin referencias'])('tolera esquemas parciales: %s', async (kind) => {
    const names = kind === 'sin tablas' ? [] : ['support_tickets.id', 'ticket_pqr_records.id'];
    jest
      .spyOn(sql, 'readTenantColumns')
      .mockResolvedValue(new Map(names.map((name) => [name, {} as sql.TenantColumn])));
    const manager = {
      queryRunner: { isTransactionActive: true },
      query: jest.fn(),
    } as unknown as EntityManager;
    const result = await TenantContext.run(
      { tenantId: 'tenant-test', schemaName: 'tenant_test', tenantSlug: 'test' },
      () => new PqrRetentionReadAdapter().read(scope, { manager }),
    );
    expect(result).toEqual({ hasUnanswered: false, lastResponseAt: null });
    expect(manager.query).not.toHaveBeenCalled();
  });
});
