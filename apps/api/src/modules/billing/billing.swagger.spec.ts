import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AccessPermissionKey } from '@iwana/shared';
import { PERMISSIONS_KEY } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BillingPolicyController } from './policy/billing-policy.controller';
import { BillingPolicyService } from './policy/billing-policy.service';

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

describe('BillingPolicyController OpenAPI y permisos', () => {
  let app: INestApplication;
  const billingPolicyService = {
    getPolicy: jest.fn().mockResolvedValue({}),
    updatePolicy: jest.fn().mockResolvedValue({}),
    preview: jest.fn().mockResolvedValue({ cycles: [] }),
    getContractPolicy: jest
      .fn()
      .mockResolvedValue({ data: { contractId: '00000000-0000-4000-8000-000000000010' } }),
    updateContractPolicy: jest.fn().mockResolvedValue({ data: {} }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BillingPolicyController],
      providers: [{ provide: BillingPolicyService, useValue: billingPolicyService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            sub: '00000000-0000-4000-8000-000000000002',
            type: 'tenant',
            role: 'ADMIN',
          };
          return true;
        },
      })
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

  it('publica operaciones de política y el preview POST con respuestas 422 y 404', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Billing API').setVersion('1.0').build(),
    );
    const getPolicy = document.paths['/billing/policy']?.get;
    const putPolicy = document.paths['/billing/policy']?.put;
    const preview = document.paths['/billing/policy/preview']?.post;
    const getOverride = document.paths['/billing/contracts/{contractId}/policy']?.get;
    const putOverride = document.paths['/billing/contracts/{contractId}/policy']?.put;
    const policyResponse = getResponseSchema(
      getPolicy as unknown as Record<string, unknown>,
      '200',
    );
    const policyProperties = (
      (policyResponse?.['properties'] as Record<string, unknown> | undefined)?.['data'] as
        | Record<string, unknown>
        | undefined
    )?.['properties'] as Record<string, unknown> | undefined;
    const overrideResponse = getResponseSchema(
      getOverride as unknown as Record<string, unknown>,
      '200',
    );
    const overrideData = (
      (overrideResponse?.['properties'] as Record<string, unknown> | undefined)?.['data'] as
        | Record<string, unknown>
        | undefined
    )?.['properties'] as Record<string, unknown> | undefined;

    expect(getPolicy).toBeDefined();
    expect(policyProperties).toEqual(
      expect.objectContaining({
        tenantId: expect.objectContaining({ type: 'string', format: 'uuid' }),
        updatedBy: expect.objectContaining({ type: 'string', nullable: true }),
        updatedAt: expect.objectContaining({ type: 'string', format: 'date-time' }),
      }),
    );
    expect(putPolicy?.requestBody).toBeDefined();
    expect(putPolicy?.responses).toHaveProperty('422');
    expect(document.paths['/billing/policy/preview']?.get).toBeUndefined();
    expect(preview?.requestBody).toBeDefined();
    expect(preview?.responses).toHaveProperty('422');
    expect(preview?.responses).toHaveProperty('404');
    expect(getResponseSchema(preview as unknown as Record<string, unknown>, '200')).toBeDefined();
    expect(getOverride).toBeDefined();
    expect(overrideData).toEqual(
      expect.objectContaining({
        periodTiming: expect.objectContaining({ nullable: true }),
        updatedAt: expect.objectContaining({ type: 'string', nullable: true }),
      }),
    );
    // BR-9.3 el contrato declara updatedBy/updatedAt opcionales: el OpenAPI no los exige.
    const policyDataSchema = (
      policyResponse?.['properties'] as Record<string, unknown> | undefined
    )?.['data'] as { required?: string[] } | undefined;
    expect(policyDataSchema?.required).not.toContain('updatedBy');
    expect(policyDataSchema?.required).not.toContain('updatedAt');
    const overrideDataSchema = (
      overrideResponse?.['properties'] as Record<string, unknown> | undefined
    )?.['data'] as { required?: string[] } | undefined;
    expect(overrideDataSchema?.required).not.toContain('updatedBy');
    expect(overrideDataSchema?.required).not.toContain('updatedAt');
    expect(putOverride?.requestBody).toBeDefined();
    expect(putOverride?.responses).toHaveProperty('404');
  });

  it('asigna lectura a la consulta y BILLING_POLICY_MANAGE a las dos escrituras', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, BillingPolicyController.prototype.getPolicy),
    ).toEqual([AccessPermissionKey.BILLING_INVOICES_READ]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, BillingPolicyController.prototype.updatePolicy),
    ).toEqual([AccessPermissionKey.BILLING_POLICY_MANAGE]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, BillingPolicyController.prototype.updateContractPolicy),
    ).toEqual([AccessPermissionKey.BILLING_POLICY_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BillingPolicyController.prototype.preview)).toEqual(
      [AccessPermissionKey.BILLING_INVOICES_READ],
    );
  });

  it('acepta POST de preview con política en el cuerpo y sin clave de idempotencia', async () => {
    const expected = {
      cycles: [
        {
          cycleDay: 1,
          cutoffDay: 15,
          items: [
            {
              periodStart: '2026-12-01',
              periodEnd: '2026-12-31',
              generationDate: '2026-12-01',
              dueDate: '2026-12-14',
              cutoffDate: '2026-12-15',
            },
            {
              periodStart: '2027-01-01',
              periodEnd: '2027-01-31',
              generationDate: '2027-01-01',
              dueDate: '2027-01-14',
              cutoffDate: '2027-01-15',
            },
            {
              periodStart: '2027-02-01',
              periodEnd: '2027-02-28',
              generationDate: '2027-02-01',
              dueDate: '2027-02-14',
              cutoffDate: '2027-02-15',
            },
          ],
        },
      ],
    };
    billingPolicyService.preview.mockResolvedValueOnce(expected);

    const response = await request(app.getHttpServer())
      .post('/billing/policy/preview')
      .send({ policy: { periodTiming: 'ANTICIPADO' } })
      .expect(200);

    expect(response.body).toEqual({ data: expected });
    expect(billingPolicyService.preview).toHaveBeenCalledWith({
      policy: { periodTiming: 'ANTICIPADO' },
    });
  });
});
