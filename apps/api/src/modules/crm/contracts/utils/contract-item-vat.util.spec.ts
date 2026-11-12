// Spec MOD14 2026-11-12 R2: el contrato congela el IVA de la instalación y de cada adicional.
import { CatalogItemType, VatTreatment } from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import type {
  CommercialCatalogReadPort,
  CommercialItemVatReference,
} from '../../../commercial/ports/commercial-catalog-read.port';
import { freezeAdditionalsVat, freezeInstallationVat } from './contract-item-vat.util';

const scope = { tenantId: 'ten-1', schemaName: 'tenant_test' };
const manager = {} as EntityManager;
const NOW = new Date('2026-11-12T15:00:00.000Z');

function ref(overrides: Partial<CommercialItemVatReference>): CommercialItemVatReference {
  return {
    itemId: 'x',
    itemType: CatalogItemType.PRODUCT,
    vatTreatment: null,
    vatLegalBasis: null,
    installationVatTreatment: null,
    installationVatLegalBasis: null,
    ...overrides,
  };
}

function catalogWith(rows: CommercialItemVatReference[]) {
  const getItemVatTreatments = jest.fn(async (_t: string, _s: string, ids: string[]) =>
    rows.filter((row) => ids.includes(row.itemId)),
  );
  return {
    port: { getItemVatTreatments } as unknown as CommercialCatalogReadPort,
    getItemVatTreatments,
  };
}

describe('freezeInstallationVat', () => {
  it('congela el tratamiento propio de la instalación del plan, con el manager del llamante', async () => {
    const { port, getItemVatTreatments } = catalogWith([
      ref({
        itemId: 'plan-1',
        itemType: CatalogItemType.PLAN,
        installationVatTreatment: VatTreatment.EXCLUDED,
        installationVatLegalBasis: 'ET_476_7',
      }),
    ]);

    await expect(freezeInstallationVat(port, scope, manager, 'plan-1', NOW)).resolves.toEqual({
      treatment: 'EXCLUDED',
      legalBasis: 'ET_476_7',
      ratePercent: 0,
      source: 'CATALOG',
      frozenAt: '2026-11-12T15:00:00.000Z',
    });
    expect(getItemVatTreatments).toHaveBeenCalledWith('ten-1', 'tenant_test', ['plan-1'], {
      manager,
    });
  });

  it('D2: plan heredado o que no es plan congela STANDARD 19 % como DEFAULT', async () => {
    const { port } = catalogWith([ref({ itemId: 'prod-1' })]);

    for (const planId of ['legacy-plan', 'prod-1']) {
      await expect(freezeInstallationVat(port, scope, manager, planId, NOW)).resolves.toEqual({
        treatment: 'STANDARD',
        legalBasis: 'ET_468',
        ratePercent: 19,
        source: 'DEFAULT',
        frozenAt: '2026-11-12T15:00:00.000Z',
      });
    }
  });
});

