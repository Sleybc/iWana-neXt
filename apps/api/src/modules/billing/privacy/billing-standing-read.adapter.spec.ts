import { TenantContext } from '@iwana/db';
import type { EntityManager } from 'typeorm';
import { BillingStandingReadAdapter } from './billing-standing-read.adapter';

describe('BillingStandingReadAdapter', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  let adapter: BillingStandingReadAdapter;
  let query: jest.Mock;

  beforeEach(() => {
    adapter = new BillingStandingReadAdapter();
    query = jest.fn();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ tenantId } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('lee la fecha civil del último documento emitido o anulado, acotando tenant y suscriptores', async () => {
    query.mockResolvedValue([{ last_fiscal_document_at: '2016-05-31' }]);

    await expect(
      adapter.lastFiscalDocumentAt(
        ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'],
        { manager: { query } as unknown as EntityManager },
      ),
    ).resolves.toBe('2016-05-31');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('EMITIDO', 'ANULADO')"),
      [tenantId, ['20000000-0000-4000-8000-000000000001']],
    );
    expect(query.mock.calls[0]?.[0]).toContain('tenant_id = $1::uuid');
    expect(query.mock.calls[0]?.[0]).toContain('MAX(issue_date)::text');
  });

  it('no consulta Billing cuando no hay suscriptores', async () => {
    await expect(
      adapter.lastFiscalDocumentAt([], { manager: { query } as unknown as EntityManager }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('devuelve nulo cuando ningún documento fiscal tiene fecha de emisión', async () => {
    query.mockResolvedValue([{ last_fiscal_document_at: null }]);

    await expect(
      adapter.lastFiscalDocumentAt(['20000000-0000-4000-8000-000000000001'], {
        manager: { query } as unknown as EntityManager,
      }),
    ).resolves.toBeNull();
  });
});
