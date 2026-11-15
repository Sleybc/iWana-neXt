import { ConfigService } from '@nestjs/config';
import { PartyContactType } from '@iwana/shared';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { hmacPii, resolvePiiHashKey } from '../../../common/crypto/pii-hash-key.util';
import type { ComplementSubscriberInput } from '../../migration/ports/migration-import.ports';
import { CrmMigrationImportAdapter } from './crm-migration-import.adapter';

/**
 * Complemento de un titular existente (spec 2026-11-15 §2.3, §2.4, §2.6): enlace sin
 * `import_batch_id`, solo campos vacíos, HMAC sin valores y reversión con su bloqueo. El SQL
 * real lo ejercita migration-promotion.postgres.integration.
 */
const config = new ConfigService({
  PII_ENCRYPTION_KEY: '9a'.repeat(32),
  MFA_ENCRYPTION_KEY: '8b'.repeat(32),
  PII_HASH_KEY: '7c'.repeat(32),
  NODE_ENV: 'test',
});
const hashKey = resolvePiiHashKey(config);
const subscriberId = '11111111-1111-4111-8111-111111111111';
const partyId = '44444444-4444-4444-8444-444444444444';

const emptyRow = {
  email: null,
  phone: null,
  altContactName: null,
  altContactPhone: null,
  address: 'Sin dirección registrada',
  city: null,
  latitude: null,
  longitude: null,
  email_hmac: null,
  phone_hmac: null,
  party_id: partyId,
};

const input: ComplementSubscriberInput = {
  subscriberId,
  email: 'titular@example.invalid',
  phone: '3000000000',
  altContactName: 'Contacto Alterno',
  altContactPhone: '3000000001',
  additionalContacts: [{ type: 'EMAIL', value: 'otro@example.invalid' }],
  address: 'Calle 1 # 2-3',
  city: 'Medellín',
  latitude: 6.25,
  longitude: -75.56,
};

function setup(current: Record<string, unknown>) {
  const party = {
    addContactsIfAbsent: jest.fn().mockResolvedValue(['c-1']),
    removeContacts: jest.fn().mockResolvedValue(1),
  };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FOR UPDATE')) return [current];
    if (sql.startsWith('SELECT party_id')) return [{ party_id: partyId }];
    if (sql.startsWith('UPDATE subscribers SET') && sql.includes('RETURNING')) {
      // Devuelve lo escrito: columnas en orden de los parámetros $3…
      const assigned = [...sql.matchAll(/(\w+) = \$(\d+)/gu)];
      const byColumn = Object.fromEntries(
        assigned.map(([, col, n]) => [col, params[Number(n) - 1]]),
      );
      const columns: Record<string, string> = {
        email: 'email_encrypted',
        phone: 'phone_encrypted',
        altContactName: 'alt_contact_name',
        altContactPhone: 'alt_contact_phone_encrypted',
        address: 'address',
        city: 'city',
        latitude: 'latitude',
        longitude: 'longitude',
      };
      const after: Record<string, unknown> = {};
      for (const [field, column] of Object.entries(columns)) {
        after[field] = column in byColumn ? String(byColumn[column]) : (current[field] ?? null);
      }
      return [[after], 1];
    }
    return [[{ id: subscriberId }], 1];
  });
  const adapter = new CrmMigrationImportAdapter(config, party as never, {} as never);
  const ctx = {
    manager: { query },
    tenantId: 't',
    schemaName: 'tenant_x',
    batchId: 'b',
    actorId: 'a',
  } as never;
  return { adapter, query, party, ctx };
}

