import { VatTreatment } from '../enums/vat-treatment.enum';
import {
  catalogItemVatInputSchema,
  contractAdditionalVatSnapshotSchema,
  contractItemVatSnapshotSchema,
  freezeCatalogItemVat,
  parseContractAdditionalVatSnapshots,
  parseContractItemVatSnapshot,
  planInstallationVatInputSchema,
  resolveCatalogItemVat,
  vatRateForTreatment,
} from './catalog-item-vat';

// Spec MOD14 2026-11-12 «IVA por concepto y cortesías» (D1, D2, R1, R2).
describe('IVA por ítem del catálogo', () => {
  it('D2: sin tratamiento propio resuelve STANDARD 19 % ET_468 como DEFAULT', () => {
    expect(resolveCatalogItemVat(null, null)).toEqual({
      treatment: VatTreatment.STANDARD,
      legalBasis: 'ET_468',
      ratePercent: 19,
      source: 'DEFAULT',
    });
    expect(resolveCatalogItemVat(undefined, 'ET_476_7').source).toBe('DEFAULT');
  });

  it('R1: el tratamiento del ítem fija la tarifa y conserva su base legal', () => {
    expect(resolveCatalogItemVat(VatTreatment.EXEMPT, 'ET_476_7')).toEqual({
      treatment: VatTreatment.EXEMPT,
      legalBasis: 'ET_476_7',
      ratePercent: 0,
      source: 'CATALOG',
    });
    expect(resolveCatalogItemVat(VatTreatment.EXCLUDED, 'ET_476_7').ratePercent).toBe(0);
    expect(resolveCatalogItemVat(VatTreatment.STANDARD, null)).toMatchObject({
      legalBasis: 'ET_468',
      ratePercent: 19,
      source: 'CATALOG',
    });
  });

  it('un exento o excluido sin base legal es un error de datos', () => {
    expect(() => resolveCatalogItemVat(VatTreatment.EXEMPT, null)).toThrow(RangeError);
    expect(() => resolveCatalogItemVat(VatTreatment.EXCLUDED, '')).toThrow(RangeError);
  });

  it('la tarifa depende solo del tratamiento', () => {
    expect(vatRateForTreatment(VatTreatment.STANDARD)).toBe(19);
    expect(vatRateForTreatment(VatTreatment.EXEMPT)).toBe(0);
    expect(vatRateForTreatment(VatTreatment.EXCLUDED)).toBe(0);
  });

  it.each([
    [catalogItemVatInputSchema, 'vatTreatment', 'vatLegalBasis'],
    [planInstallationVatInputSchema, 'installationVatTreatment', 'installationVatLegalBasis'],
  ] as const)('entrada %#: exige base legal con EXEMPT/EXCLUDED y la normaliza', (schema, t, b) => {
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ [t]: VatTreatment.STANDARD }).success).toBe(true);
    expect(schema.safeParse({ [t]: VatTreatment.EXEMPT }).success).toBe(false);
    expect(schema.safeParse({ [t]: VatTreatment.EXCLUDED, [b]: null }).success).toBe(false);
    const parsed = schema.parse({ [t]: VatTreatment.EXEMPT, [b]: ' et_476_7 ' }) as Record<
      string,
      unknown
    >;
    expect(parsed[b]).toBe('ET_476_7');
    expect(schema.safeParse({ [b]: 'base legal libre con espacios' }).success).toBe(false);
    expect(schema.safeParse({ [b]: 'X' }).success).toBe(false);
  });

  it('el snapshot congelado exige tarifa coherente y rechaza campos extra', () => {
    const frozen = freezeCatalogItemVat(
      resolveCatalogItemVat(VatTreatment.STANDARD, 'ET_468'),
      new Date('2026-11-12T10:00:00.000Z'),
    );
    expect(frozen).toEqual({
      treatment: 'STANDARD',
      legalBasis: 'ET_468',
      ratePercent: 19,
      source: 'CATALOG',
      frozenAt: '2026-11-12T10:00:00.000Z',
    });
    expect(contractItemVatSnapshotSchema.safeParse(frozen).success).toBe(true);
    expect(contractItemVatSnapshotSchema.safeParse({ ...frozen, ratePercent: 0 }).success).toBe(
      false,
    );
    expect(contractItemVatSnapshotSchema.safeParse({ ...frozen, extra: 1 }).success).toBe(false);
    // Instante con desplazamiento, como lo escribe PostgreSQL en el relleno de la 201.
    expect(
      contractItemVatSnapshotSchema.safeParse({
        ...frozen,
        source: 'BACKFILL',
        frozenAt: '2026-11-12T10:00:00.123+00:00',
      }).success,
    ).toBe(true);
    expect(
      contractAdditionalVatSnapshotSchema.safeParse({
        ...frozen,
        itemId: 'item-1',
        itemType: 'SERVICE',
      }).success,
    ).toBe(true);
    expect(
      contractAdditionalVatSnapshotSchema.safeParse({ ...frozen, itemId: 'x', itemType: 'PLAN' })
        .success,
    ).toBe(false);
  });

  it('la lectura tolerante descarta lo inválido', () => {
    const valid = freezeCatalogItemVat(resolveCatalogItemVat(null, null));
    expect(parseContractItemVatSnapshot(valid)).toEqual(valid);
    expect(parseContractItemVatSnapshot(null)).toBeNull();
    expect(parseContractItemVatSnapshot({ treatment: 'STANDARD' })).toBeNull();
    expect(parseContractAdditionalVatSnapshots('no')).toEqual([]);
    expect(
      parseContractAdditionalVatSnapshots([
        { ...valid, itemId: 'a', itemType: 'PRODUCT' },
        { bad: true },
      ]),
    ).toEqual([{ ...valid, itemId: 'a', itemType: 'PRODUCT' }]);
  });
});

describe('adicional congelado con nombre y precio (bloque C)', () => {
  const entry = {
    itemId: 'a',
    itemType: 'SERVICE' as const,
    treatment: VatTreatment.STANDARD,
    legalBasis: 'ET_468',
    ratePercent: 19 as const,
    source: 'CATALOG' as const,
    frozenAt: '2026-11-12T00:00:00.000Z',
  };

  it('acepta nombre y precio con dos decimales, o precio nulo', () => {
    expect(
      contractAdditionalVatSnapshotSchema.safeParse({
        ...entry,
        name: 'IP fija',
        unitPrice: '30000.00',
      }).success,
    ).toBe(true);
    expect(
      contractAdditionalVatSnapshotSchema.safeParse({ ...entry, unitPrice: null }).success,
    ).toBe(true);
    expect(contractAdditionalVatSnapshotSchema.safeParse(entry).success).toBe(true);
  });

  it.each(['30000', '-1.00', '1.5', 'x'])('rechaza el precio %p', (unitPrice) => {
    expect(contractAdditionalVatSnapshotSchema.safeParse({ ...entry, unitPrice }).success).toBe(
      false,
    );
  });

  it('rechaza un nombre vacío', () => {
    expect(contractAdditionalVatSnapshotSchema.safeParse({ ...entry, name: '' }).success).toBe(
      false,
    );
  });
});
