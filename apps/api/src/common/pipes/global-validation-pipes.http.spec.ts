import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  ConsentChannel,
  CustomerSegment,
  DocumentType,
  ExecutionOrderResult,
  Feasibility,
  PersonType,
  VatResponsibility,
} from '@iwana/shared';
import { ZodBodyValidationPipe } from '../../modules/crm/pipes/zod-body-validation.pipe';
import {
  CloseExecutionOrderDto,
  CloseExecutionOrderSchema,
} from '../../modules/tasks/dto/execution-orders.dto';
import {
  CreateCoverageCheckDto,
  CreateCoverageCheckSchema,
} from '../../modules/crm/expedientes/dto/create-coverage-check.dto';
import { CreateSubscriberDto } from '../../modules/crm/subscribers/dto/create-subscriber.dto';
import { UpdateSubscriberDto } from '../../modules/crm/subscribers/dto/update-subscriber.dto';
import { CreateSubscriberSchema, UpdateSubscriberSchema } from '@iwana/shared';
import { createAppWithGlobalPipes } from '../testing/create-app-with-global-pipes';

const SAMPLE_UUID = 'ecbdb6de-4e3e-4e50-8c92-4f6ca738a1d7';

@Controller('validation-pipes')
class ValidationPipesTestController {
  @Post('subscriber-create')
  createSubscriber(
    @Body(new ZodBodyValidationPipe(CreateSubscriberSchema)) dto: CreateSubscriberDto,
  ): unknown {
    return { authorizations: dto.authorizations, legalRepresentative: dto.legalRepresentative };
  }

  @Post('subscriber-update')
  updateSubscriber(
    @Body(new ZodBodyValidationPipe(UpdateSubscriberSchema)) dto: UpdateSubscriberDto,
  ): unknown {
    return {
      legalRepresentative: dto.legalRepresentative,
      rutResponsibilities: dto.rutResponsibilities,
    };
  }

  @Post('coverage-check')
  createCoverageCheck(
    @Body(new ZodBodyValidationPipe(CreateCoverageCheckSchema)) dto: CreateCoverageCheckDto,
  ): unknown {
    return { snapshotJson: dto.snapshotJson };
  }

  @Post('execution-order-close')
  closeExecutionOrder(
    @Body(new ZodBodyValidationPipe(CloseExecutionOrderSchema)) dto: CloseExecutionOrderDto,
  ): unknown {
    return { customerAcceptance: dto.customerAcceptance, followUp: dto.followUp };
  }
}

@Module({ controllers: [ValidationPipesTestController] })
class ValidationPipesTestModule {}

