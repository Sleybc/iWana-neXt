import type { PurchaseRequestLineAwardInput as ContractAwardInput } from '@iwana/shared';
import { mapContractAwardToApiInput, mapContractAwardsToApiDto } from './purchase-award-submit';

describe('purchase-award-submit', () => {
  it('mapea cantidades string a número conservando cotización y notas', () => {
    const draft: ContractAwardInput = {
      purchaseRequestLineId: 'line-1',
      supplierQuoteId: 'quote-1',
      awardedPartyRefId: 'party-1',
      awardedQuantity: '2.00',
      awardNotes: 'Urgente',
    };

    expect(mapContractAwardToApiInput(draft)).toEqual({
      purchaseRequestLineId: 'line-1',
      supplierQuoteId: 'quote-1',
      awardedPartyRefId: 'party-1',
      awardedQuantity: 2,
      awardNotes: 'Urgente',
    });
  });

  it('propaga el costo aportado de la escotilla sin cotización vinculada', () => {
    const draft: ContractAwardInput = {
      purchaseRequestLineId: 'line-2',
      awardedPartyRefId: 'party-9',
      awardedQuantity: '1.00',
      unitCost: '250000.00',
    };

    const mapped = mapContractAwardToApiInput(draft);
    expect(mapped.unitCost).toBe(250000);
    expect(mapped).not.toHaveProperty('supplierQuoteId');
  });

  it('una cantidad no numérica cae a cero para que el servidor la rechace', () => {
    const mapped = mapContractAwardToApiInput({
      purchaseRequestLineId: 'line-3',
      awardedPartyRefId: 'party-1',
      awardedQuantity: 'no-numérica',
    });

    expect(mapped.awardedQuantity).toBe(0);
  });

  it('compone el DTO en lote con el arreglo de drafts', () => {
    const dto = mapContractAwardsToApiDto([
      {
        purchaseRequestLineId: 'line-1',
        supplierQuoteId: 'quote-1',
        awardedPartyRefId: 'party-1',
        awardedQuantity: '1.00',
      },
      {
        purchaseRequestLineId: 'line-2',
        supplierQuoteId: 'quote-2',
        awardedPartyRefId: 'party-2',
        awardedQuantity: '3.50',
      },
    ]);

    expect(dto.awards).toHaveLength(2);
    expect(dto.awards[1]?.awardedQuantity).toBe(3.5);
  });
});
