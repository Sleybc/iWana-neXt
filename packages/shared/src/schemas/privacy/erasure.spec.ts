import {
  dataSubjectRequestDetailSchema,
  dataSubjectRequestSummarySchema,
  erasureBlockerSchema,
  erasureCategorySchema,
  erasurePreviewSchema,
  resolveRequestSchema,
} from './requests';

const ERASURE_CATEGORIES = [
  'IDENTIFICACION',
  'CONTACTO',
  'UBICACION',
  'FISCAL',
  'COMERCIAL',
  'EVIDENCIA_CONSENTIMIENTO',
  'CUENTA_USUARIO',
  'EVIDENCIA_DOCUMENTAL',
  'OPERACION_CAMPO',
] as const;

function zeroCounts(): Record<(typeof ERASURE_CATEGORIES)[number], number> {
  return Object.fromEntries(ERASURE_CATEGORIES.map((category) => [category, 0])) as Record<
    (typeof ERASURE_CATEGORIES)[number],
    number
  >;
}

describe('contratos de supresión de privacidad (Fase 1b)', () => {
  it('fija las nueve categorías y los cinco bloqueos de anonimización', () => {
    for (const category of ERASURE_CATEGORIES) {
      expect(erasureCategorySchema.safeParse(category).success).toBe(true);
    }
    expect(erasureCategorySchema.safeParse('OTRO').success).toBe(false);
    for (const blocker of [
      'IDENTITY_NOT_VERIFIED',
      'INVALID_STATUS',
      'CONSERVATION_DUTY',
      'UNRECONCILED_TITULAR',
      'ACTIVE_USER_ACCOUNT',
    ]) {
      expect(erasureBlockerSchema.safeParse(blocker).success).toBe(true);
    }
    expect(erasureBlockerSchema.safeParse('OTRO').success).toBe(false);
  });

  it('acepta resolver sin supresión y exige confirmación literal con expedientes acotados', () => {
    const base = { responseText: 'Respuesta', responseChannel: 'EMAIL' };
    expect(resolveRequestSchema.safeParse(base).success).toBe(true);
    expect(
      resolveRequestSchema.safeParse({
        ...base,
        erasure: {
          confirm: true,
          expedienteIds: ['60000000-0000-4000-8000-000000000001'],
        },
      }).success,
    ).toBe(true);
    expect(
      resolveRequestSchema.safeParse({ ...base, erasure: { confirm: false, expedienteIds: [] } })
        .success,
    ).toBe(false);
    expect(
      resolveRequestSchema.safeParse({
        ...base,
        erasure: {
          confirm: true,
          expedienteIds: Array.from(
            { length: 51 },
            (_, index) => `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          ),
        },
      }).success,
    ).toBe(false);
    expect(
      resolveRequestSchema.safeParse({
        ...base,
        erasure: { confirm: true, expedienteIds: [], extra: true },
      }).success,
    ).toBe(false);
  });

  it('valida la vista previa sin PII: elegibilidad, bloqueos, candidatos y conteos', () => {
    const preview = {
      eligible: true,
      blockers: [],
      candidateExpedienteIds: ['60000000-0000-4000-8000-000000000001'],
      counts: { ...zeroCounts(), IDENTIFICACION: 2 },
      categories: ['IDENTIFICACION'],
    };
    expect(erasurePreviewSchema.safeParse(preview).success).toBe(true);
    expect(
      erasurePreviewSchema.safeParse({
        ...preview,
        eligible: false,
        blockers: ['ACTIVE_USER_ACCOUNT'],
      }).success,
    ).toBe(true);
    expect(
      erasurePreviewSchema.safeParse({
        ...preview,
        counts: { ...zeroCounts(), IDENTIFICACION: -1 },
      }).success,
    ).toBe(false);
    expect(erasurePreviewSchema.safeParse({ ...preview, categories: ['OTRA'] }).success).toBe(
      false,
    );
  });

  it('exige el plazo de traslado, el traslado tardío y la evidencia de supresión en resumen y detalle', () => {
    const summary = {
      id: '60000000-0000-4000-8000-000000000001',
      kind: 'CONSULTA',
      right: 'SUPRIMIR',
      purpose: null,
      status: 'TRASLADADA',
      receivedAt: '2026-10-14T17:00:00.000Z',
      dueAt: '2026-10-28',
      extendedUntil: null,
      isOverdue: false,
      transferDueAt: '2026-10-16',
      transferredLate: true,
      erasedAt: null,
      erasureCategories: [],
    };
    expect(dataSubjectRequestSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      dataSubjectRequestSummarySchema.safeParse({ ...summary, transferredLate: 'sí' }).success,
    ).toBe(false);
    expect(
      dataSubjectRequestSummarySchema.safeParse({ ...summary, erasureCategories: ['OTRA'] })
        .success,
    ).toBe(false);

    const { isOverdue: _overdue, ...summaryWithoutOverdue } = summary;
    const detail = {
      request: {
        ...summaryWithoutOverdue,
        partyId: null,
        requesterKind: 'TITULAR',
        completeAt: null,
        impersonationComplaintDueAt: null,
        suspendedContractIds: [],
        infoRequiredAt: null,
        desistAt: null,
        responseText: null,
        responseChannel: null,
        resolvedAt: null,
        resolvedBy: null,
        transferredTo: 'Entidad receptora',
        legalBasis: null,
        identityStatus: 'VERIFICADA',
        identityVerificationMethod: 'COPIA_DOCUMENTO',
        identityVerifiedAt: '2026-10-14T18:00:00.000Z',
        hasRequesterEvidence: false,
        requester: null,
      },
      events: [],
      tasks: [],
    };
    expect(dataSubjectRequestDetailSchema.safeParse(detail).success).toBe(true);
  });
});
