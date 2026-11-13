import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import {
  BILLING_INSTALLATION_VALUE_SOURCES,
  BillingDocumentInstallationBreakdownSchema,
  BillingInstallationBreakdownItemSchema,
} from '@iwana/shared';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { BillingDocumentsController } from '../documents/billing-documents.controller';
import { BillingDocumentsService } from '../documents/billing-documents.service';
import { BillingFirstChargeService } from '../generation/billing-first-charge.service';
import { BillingGenerationService } from '../generation/billing-generation.service';

type Schema = {
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: string[];
  nullable?: boolean;
};

describe('OpenAPI del detalle de documento: valor real de la instalación (spec MOD14 2026-11-13)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingDocumentsController],
      providers: [
        { provide: BillingDocumentsService, useValue: {} },
        { provide: BillingGenerationService, useValue: {} },
        { provide: BillingFirstChargeService, useValue: {} },
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

  it('publica installationBreakdown con los mismos campos que el contrato compartido', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing').setVersion('1.0').build(),
    );
    const response = document.paths['/billing/documents/{id}']?.get?.responses?.['200'] as
      | { content?: Record<string, { schema?: Schema }> }
      | undefined;
    const data = response?.content?.['application/json']?.schema?.properties?.['data'];
    const breakdown = data?.properties?.['installationBreakdown'];
    expect(breakdown?.nullable).toBe(true);
    expect([...(breakdown?.required ?? [])].sort()).toEqual(
      BillingDocumentInstallationBreakdownSchema.keyof().options.slice().sort(),
    );
    const item = breakdown?.properties?.['items']?.items;
    expect([...(item?.required ?? [])].sort()).toEqual(
      BillingInstallationBreakdownItemSchema.keyof().options.slice().sort(),
    );
    expect(item?.properties?.['valueSource']?.enum).toEqual([
      ...BILLING_INSTALLATION_VALUE_SOURCES,
    ]);
  });
});