describe('global ValidationPipe + CRM Zod boundaries', () => {
  let app: Awaited<ReturnType<typeof createAppWithGlobalPipes>>;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ValidationPipesTestModule] }).compile();
    app = await createAppWithGlobalPipes(moduleRef);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('acepta authorizations como arreglos de objetos en el alta manual', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-create')
      .send({
        personType: PersonType.NATURAL,
        customerSegment: Object.values(CustomerSegment)[0],
        documentType: DocumentType.CC,
        documentNumber: 'DOC-SINTETICO-001',
        firstName: 'Nombre sintético',
        lastName: 'Apellido sintético',
        stratum: 3,
        email: 'test@example.invalid',
        address: 'Dirección sintética',
        authorizationChannel: Object.values(ConsentChannel)[0],
        authorizations: [
          { purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId: SAMPLE_UUID },
        ],
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
      });

    expect(response.status).toBe(201);
    expect(response.body.authorizations).toEqual([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', granted: true, legalTextId: SAMPLE_UUID },
    ]);
  });

  it('exige IVA en el alta sin atribuir el RUT cuando falta la responsabilidad de IVA', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-create')
      .send({
        personType: PersonType.NATURAL,
        customerSegment: Object.values(CustomerSegment)[0],
        documentType: DocumentType.CC,
        documentNumber: 'DOC-SINTETICO-003',
        firstName: 'Nombre sintético',
        lastName: 'Apellido sintético',
        stratum: 3,
        email: 'test@example.invalid',
        address: 'Dirección sintética',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.fieldErrors.vatResponsibility).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
    expect(response.body.details.fieldErrors).not.toHaveProperty('rutResponsibilities');
  });

  it('ubica la responsabilidad del RUT en el alta jurídica con lista vacía', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-create')
      .send({
        personType: PersonType.JURIDICA,
        customerSegment: Object.values(CustomerSegment)[0],
        nit: '900123456',
        nitVerificationDigit: '8',
        businessName: 'Empresa sintética',
        legalRepresentative: {
          fullName: 'Representante sintético',
          documentType: DocumentType.CC,
          documentNumber: 'DOC-REP-SINTETICO-003',
        },
        email: 'empresa@example.invalid',
        address: 'Dirección sintética',
        vatResponsibility: VatResponsibility.NO_RESPONSABLE,
        rutResponsibilities: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.fieldErrors.rutResponsibilities).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
  });

  it('conserva legalRepresentative en el alta jurídica', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-create')
      .send({
        personType: PersonType.JURIDICA,
        customerSegment: Object.values(CustomerSegment)[0],
        nit: '900123456',
        nitVerificationDigit: '8',
        businessName: 'Empresa sintética',
        legalRepresentative: {
          fullName: 'Representante sintético',
          documentType: DocumentType.CC,
          documentNumber: 'DOC-REP-SINTETICO-001',
        },
        email: 'empresa@example.invalid',
        address: 'Dirección sintética',
        vatResponsibility: VatResponsibility.RESPONSABLE,
        rutResponsibilities: ['O-13'],
      });

    expect(response.status).toBe(201);
    expect(response.body.legalRepresentative).toEqual({
      fullName: 'Representante sintético',
      documentType: DocumentType.CC,
      documentNumber: 'DOC-REP-SINTETICO-001',
    });
  });

  it('conserva legalRepresentative y rutResponsibilities en la edición', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-update')
      .send({
        legalRepresentative: {
          fullName: 'Representante sintético',
          documentType: DocumentType.CC,
          documentNumber: 'DOC-REP-SINTETICO-002',
        },
        rutResponsibilities: ['O-13', 'O-47'],
      });

    expect(response.status).toBe(201);
    expect(response.body.legalRepresentative.documentNumber).toBe('DOC-REP-SINTETICO-002');
    expect(response.body.rutResponsibilities).toEqual(['O-13', 'O-47']);
  });

  it('admite responsabilidades vacías en la edición aislada', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-update')
      .send({ rutResponsibilities: [] });

    expect(response.status).toBe(201);
    expect(response.body.rutResponsibilities).toEqual([]);
  });

  it('rechaza responsabilidades repetidas en la edición con el schema compartido', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-update')
      .send({ rutResponsibilities: ['O-13', 'O-13'] });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza un DV no numérico en la edición con el schema compartido', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/subscriber-update')
      .send({ nitVerificationDigit: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.fieldErrors).toHaveProperty('nitVerificationDigit');
  });

  it('conserva snapshotJson como objeto al validar una consulta de cobertura', async () => {
    const snapshotJson = { source: 'test', coverage: { available: true, code: 'FIBRA' } };
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/coverage-check')
      .send({
        addressUsed: 'Dirección sintética',
        result: Object.values(Feasibility)[0],
        snapshotJson,
      });

    expect(response.status).toBe(201);
    expect(response.body.snapshotJson).toEqual(snapshotJson);
  });

  it('conserva customerAcceptance como objeto al cerrar una orden', async () => {
    const customerAcceptance = { artifactId: 'artifact-sintetico', method: 'OTP' };
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/execution-order-close')
      .send({
        result: Object.values(ExecutionOrderResult)[0],
        summary: 'Resumen sintético',
        customerAcceptance,
      });

    expect(response.status).toBe(201);
    expect(response.body.customerAcceptance).toEqual(customerAcceptance);
  });

  it('conserva followUp como objeto al cerrar una orden', async () => {
    const followUp = { reasonCode: 'FOLLOW_UP', dueAt: '2026-10-20T12:00:00.000Z' };
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation-pipes/execution-order-close')
      .send({
        result: Object.values(ExecutionOrderResult)[0],
        summary: 'Resumen sintético',
        followUp,
      });

    expect(response.status).toBe(201);
    expect(response.body.followUp).toEqual(followUp);
  });
});
