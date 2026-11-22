import { countUsageSubscribers, LISTED_SUBSCRIBER_SCOPE_SQL } from './listed-subscribers';

describe('countUsageSubscribers (definición CRM sin anonimizados, ADR-114 v1.2)', () => {
  it('cuenta con el alcance de CRM, parametrizado por tenant y sin devolver filas', async () => {
    const query = jest.fn().mockResolvedValue([{ total: '3' }]);
    await expect(countUsageSubscribers({ query } as never, 't1')).resolves.toBe(3);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SELECT count(*)::int AS total');
    expect(sql).toContain(LISTED_SUBSCRIBER_SCOPE_SQL);
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain('s.anonymized_at IS NULL');
    expect(params).toEqual(['t1']);
  });

  it('el alcance cubre primera activación o contrato activado', () => {
    expect(LISTED_SUBSCRIBER_SCOPE_SQL).toContain(
      "s.status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')",
    );
    expect(LISTED_SUBSCRIBER_SCOPE_SQL).toContain("IN ('ACTIVE', 'SUSPENDED', 'TERMINATED')");
  });
});
