import { BillingMigrationImportAdapter } from './billing-migration-import.adapter';

/** Conciliación de un titular complementado (spec 2026-11-15 §2.5): solo lo de UISP. */
describe('BillingMigrationImportAdapter — totales importados', () => {
  const adapter = new BillingMigrationImportAdapter();
  const subscriberId = '11111111-1111-4111-8111-111111111111';

  function ctx() {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ subscriber_id: subscriberId, cents: '15000' }])
      .mockResolvedValueOnce([{ subscriber_id: subscriberId, cents: '5000' }]);
    return { query, ctx: { manager: { query }, tenantId: 't' } as never };
  }

  it('importedTotalsBySubscriber filtra documentos y pagos por external_id uisp:%', async () => {
    const { query, ctx: read } = ctx();
    await expect(adapter.importedTotalsBySubscriber(read, [subscriberId])).resolves.toEqual(
      new Map([[subscriberId, { billedCents: 15000, paidCents: 5000 }]]),
    );
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain("external_id LIKE 'uisp:%'");
      expect(params).toEqual(['t', [subscriberId], true]);
    }
  });

  it('totalsBySubscriber conserva el total de iWana (sin filtro de origen)', async () => {
    const { query, ctx: read } = ctx();
    await adapter.totalsBySubscriber(read, [subscriberId]);
    for (const [, params] of query.mock.calls) expect(params).toEqual(['t', [subscriberId], false]);
  });

  it('sin titulares no consulta', async () => {
    const { query, ctx: read } = ctx();
    await expect(adapter.importedTotalsBySubscriber(read, [])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});
