import { ExecutionContext, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { BILLING_PERIOD_PAYMENT_STATES } from '@iwana/shared';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BillingCyclesController } from '../crm/contracts/billing-cycles.controller';
import { ContractsService } from '../crm/contracts/contracts.service';

describe('BR-4.2 OpenAPI de la agenda de corte', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingCyclesController],
      providers: [
        { provide: ContractsService, useValue: {} },
        {
          provide: EffectivePermissionsService,
          useValue: { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (context: ExecutionContext) => !!context })
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

  it('publica paymentState opcional con el vocabulario de BILLING_PERIOD_PAYMENT_STATES', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Agenda').setVersion('1.0').build(),
    );
    const operation = document.paths['/crm/billing-cycles/cutoff-agenda']?.get;
    const response = operation?.responses?.['200'] as
      | { content?: Record<string, { schema?: Record<string, unknown> }> }
      | undefined;
    const body = response?.content?.['application/json']?.schema as {
      properties: { items: { items: { properties: Record<string, unknown>; required: string[] } } };
    };
    const item = body.properties.items.items;
    expect(item.properties['paymentState']).toEqual({
      type: 'string',
      enum: [...BILLING_PERIOD_PAYMENT_STATES],
    });
    expect(item.required).not.toContain('paymentState');
  });
});
