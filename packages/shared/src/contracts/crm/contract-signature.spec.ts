import {
  CONTRACT_ACTIVATED_EVENT_TYPE,
  ContractActivatedEnvelopeSchema,
  ContractActivatedPayloadSchema,
  ContractDocumentGenerationSchema,
  ContractPdfJobPayloadSchema,
  ContractPermanenceSchema,
  ContractSignatureRecordSchema,
  ContractSignatureRequestSchema,
  ContractSignatureResponseSchema,
  ManualContractActivationSchema,
  PlanPermanenceOfferSchema,
  PlanPermanenceOfferUpdateSchema,
  contractActivatedIdempotencyKey,
} from './contract-signature';

const TENANT = '11111111-1111-4111-8111-111111111111';
const CONTRACT = '22222222-2222-4222-8222-222222222222';
const SUBSCRIBER = '33333333-3333-4333-8333-333333333333';
const UUID = '44444444-4444-4444-8444-444444444444';
const HASH = 'a'.repeat(64);
const NOW = '2026-11-11T15:00:00.000Z';

const payload = {
  tenantId: TENANT,
  contractId: CONTRACT,
  subscriberId: SUBSCRIBER,
  activatedAt: NOW,
  billingStartDate: '2026-11-10',
  source: 'SIGNATURE',
};

