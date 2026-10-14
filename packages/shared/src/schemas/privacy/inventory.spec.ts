import { privacyInventorySchema } from './inventory';

describe('privacyInventorySchema', () => {
  const validInventory = {
    generatedAt: '2026-10-14T12:00:00.000Z',
    databases: [
      {
        key: 'CLIENTES',
        categories: ['identificación'],
        purposes: ['TRATAMIENTO_CONTRACTUAL'],
        retention: [{ category: 'IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR', years: 5 }],
        hasSensitiveData: false,
        internationalTransfer: 'NO_DECLARADA',
        securityMeasures: ['Control de acceso por rol'],
      },
    ],
  };

  it('acepta el inventario declarativo y sus finalidades tipadas', () => {
    expect(privacyInventorySchema.safeParse(validInventory).success).toBe(true);
  });

  it('rechaza conteos y claves no incluidas en el contrato', () => {
    expect(
      privacyInventorySchema.safeParse({
        ...validInventory,
        databases: [{ ...validInventory.databases[0], recordCount: 20 }],
      }).success,
    ).toBe(false);
    expect(
      privacyInventorySchema.safeParse({
        ...validInventory,
        databases: [{ ...validInventory.databases[0], key: 'ARCHIVO' }],
      }).success,
    ).toBe(false);
  });
});
