import { ExpedienteSectionCompletenessService } from '../expediente-section-completeness.service';
import { ExpedienteRecord } from '../entities/expediente-record.entity';

describe('ExpedienteSectionCompletenessService', () => {
  const service = new ExpedienteSectionCompletenessService();

  it('expone los campos incompletos de una oportunidad nueva y bloquea instalación', () => {
    const result = service.calculateSummary({
      expediente: buildExpediente(),
      consents: [],
      quotes: [],
      coverageChecks: [],
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'identification', percentage: 25 }),
        expect.objectContaining({ key: 'address', percentage: 0 }),
        expect.objectContaining({ key: 'contact', percentage: 0 }),
        expect.objectContaining({ key: 'technicalFeasibility', percentage: 0 }),
        expect.objectContaining({ key: 'customerInterest', percentage: 50 }),
        expect.objectContaining({ key: 'legalCompliance', percentage: 0 }),
        expect.objectContaining({ key: 'documentSupport', percentage: 0 }),
      ]),
    );
    expect(result.missingRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sectionKey: 'contact', fieldKey: 'phonePrimaryEncrypted' }),
        expect.objectContaining({ sectionKey: 'documentSupport', fieldKey: 'identity_document' }),
      ]),
    );
    expect(result.installationReadiness).toEqual(
      expect.objectContaining({ status: 'NOT_READY', canTransition: false }),
    );
  });

  it('usa la presencia proyectada para completar los datos protegidos', () => {
    const expediente = buildExpediente({
      personType: 'PERSONA_JURIDICA',
      documentType: 'NIT',
      acquisitionChannel: 'REFERIDO',
      interestedPlanId: 'plan-sintetico',
      feasibility: 'VIABLE',
      candidateTechnologies: ['FIBER'],
      evaluationSource: 'VISITA_TECNICA',
      technicalConfidence: 'HIGH',
      identityVerified: 'verified',
      legalComplianceStatus: 'COMPLIANT',
    });
    const result = service.calculateSummary({
      expediente,
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence: {
        documentNumber: true,
        phonePrimary: true,
        emailPrimary: true,
        altContactPhone: true,
        companyName: true,
        altContactName: true,
        paymentMethod: true,
        billingCycle: true,
        fiscalName: true,
        hasAddress: true,
        hasMunicipality: true,
        hasDepartment: true,
        hasPostalCode: true,
        hasStratum: true,
        hasNeighborhood: true,
        hasLatitude: true,
        hasLongitude: true,
        documentSupportApproved: {
          chamber_of_commerce: true,
          rut: true,
          legal_representative_id: true,
        },
      },
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'identification', percentage: 100 }),
        expect.objectContaining({ key: 'address', percentage: 100 }),
        expect.objectContaining({ key: 'contact', percentage: 100 }),
        expect.objectContaining({ key: 'technicalFeasibility', percentage: 100 }),
        expect.objectContaining({ key: 'customerInterest', percentage: 100 }),
        expect.objectContaining({ key: 'legalCompliance', percentage: 100 }),
        expect.objectContaining({ key: 'documentSupport', percentage: 100 }),
      ]),
    );
    expect(result.installationReadiness).toEqual(
      expect.objectContaining({ status: 'READY_COMPLETE', canTransition: true }),
    );
  });

  it('respeta flags negativos aunque la entidad tenga valores y permite continuar con pendientes', () => {
    const result = service.calculateSummary({
      expediente: buildExpediente({
        companyName: 'Empresa sintética',
        documentType: 'NIT',
        documentNumberEncrypted: 'cipher-documento',
        phonePrimaryEncrypted: 'cipher-telefono',
        emailPrimaryEncrypted: 'cipher-correo',
        altContactName: 'Contacto sintético',
        altContactPhoneEncrypted: 'cipher-alterno',
        address: 'Dirección sintética',
        municipality: 'Municipio sintético',
        department: 'Departamento sintético',
        postalCode: '00000',
        stratum: 2,
        neighborhood: 'Sector sintético',
        latitude: 4.5,
        longitude: -74,
        personType: 'PERSONA_NATURAL',
        documentSupports: {
          identity_document: { versions: [{ status: 'APPROVED' }] },
          utility_bill: { versions: [{ status: 'APPROVED' }] },
        },
      }),
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence: {
        documentNumber: false,
        phonePrimary: false,
        emailPrimary: false,
        altContactPhone: false,
        companyName: false,
        altContactName: false,
        hasAddress: false,
        hasMunicipality: false,
        hasDepartment: false,
        hasPostalCode: false,
        hasStratum: false,
        hasNeighborhood: false,
        hasLatitude: false,
        hasLongitude: false,
        documentSupportApproved: { identity_document: false, utility_bill: false },
      },
    });

    expect(result.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'identification', percentage: 75 }),
        expect.objectContaining({ key: 'address', percentage: 0 }),
        expect.objectContaining({ key: 'contact', percentage: 0 }),
        expect.objectContaining({ key: 'documentSupport', percentage: 0 }),
      ]),
    );
    expect(result.installationReadiness).toEqual(
      expect.objectContaining({ status: 'NOT_READY', canTransition: false }),
    );
  });

  it('permite continuar cuando solo faltan los soportes documentales', () => {
    const result = service.calculateSummary({
      expediente: buildExpediente({
        fullName: 'Empresa sintética',
        personType: 'PERSONA_NATURAL',
        documentType: 'CC',
        documentNumberEncrypted: 'cipher-documento',
        address: 'Dirección sintética',
        municipality: 'Municipio sintético',
        department: 'Departamento sintético',
        postalCode: '00000',
        stratum: 2,
        neighborhood: 'Sector sintético',
        phonePrimaryEncrypted: 'cipher-telefono',
        emailPrimaryEncrypted: 'cipher-correo',
        altContactName: 'Contacto sintético',
        altContactPhoneEncrypted: 'cipher-alterno',
        feasibility: 'VIABLE',
        candidateTechnologies: ['FIBER'],
        evaluationSource: 'VISITA_TECNICA',
        technicalConfidence: 'HIGH',
        latitude: 4.5,
        longitude: -74,
        acquisitionChannel: 'REFERIDO',
        interestedPlanId: 'plan-sintetico',
        identityVerified: 'verified',
        legalComplianceStatus: 'COMPLIANT',
      }),
      consents: [],
      quotes: [],
      coverageChecks: [],
      sensitiveFieldPresence: {
        documentNumber: true,
        phonePrimary: true,
        emailPrimary: true,
        altContactPhone: true,
        companyName: true,
        altContactName: true,
        hasAddress: true,
        hasMunicipality: true,
        hasDepartment: true,
        hasPostalCode: true,
        hasStratum: true,
        hasNeighborhood: true,
        hasLatitude: true,
        hasLongitude: true,
        documentSupportApproved: { identity_document: false, utility_bill: false },
      },
    });

    expect(result.overallPercentage).toBe(86);
    expect(result.installationReadiness).toEqual(
      expect.objectContaining({ status: 'READY_WITH_PENDING', canTransition: true }),
    );
  });
});

function buildExpediente(overrides: Partial<ExpedienteRecord> = {}): ExpedienteRecord {
  return {
    id: 'exp-test',
    fullName: 'Oportunidad sintética',
    personType: null,
    documentType: null,
    documentNumberEncrypted: null,
    companyName: null,
    address: null,
    municipality: null,
    department: null,
    postalCode: null,
    stratum: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    phonePrimaryEncrypted: null,
    emailPrimaryEncrypted: null,
    altContactName: null,
    altContactPhoneEncrypted: null,
    feasibility: null,
    candidateTechnologies: null,
    evaluationSource: null,
    technicalConfidence: null,
    acquisitionChannel: 'WEB',
    source: '',
    interestedPlanId: null,
    identityVerified: null,
    legalComplianceStatus: null,
    documentSupports: null,
    ...overrides,
  } as ExpedienteRecord;
}
