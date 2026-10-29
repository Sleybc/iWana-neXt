import {
  authorizationProofSchema,
  createDataAuthorizationSchema,
  createLegalTextSchema,
  createPrivacyIncidentSchema,
  dataAuthorizationViewSchema,
  legalTextSchema,
  privacyEvidenceResponseSchema,
  reportPrivacyIncidentSchema,
  updatePurposeSettingsSchema,
} from './index';

describe('C-PRIV-API v1.0 — schemas compartidos de privacy', () => {
  it('acepta solo medios de consentimiento vigentes en autorizaciones nuevas', () => {
    const base = {
      partyId: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
      purpose: 'TRATAMIENTO_CONTRACTUAL',
      granted: true,
      legalTextId: '6f199f37-a724-437b-a1e1-723410ec87ee',
    };

    expect(createDataAuthorizationSchema.safeParse({ ...base, channel: 'TELEFONO' }).success).toBe(
      true,
    );
    expect(
      createDataAuthorizationSchema.safeParse({ ...base, channel: 'CRM_CONVERSION' }).success,
    ).toBe(false);
  });

  it('rechaza IP y user agent enviados por el cliente al registrar una autorización', () => {
    const parsed = createDataAuthorizationSchema.safeParse({
      partyId: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
      purpose: 'TRATAMIENTO_CONTRACTUAL',
      granted: true,
      channel: 'EMAIL',
      legalTextId: '6f199f37-a724-437b-a1e1-723410ec87ee',
      ip: '192.0.2.1',
      userAgent: 'Browser test',
    });
    expect(parsed.success).toBe(false);
  });

  it('mantiene IP, user agent y evidencia fuera de la vista 360°', () => {
    const parsed = dataAuthorizationViewSchema.safeParse({
      id: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
      partyId: '6f199f37-a724-437b-a1e1-723410ec87ee',
      purpose: 'CONTACTO_COMERCIAL',
      kind: 'GRANT',
      granted: true,
      channel: 'EMAIL',
      legalTextId: 'f72016bd-f450-45c0-8b64-90216a7e0e9c',
      capturedAt: '2026-10-14T12:00:00.000Z',
      ip: '192.0.2.1',
      userAgent: 'Browser test',
      evidenceMediaId: 'd9f172a1-4cb3-41e5-a51b-03d17f3ea06a',
    });
    expect(parsed.success).toBe(false);
  });

  it('calcula el hash en el servidor y no acepta sha256 en el texto entrante', () => {
    const parsed = createLegalTextSchema.safeParse({
      type: 'AUTORIZACION',
      version: '1.0',
      content: 'Texto de prueba sin datos personales.',
      url: 'https://example.invalid/privacy/1',
      sha256: 'a'.repeat(64),
    });
    expect(parsed.success).toBe(false);
    expect(
      authorizationProofSchema.safeParse({
        legalTextVersion: '1.0',
        sha256: 'a'.repeat(64),
        evidenceUrl: null,
      }).success,
    ).toBe(true);
  });

  it('limita el payload de incidentes a descripción y categorías afectadas', () => {
    expect(
      createPrivacyIncidentSchema.safeParse({
        description: 'Acceso no autorizado a un sistema.',
        affectedCategories: ['Identificación'],
        detectedAt: '2026-10-14T12:00:00.000Z',
        sicReportDueAt: '2026-11-04',
      }).success,
    ).toBe(false);
  });

  it('valida reporte civil de incidente con referencia externa', () => {
    expect(
      reportPrivacyIncidentSchema.safeParse({
        reportedAt: '2026-10-14',
        externalReference: 'SIC-1842',
      }).success,
    ).toBe(true);
    expect(
      reportPrivacyIncidentSchema.safeParse({
        reportedAt: '2026-10-14T12:00:00.000Z',
        externalReference: 'SIC-1842',
      }).success,
    ).toBe(false);
  });

  it('exige isCurrent en la vista de texto legal y valida la respuesta de evidencia', () => {
    const legalText = {
      id: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
      type: 'AUTORIZACION',
      version: '2.0',
      sha256: 'a'.repeat(64),
      content: 'Texto legal.',
      format: 'PLAIN',
      publishedAt: '2026-10-14T12:00:00.000Z',
      url: null,
    };
    expect(legalTextSchema.safeParse(legalText).success).toBe(false);
    expect(legalTextSchema.safeParse({ ...legalText, isCurrent: true }).success).toBe(true);
    expect(
      privacyEvidenceResponseSchema.safeParse({
        mediaId: '3e54ed12-5ad4-4f28-b7de-a8dd227b95c4',
        mimeType: 'application/pdf',
        sizeBytes: 512,
      }).success,
    ).toBe(true);
  });

  it('aplica formato simple por defecto y rechaza finalidades repetidas', () => {
    expect(
      createLegalTextSchema.parse({ type: 'AUTORIZACION', version: '1', content: 'Texto' }).format,
    ).toBe('PLAIN');
    expect(
      updatePurposeSettingsSchema.safeParse({
        items: [
          { purpose: 'CONTACTO_COMERCIAL', enabled: true },
          { purpose: 'CONTACTO_COMERCIAL', enabled: false },
        ],
      }).success,
    ).toBe(false);
  });
});
