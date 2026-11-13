import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { AccessPermissionKey, BILLING_WITHHOLDING_TAX_CODES, UserRole } from '@iwana/shared';
import { PERMISSIONS_KEY } from '../access-control/decorators/permissions.decorator';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { BillingPaymentsController } from './payments/billing-payments.controller';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingWithholdingsController } from './payments/billing-withholdings.controller';
import { BillingWithholdingOptionsService } from './payments/billing-withholding-options.service';

type Schema = Record<string, unknown>;

function jsonSchema(operation: unknown, kind: 'request' | string): Schema | undefined {
  const op = operation as Schema | undefined;
  const holder =
    kind === 'request'
      ? (op?.['requestBody'] as Schema | undefined)
      : ((op?.['responses'] as Schema | undefined)?.[kind] as Schema | undefined);
  const content = holder?.['content'] as Schema | undefined;
  return (content?.['application/json'] as Schema | undefined)?.['schema'] as Schema | undefined;
}

function props(schema: Schema | undefined): Schema {
  return (schema?.['properties'] as Schema | undefined) ?? {};
}

describe('Retenciones en el pago — OpenAPI (spec MOD14 2026-11-13 R6, R7)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const options = { optionsForSubscriber: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingPaymentsController, BillingWithholdingsController],
      providers: [
        { provide: BillingPaymentsService, useValue: {} },
        { provide: BillingWithholdingOptionsService, useValue: options },
        { provide: AuditService, useValue: {} },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('el registro de pago declara las líneas de retención con sus campos obligatorios', () => {
    const request = jsonSchema(document.paths['/billing/payments']?.post, 'request');
    const withholdings = props(request)['withholdings'] as Schema;
    expect(withholdings).toMatchObject({ type: 'array', maxItems: 10 });
    const item = withholdings['items'] as Schema;
    expect(item['required']).toEqual(['taxCode', 'base', 'rate', 'amount', 'certificateNumber']);
    expect(props(item)['taxCode']).toEqual({
      type: 'string',
      enum: [...BILLING_WITHHOLDING_TAX_CODES],
    });
    expect(props(item)['certificateNumber']).toMatchObject({ minLength: 1, maxLength: 60 });
    expect(props(item)['documentId']).toMatchObject({ type: 'string', format: 'uuid' });
  });

  it('la respuesta del pago expone las retenciones y su total', () => {
    const response = jsonSchema(document.paths['/billing/payments/{id}']?.get, '200');
    const data = props(response)['data'] as Schema;
    expect(props(data)['withholdingAmount']).toEqual({ type: 'string' });
    const items = (props(data)['withholdings'] as Schema)['items'] as Schema;
    expect(props(items)).toEqual(
      expect.objectContaining({
        rate: expect.objectContaining({ type: 'string' }),
        certificateNumber: { type: 'string', nullable: true },
        voidedAt: expect.objectContaining({ nullable: true }),
      }),
    );
  });

  it('publica las opciones de retención con el permiso de registrar pagos', async () => {
    const operation =
      document.paths['/billing/subscribers/{subscriberId}/withholding-options']?.get;
    const data = props(jsonSchema(operation, '200'))['data'] as Schema;
    expect(data['required']).toEqual(['subscriberId', 'eligible', 'eligibility', 'options']);
    // Decisión D3 (spec MOD14 2026-11-13): solo O-23; PERSONA_JURIDICA se retiró del contrato.
    expect(props(data)['eligibility']).toEqual(
      expect.objectContaining({ enum: ['AGENTE_RETENEDOR'], nullable: true }),
    );
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        BillingWithholdingsController.prototype.withholdingOptions,
      ),
    ).toEqual([AccessPermissionKey.BILLING_PAYMENTS_REGISTER]);
    expect(
      Reflect.getMetadata(ROLES_KEY, BillingWithholdingsController.prototype.withholdingOptions),
    ).toEqual(expect.arrayContaining([UserRole.ADMIN, UserRole.ACCOUNTANT]));

    options.optionsForSubscriber.mockResolvedValueOnce({ eligible: false });
    const controller = app.get(BillingWithholdingsController);
    await expect(
      controller.withholdingOptions('00000000-0000-4000-8000-000000000010'),
    ).resolves.toEqual({ data: { eligible: false } });
  });
});
