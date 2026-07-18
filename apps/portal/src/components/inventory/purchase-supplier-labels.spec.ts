import type { PurchaseRequestDetailRecord } from '@/lib/api-client';
import {
  collectPurchaseDetailSupplierIds,
  resolveMissingSupplierLabels,
  seedSupplierLabelsFromDetail,
} from './purchase-supplier-labels';

jest.mock('@/lib/api-client', () => ({
  purchasingApi: {
    getProviderSummary: jest.fn(async (partyRefId: string) => ({
      displayName: `Nombre de ${partyRefId}`,
    })),
  },
}));

describe('purchase-supplier-labels', () => {
  it('recolecta IDs de órdenes, cotizaciones, awards e invitaciones', () => {
    const detail = {
      orders: [{ partyRefId: 'p-order' }],
      quotes: [{ partyRefId: 'p-quote' }],
      awards: [{ awardedPartyRefId: 'p-award' }],
      rfq: {
        invitations: [{ partyRefId: 'p-invite', displayName: 'Invitado SA' }],
      },
    } as unknown as PurchaseRequestDetailRecord;

    expect(collectPurchaseDetailSupplierIds(detail).sort()).toEqual(
      ['p-award', 'p-invite', 'p-order', 'p-quote'].sort(),
    );
    expect(seedSupplierLabelsFromDetail(detail)).toEqual({ 'p-invite': 'Invitado SA' });
  });

  it('resuelve solo IDs faltantes vía getProviderSummary', async () => {
    const resolved = await resolveMissingSupplierLabels(['known', 'missing'], {
      known: 'Ya conocido',
    });

    expect(resolved).toEqual({ missing: 'Nombre de missing' });
    expect(resolved).not.toHaveProperty('known');
  });
});
