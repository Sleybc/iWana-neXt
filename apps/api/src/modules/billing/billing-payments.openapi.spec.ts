import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { BillingPaymentsController } from './payments/billing-payments.controller';
import { BillingPaymentsService } from './payments/billing-payments.service';

function getResponseSchema(
  operation: Record<string, unknown> | undefined,
  statusCode: string,
): Record<string, unknown> | undefined {
  const responses = operation?.['responses'] as Record<string, unknown> | undefined;
  const response = responses?.[statusCode] as Record<string, unknown> | undefined;
  const content = response?.['content'] as Record<string, unknown> | undefined;
  const json = content?.['application/json'] as Record<string, unknown> | undefined;
  return json?.['schema'] as Record<string, unknown> | undefined;
}

describe('BillingPaymentsController OpenAPI (BR-9.3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingPaymentsController],
      providers: [
        { provide: BillingPaymentsService, useValue: {} },
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('el detalle del pago declara los campos de anulación del contrato compartido', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
    const detail = document.paths['/billing/payments/{id}']?.get;
    const schema = getResponseSchema(detail as unknown as Record<string, unknown>, '200');
    const data = (schema?.['properties'] as Record<string, unknown> | undefined)?.['data'] as
      | Record<string, unknown>
      | undefined;
    const properties = data?.['properties'] as Record<string, unknown> | undefined;
    expect(properties).toEqual(
      expect.objectContaining({
        voidReasonCode: expect.objectContaining({ type: 'string', nullable: true }),
        voidNote: expect.objectContaining({ type: 'string', nullable: true }),
        voidedAt: expect.objectContaining({ type: 'string', nullable: true }),
        voidedBy: expect.objectContaining({ type: 'string', nullable: true }),
      }),
    );
  });

  it('declara desasociar y el recibo PDF con permisos, cuerpos y respuestas (spec 2026-11-13 D6, D8)', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
    const unlink = document.paths['/billing/payments/{id}/allocations/{allocationId}/unlink']
      ?.post as unknown as Record<string, unknown> | undefined;
    expect(unlink).toBeDefined();
    const body = (
      (unlink?.['requestBody'] as Record<string, unknown>)?.['content'] as Record<
        string,
        { schema: Record<string, unknown> }
      >
    )['application/json']?.schema;
    expect(body).toEqual(
      expect.objectContaining({
        required: ['reasonCode'],
        additionalProperties: false,
        properties: {
          reasonCode: {
            type: 'string',
            enum: ['APLICADO_A_DOCUMENTO_EQUIVOCADO', 'VALOR_EQUIVOCADO', 'REASIGNACION'],
          },
        },
      }),
    );
    expect(Object.keys(unlink?.['responses'] as object)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404', '409', '422']),
    );
    const data = (
      getResponseSchema(unlink, '200')?.['properties'] as Record<string, Record<string, unknown>>
    )?.['data'];
    const properties = data?.['properties'] as Record<string, Record<string, unknown>>;
    expect(properties['receiptNumber']).toEqual(
      expect.objectContaining({ type: 'integer', nullable: true }),
    );
    expect(properties['imported']).toEqual(expect.objectContaining({ type: 'boolean' }));
    expect(properties['externalId']).toEqual(
      expect.objectContaining({ type: 'string', nullable: true }),
    );
    const allocation = (properties['allocations']?.['items'] as Record<string, unknown>)?.[
      'properties'
    ] as Record<string, Record<string, unknown>>;
    expect(allocation['reversalReasonCode']).toEqual(
      expect.objectContaining({ nullable: true, enum: expect.arrayContaining(['REASIGNACION']) }),
    );

    const receipt = document.paths['/billing/payments/{id}/receipt/pdf']?.get as unknown as
      | Record<string, unknown>
      | undefined;
    expect(receipt).toBeDefined();
    const responses = receipt?.['responses'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404', '409', '503']),
    );
    expect(Object.keys(responses['200']?.['content'] as object)).toContain('application/pdf');
  });
});