describe('crm.contract.activated', () => {
  it('acepta el payload de solo identificadores', () => {
    expect(ContractActivatedPayloadSchema.parse(payload)).toEqual(payload);
    expect(CONTRACT_ACTIVATED_EVENT_TYPE).toBe('crm.contract.activated');
  });

  it('rechaza PII u otros campos extra', () => {
    expect(
      ContractActivatedPayloadSchema.safeParse({ ...payload, documentNumber: '123' }).success,
    ).toBe(false);
  });

  it('rechaza fuente desconocida y fecha civil inválida', () => {
    expect(ContractActivatedPayloadSchema.safeParse({ ...payload, source: 'AUTO' }).success).toBe(
      false,
    );
    expect(
      ContractActivatedPayloadSchema.safeParse({ ...payload, billingStartDate: '2026-02-30' })
        .success,
    ).toBe(false);
  });

  it('acepta MANUAL', () => {
    expect(ContractActivatedPayloadSchema.safeParse({ ...payload, source: 'MANUAL' }).success).toBe(
      true,
    );
  });

  const envelope = {
    eventId: UUID,
    eventType: 'crm.contract.activated',
    tenantId: TENANT,
    aggregateId: CONTRACT,
    occurredAt: NOW,
    payload,
  };

  it('valida el envelope coherente', () => {
    expect(ContractActivatedEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it('rechaza aggregateId o tenant distintos del payload', () => {
    expect(
      ContractActivatedEnvelopeSchema.safeParse({ ...envelope, aggregateId: UUID }).success,
    ).toBe(false);
    expect(ContractActivatedEnvelopeSchema.safeParse({ ...envelope, tenantId: UUID }).success).toBe(
      false,
    );
  });

  it('deriva una clave idempotente por contrato', () => {
    expect(contractActivatedIdempotencyKey(CONTRACT)).toBe(`crm.contract.activated:${CONTRACT}`);
  });

  it('la activación manual exige motivo', () => {
    expect(ManualContractActivationSchema.safeParse({}).success).toBe(false);
    expect(ManualContractActivationSchema.safeParse({ reason: 'corto' }).success).toBe(false);
    expect(
      ManualContractActivationSchema.safeParse({ reason: 'Cliente firmó en papel en oficina' })
        .success,
    ).toBe(true);
  });
});

describe('estado de generación del contrato', () => {
  const base = {
    generationId: UUID,
    contractId: CONTRACT,
    status: 'PENDING',
    templateLegalTextId: null,
    templateVersion: null,
    documentSha256: null,
    requestedAt: NOW,
    completedAt: null,
    failureReason: null,
    missingOperatorFields: [],
  };
  const ready = {
    ...base,
    status: 'READY',
    templateLegalTextId: UUID,
    templateVersion: '2026.1',
    documentSha256: HASH,
    completedAt: NOW,
  };

  it('acepta PENDING sin huella', () => {
    expect(ContractDocumentGenerationSchema.safeParse(base).success).toBe(true);
  });

  it('READY exige huella, versión, plantilla y fecha', () => {
    expect(ContractDocumentGenerationSchema.safeParse({ ...base, status: 'READY' }).success).toBe(
      false,
    );
    expect(ContractDocumentGenerationSchema.safeParse(ready).success).toBe(true);
  });

  it('rechaza huella fuera de READY o en mayúsculas', () => {
    expect(
      ContractDocumentGenerationSchema.safeParse({ ...base, documentSha256: HASH }).success,
    ).toBe(false);
    expect(
      ContractDocumentGenerationSchema.safeParse({ ...ready, documentSha256: 'A'.repeat(64) })
        .success,
    ).toBe(false);
  });

  it('FAILED exige motivo; OPERATOR_DATA_MISSING exige los campos', () => {
    const failed = { ...base, status: 'FAILED', completedAt: NOW };
    expect(ContractDocumentGenerationSchema.safeParse(failed).success).toBe(false);
    expect(
      ContractDocumentGenerationSchema.safeParse({
        ...failed,
        failureReason: 'TEMPLATE_NOT_APPROVED',
      }).success,
    ).toBe(true);
    expect(
      ContractDocumentGenerationSchema.safeParse({
        ...failed,
        failureReason: 'OPERATOR_DATA_MISSING',
      }).success,
    ).toBe(false);
    expect(
      ContractDocumentGenerationSchema.safeParse({
        ...failed,
        failureReason: 'OPERATOR_DATA_MISSING',
        missingOperatorFields: ['reconnectionFee'],
      }).success,
    ).toBe(true);
    expect(
      ContractDocumentGenerationSchema.safeParse({
        ...failed,
        failureReason: 'RENDER_FAILED',
        missingOperatorFields: ['reconnectionFee'],
      }).success,
    ).toBe(false);
  });

  it('PENDING no lleva motivo', () => {
    expect(
      ContractDocumentGenerationSchema.safeParse({ ...base, failureReason: 'RENDER_FAILED' })
        .success,
    ).toBe(false);
  });

  it('el trabajo del worker solo lleva identificadores', () => {
    const job = { tenantId: TENANT, contractId: CONTRACT, generationId: UUID };
    expect(ContractPdfJobPayloadSchema.safeParse(job).success).toBe(true);
    expect(ContractPdfJobPayloadSchema.safeParse({ ...job, html: '<p/>' }).success).toBe(false);
  });
});

describe('firma del contrato', () => {
  const signer = { fullName: 'Titular Prueba', documentType: 'CC', documentNumber: '1000000001' };
  const request = {
    idempotencyKey: UUID,
    generationId: UUID,
    documentSha256: HASH,
    executionOrderId: UUID,
    signatureImage: 'data:image/png;base64,iVBORw0KGgo=',
    signer,
    location: { latitude: 4.7110123, longitude: -74.0721987 },
    device: { userAgent: 'Mozilla/5.0 (Android)', platform: 'Android' },
  };

  it('acepta la solicitud y redondea la ubicación a precisión limitada', () => {
    const parsed = ContractSignatureRequestSchema.parse(request);
    expect(parsed.location).toEqual({ latitude: 4.711, longitude: -74.072 });
  });

  it('acepta ubicación negada', () => {
    expect(ContractSignatureRequestSchema.safeParse({ ...request, location: null }).success).toBe(
      true,
    );
  });

  it('rechaza firma no PNG, documento inválido, NIT o sin idempotencyKey', () => {
    expect(
      ContractSignatureRequestSchema.safeParse({
        ...request,
        signatureImage: 'data:image/jpeg;base64,AAAA',
      }).success,
    ).toBe(false);
    expect(
      ContractSignatureRequestSchema.safeParse({
        ...request,
        signer: { ...signer, documentNumber: '12-3' },
      }).success,
    ).toBe(false);
    expect(
      ContractSignatureRequestSchema.safeParse({
        ...request,
        signer: { ...signer, documentType: 'NIT_PERSONA' },
      }).success,
    ).toBe(false);
    const withoutKey: Record<string, unknown> = { ...request };
    delete withoutKey.idempotencyKey;
    expect(ContractSignatureRequestSchema.safeParse(withoutKey).success).toBe(false);
  });

  it('rechaza firma demasiado grande', () => {
    expect(
      ContractSignatureRequestSchema.safeParse({
        ...request,
        signatureImage: `data:image/png;base64,${'A'.repeat(700_000)}`,
      }).success,
    ).toBe(false);
  });

  it('la respuesta no expone URL del documento', () => {
    const response = {
      contractId: CONTRACT,
      status: 'ACTIVE',
      signedAt: NOW,
      billingStartDate: '2026-11-10',
      signedDocumentSha256: HASH,
      templateVersion: '2026.1',
      replayed: false,
    };
    expect(ContractSignatureResponseSchema.safeParse(response).success).toBe(true);
    expect(
      ContractSignatureResponseSchema.safeParse({ ...response, documentUrl: 'https://x' }).success,
    ).toBe(false);
  });

  it('el registro persistido exige precisión limitada', () => {
    const record = {
      signedAt: NOW,
      signedBy: signer,
      technicianId: UUID,
      executionOrderId: UUID,
      templateLegalTextId: UUID,
      templateVersion: '2026.1',
      unsignedDocumentSha256: HASH,
      signedDocumentSha256: 'b'.repeat(64),
      signatureAssetId: UUID,
      signedDocumentAssetId: UUID,
      location: { latitude: 4.711, longitude: -74.072 },
      device: request.device,
    };
    expect(ContractSignatureRecordSchema.safeParse(record).success).toBe(true);
    expect(
      ContractSignatureRecordSchema.safeParse({
        ...record,
        location: { latitude: 4.7110123, longitude: -74.072 },
      }).success,
    ).toBe(false);
  });
});

describe('permanencia mínima', () => {
  it('plan sin permanencia no lleva meses ni monto', () => {
    const none = {
      installationFee: 120000,
      offersPermanence: false,
      months: null,
      discountedOrDeferredAmount: null,
    };
    expect(PlanPermanenceOfferSchema.safeParse(none).success).toBe(true);
    expect(PlanPermanenceOfferSchema.safeParse({ ...none, months: 6 }).success).toBe(false);
  });

  it('plan con permanencia: hasta 12 meses y monto no mayor al cargo', () => {
    const offer = {
      installationFee: 120000,
      offersPermanence: true,
      months: 12,
      discountedOrDeferredAmount: 120000,
    };
    expect(PlanPermanenceOfferSchema.safeParse(offer).success).toBe(true);
    expect(PlanPermanenceOfferSchema.safeParse({ ...offer, months: 13 }).success).toBe(false);
    expect(
      PlanPermanenceOfferSchema.safeParse({ ...offer, discountedOrDeferredAmount: 130000 }).success,
    ).toBe(false);
    expect(PlanPermanenceOfferSchema.safeParse({ ...offer, months: null }).success).toBe(false);
    expect(PlanPermanenceOfferSchema.safeParse({ ...offer, connectionFee: 120000 }).success).toBe(
      false,
    );
  });

  it('oferta sin installation_fee vigente: installationFee null y sin tope en el esquema', () => {
    const offer = {
      installationFee: null,
      offersPermanence: true,
      months: 6,
      discountedOrDeferredAmount: 50000,
    };
    expect(PlanPermanenceOfferSchema.safeParse(offer).success).toBe(true);
  });

  it('edición de la oferta: no acepta el cargo; el tope lo valida el servidor', () => {
    const body = { offersPermanence: true, months: 6, discountedOrDeferredAmount: 50000 };
    expect(PlanPermanenceOfferUpdateSchema.safeParse(body).success).toBe(true);
    expect(
      PlanPermanenceOfferUpdateSchema.safeParse({ ...body, installationFee: 90000 }).success,
    ).toBe(false);
    expect(
      PlanPermanenceOfferUpdateSchema.safeParse({ ...body, discountedOrDeferredAmount: 0 }).success,
    ).toBe(false);
    expect(
      PlanPermanenceOfferUpdateSchema.safeParse({
        offersPermanence: false,
        months: 3,
        discountedOrDeferredAmount: null,
      }).success,
    ).toBe(false);
  });

  const accepted = {
    accepted: true,
    months: 3,
    connectionFee: 90000,
    discountedOrDeferredAmount: 90000,
    startDate: '2026-11-10',
    endDate: '2027-02-10',
    schedule: [
      { month: 1, amount: 90000 },
      { month: 2, amount: 60000 },
      { month: 3, amount: 30000 },
    ],
  };

  it('acepta la permanencia pactada con su tabla', () => {
    expect(ContractPermanenceSchema.safeParse(accepted).success).toBe(true);
  });

  it('no aceptada: sin datos de permanencia', () => {
    const declined = {
      accepted: false,
      months: null,
      connectionFee: null,
      discountedOrDeferredAmount: null,
      startDate: null,
      endDate: null,
      schedule: [],
    };
    expect(ContractPermanenceSchema.safeParse(declined).success).toBe(true);
    expect(ContractPermanenceSchema.safeParse({ ...declined, months: 3 }).success).toBe(false);
  });

  it('rechaza tabla incompleta, creciente, desordenada o mayor al descuento', () => {
    const variants = [
      accepted.schedule.slice(0, 2),
      [
        { month: 1, amount: 30000 },
        { month: 2, amount: 60000 },
        { month: 3, amount: 90000 },
      ],
      [
        { month: 2, amount: 90000 },
        { month: 1, amount: 60000 },
        { month: 3, amount: 30000 },
      ],
      [
        { month: 1, amount: 95000 },
        { month: 2, amount: 60000 },
        { month: 3, amount: 30000 },
      ],
    ];
    for (const schedule of variants) {
      expect(ContractPermanenceSchema.safeParse({ ...accepted, schedule }).success).toBe(false);
    }
  });

  it('rechaza fechas invertidas y más de 12 meses', () => {
    expect(ContractPermanenceSchema.safeParse({ ...accepted, endDate: '2026-11-01' }).success).toBe(
      false,
    );
    expect(ContractPermanenceSchema.safeParse({ ...accepted, months: 13 }).success).toBe(false);
  });
});
