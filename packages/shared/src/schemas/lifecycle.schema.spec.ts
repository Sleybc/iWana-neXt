import {
  LifecycleCommandSchema,
  LifecyclePreviewRequestSchema,
  LifecyclePreviewResponseSchema,
  LifecycleSuspendCommandSchema,
  LifecycleReactivateCommandSchema,
  LifecycleTerminateCommandSchema,
  LIFECYCLE_REASON_CODES_BY_ACTION,
  LIFECYCLE_ERROR_CODES,
} from './lifecycle.schema';

describe('MOD05 lifecycle shared contract', () => {
  it('freezes a closed, act-specific provisional reason catalog', () => {
    expect(LIFECYCLE_REASON_CODES_BY_ACTION).toEqual({
      suspend: [
        'MORA',
        'SOLICITUD_TITULAR',
        'USO_INDEBIDO',
        'ORDEN_AUTORIDAD',
        'FALLA_TECNICA_PROLONGADA',
      ],
      reactivate: [
        'PAGO_REGISTRADO',
        'FIN_SUSPENSION_SOLICITADA',
        'CORRECCION_OPERATIVA',
        'LEVANTAMIENTO_ORDEN',
      ],
      terminate: [
        'SOLICITUD_TITULAR',
        'MORA_PROLONGADA',
        'TRASLADO_SIN_COBERTURA',
        'USO_INDEBIDO',
        'DUPLICADO',
      ],
    });
    expect(LIFECYCLE_ERROR_CODES).toEqual([
      'SUBSCRIBER_STATUS_DERIVED',
      'SUBSCRIBER_CANCELLED',
      'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY',
      'SUBSCRIBER_HAS_LIVE_CONTRACTS',
      'IDEMPOTENCY_KEY_REUSED',
      'LIFECYCLE_CONTRACT_STATE_CHANGED',
      'LIFECYCLE_NO_CHANGES',
      'LIFECYCLE_SYSTEM_ONLY_REASON',
      'INVALID_IDEMPOTENCY_KEY',
    ]);
  });

  it('accepts optional note and explicit contract selection, but rejects invalid reasons and IDs', () => {
    expect(
      LifecycleCommandSchema.safeParse({
        reasonCode: 'MORA',
        note: 'Nota de prueba sintética',
        contractIds: ['00000000-0000-4000-8000-000000000001'],
      }).success,
    ).toBe(true);
    expect(LifecycleCommandSchema.safeParse({ reasonCode: 'INVENTED_REASON' }).success).toBe(false);
    expect(
      LifecycleCommandSchema.safeParse({ reasonCode: 'MORA', note: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(
      LifecycleCommandSchema.safeParse({
        reasonCode: 'MORA',
        contractIds: ['not-a-uuid'],
      }).success,
    ).toBe(false);
  });

  it('validates each endpoint command against its act catalog and requires contractIds for termination', () => {
    expect(LifecycleSuspendCommandSchema.safeParse({ reasonCode: 'MORA' }).success).toBe(true);
    expect(LifecycleSuspendCommandSchema.safeParse({ reasonCode: 'PAGO_REGISTRADO' }).success).toBe(
      false,
    );
    expect(
      LifecycleReactivateCommandSchema.safeParse({ reasonCode: 'PAGO_REGISTRADO' }).success,
    ).toBe(true);
    expect(LifecycleTerminateCommandSchema.safeParse({ reasonCode: 'DUPLICADO' }).success).toBe(
      false,
    );
    expect(
      LifecycleTerminateCommandSchema.safeParse({
        reasonCode: 'DUPLICADO',
        contractIds: ['00000000-0000-4000-8000-000000000001'],
      }).success,
    ).toBe(true);
    expect(
      LifecycleTerminateCommandSchema.safeParse({
        reasonCode: 'DESCARTE_EXPEDIENTE',
        contractIds: ['00000000-0000-4000-8000-000000000001'],
      }).success,
    ).toBe(false);
  });

  it('types the preview output without PII or free text', () => {
    expect(
      LifecyclePreviewRequestSchema.safeParse({ action: 'SUSPEND', reasonCode: 'MORA' }).success,
    ).toBe(true);
    expect(
      LifecyclePreviewRequestSchema.safeParse({ action: 'SUSPEND', reasonCode: 'PAGO_REGISTRADO' })
        .success,
    ).toBe(false);
    expect(LifecyclePreviewRequestSchema.safeParse({ reasonCode: 'MORA' }).success).toBe(false);
    expect(
      LifecyclePreviewResponseSchema.safeParse({
        action: 'SUSPEND',
        affectedContracts: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            fromStatus: 'ACTIVE',
            toStatus: 'SUSPENDED',
          },
        ],
        subscriberStatus: { from: 'ACTIVE', to: 'SUSPENDED' },
        hasLiveContracts: true,
        warnings: [{ code: 'EQUIPMENT_ON_LOAN', contractIds: [] }],
      }).success,
    ).toBe(true);
    expect(
      LifecyclePreviewResponseSchema.safeParse({
        action: 'SUSPEND',
        affectedContracts: [],
        subscriberStatus: { from: 'ACTIVE', to: 'ACTIVE' },
        hasLiveContracts: true,
        warnings: [],
        note: 'not part of the preview response',
      }).success,
    ).toBe(false);
  });
});
