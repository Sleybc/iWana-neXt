/**
 * Pruebas de validación de esquemas (P1-1).
 *
 * Verifica que un payload conforme al contrato tipado (shared) pasa
 * la validación Zod del DTO, y que payloads inválidos son rechazados.
 *
 * Contrato fuente: @iwana/shared → contracts/operations/execution-orders.ts
 */

import {
  AssignExecutionOrderSchema,
  RegisterEvidenceSchema,
  FollowUpSchema,
  StartExecutionOrderSchema,
  CloseExecutionOrderSchema,
  BlockExecutionOrderSchema,
  UnblockExecutionOrderSchema,
  RegisterExecutionOrderItemUsageSchema,
} from '../dto/execution-orders.dto';
import {
  ExecutionOrderResult,
  ExecutionOrderItemAction,
  InventoryDisposition,
} from '@iwana/shared';

describe('ExecutionOrders Schema Validation (P1-1)', () => {
  describe('RegisterExecutionOrderItemUsageSchema (R1.4)', () => {
    const validPayload = {
      itemId: 'item-001',
      quantity: 1,
      technicianCustodyId: 'custody-001',
      serialNumber: 'serial-001',
      action: ExecutionOrderItemAction.INSTALL,
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
    };

    it('acepta la forma canónica con technicianCustodyId', () => {
      expect(RegisterExecutionOrderItemUsageSchema.parse(validPayload)).toEqual(validPayload);
    });

    it('rechaza custodySelection como alias obsoleto', () => {
      expect(() =>
        RegisterExecutionOrderItemUsageSchema.parse({
          ...validPayload,
          technicianCustodyId: undefined,
          custodySelection: { type: 'TECHNICIAN', id: 'custody-001' },
        }),
      ).toThrow();
    });

    it('rechaza la ausencia de technicianCustodyId', () => {
      const { technicianCustodyId: _technicianCustodyId, ...withoutCustody } = validPayload;
      expect(() => RegisterExecutionOrderItemUsageSchema.parse(withoutCustody)).toThrow();
    });

    it.each([0, -1, 1.5, '2.5'])('rechaza quantity no entero positivo: %s', (quantity) => {
      expect(() =>
        RegisterExecutionOrderItemUsageSchema.parse({ ...validPayload, quantity }),
      ).toThrow();
    });

    it('coercea una cantidad entera positiva de transporte a number', () => {
      expect(
        RegisterExecutionOrderItemUsageSchema.parse({ ...validPayload, quantity: '2' }).quantity,
      ).toBe(2);
    });
  });

  // ── AssignExecutionOrder ───────────────────────────────────────────────
  describe('AssignExecutionOrderSchema', () => {
    it('acepta payload válido con todos los campos', () => {
      const result = AssignExecutionOrderSchema.parse({
        assigneeType: 'TECHNICIAN',
        assigneeId: '11111111-1111-4111-8111-111111111111',
        reason: 'Asignación por urgencia',
      });
      expect(result.assigneeType).toBe('TECHNICIAN');
      expect(result.assigneeId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.reason).toBe('Asignación por urgencia');
    });

    it('acepta payload sin reason (opcional)', () => {
      const result = AssignExecutionOrderSchema.parse({
        assigneeType: 'CREW',
        assigneeId: '22222222-2222-4222-8222-222222222222',
      });
      expect(result.assigneeType).toBe('CREW');
      expect(result.reason).toBeUndefined();
    });

    it('rechaza assigneeType inválido', () => {
      expect(() =>
        AssignExecutionOrderSchema.parse({
          assigneeType: 'INVALID',
          assigneeId: '11111111-1111-4111-8111-111111111111',
        }),
      ).toThrow();
    });

    it('rechaza assigneeId no UUID', () => {
      expect(() =>
        AssignExecutionOrderSchema.parse({
          assigneeType: 'TECHNICIAN',
          assigneeId: 'not-a-uuid',
        }),
      ).toThrow();
    });
  });

  // ── RegisterEvidence ───────────────────────────────────────────────────
  describe('RegisterEvidenceSchema', () => {
    it('acepta payload válido', () => {
      const result = RegisterEvidenceSchema.parse({
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidenceType: 'PHOTO',
        requirementKey: 'req-photo-installation',
        expiresAt: '2099-06-25T14:00:00.000Z',
        capturedAt: '2026-06-24T14:00:00.000Z',
      });
      expect(result.mediaAssetId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(result.evidenceType).toBe('PHOTO');
      expect(result.requirementKey).toBe('req-photo-installation');
    });

    it('acepta capturedAt explícitamente nulo', () => {
      const result = RegisterEvidenceSchema.parse({
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidenceType: 'DOCUMENT',
        requirementKey: 'req-doc',
        expiresAt: '2099-06-25T14:00:00.000Z',
        capturedAt: null,
      });
      expect(result.capturedAt).toBeNull();
    });

    it('acepta payload sin capturedAt porque es opcional y nullable', () => {
      const result = RegisterEvidenceSchema.parse({
        mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidenceType: 'DOCUMENT',
        requirementKey: 'req-doc',
        expiresAt: '2099-06-25T14:00:00.000Z',
      });
      expect(result.capturedAt).toBeUndefined();
    });

    it('rechaza mediaAssetId no UUID', () => {
      expect(() =>
        RegisterEvidenceSchema.parse({
          mediaAssetId: 'not-a-uuid',
          evidenceType: 'PHOTO',
          requirementKey: 'req-1',
        }),
      ).toThrow();
    });

    it('rechaza requirementKey vacío', () => {
      expect(() =>
        RegisterEvidenceSchema.parse({
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidenceType: 'PHOTO',
          requirementKey: '',
          expiresAt: '2099-06-25T14:00:00.000Z',
        }),
      ).toThrow();
    });

    it('rechaza evidenceType fuera del enum canónico', () => {
      expect(() =>
        RegisterEvidenceSchema.parse({
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidenceType: 'VIDEO',
          requirementKey: 'req-video',
          expiresAt: '2099-06-25T14:00:00.000Z',
        }),
      ).toThrow();
    });

    it('rechaza expiresAt vencido o no date-time', () => {
      for (const expiresAt of ['2020-06-25T14:00:00.000Z', 'not-a-date']) {
        expect(() =>
          RegisterEvidenceSchema.parse({
            mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            evidenceType: 'PHOTO',
            requirementKey: 'req-photo',
            expiresAt,
          }),
        ).toThrow();
      }
    });

    it('rechaza capturedAt no date-time', () => {
      expect(() =>
        RegisterEvidenceSchema.parse({
          mediaAssetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          evidenceType: 'PHOTO',
          requirementKey: 'req-photo',
          expiresAt: '2099-06-25T14:00:00.000Z',
          capturedAt: 'not-a-date',
        }),
      ).toThrow();
    });
  });

  // ── FollowUp ───────────────────────────────────────────────────────────
  describe('FollowUpSchema', () => {
    it('acepta payload válido', () => {
      const result = FollowUpSchema.parse({
        reasonCode: 'MATERIAL_MISSING',
        dueAt: '2026-07-01T14:00:00.000Z',
      });
      expect(result.reasonCode).toBe('MATERIAL_MISSING');
      expect(result.dueAt).toBe('2026-07-01T14:00:00.000Z');
    });

    it('acepta payload sin dueAt', () => {
      const result = FollowUpSchema.parse({
        reasonCode: 'SCHEDULING_ISSUE',
      });
      expect(result.reasonCode).toBe('SCHEDULING_ISSUE');
      expect(result.dueAt).toBeUndefined();
    });
  });

  // ── StartExecutionOrder ────────────────────────────────────────────────
  describe('StartExecutionOrderSchema (P1-1)', () => {
    it('acepta payload con note', () => {
      const result = StartExecutionOrderSchema.parse({
        note: 'Inicio de instalación',
      });
      expect(result.note).toBe('Inicio de instalación');
    });

    it('acepta payload vacío', () => {
      const result = StartExecutionOrderSchema.parse({});
      expect(result.note).toBeUndefined();
    });

    it('rechaza campos extra (strict mode)', () => {
      expect(() => StartExecutionOrderSchema.parse({ notes: 'Campo antiguo' })).toThrow();
    });
  });

  // ── CloseExecutionOrder ────────────────────────────────────────────────
  describe('CloseExecutionOrderSchema (P1-1)', () => {
    it('acepta payload mínimo con summary requerido', () => {
      const result = CloseExecutionOrderSchema.parse({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Instalación completada exitosamente',
      });
      expect(result.result).toBe(ExecutionOrderResult.EXECUTED);
      expect(result.summary).toBe('Instalación completada exitosamente');
    });

    it('acepta payload con reasonCode', () => {
      const result = CloseExecutionOrderSchema.parse({
        result: ExecutionOrderResult.NOT_EXECUTED,
        reasonCode: 'ACCESS_DENIED',
        summary: 'No se pudo acceder al domicilio',
      });
      expect(result.reasonCode).toBe('ACCESS_DENIED');
    });

    it('acepta payload con customerAcceptance y followUp', () => {
      const result = CloseExecutionOrderSchema.parse({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Servicio instalado',
        customerAcceptance: {
          artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          method: 'SIGNATURE',
        },
        followUp: {
          reasonCode: 'NEED_FOLLOW_UP',
          dueAt: '2026-07-10T14:00:00.000Z',
        },
      });
      expect(result.customerAcceptance?.method).toBe('SIGNATURE');
      expect(result.followUp?.reasonCode).toBe('NEED_FOLLOW_UP');
    });

    it('rechaza payload sin summary (requerido en shared type)', () => {
      expect(() =>
        CloseExecutionOrderSchema.parse({
          result: ExecutionOrderResult.EXECUTED,
        }),
      ).toThrow();
    });

    it('rechaza payload con closeNotes (opcional) pero sin result', () => {
      expect(() =>
        CloseExecutionOrderSchema.parse({
          closeNotes: 'Nota de cierre',
        }),
      ).toThrow();
    });

    it('acepta payload con closeNotes y customerSignatureRef', () => {
      const result = CloseExecutionOrderSchema.parse({
        result: ExecutionOrderResult.EXECUTED,
        summary: 'Cierre con firma',
        closeNotes: 'Nota interna',
        customerSignatureRef: 'signature-uuid',
      });
      expect(result.closeNotes).toBe('Nota interna');
      expect(result.customerSignatureRef).toBe('signature-uuid');
    });
  });

  // ── BlockExecutionOrder ────────────────────────────────────────────────
  describe('BlockExecutionOrderSchema', () => {
    it('acepta payload válido', () => {
      const result = BlockExecutionOrderSchema.parse({
        reasonCode: 'MATERIAL_MISSING',
        note: 'Falta fibra óptica',
      });
      expect(result.reasonCode).toBe('MATERIAL_MISSING');
    });

    it('rechaza reasonCode vacío', () => {
      expect(() => BlockExecutionOrderSchema.parse({ reasonCode: '' })).toThrow();
    });
  });

  // ── UnblockExecutionOrder ──────────────────────────────────────────────
  describe('UnblockExecutionOrderSchema', () => {
    it('acepta payload válido', () => {
      const result = UnblockExecutionOrderSchema.parse({
        resolutionCode: 'MATERIAL_DELIVERED',
      });
      expect(result.resolutionCode).toBe('MATERIAL_DELIVERED');
    });
  });
});
