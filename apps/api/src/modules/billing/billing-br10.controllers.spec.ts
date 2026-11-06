import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { AccessPermissionKey } from '@iwana/shared';
import { EffectivePermissionsService } from '../access-control/services/effective-permissions.service';
import { BillingDocumentsController } from './documents/billing-documents.controller';
import { BillingDocumentsService } from './documents/billing-documents.service';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingPaymentsController } from './payments/billing-payments.controller';
import { BillingPaymentsService } from './payments/billing-payments.service';
import { BillingPolicyController } from './policy/billing-policy.controller';
import { BillingPolicyService } from './policy/billing-policy.service';

jest.mock('./documents/billing-documents.pdf', () => ({
  renderBillingDocumentPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fixture')),
}));

const ACTOR = '00000000-0000-4000-8000-000000000002';
const DOCUMENT = '00000000-0000-4000-8000-000000000030';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000033';
const request = { user: { sub: ACTOR } };

describe('Controladores de facturación — ramas de actor y permisos', () => {
  describe('BillingDocumentsController', () => {
    let documents: {
      list: jest.Mock;
      findOne: jest.Mock;
      issue: jest.Mock;
      void: jest.Mock;
      discard: jest.Mock;
      pdfDocument: jest.Mock;
    };
    let generation: { generate: jest.Mock };
    let controller: BillingDocumentsController;

    beforeEach(() => {
      documents = {
        list: jest.fn().mockResolvedValue({ data: [] }),
        findOne: jest.fn().mockResolvedValue({ id: DOCUMENT, status: 'EMITIDO', number: 'FE-1' }),
        issue: jest.fn().mockResolvedValue([]),
        void: jest.fn().mockResolvedValue(undefined),
        discard: jest.fn().mockResolvedValue(undefined),
        pdfDocument: jest.fn(),
      };
      generation = { generate: jest.fn().mockResolvedValue({ generated: 0 }) };
      controller = new BillingDocumentsController(
        documents as unknown as BillingDocumentsService,
        generation as unknown as BillingGenerationService,
      );
    });

    it('rechaza una petición sin actor autenticado', async () => {
      await expect(controller.findOne(DOCUMENT, {} as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(controller.findOne(DOCUMENT, { user: {} } as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('genera con los filtros opcionales presentes y omitidos', async () => {
      await controller.generate({ contractId: DOCUMENT, date: '2026-11-05' }, request as never);
      expect(generation.generate).toHaveBeenCalledWith({
        contractId: DOCUMENT,
        date: '2026-11-05',
        actorId: ACTOR,
      });

      await controller.generate({}, request as never);
      expect(generation.generate).toHaveBeenLastCalledWith({ actorId: ACTOR });
    });

    it('lista con todos los filtros y con la paginación por defecto', async () => {
      await controller.list(
        {
          page: 2,
          limit: 10,
          status: 'BORRADOR',
          paymentState: 'PENDIENTE',
          cycleDay: 5,
          subscriberId: SUBSCRIBER,
          from: '2026-11-01',
          to: '2026-11-30',
        } as never,
        request as never,
      );
      expect(documents.list).toHaveBeenCalledWith(
        {
          page: 2,
          limit: 10,
          status: 'BORRADOR',
          paymentState: 'PENDIENTE',
          cycleDay: 5,
          subscriberId: SUBSCRIBER,
          from: '2026-11-01',
          to: '2026-11-30',
        },
        ACTOR,
      );

      await controller.list({ page: 1, limit: 25 } as never, request as never);
      expect(documents.list).toHaveBeenLastCalledWith({ page: 1, limit: 25 }, ACTOR);
    });

    it('emite, anula y descarta pasando el actor de la sesión', async () => {
      await controller.issue({ documentIds: [DOCUMENT] }, request as never);
      expect(documents.issue).toHaveBeenCalledWith([DOCUMENT], ACTOR);

      await controller.void(DOCUMENT, { reasonCode: 'ERROR_DE_VALOR' }, request as never);
      expect(documents.void).toHaveBeenCalledWith(DOCUMENT, 'ERROR_DE_VALOR', undefined, ACTOR);

      await controller.discard(DOCUMENT, request as never);
      expect(documents.discard).toHaveBeenCalledWith(DOCUMENT, ACTOR);
    });

    it('no entrega el PDF de un documento que no está emitido', async () => {
      documents.pdfDocument.mockResolvedValueOnce({ id: DOCUMENT, status: 'BORRADOR' });
      await expect(
        controller.pdf(DOCUMENT, request as never, {} as Response),
      ).rejects.toMatchObject({ response: { code: 'BILLING_DOCUMENT_NOT_ISSUED' } });
    });

    it('entrega el PDF emitido con nombre de archivo y tipo correcto', async () => {
      documents.pdfDocument.mockResolvedValueOnce({
        id: DOCUMENT,
        status: 'EMITIDO',
        number: 'FE-000001',
      });
      const response = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.pdf(DOCUMENT, request as never, response);

      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="FE-000001.pdf"',
      );
      expect(response.send).toHaveBeenCalled();
    });
  });

  describe('BillingPaymentsController', () => {
    let payments: {
      registerPayment: jest.Mock;
      listPayments: jest.Mock;
      getPayment: jest.Mock;
      allocateCredit: jest.Mock;
      voidPayment: jest.Mock;
      statementForSubscriber: jest.Mock;
    };
    let permissions: { getEffectivePermissionsForUser: jest.Mock };
    let controller: BillingPaymentsController;

    beforeEach(() => {
      payments = {
        registerPayment: jest.fn().mockResolvedValue({ id: 'payment' }),
        listPayments: jest.fn().mockResolvedValue({ data: [], meta: {} }),
        getPayment: jest.fn().mockResolvedValue({ id: 'payment' }),
        allocateCredit: jest.fn().mockResolvedValue({ id: 'payment' }),
        voidPayment: jest.fn().mockResolvedValue({ id: 'payment' }),
        statementForSubscriber: jest.fn().mockResolvedValue({ documents: [] }),
      };
      permissions = { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) };
      controller = new BillingPaymentsController(
        payments as unknown as BillingPaymentsService,
        permissions as unknown as EffectivePermissionsService,
      );
    });

    it('rechaza una clave de idempotencia vacía pero no la ausente', async () => {
      await expect(controller.register({}, '   ', request as never)).rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
      });
      await expect(controller.register({}, undefined, request as never)).rejects.toMatchObject({
        response: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
      });
      await controller.register({}, 'clave', request as never);
      expect(payments.registerPayment).toHaveBeenCalledWith({}, 'clave', ACTOR);
    });

    it('rechaza una petición sin actor autenticado', async () => {
      await expect(controller.register({}, 'clave', {} as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it.each([
      [AccessPermissionKey.PRIVACY_READ, 'PRIVACY_READ'],
      [AccessPermissionKey.CRM_BLOCKED_DATA_READ, 'CRM_BLOCKED_DATA_READ'],
    ])('propaga la concesión %s al listado y al estado de cuenta', async (grant, expected) => {
      permissions.getEffectivePermissionsForUser.mockResolvedValue([grant]);
      await controller.list({ page: 1, limit: 20 } as never, request as never);
      await controller.statement(SUBSCRIBER, request as never);

      expect(payments.listPayments).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        { actorId: ACTOR, canSeeBlocked: true, grantedBy: expected },
      );
      expect(payments.statementForSubscriber).toHaveBeenCalledWith(SUBSCRIBER, ACTOR, {
        canSeeBlocked: true,
        grantedBy: expected,
      });
    });

    it('no concede lectura de bloqueados sin permisos de privacidad', async () => {
      await controller.list({} as never, request as never);
      await controller.statement(SUBSCRIBER, request as never);

      expect(payments.listPayments).toHaveBeenCalledWith(
        {},
        { actorId: ACTOR, canSeeBlocked: false },
      );
      expect(payments.statementForSubscriber).toHaveBeenCalledWith(SUBSCRIBER, ACTOR, {
        canSeeBlocked: false,
      });
    });

    it('delega la asignación y la anulación con el actor de la sesión', async () => {
      await controller.allocate(DOCUMENT, { allocations: [] }, request as never);
      expect(payments.allocateCredit).toHaveBeenCalledWith(DOCUMENT, { allocations: [] }, ACTOR);

      await controller.void(DOCUMENT, { reasonCode: 'ERROR_DE_REGISTRO' }, request as never);
      expect(payments.voidPayment).toHaveBeenCalledWith(
        DOCUMENT,
        { reasonCode: 'ERROR_DE_REGISTRO' },
        ACTOR,
      );
    });
  });

  describe('BillingPolicyController', () => {
    let policy: {
      getPolicy: jest.Mock;
      updatePolicy: jest.Mock;
      preview: jest.Mock;
      getContractPolicy: jest.Mock;
      updateContractPolicy: jest.Mock;
    };
    let controller: BillingPolicyController;

    beforeEach(() => {
      policy = {
        getPolicy: jest.fn().mockResolvedValue({}),
        updatePolicy: jest.fn().mockResolvedValue({}),
        preview: jest.fn().mockResolvedValue({}),
        getContractPolicy: jest.fn().mockResolvedValue({}),
        updateContractPolicy: jest.fn().mockResolvedValue({}),
      };
      controller = new BillingPolicyController(policy as unknown as BillingPolicyService);
    });

    it('rechaza actualizar sin actor autenticado', async () => {
      await expect(controller.updatePolicy({}, {} as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        controller.updateContractPolicy(DOCUMENT, {}, {} as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('delega consulta, vista previa y actualización con el actor de la sesión', async () => {
      await controller.getPolicy();
      await controller.preview({ contractId: DOCUMENT });
      await controller.getContractPolicy(DOCUMENT);
      await controller.updatePolicy({}, request as never);
      await controller.updateContractPolicy(DOCUMENT, {}, request as never);

      expect(policy.getPolicy).toHaveBeenCalled();
      expect(policy.preview).toHaveBeenCalledWith({ contractId: DOCUMENT });
      expect(policy.getContractPolicy).toHaveBeenCalledWith(DOCUMENT);
      expect(policy.updatePolicy).toHaveBeenCalledWith({}, ACTOR);
      expect(policy.updateContractPolicy).toHaveBeenCalledWith(DOCUMENT, {}, ACTOR);
    });
  });
});
