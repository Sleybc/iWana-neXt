import type {
  ExecutionOrderDetail,
  ExecutionOrderError,
  ExecutionOrderItemUsage,
  RegisterEvidenceCommand,
} from './execution-orders';
import {
  canonicalizeInventoryExecutionRequest,
  InventoryConsumptionReversalRequestedV1EnvelopeSchema,
  InventoryConsumptionRequestedV2EnvelopeSchema,
  InventoryReversalConfirmedV1Schema,
  InventoryReversalRejectedV1Schema,
  ReverseItemUsageCommandSchema,
} from './execution-orders';
import { ExecutionOrderItemAction } from '../../enums/operations';
import { InventoryDisposition } from '../../enums/inventory';

describe('execution order shared contracts', () => {
  it('accepts a missing template in the detail contract', () => {
    const template: ExecutionOrderDetail['template'] = null;

    expect(template).toBeNull();
  });

  it('models closure missing requirements as product labels', () => {
    const error: ExecutionOrderError = {
      code: 'CLOSURE_GATE_INCOMPLETE',
      message: 'No se puede cerrar la OT: requisitos pendientes.',
      correlationId: '00000000-0000-4000-8000-000000000001',
      missingRequirements: ['Instalación de fibra'],
    };

    expect(error.missingRequirements).toEqual(['Instalación de fibra']);
  });

  it('models nullable capturedAt explicitly in evidence requests', () => {
    const command: RegisterEvidenceCommand = {
      mediaAssetId: '00000000-0000-4000-8000-000000000001',
      evidenceType: 'PHOTO',
      requirementKey: 'req-photo',
      expiresAt: '2099-06-25T14:00:00.000Z',
      capturedAt: null,
    };

    expect(command.capturedAt).toBeNull();
  });

  it('validates the complete V2 inventory request envelope at runtime', () => {
    const envelope = {
      eventId: '00000000-0000-4000-8000-000000000001',
      eventType: 'InventoryConsumptionRequestedV2',
      tenantId: '00000000-0000-4000-8000-000000000002',
      aggregateId: '00000000-0000-4000-8000-000000000003',
      aggregateVersion: 2,
      occurredAt: '2026-10-06T12:00:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000004',
      payload: {
        executionOrderId: '00000000-0000-4000-8000-000000000003',
        inventoryRequestId: '00000000-0000-4000-8000-000000000005',
        itemId: '00000000-0000-4000-8000-000000000006',
        quantity: 1,
        serial: 'SER-001',
        technicianCustodyId: '00000000-0000-4000-8000-000000000007',
        action: ExecutionOrderItemAction.INSTALL,
        finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
        subscriberId: '00000000-0000-4000-8000-000000000008',
        actorUserId: '00000000-0000-4000-8000-000000000009',
      },
    };

    expect(InventoryConsumptionRequestedV2EnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(
      InventoryConsumptionRequestedV2EnvelopeSchema.safeParse({
        ...envelope,
        payload: { ...envelope.payload, subscriberId: null },
      }).success,
    ).toBe(true);
    expect(
      InventoryConsumptionRequestedV2EnvelopeSchema.safeParse({
        ...envelope,
        payload: { ...envelope.payload, quantity: 2 },
      }).success,
    ).toBe(false);
    expect(
      InventoryConsumptionRequestedV2EnvelopeSchema.safeParse({
        ...envelope,
        payload: {
          ...envelope.payload,
          itemId: 'SKU-001',
          technicianCustodyId: 'custody:tech-001',
          subscriberId: 'subscriber-001',
        },
      }).success,
    ).toBe(true);

    const usage: ExecutionOrderItemUsage = {
      id: 'usage-001',
      itemId: '00000000-0000-4000-8000-000000000006',
      requirementKey: null,
      quantity: 1,
      action: ExecutionOrderItemAction.INSTALL,
      finalDisposition: InventoryDisposition.INSTALLED_AT_CUSTOMER,
      inventoryRequestId: '00000000-0000-4000-8000-000000000005',
      movementStatus: 'REJECTED',
      rejectionReasonCode: 'SUBSCRIBER_REQUIRED',
      createdAt: '2026-10-06T12:00:00.000Z',
    };
    expect(usage.rejectionReasonCode).toBe('SUBSCRIBER_REQUIRED');
  });

  it('canonicalizes the signed queue envelope independently of object key order', () => {
    expect(canonicalizeInventoryExecutionRequest('tenant-1', { b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalizeInventoryExecutionRequest('tenant-1', { a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it('validates the v1.7 reversal command and keeps its reason out of the event', () => {
    expect(ReverseItemUsageCommandSchema.safeParse({ reason: 'Corrección de orden' }).success).toBe(
      true,
    );
    expect(ReverseItemUsageCommandSchema.safeParse({ reason: '   ' }).success).toBe(false);

    const envelope = {
      eventId: '00000000-0000-4000-8000-000000000011',
      eventType: 'InventoryConsumptionReversalRequestedV1',
      tenantId: '00000000-0000-4000-8000-000000000002',
      aggregateId: '00000000-0000-4000-8000-000000000003',
      aggregateVersion: 4,
      occurredAt: '2026-10-10T12:00:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000004',
      payload: {
        executionOrderId: '00000000-0000-4000-8000-000000000003',
        reversalRequestId: '00000000-0000-4000-8000-000000000005',
        inventoryRequestId: '00000000-0000-4000-8000-000000000006',
        originalStockMovementId: 'movement-original',
        technicianCustodyId: 'custody-001',
        actorUserId: '00000000-0000-4000-8000-000000000007',
      },
    };

    expect(InventoryConsumptionReversalRequestedV1EnvelopeSchema.safeParse(envelope).success).toBe(
      true,
    );
    expect(
      InventoryConsumptionReversalRequestedV1EnvelopeSchema.safeParse({
        ...envelope,
        payload: { ...envelope.payload, reason: 'must not leave MOD11' },
      }).success,
    ).toBe(false);
    expect(
      InventoryReversalConfirmedV1Schema.safeParse({
        executionOrderId: envelope.aggregateId,
        reversalRequestId: envelope.payload.reversalRequestId,
        stockMovementId: 'movement-reversal',
      }).success,
    ).toBe(true);
    expect(
      InventoryReversalRejectedV1Schema.safeParse({
        executionOrderId: envelope.aggregateId,
        reversalRequestId: envelope.payload.reversalRequestId,
        reasonCode: 'REVERSAL_LOAN_MISMATCH',
      }).success,
    ).toBe(true);
  });
});
