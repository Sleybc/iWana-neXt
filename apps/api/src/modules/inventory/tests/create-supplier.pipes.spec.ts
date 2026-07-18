import { ValidationPipe } from '@nestjs/common';
import { DocumentTypeParty, PartyContactType, PartyType } from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateSupplierDto, CreateSupplierSchema } from '../dto';

describe('CreateSupplier ValidationPipe + Zod pipe', () => {
  const globalPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const zodPipe = new ZodValidationPipe(CreateSupplierSchema);

  async function runPipes(body: unknown) {
    const afterGlobal = await globalPipe.transform(body, {
      type: 'body',
      metatype: CreateSupplierDto,
      data: '',
    });
    return zodPipe.transform(afterGlobal);
  }

  it('preserves nested contacts after global ValidationPipe', async () => {
    const body = {
      partyType: PartyType.ORGANIZATION,
      documentType: DocumentTypeParty.NIT,
      documentNumber: '900123456',
      displayName: 'Proveedor Alfa',
      contacts: [
        { type: PartyContactType.EMAIL, value: 'compras@alfa.test', isPrimary: true },
        { type: PartyContactType.PHONE, value: '3001112233' },
      ],
      paymentTermsDays: 8,
      currency: 'COP',
    };

    await expect(runPipes(body)).resolves.toMatchObject({
      displayName: 'Proveedor Alfa',
      contacts: [
        expect.objectContaining({
          type: PartyContactType.EMAIL,
          value: 'compras@alfa.test',
          isPrimary: true,
        }),
        expect.objectContaining({
          type: PartyContactType.PHONE,
          value: '3001112233',
        }),
      ],
      paymentTermsDays: 8,
      currency: 'COP',
    });
  });
});
