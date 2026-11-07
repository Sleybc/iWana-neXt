import type { QueryRunner } from 'typeorm';
import { SupplierProfileReadAdapter } from './supplier-profile-read.adapter';

describe('SupplierProfileReadAdapter', () => {
  const adapter = new SupplierProfileReadAdapter();
  const partyId = 'party-fixture';
  const catalog = [
    {
      table_name: 'supplier_profiles',
      column_name: 'party_ref_id',
      is_nullable: 'NO',
      data_type: 'uuid',
      udt_name: 'uuid',
    },
  ];

  it('devuelve false en un schema parcial sin consultar la tabla ausente', async () => {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) return [];
      throw Object.assign(new Error('Tabla ausente en el schema sintético'), { code: '42P01' });
    });

    await expect(
      adapter.hasSupplierProfile(partyId, { query } as unknown as QueryRunner),
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('information_schema.columns'));
  });

  it.each([true, false])(
    'con tabla presente devuelve proveedor=%s para el Party',
    async (linked) => {
      const query = jest.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce([{ linked }]);

      await expect(
        adapter.hasSupplierProfile(partyId, { query } as unknown as QueryRunner),
      ).resolves.toBe(linked);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('party_ref_id::text = $1::text'), [
        partyId,
      ]);
    },
  );

  it('devuelve false si la consulta de existencia no devuelve filas', async () => {
    const query = jest.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce([]);

    await expect(
      adapter.hasSupplierProfile(partyId, { query } as unknown as QueryRunner),
    ).resolves.toBe(false);
  });

  it('propaga un fallo de lectura del catálogo sin confundirlo con tabla ausente', async () => {
    const failure = new Error('Fallo sintético de catálogo');
    const query = jest.fn().mockRejectedValue(failure);

    await expect(
      adapter.hasSupplierProfile(partyId, { query } as unknown as QueryRunner),
    ).rejects.toBe(failure);
  });
});
