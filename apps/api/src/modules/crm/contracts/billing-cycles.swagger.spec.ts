import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { BillingCyclesController } from './billing-cycles.controller';
import { ContractsService } from './contracts.service';

describe('BillingCyclesController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingCyclesController],
      providers: [
        { provide: ContractsService, useValue: {} },
        { provide: EffectivePermissionsService, useValue: {} },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
        { provide: RolesGuard, useValue: { canActivate: () => true } },
        { provide: PermissionsGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta nextCutoffDate como fecha requerida del catálogo', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Swagger CRM Billing Cycles Test')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'access-token')
        .build(),
    );
    const operation = document.paths['/crm/billing-cycles']?.get;
    const response = operation?.responses?.['200'] as
      | { content?: Record<string, { schema?: unknown }> }
      | undefined;
    const responseSchema = response?.content?.['application/json']?.schema;

    expect(responseSchema).toMatchObject({
      type: 'array',
      items: {
        type: 'object',
        required: ['cycleDay', 'cutoffDay', 'active', 'nextCutoffDate'],
        properties: {
          nextCutoffDate: { type: 'string', format: 'date' },
        },
      },
    });
  });
});
