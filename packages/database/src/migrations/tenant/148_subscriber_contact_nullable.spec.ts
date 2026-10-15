import { SubscriberContactNullable1480000000000 } from './148_subscriber_contact_nullable';

describe('SubscriberContactNullable148', () => {
  const migration = new SubscriberContactNullable1480000000000();

  it('up relaja el NOT NULL de las tres columnas sin backfill', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as never);

    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('ALTER COLUMN email_encrypted DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN phone_encrypted DROP NOT NULL');
    expect(sql).toContain('ALTER COLUMN value DROP NOT NULL');
    expect(sql).not.toMatch(/\bUPDATE\b/u);
  });

  it('down verifica los tres conteos antes de restaurar NOT NULL', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ email_nulls: 0, phone_nulls: 0, party_contact_value_nulls: 0 }]);

    await migration.down({ query } as never);

    expect(query).toHaveBeenCalledTimes(3);
    const sql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(sql).toContain('email_encrypted SET NOT NULL');
    expect(sql).toContain('phone_encrypted SET NOT NULL');
    expect(sql).toContain('party_contact');
    expect(sql).toContain('value SET NOT NULL');
  });

  it('down aborta antes del DDL e informa conteos sin datos de contacto', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ email_nulls: 2, phone_nulls: 1, party_contact_value_nulls: 3 }]);

    await expect(migration.down({ query } as never)).rejects.toThrow(
      'subscribers.email_encrypted (2), subscribers.phone_encrypted (1) y party_contact.value (3)',
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain('COUNT(*)');
  });
});