describe('freezeAdditionalsVat', () => {
  const rows = [
    ref({
      itemId: 'prod-1',
      vatTreatment: VatTreatment.STANDARD,
      vatLegalBasis: 'ET_468',
    }),
    ref({
      itemId: 'svc-1',
      itemType: CatalogItemType.SERVICE,
      vatTreatment: VatTreatment.EXEMPT,
      vatLegalBasis: 'ET_476_7',
    }),
  ];

  it('congela cada adicional con el IVA de su ítem y sin repetir identificadores', async () => {
    const { port } = catalogWith(rows);

    const result = await freezeAdditionalsVat(
      port,
      scope,
      manager,
      { productIds: ['prod-1', 'prod-1', 'gone'], serviceIds: ['svc-1'] },
      [],
      NOW,
    );

    expect(result).toEqual([
      {
        itemId: 'prod-1',
        itemType: 'PRODUCT',
        treatment: 'STANDARD',
        legalBasis: 'ET_468',
        ratePercent: 19,
        source: 'CATALOG',
        frozenAt: NOW.toISOString(),
        unitPrice: null,
      },
      {
        itemId: 'gone',
        itemType: 'PRODUCT',
        treatment: 'STANDARD',
        legalBasis: 'ET_468',
        ratePercent: 19,
        source: 'DEFAULT',
        frozenAt: NOW.toISOString(),
        unitPrice: null,
      },
      {
        itemId: 'svc-1',
        itemType: 'SERVICE',
        treatment: 'EXEMPT',
        legalBasis: 'ET_476_7',
        ratePercent: 0,
        source: 'CATALOG',
        frozenAt: NOW.toISOString(),
        unitPrice: null,
      },
    ]);
  });

  it('un servicio listado como producto no toma el IVA del servicio (DEFAULT)', async () => {
    const { port } = catalogWith(rows);

    const [entry] = await freezeAdditionalsVat(
      port,
      scope,
      manager,
      { productIds: ['svc-1'], serviceIds: [] },
      [],
      NOW,
    );

    expect(entry).toMatchObject({ itemType: 'PRODUCT', treatment: 'STANDARD', source: 'DEFAULT' });
  });

  it('conserva lo ya congelado, congela lo nuevo y retira lo quitado', async () => {
    const { port, getItemVatTreatments } = catalogWith(rows);
    const previous = [
      {
        itemId: 'prod-1',
        itemType: 'PRODUCT' as const,
        treatment: VatTreatment.EXCLUDED,
        legalBasis: 'ET_476_7',
        ratePercent: 0 as const,
        source: 'CATALOG' as const,
        frozenAt: '2026-01-01T00:00:00.000Z',
      },
      {
        itemId: 'old',
        itemType: 'SERVICE' as const,
        treatment: VatTreatment.STANDARD,
        legalBasis: 'ET_468',
        ratePercent: 19 as const,
        source: 'CATALOG' as const,
        frozenAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const result = await freezeAdditionalsVat(
      port,
      scope,
      manager,
      { productIds: ['prod-1'], serviceIds: ['svc-1'] },
      previous,
      NOW,
    );

    expect(result.map((entry) => [entry.itemId, entry.treatment, entry.frozenAt])).toEqual([
      ['prod-1', 'EXCLUDED', '2026-01-01T00:00:00.000Z'],
      ['svc-1', 'EXEMPT', NOW.toISOString()],
    ]);
    expect(getItemVatTreatments).toHaveBeenCalledWith(
      'ten-1',
      'tenant_test',
      ['svc-1'],
      { manager },
      'RESIDENTIAL',
    );
  });

  it('bloque C: congela nombre y precio vigente del segmento; lo ya congelado conserva su precio', async () => {
    const { port, getItemVatTreatments } = catalogWith([
      ref({ itemId: 'prod-1', name: 'Router', currentBasePrice: '120000' }),
      ref({
        itemId: 'svc-1',
        itemType: CatalogItemType.SERVICE,
        name: 'IP fija',
        currentBasePrice: null,
      }),
    ]);
    const previous = [
      {
        itemId: 'svc-old',
        itemType: 'SERVICE' as const,
        treatment: VatTreatment.STANDARD,
        legalBasis: 'ET_468',
        ratePercent: 19 as const,
        source: 'CATALOG' as const,
        frozenAt: '2026-01-01T00:00:00.000Z',
        name: 'Soporte',
        unitPrice: '10000.00',
      },
    ];

    const result = await freezeAdditionalsVat(
      port,
      scope,
      manager,
      { productIds: ['prod-1'], serviceIds: ['svc-1', 'svc-old'] },
      previous,
      NOW,
      'BUSINESS' as never,
    );

    expect(result).toEqual([
      expect.objectContaining({ itemId: 'prod-1', name: 'Router', unitPrice: '120000.00' }),
      expect.objectContaining({ itemId: 'svc-1', name: 'IP fija', unitPrice: null }),
      previous[0],
    ]);
    expect(getItemVatTreatments).toHaveBeenCalledWith(
      'ten-1',
      'tenant_test',
      ['prod-1', 'svc-1'],
      { manager },
      'BUSINESS',
    );
  });

  it('bloque C: un precio inválido del catálogo no se congela', async () => {
    const { port } = catalogWith([ref({ itemId: 'prod-1', currentBasePrice: '-5' })]);

    const [entry] = await freezeAdditionalsVat(
      port,
      scope,
      manager,
      { productIds: ['prod-1'], serviceIds: [] },
      [],
      NOW,
    );

    expect(entry).toMatchObject({ unitPrice: null });
    expect(entry).not.toHaveProperty('name');
  });

  it('sin adicionales no consulta el catálogo', async () => {
    const { port, getItemVatTreatments } = catalogWith(rows);

    await expect(
      freezeAdditionalsVat(port, scope, manager, { productIds: [], serviceIds: [] }),
    ).resolves.toEqual([]);
    expect(getItemVatTreatments).not.toHaveBeenCalled();
  });
});
