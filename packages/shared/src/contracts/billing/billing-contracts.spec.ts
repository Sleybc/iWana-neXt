import {
  BillingPolicySchema,
  BillingPolicyUpdateSchema,
  BillingContractPolicyUpdateSchema,
  BillingContractPolicyResponseSchema,
  BillingGenerationSummarySchema,
  BillingPolicyPreviewRequestSchema,
  BillingPolicyPreviewSchema,
  BillingDocumentResponseSchema,
  GenerateDocumentsCommandSchema,
  IssueDocumentsCommandSchema,
  VoidDocumentCommandSchema,
  VoidPaymentCommandSchema,
  RegisterPaymentCommandSchema,
  AllocateCreditCommandSchema,
  BillingBuyerSnapshotSchema,
  BillingIssuerSnapshotSchema,
  BILLING_DOCUMENT_VOID_REASONS,
  BILLING_PAYMENT_VOID_REASONS,
  BILLING_PERIOD_PAYMENT_STATES,
  BILLING_ERROR_CODES,
  PaymentAllocationInputSchema,
  CreditAllocationItemSchema,
} from './index';

describe('Billing Shared Contracts (HLD v1.1 §4, CA-FAC-02, RS-6, RS-7)', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const validContractId = '22222222-2222-4222-8222-222222222222';
  const validSubscriberId = '33333333-3333-4333-8333-333333333333';
  const validDocumentId = '44444444-4444-4444-8444-444444444444';

  it('exige todos los contadores de generación y rechaza valores negativos', () => {
    const summary = {
      generated: 1,
      failed: 0,
      notDue: 0,
      existing: 0,
      omittedImpersonation: 0,
      omittedTermination: 0,
      blocked: 0,
      withoutCycle: 0,
      unbilledAdditionalDocuments: 0,
    };
    expect(BillingGenerationSummarySchema.parse(summary)).toEqual(summary);
    expect(BillingGenerationSummarySchema.safeParse({ ...summary, failed: -1 }).success).toBe(
      false,
    );
    expect(
      BillingGenerationSummarySchema.safeParse({ ...summary, blocked: undefined }).success,
    ).toBe(false);
  });

  it('distingue valores heredados nulos de campos omitidos en la respuesta de política', () => {
    const data = {
      contractId: validContractId,
      periodTiming: null,
      generationLeadDays: null,
      paymentTermDays: null,
      graceDays: null,
      cutoffEnabled: false,
      firstPeriodMode: null,
      billingStartDate: null,
      updatedBy: null,
      updatedAt: null,
    };
    expect(BillingContractPolicyResponseSchema.parse({ data })).toEqual({ data });
    expect(
      BillingContractPolicyResponseSchema.safeParse({ data: { ...data, cutoffEnabled: undefined } })
        .success,
    ).toBe(false);
  });

  describe('BillingPolicySchema & BillingPolicyUpdateSchema', () => {
    const validBasePolicy = {
      tenantId: validTenantId,
      periodTiming: 'ANTICIPADO' as const,
      generationLeadDays: 0,
      cutoffMode: 'DIA_FIJO_CICLO' as const,
      paymentTermDays: 14,
      graceDays: 0,
      cutoffEnabled: true,
      minimumUnpaidForCutoff: 0,
      prorationMethod: 'DIAS_REALES' as const,
      firstPeriodMode: 'SEPARADO' as const,
      automaticGeneration: false,
      approvalMode: 'BORRADOR' as const,
      autoApplyCredit: true,
      generationHour: 6,
      documentPrefix: 'DC',
    };

    it('acepta una política válida con ANTICIPADO y DIA_FIJO_CICLO', () => {
      const parsed = BillingPolicySchema.safeParse(validBasePolicy);
      expect(parsed.success).toBe(true);
    });

    it('acepta una política válida con VENCIDO y VENCIMIENTO_MAS_GRACIA', () => {
      const parsed = BillingPolicySchema.safeParse({
        ...validBasePolicy,
        periodTiming: 'VENCIDO',
        cutoffMode: 'VENCIMIENTO_MAS_GRACIA',
      });
      expect(parsed.success).toBe(true);
    });

    it('rechaza con BILLING_POLICY_INCOMPATIBLE la combinación DIA_FIJO_CICLO con VENCIDO (CA-FAC-02)', () => {
      const invalidPolicy = {
        ...validBasePolicy,
        periodTiming: 'VENCIDO',
        cutoffMode: 'DIA_FIJO_CICLO',
      };

      const result = BillingPolicySchema.safeParse(invalidPolicy);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors[0];
        expect(error?.message).toContain(BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE);
        expect(error?.path).toContain('cutoffMode');
      }
    });

    it('BillingPolicyUpdateSchema rechaza la combinación incompatible con expectedUpdatedAt', () => {
      const updatePayload = {
        expectedUpdatedAt: '2026-11-03T16:00:00.000Z',
        periodTiming: 'VENCIDO' as const,
        cutoffMode: 'DIA_FIJO_CICLO' as const,
        generationLeadDays: 0,
        paymentTermDays: 14,
        graceDays: 0,
        cutoffEnabled: true,
        minimumUnpaidForCutoff: 0,
        prorationMethod: 'DIAS_REALES' as const,
        firstPeriodMode: 'SEPARADO' as const,
        automaticGeneration: false,
        approvalMode: 'BORRADOR' as const,
        autoApplyCredit: true,
        generationHour: 6,
        documentPrefix: 'DC',
      };

      const result = BillingPolicyUpdateSchema.safeParse(updatePayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain(
          BILLING_ERROR_CODES.BILLING_POLICY_INCOMPATIBLE,
        );
      }
    });
  });

  describe('BillingContractPolicyUpdateSchema', () => {
    it('permite sobrescrituras parciales y fecha de inicio de cobro civil', () => {
      const parsed = BillingContractPolicyUpdateSchema.safeParse({
        periodTiming: 'ANTICIPADO',
        billingStartDate: '2026-11-15',
        cutoffEnabled: false,
      });
      expect(parsed.success).toBe(true);
    });

    it('rechaza fecha civil inválida en billingStartDate', () => {
      const parsed = BillingContractPolicyUpdateSchema.safeParse({
        billingStartDate: '2026-02-30',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('vista previa de política (RS-10)', () => {
    it('acepta política parcial y exige contratos estrictos', () => {
      expect(
        BillingPolicyPreviewRequestSchema.safeParse({
          contractId: validContractId,
          policy: { periodTiming: 'VENCIDO', generationLeadDays: 5 },
        }).success,
      ).toBe(true);
      expect(BillingPolicyPreviewRequestSchema.safeParse({ unexpected: true }).success).toBe(false);
      expect(
        BillingPolicyPreviewRequestSchema.safeParse({ policy: { unsupported: true } }).success,
      ).toBe(false);
    });

    it('serializa tres fechas por ciclo', () => {
      const previewItem = {
        periodStart: '2026-12-01',
        periodEnd: '2026-12-31',
        generationDate: '2026-12-01',
        dueDate: '2026-12-14',
        cutoffDate: '2026-12-15',
      };
      expect(
        BillingPolicyPreviewSchema.safeParse({
          cycles: [{ cycleDay: 1, cutoffDay: 15, items: [previewItem, previewItem, previewItem] }],
        }).success,
      ).toBe(true);
      expect(
        BillingPolicyPreviewSchema.safeParse({
          cycles: [{ cycleDay: 1, cutoffDay: 15, items: [previewItem] }],
        }).success,
      ).toBe(false);
    });
  });

  it('incluye el conteo de adicionales sin cobrar en la respuesta de documento (RS-12)', () => {
    const response = {
      id: validDocumentId,
      tenantId: validTenantId,
      periodId: validDocumentId,
      contractId: validContractId,
      subscriberId: validSubscriberId,
      status: 'BORRADOR',
      dueDate: '2026-12-14',
      periodStart: '2026-11-05',
      periodEnd: '2026-12-04',
      coveredStart: '2026-11-05',
      paymentState: null,
      buyerProtected: false,
      subtotal: '0.00',
      taxTotal: '0.00',
      total: '0.00',
      unbilledAdditionalCount: 2,
      createdAt: '2026-11-04T12:00:00.000Z',
      updatedAt: '2026-11-04T12:00:00.000Z',
    };
    expect(BillingDocumentResponseSchema.safeParse(response).success).toBe(true);
    expect(
      BillingDocumentResponseSchema.safeParse({ ...response, unbilledAdditionalCount: -1 }).success,
    ).toBe(false);
  });

  describe('Comandos y catálogos de documentos y pagos', () => {
    it('incluye SUPLANTACION en BILLING_DOCUMENT_VOID_REASONS (v1.1, RS-7)', () => {
      expect(BILLING_DOCUMENT_VOID_REASONS).toContain('SUPLANTACION');

      const validVoid = VoidDocumentCommandSchema.safeParse({
        reasonCode: 'SUPLANTACION',
        note: 'Contrato suspendido por falsedad personal Ley 2573',
      });
      expect(validVoid.success).toBe(true);
    });

    it('incluye PRIVACY_TITULAR_ANONYMIZED en BILLING_ERROR_CODES (v1.1, RS-6)', () => {
      expect(BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED).toBe('PRIVACY_TITULAR_ANONYMIZED');
    });

    it('valida RegisterPaymentCommandSchema con método de catálogo y sugerencia de aplicación', () => {
      const validPayment = RegisterPaymentCommandSchema.safeParse({
        subscriberId: validSubscriberId,
        method: 'TRANSFERENCIA',
        amount: 85000.5,
        paidAt: '2026-11-03',
        reference: 'TR-987654',
        note: 'Pago mensualidad',
        allocations: [{ documentId: validDocumentId, amount: 85000.5 }],
      });
      expect(validPayment.success).toBe(true);
    });

    it('limita los importes de pago y aplicaciones a numeric(14,2)', () => {
      const payment = {
        subscriberId: validSubscriberId,
        method: 'TRANSFERENCIA',
        paidAt: '2026-11-03',
      };

      expect(
        RegisterPaymentCommandSchema.safeParse({ ...payment, amount: '999999999999.99' }).success,
      ).toBe(true);
      expect(
        RegisterPaymentCommandSchema.safeParse({ ...payment, amount: 999999999999.99 }).success,
      ).toBe(true);
      expect(RegisterPaymentCommandSchema.safeParse({ ...payment, amount: 1.001 }).success).toBe(
        false,
      );
      expect(
        RegisterPaymentCommandSchema.safeParse({ ...payment, amount: 1_000_000_000_000 }).success,
      ).toBe(false);
      expect(
        RegisterPaymentCommandSchema.safeParse({ ...payment, amount: '1000000000000.00' }).success,
      ).toBe(false);
      expect(RegisterPaymentCommandSchema.safeParse({ ...payment, amount: '0.00' }).success).toBe(
        false,
      );

      expect(
        PaymentAllocationInputSchema.safeParse({
          documentId: validDocumentId,
          amount: '999999999999.99',
        }).success,
      ).toBe(true);
      expect(
        PaymentAllocationInputSchema.safeParse({ documentId: validDocumentId, amount: '1.001' })
          .success,
      ).toBe(false);
      expect(
        CreditAllocationItemSchema.safeParse({
          paymentId: validDocumentId,
          documentId: validDocumentId,
          amount: '1000000000000.00',
        }).success,
      ).toBe(false);
    });

    it('limita el umbral de corte a numeric(14,2)', () => {
      const validPolicy = {
        tenantId: validTenantId,
        periodTiming: 'ANTICIPADO',
        generationLeadDays: 0,
        cutoffMode: 'DIA_FIJO_CICLO',
        paymentTermDays: 14,
        graceDays: 0,
        cutoffEnabled: true,
        minimumUnpaidForCutoff: '999999999999.99',
        prorationMethod: 'DIAS_REALES',
        firstPeriodMode: 'SEPARADO',
        automaticGeneration: false,
        approvalMode: 'BORRADOR',
        autoApplyCredit: true,
        generationHour: 6,
        documentPrefix: 'DC',
      };

      expect(BillingPolicySchema.safeParse(validPolicy).success).toBe(true);
      expect(
        BillingPolicySchema.safeParse({ ...validPolicy, minimumUnpaidForCutoff: 1.001 }).success,
      ).toBe(false);

      expect(
        BillingPolicyUpdateSchema.safeParse({
          expectedUpdatedAt: '2026-11-03T16:00:00.000Z',
          periodTiming: 'ANTICIPADO',
          generationLeadDays: 0,
          cutoffMode: 'DIA_FIJO_CICLO',
          paymentTermDays: 14,
          graceDays: 0,
          cutoffEnabled: true,
          prorationMethod: 'DIAS_REALES',
          firstPeriodMode: 'SEPARADO',
          automaticGeneration: false,
          approvalMode: 'BORRADOR',
          autoApplyCredit: true,
          generationHour: 6,
          documentPrefix: 'DC',
          minimumUnpaidForCutoff: 1_000_000_000_000,
        }).success,
      ).toBe(false);
    });

    it('rechaza campos no declarados en snapshots fiscales del adquirente y emisor', () => {
      expect(
        BillingBuyerSnapshotSchema.safeParse({
          displayName: 'Titular de prueba',
          extraPersonalData: 'dato no contratado',
        }).success,
      ).toBe(false);
      expect(
        BillingIssuerSnapshotSchema.safeParse({
          legalName: 'Empresa de prueba',
          nit: '900000000',
          extraPersonalData: 'dato no contratado',
        }).success,
      ).toBe(false);
    });

    it('valida IssueDocumentsCommandSchema con entre 1 y 100 UUIDs', () => {
      const valid = IssueDocumentsCommandSchema.safeParse({
        documentIds: [validDocumentId],
      });
      expect(valid.success).toBe(true);

      const empty = IssueDocumentsCommandSchema.safeParse({
        documentIds: [],
      });
      expect(empty.success).toBe(false);
    });

    it('valida estados de pago ordenados (ADR-103 D3)', () => {
      expect(BILLING_PERIOD_PAYMENT_STATES).toEqual([
        'SIN_DOCUMENTO',
        'PAGADO',
        'VENCIDO',
        'PARCIAL',
        'PENDIENTE',
      ]);
    });
  });
});
