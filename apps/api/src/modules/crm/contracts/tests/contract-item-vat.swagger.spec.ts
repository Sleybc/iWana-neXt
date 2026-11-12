// Spec MOD14 2026-11-12 R2: OpenAPI del IVA congelado de la instalación y de los adicionales.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN } from '@iwana/shared';
import { ContractResponseDto } from '../dto/contract-response.dto';

describe('ContractResponseDto Swagger — IVA por ítem', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta installationVatSnapshot y additionalVatSnapshot', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Contrato').setVersion('1.0').build(),
      { extraModels: [ContractResponseDto] },
    );
    const schemas = document.components?.schemas ?? {};
    const contract = schemas['ContractResponseDto'] as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(JSON.stringify(contract.properties['installationVatSnapshot'])).toContain(
      'ContractItemVatSnapshotResponseDto',
    );
    expect(contract.properties['additionalVatSnapshot']).toMatchObject({ type: 'array' });
    expect(schemas['ContractItemVatSnapshotResponseDto']).toMatchObject({
      required: expect.arrayContaining([
        'treatment',
        'legalBasis',
        'ratePercent',
        'source',
        'frozenAt',
      ]),
      properties: {
        treatment: { enum: ['EXEMPT', 'EXCLUDED', 'STANDARD'] },
        source: { enum: ['CATALOG', 'DEFAULT', 'BACKFILL'] },
      },
    });
    const additional = schemas['ContractAdditionalVatSnapshotResponseDto'] as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(additional).toMatchObject({
      required: expect.arrayContaining(['itemId', 'itemType', 'treatment']),
      properties: {
        itemType: { enum: ['PRODUCT', 'SERVICE'] },
        name: { type: 'string', maxLength: 200 },
        unitPrice: {
          type: 'string',
          nullable: true,
          pattern: CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN.source,
        },
      },
    });
    // Opcionales como en contractAdditionalVatSnapshotSchema: un ítem legado no los trae.
    expect(additional.required).not.toContain('name');
    expect(additional.required).not.toContain('unitPrice');
  });
});
