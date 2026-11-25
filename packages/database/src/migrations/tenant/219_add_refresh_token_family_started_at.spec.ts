import { AddRefreshTokenFamilyStartedAt2190000000219 } from './219_add_refresh_token_family_started_at';

describe('219_add_refresh_token_family_started_at', () => {
  it('up añade una columna nullable sin backfill y down la retira', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const migration = new AddRefreshTokenFamilyStartedAt2190000000219();
    await migration.up({ query } as never);
    await migration.down({ query } as never);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'ALTER TABLE refresh_tokens ADD COLUMN family_started_at timestamptz',
      'ALTER TABLE refresh_tokens DROP COLUMN family_started_at',
    ]);
  });
});
