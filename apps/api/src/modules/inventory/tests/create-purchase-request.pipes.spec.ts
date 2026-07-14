import { ValidationPipe } from '@nestjs/common';
import {
  PurchaseRequestLineSourceKind,
  PurchaseRequestPriority,
  PurchaseRequestType,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreatePurchaseRequestDto, CreatePurchaseRequestSchema } from '../dto';

describe('CreatePurchaseRequest ValidationPipe + Zod pipe', () => {
  const globalPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const zodPipe = new ZodValidationPipe(CreatePurchaseRequestSchema);

  async function runPipes(body: unknown) {
    const afterGlobal = await globalPipe.transform(body, {
      type: 'body',
      metatype: CreatePurchaseRequestDto,
      data: '',
    });
    return zodPipe.transform(afterGlobal);
  }

  it('preserves nested purchase request lines after global ValidationPipe', async () => {
    const body = {
      title: 'Compra de prueba',
      requestType: PurchaseRequestType.REPLENISHMENT,
      priority: PurchaseRequestPriority.NORMAL,
      requestingArea: 'Operaciones',
      justification: 'Necesitamos reponer material de campo esta semana.',
      neededByDate: null,
      lines: [
        {
          sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
          inventoryItemId: '11111111-1111-4111-8111-111111111111',
          freeTextDescription: null,
          quantityRequested: 1,
          unitOfMeasure: 'caja',
          suggestedPartyRefId: null,
          notes: null,
        },
      ],
    };

    await expect(runPipes(body)).resolves.toMatchObject({
      title: 'Compra de prueba',
      lines: [
        expect.objectContaining({
          sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
          inventoryItemId: '11111111-1111-4111-8111-111111111111',
          quantityRequested: 1,
          unitOfMeasure: 'caja',
        }),
      ],
    });
  });

  it('normalizes empty neededByDate to null', async () => {
    const body = {
      title: 'Compra de prueba',
      requestType: PurchaseRequestType.REPLENISHMENT,
      requestingArea: 'Operaciones',
      justification: 'Necesitamos reponer material de campo esta semana.',
      neededByDate: '',
      lines: [
        {
          sourceKind: PurchaseRequestLineSourceKind.INVENTORY_ITEM,
          inventoryItemId: '11111111-1111-4111-8111-111111111111',
          quantityRequested: 1,
          unitOfMeasure: 'unidad',
        },
      ],
    };

    await expect(runPipes(body)).resolves.toMatchObject({
      neededByDate: null,
      lines: [expect.objectContaining({ quantityRequested: 1 })],
    });
  });
});
