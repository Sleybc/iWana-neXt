import {
  completeRequestSchema,
  createDataSubjectRequestSchema,
  dataSubjectRequestDetailSchema,
  extendRequestSchema,
  requireInfoRequestSchema,
  rejectRequestSchema,
  resolveRequestSchema,
  transferRequestSchema,
  verifyIdentityRequestSchema,
} from './requests';

describe('contratos de solicitudes de privacidad v1.1', () => {
  const base = {
    kind: 'RECLAMO',
    right: 'REVOCAR',
    purpose: 'CONTACTO_COMERCIAL',
    requesterKind: 'TITULAR',
    requesterName: 'Persona de prueba',
    requesterDocumentType: 'CC',
    requesterDocument: '1234567',
    requesterContact: 'fixture@example.invalid',
    requesterEvidenceMediaId: 'f8a1ee38-4d89-4b2a-9b5d-70f53ff43f09',
    identityVerificationMethod: 'COPIA_DOCUMENTO',
    partyId: 'aa4f2f0b-84dc-4fc0-9dd9-99e9ca29996c',
    receivedAt: '2026-07-06',
  };

  it('exige finalidad solo en REVOCAR', () => {
    expect(createDataSubjectRequestSchema.safeParse(base).success).toBe(true);
    expect(createDataSubjectRequestSchema.safeParse({ ...base, right: 'CONOCER' }).success).toBe(
      false,
    );
    expect(createDataSubjectRequestSchema.safeParse({ ...base, purpose: undefined }).success).toBe(
      false,
    );
  });

  it('rechaza que el cliente establezca actor o marcas de verificación', () => {
    expect(
      createDataSubjectRequestSchema.safeParse({ ...base, identityVerifiedBy: 'actor' }).success,
    ).toBe(false);
  });

  it('rechaza fechas civiles imposibles', () => {
    expect(
      createDataSubjectRequestSchema.safeParse({ ...base, receivedAt: '2026-02-31' }).success,
    ).toBe(false);
  });

  it('permite radicar consulta o reclamo sin verificar y exige verificación para suplantación', () => {
    const {
      identityVerificationMethod: _method,
      requesterEvidenceMediaId: _evidence,
      ...unverified
    } = base;
    expect(
      createDataSubjectRequestSchema.safeParse({
        ...unverified,
        right: 'CONOCER',
        purpose: undefined,
      }).success,
    ).toBe(true);
    expect(
      createDataSubjectRequestSchema.safeParse({ ...unverified, kind: 'SUPLANTACION' }).success,
    ).toBe(false);
    expect(
      createDataSubjectRequestSchema.safeParse({
        ...unverified,
        kind: 'SUPLANTACION',
        right: 'CONOCER',
        purpose: undefined,
        identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        partyId: base.partyId,
        disputedContractIds: [base.partyId],
      }).success,
    ).toBe(true);
    expect(
      createDataSubjectRequestSchema.safeParse({
        ...unverified,
        kind: 'SUPLANTACION',
        right: 'CONOCER',
        purpose: undefined,
        identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
        partyId: base.partyId,
      }).success,
    ).toBe(false);
  });

  it('valida la verificación diferida según tipo de solicitante', () => {
    expect(
      verifyIdentityRequestSchema.safeParse({
        identityVerificationMethod: 'DOCUMENTO_PRESENCIAL',
      }).success,
    ).toBe(true);
    expect(
      verifyIdentityRequestSchema.safeParse({
        identityVerificationMethod: 'COPIA_DOCUMENTO',
        requesterEvidenceMediaId: base.requesterEvidenceMediaId,
      }).success,
    ).toBe(true);
    expect(
      verifyIdentityRequestSchema.safeParse({
        identityVerificationMethod: 'COPIA_DOCUMENTO',
      }).success,
    ).toBe(false);
    expect(
      verifyIdentityRequestSchema.safeParse({
        identityVerificationMethod: 'DECLARACION_CAUSAHABIENTE',
      }).success,
    ).toBe(false);
  });

  it('valida los cuerpos versionados de las seis transiciones', () => {
    expect(
      requireInfoRequestSchema.safeParse({
        missingItems: 'Falta la identificación',
        channel: 'EMAIL',
      }).success,
    ).toBe(true);
    expect(completeRequestSchema.safeParse({ completedAt: '2026-04-10' }).success).toBe(true);
    expect(extendRequestSchema.safeParse({ reason: 'Motivo suficiente' }).success).toBe(true);
    expect(
      resolveRequestSchema.safeParse({
        responseText: 'Respuesta',
        responseChannel: 'EMAIL',
        dataChangeReference: 'CRM-123',
      }).success,
    ).toBe(true);
    expect(
      rejectRequestSchema.safeParse({
        responseText: 'Respuesta',
        responseChannel: 'EMAIL',
        legalBasis: 'DEBER_LEGAL_CONSERVACION',
      }).success,
    ).toBe(true);
    expect(
      transferRequestSchema.safeParse({
        transferredTo: 'Entidad receptora',
        reason: 'Competencia asignada a otra entidad',
        channel: 'EMAIL',
      }).success,
    ).toBe(true);
    expect(extendRequestSchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('valida el contrato del detalle con identidad y evidencia sin identificadores internos', () => {
    const request = {
      id: '60000000-0000-4000-8000-000000000001',
      partyId: null,
      requesterKind: 'TITULAR',
      kind: 'CONSULTA',
      right: 'CONOCER',
      purpose: null,
      status: 'RADICADA',
      receivedAt: '2026-10-14T17:00:00.000Z',
      completeAt: null,
      dueAt: '2026-10-28',
      impersonationComplaintDueAt: null,
      suspendedContractIds: [],
      extendedUntil: null,
      infoRequiredAt: null,
      desistAt: null,
      responseText: null,
      responseChannel: null,
      resolvedAt: null,
      resolvedBy: null,
      transferredTo: null,
      legalBasis: null,
      identityStatus: 'PENDIENTE',
      identityVerificationMethod: null,
      identityVerifiedAt: null,
      hasRequesterEvidence: false,
      requester: null,
    };
    const detail = {
      request,
      events: [
        {
          id: '60000000-0000-4000-8000-000000000002',
          fromStatus: null,
          toStatus: 'RADICADA',
          reason: 'RADICACION',
          occurredAt: '2026-10-14T17:00:00.000Z',
        },
      ],
      tasks: [],
    };

    expect(dataSubjectRequestDetailSchema.safeParse(detail).success).toBe(true);
    expect(
      dataSubjectRequestDetailSchema.safeParse({
        ...detail,
        request: {
          ...request,
          hasRequesterEvidence: true,
          requester: {
            name: 'Solicitante ficticio',
            documentType: 'CC',
            document: '1234567',
            contact: 'fixture@example.invalid',
            mediaId: '60000000-0000-4000-8000-000000000003',
          },
        },
      }).success,
    ).toBe(false);
    expect(
      dataSubjectRequestDetailSchema.safeParse({
        ...detail,
        events: [{ ...detail.events[0], actorId: '60000000-0000-4000-8000-000000000004' }],
      }).success,
    ).toBe(false);
  });
});
