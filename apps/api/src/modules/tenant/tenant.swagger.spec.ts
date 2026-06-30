jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {
    getBootstrapTenantAdminCredentials(): Promise<unknown> {
      return Promise.resolve(null);
    }

    regenerateTenantAdminCredentials(): Promise<unknown> {
      return Promise.resolve(null);
    }
  },
}));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { DashboardSummaryService } from './dashboard-summary.service';
import { TenantController } from './tenant.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantService } from './tenant.service';

function getResponseSchema(
  operation: Record<string, unknown> | undefined,
  statusCode: string,
): Record<string, unknown> | undefined {
  const responses = operation?.responses as Record<string, unknown> | undefined;
  const response = responses?.[statusCode] as Record<string, unknown> | undefined;
  const content = response?.content as Record<string, unknown> | undefined;
  const jsonBody = content?.['application/json'] as Record<string, unknown> | undefined;

  return jsonBody?.schema as Record<string, unknown> | undefined;
}

function getRequestSchema(
  operation: Record<string, unknown> | undefined,
  mimeType: string,
): Record<string, unknown> | undefined {
  const requestBody = operation?.requestBody as Record<string, unknown> | undefined;
  const content = requestBody?.content as Record<string, unknown> | undefined;
  const typedBody = content?.[mimeType] as Record<string, unknown> | undefined;

  return typedBody?.schema as Record<string, unknown> | undefined;
}

describe('TenantController Swagger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: {} },
        { provide: TenantProvisioningService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: DashboardSummaryService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documenta ejemplos de branding público, patch híbrido y upload multipart', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Swagger Tenant Test').setVersion('1.0').build(),
    );

    const publicBranding = document.paths['/tenants/public-branding']?.get;
    const selfBrandingPatch = document.paths['/tenants/me/branding']?.patch;
    const selfBrandingUpload = document.paths['/tenants/me/branding/assets']?.post;
    const platformBrandingPatch = document.paths['/tenants/{id}/branding']?.patch;
    const platformBrandingUpload = document.paths['/tenants/{id}/branding/assets']?.post;

    expect(publicBranding?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'slug',
          schema: expect.objectContaining({
            example: 'isp-demo',
          }),
        }),
      ]),
    );
    expect(getResponseSchema(publicBranding as unknown as Record<string, unknown>, '200')).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'ISP Demo',
            productName: 'ISP Demo',
            surfaceName: 'Portal empresarial',
            metadataTitle: 'ISP Demo — Portal empresarial',
            faviconLightUrl: 'https://cdn.demo.co/branding/favicon-light.svg',
          }),
        }),
      }),
    );

    expect(
      getRequestSchema(selfBrandingPatch as unknown as Record<string, unknown>, 'application/json'),
    ).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          logoLightUrl: 'https://cdn.demo.co/branding/logo-light.svg',
          brandingProductName: 'ISP Demo',
          brandingSurfaceName: 'Portal empresarial',
          faviconLightAssetId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      }),
    );
    expect(
      getResponseSchema(selfBrandingPatch as unknown as Record<string, unknown>, '200'),
    ).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          data: expect.objectContaining({
            slug: 'isp-demo',
            showTenantName: true,
          }),
        }),
      }),
    );

    expect(
      getRequestSchema(
        selfBrandingUpload as unknown as Record<string, unknown>,
        'multipart/form-data',
      )?.example,
    ).toEqual(
      expect.objectContaining({
        usage: 'seal',
        themeVariant: 'light',
      }),
    );
    expect(
      getResponseSchema(selfBrandingUpload as unknown as Record<string, unknown>, '201'),
    ).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          data: expect.objectContaining({
            usage: 'seal',
            publicUrl: 'https://cdn.demo.co/branding/seal-light.svg',
          }),
        }),
      }),
    );

    expect(
      getRequestSchema(
        platformBrandingPatch as unknown as Record<string, unknown>,
        'application/json',
      ),
    ).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          logoLightUrl: 'https://cdn.demo.co/branding/logo-light.svg',
        }),
      }),
    );
    expect(
      getResponseSchema(platformBrandingUpload as unknown as Record<string, unknown>, '201'),
    ).toEqual(
      expect.objectContaining({
        example: expect.objectContaining({
          data: expect.objectContaining({
            id: '550e8400-e29b-41d4-a716-446655440001',
            themeVariant: 'light',
          }),
        }),
      }),
    );
  });
});
