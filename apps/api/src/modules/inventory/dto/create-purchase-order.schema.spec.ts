import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreatePurchaseOrderSchema } from '../dto';

/**
 * Guarda anti-duplicados del payload de órdenes (MOD12 Compras, adenda del
 * informe de Fase 30 §12.5): una misma línea de solicitud no puede viajar dos
 * veces en la MISMA orden — la segunda iteración del servidor re-consultaría
 * el estado intermedio que la primera guardó y el tope ORDER_EXCEEDS_AWARD
 * dependería del orden del payload. El reparto entre proveedores es entre
 * órdenes distintas (modo batch), nunca dos líneas de la misma orden.
 */
describe('CreatePurchaseOrderSchema · guarda de líneas duplicadas', () => {
  const zodPipe = new ZodValidationPipe(CreatePurchaseOrderSchema);

  const line = (purchaseRequestLineId: string) => ({
    purchaseRequestLineId,
    itemId: `item-${purchaseRequestLineId}`,
    quantity: 1,
    unitCost: 100,
  });

  function parseOrCapture(body: unknown): unknown {
    try {
      zodPipe.transform(body);
      return null;
    } catch (error) {
      return error;
    }
  }

  function expectRejectedWithDuplicates(body: unknown): void {
    const caught = parseOrCapture(body);
    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      details?: { fieldErrors?: Record<string, string[]> };
    };
    expect(JSON.stringify(response.details?.fieldErrors ?? {})).toContain('líneas duplicadas');
  }

  it('rechaza dos líneas con la misma purchaseRequestLineId en modo legado', () => {
    expectRejectedWithDuplicates({
      purchaseRequestId: 'pr-001',
      partyRefId: 'party-a',
      lines: [line('line-a'), line('line-a')],
    });
  });

  it('rechaza el duplicado dentro de una orden del modo batch', () => {
    expectRejectedWithDuplicates({
      purchaseRequestId: 'pr-001',
      orders: [
        {
          partyRefId: 'party-a',
          lines: [line('line-a'), line('line-b'), line('line-a')],
        },
      ],
    });
  });

  it('acepta líneas distintas, líneas libres y la misma línea en órdenes distintas', () => {
    const caught = parseOrCapture({
      purchaseRequestId: 'pr-001',
      orders: [
        {
          partyRefId: 'party-a',
          lines: [line('line-a'), { itemId: 'item-libre', quantity: 2, unitCost: 50 }],
        },
        {
          partyRefId: 'party-b',
          lines: [line('line-a')],
        },
      ],
    });

    expect(caught).toBeNull();
  });
});