describe('CrmMigrationImportAdapter — complemento de titular existente', () => {
  it('linkComplement fija external_id solo si es NULL y nunca escribe import_batch_id', async () => {
    const { adapter, query, ctx } = setup(emptyRow);
    await expect(adapter.linkComplement(ctx, subscriberId, 'uisp:client:7')).resolves.toBe(true);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toContain('external_id IS NULL');
    expect(sql).not.toContain('import_batch_id');
    expect(params).toEqual(['t', subscriberId, 'uisp:client:7']);
  });

  it('completa todos los vacíos (dirección placeholder incluida) y devuelve solo nombres y HMAC', async () => {
    const { adapter, query, party, ctx } = setup(emptyRow);
    const result = await adapter.fillEmptyFields(ctx, input);

    expect(result.filled.map((item) => item.field).sort()).toEqual(
      [
        'address',
        'altContactName',
        'altContactPhone',
        'city',
        'email',
        'latitude',
        'longitude',
        'phone',
      ].sort(),
    );
    expect(result.differing).toEqual([]);
    expect(result.contactIds).toEqual(['c-1']);
    for (const item of result.filled) expect(item.hmac).toMatch(/^[0-9a-f]{64}$/u);
    // Sin valores en lo que se devuelve (va a promotion_meta).
    expect(JSON.stringify(result)).not.toContain('titular@example.invalid');
    expect(JSON.stringify(result)).not.toContain('Calle 1');
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE subscribers'))!;
    expect(update[0]).toContain('email_hmac');
    expect(update[0]).toContain('phone_hmac');
    expect(update[1]).toContain(hashEmail(input.email!, hashKey));
    expect(update[1]).toContain(hmacPii(input.phone!, hashKey));
    // El correo y el teléfono se guardan cifrados, nunca en claro.
    expect(update[1]).not.toContain(input.email);
    expect(party.addContactsIfAbsent).toHaveBeenCalledWith(
      partyId,
      [{ type: PartyContactType.EMAIL, value: 'otro@example.invalid' }],
      expect.anything(),
    );
  });

  it('nunca sobrescribe: lo que tiene valor distinto va a differing y no se actualiza', async () => {
    const { adapter, query, ctx } = setup({
      ...emptyRow,
      email: 'cifrado-previo',
      email_hmac: hashEmail('previo@example.invalid', hashKey),
      phone: 'cifrado-previo',
      phone_hmac: hmacPii(input.phone!, hashKey),
      altContactName: 'Otra Persona',
      altContactPhone: 'cifrado',
      address: 'Carrera 9',
      city: 'Bogotá',
    });
    const result = await adapter.fillEmptyFields(ctx, { ...input, additionalContacts: [] });

    expect(result.filled).toEqual([]);
    expect(result.differing.sort()).toEqual(['address', 'altContactName', 'email'].sort());
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('dirección con valor: municipio y coordenadas no se completan sueltos', async () => {
    const { adapter, ctx } = setup({ ...emptyRow, address: 'Carrera 9' });
    const result = await adapter.fillEmptyFields(ctx, { ...input, additionalContacts: [] });
    const fields = result.filled.map((item) => item.field);
    expect(fields).not.toContain('city');
    expect(fields).not.toContain('latitude');
    expect(fields).not.toContain('address');
  });

  it('revertComplement vacía lo completado, devuelve el placeholder y retira external_id y contactos', async () => {
    const { adapter, query, party, ctx } = setup(emptyRow);
    await expect(
      adapter.revertComplement(ctx, [
        {
          subscriberId,
          linkedExternalId: 'uisp:client:7',
          filled: [
            { field: 'email', hmac: 'x' },
            { field: 'address', hmac: 'y' },
          ],
          contactIds: ['c-1'],
        },
      ]),
    ).resolves.toBe(1);
    const sqls = query.mock.calls.map(([sql]) => String(sql));
    expect(sqls[0]).toContain('email_encrypted = NULL');
    expect(sqls[0]).toContain('email_hmac = NULL');
    expect(sqls[0]).toContain("address = 'Sin dirección registrada'");
    expect(sqls[0]).not.toContain('DELETE');
    expect(sqls[1]).toContain('external_id = NULL');
    expect(party.removeContacts).toHaveBeenCalledWith(partyId, ['c-1'], expect.anything());
  });

  it('revertBlockers: DATO_COMPLETADO_MODIFICADO solo si el HMAC actual difiere del escrito', async () => {
    const { adapter, query, ctx } = setup(emptyRow);
    const result = await adapter.fillEmptyFields(ctx, { ...input, additionalContacts: [] });
    const email = result.filled.find((item) => item.field === 'email')!;
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE subscribers'))!;
    const written = (update[1] as unknown[]).find(
      (value) => typeof value === 'string' && value !== 't' && value.includes(':'),
    );
    const ids = { subscriberIds: [], contractIds: [] };
    const record = { subscriberId, linkedExternalId: null, filled: [email], contactIds: [] };
    const reading = (stored: unknown) =>
      ({
        manager: { query: jest.fn().mockResolvedValue([{ email: stored }]) },
        tenantId: 't',
      }) as never;

    // Sigue el cifrado que escribió el lote → sin bloqueo.
    await expect(
      adapter.revertBlockers(reading(written), 'b', { ...ids, complements: [record] }),
    ).resolves.toEqual([]);
    // Alguien lo editó → bloqueo.
    await expect(
      adapter.revertBlockers(reading('otro-cifrado'), 'b', { ...ids, complements: [record] }),
    ).resolves.toEqual([{ motivo: 'DATO_COMPLETADO_MODIFICADO', cantidad: 1 }]);
    await expect(adapter.revertBlockers(reading(null), 'b', ids)).resolves.toEqual([]);
  });
});
