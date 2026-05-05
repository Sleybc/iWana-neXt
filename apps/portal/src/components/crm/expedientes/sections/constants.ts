import { BriefcaseBusiness, MapPin, Phone, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import type {
  CompletenessResult,
  ExpedienteRecord,
  SectionCompletenessItem,
} from '@/lib/api-client';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  DOCUMENT_TYPE_OPTIONS,
  EVALUATION_SOURCE_OPTIONS,
  TECHNICAL_CONFIDENCE_OPTIONS,
  TECHNICAL_VIABILITY_RESULT_OPTIONS,
  TECHNOLOGY_OPTION_OPTIONS,
  getMunicipiosByDepartamento,
} from '@/components/crm/expedientes/expediente-ui';
import type { CompletenessDimension, DraftValues, SectionConfig, SectionId } from './types';

export {
  ACQUISITION_CHANNEL_OPTIONS,
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  DOCUMENT_TYPE_OPTIONS,
  EVALUATION_SOURCE_OPTIONS,
  TECHNICAL_CONFIDENCE_OPTIONS,
  TECHNICAL_VIABILITY_RESULT_OPTIONS,
  TECHNOLOGY_OPTION_OPTIONS,
  getMunicipiosByDepartamento,
};

export const EMPTY_VALUE = '';

export const BACKEND_SECTION_KEY_BY_UI_SECTION: Record<SectionId | 'document_support', string> = {
  identification: 'identification',
  contact: 'contact',
  location: 'address',
  commercial_interest: 'customerInterest',
  technical_feasibility: 'technicalFeasibility',
  legal_consent: 'legalCompliance',
  document_support: 'documentSupport',
};

const NATURAL_PERSON_DOCUMENT_KEYS = ['identity_document', 'utility_bill'] as const;
const LEGAL_ENTITY_DOCUMENT_KEYS = [
  'chamber_of_commerce',
  'rut',
  'legal_representative_id',
] as const;

function normalizePersonType(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isLegalEntityPersonType(value: string | null | undefined): boolean {
  const normalized = normalizePersonType(value);
  return (
    normalized === 'PERSONA_JURIDICA' ||
    normalized === 'JURIDICA' ||
    normalized === 'PERSONAJURIDICA' ||
    normalized === 'TIPO_PERSONA_JURIDICA'
  );
}

function getRequiredDocumentKeysByPersonType(
  personType: string | null | undefined,
): readonly string[] {
  return isLegalEntityPersonType(personType)
    ? LEGAL_ENTITY_DOCUMENT_KEYS
    : NATURAL_PERSON_DOCUMENT_KEYS;
}

export function calculateDocumentSupportCompletion(
  personType: string | null | undefined,
  documentSupports: ExpedienteRecord['documentSupports'],
): number {
  const requiredDocumentKeys = getRequiredDocumentKeysByPersonType(personType);

  if (requiredDocumentKeys.length === 0) {
    return 0;
  }

  const supports = documentSupports && typeof documentSupports === 'object' ? documentSupports : {};

  const uploadedCount = requiredDocumentKeys.filter((key) => {
    const item = supports[key];
    return (
      item &&
      typeof item === 'object' &&
      Array.isArray((item as { versions?: unknown[] }).versions) &&
      ((item as { versions?: unknown[] }).versions?.length ?? 0) > 0
    );
  }).length;

  return Math.round((uploadedCount / requiredDocumentKeys.length) * 100);
}

export function getBackendSectionCompletion(
  sectionCompleteness: SectionCompletenessItem[] | null | undefined,
  sectionId: SectionId | 'document_support',
): number | null {
  const backendKey = BACKEND_SECTION_KEY_BY_UI_SECTION[sectionId];
  const match = sectionCompleteness?.find((section) => section.key === backendKey);
  return typeof match?.percentage === 'number' ? match.percentage : null;
}

export const FIELD_LABELS: Record<string, string> = {
  fullName: 'Nombre completo',
  personType: 'Tipo de persona',
  documentType: 'Tipo de documento',
  documentNumber: 'Número de documento',
  firstName: 'Nombres',
  lastName: 'Apellidos',
  companyName: 'Razón social',
  primaryContactName: 'Nombre del contacto principal',
  primaryContactRole: 'Cargo del contacto',
  phonePrimary: 'Teléfono principal',
  emailPrimary: 'Correo principal',
  altContactName: 'Nombre contacto alternativo',
  altContactPhone: 'Teléfono contacto alternativo',
  address: 'Dirección',
  municipality: 'Municipio',
  department: 'Departamento',
  postalCode: 'Código postal',
  stratum: 'Estrato',
  neighborhood: 'Sector / Barrio',
  latitude: 'Latitud',
  longitude: 'Longitud',
  interestedPlanId: 'Plan de interés',
  additionalProductIds: 'Productos adicionales',
  additionalServiceIds: 'Servicios adicionales',
  acquisitionChannel: 'Canal de captación',
  sourceDetail: 'Detalle de origen',
  coverageResult: 'Referencia de cobertura',
  feasibility: 'Resultado de viabilidad',
  candidateTechnologies: 'Opciones viables',
  availableTechnology: 'Opción principal recomendada',
  technicalConfidence: 'Nivel de certeza',
  evaluationSource: 'Fuente de evaluación',
  technicalObservations: 'Observación técnica',
  identityVerified: 'Identidad verificada',
  legalComplianceStatus: 'Tratamiento de datos personales',
};

export const FIELD_PLACEHOLDERS: Record<string, string> = {
  fullName: 'Nombre o razón social',
  personType: 'Persona natural o jurídica',
  documentType: 'CC, NIT, CE...',
  documentNumber: 'Número del documento',
  firstName: 'Nombres del titular',
  lastName: 'Apellidos del titular',
  companyName: 'Nombre de la empresa',
  primaryContactName: 'Nombre del contacto',
  primaryContactRole: 'Gerente, representante...',
  phonePrimary: '3001234567',
  emailPrimary: 'cliente@empresa.co',
  altContactName: 'Nombre de quien puede contactar',
  altContactPhone: '3001234567',
  address: 'Dirección principal',
  municipality: 'Selecciona el municipio',
  department: 'Cundinamarca',
  postalCode: '252601',
  stratum: 'Estrato 0 a 6',
  neighborhood: 'Barrio o vereda',
  latitude: '4.7110',
  longitude: '-74.0721',
  interestedPlanId: 'Plan o referencia comercial',
  additionalProductIds: 'Productos adicionales',
  additionalServiceIds: 'Servicios adicionales',
  acquisitionChannel: 'Canal de adquisición',
  sourceDetail: 'Detalle de campaña u observación',
  coverageResult: 'Contexto de cobertura (opcional)',
  feasibility: 'Selecciona el resultado técnico',
  technicalObservations: 'Explica brevemente el criterio técnico aplicado',
  identityVerified: 'Verificado / Sin verificar',
  legalComplianceStatus: 'Autoriza / No autoriza',
};

const IDENTIFICATION_FIELDS_BASE = ['personType', 'documentType', 'documentNumber'] as const;
const IDENTIFICATION_FIELDS_NATURAL = [
  ...IDENTIFICATION_FIELDS_BASE,
  'firstName',
  'lastName',
] as const;
const IDENTIFICATION_FIELDS_JURIDICA = [
  ...IDENTIFICATION_FIELDS_BASE,
  'companyName',
  'primaryContactName',
  'primaryContactRole',
] as const;

export function getIdentificationRelevantFields(
  personType: string | null | undefined,
): readonly string[] {
  if (personType === 'PERSONA_JURIDICA') {
    return IDENTIFICATION_FIELDS_JURIDICA;
  }
  return IDENTIFICATION_FIELDS_NATURAL;
}

export function hasPersistedIdentificationData(values: DraftValues): boolean {
  const relevantFields = getIdentificationRelevantFields(values.personType);
  return relevantFields.some((field) => values[field]?.trim());
}

export const SECTIONS: SectionConfig[] = [
  {
    id: 'identification',
    label: 'Identificación',
    description: 'Datos base del titular o razón social.',
    icon: UserRound,
    renderFields: [...IDENTIFICATION_FIELDS_NATURAL, ...IDENTIFICATION_FIELDS_JURIDICA.slice(3)],
    payloadFields: [...IDENTIFICATION_FIELDS_NATURAL, ...IDENTIFICATION_FIELDS_JURIDICA.slice(3)],
    completionFields: [
      ...IDENTIFICATION_FIELDS_NATURAL,
      ...IDENTIFICATION_FIELDS_JURIDICA.slice(3),
    ],
  },
  {
    id: 'contact',
    label: 'Contacto',
    description: 'Canales directos para seguimiento comercial.',
    icon: Phone,
    renderFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
    payloadFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
    completionFields: ['phonePrimary', 'emailPrimary', 'altContactName', 'altContactPhone'],
  },
  {
    id: 'location',
    label: 'Dirección',
    description: 'dirección del cliente potencial',
    icon: MapPin,
    renderFields: [
      'department',
      'municipality',
      'address',
      'postalCode',
      'stratum',
      'neighborhood',
      'latitude',
      'longitude',
    ],
    payloadFields: [
      'department',
      'municipality',
      'address',
      'postalCode',
      'stratum',
      'neighborhood',
      'latitude',
      'longitude',
    ],
    completionFields: [
      'department',
      'municipality',
      'address',
      'postalCode',
      'stratum',
      'neighborhood',
      'latitude',
      'longitude',
    ],
  },
  {
    id: 'commercial_interest',
    label: 'Interés del cliente',
    description: 'Plan deseado y origen de la oportunidad.',
    icon: BriefcaseBusiness,
    renderFields: [
      'interestedPlanId',
      'additionalProductIds',
      'additionalServiceIds',
      'acquisitionChannel',
      'sourceDetail',
    ],
    payloadFields: [
      'interestedPlanId',
      'additionalProductIds',
      'additionalServiceIds',
      'acquisitionChannel',
      'sourceDetail',
    ],
    completionFields: ['interestedPlanId', 'acquisitionChannel'],
  },
  {
    id: 'technical_feasibility',
    label: 'Viabilidad técnica',
    description: 'Decisión técnica con alternativas viables y opción principal.',
    icon: Wrench,
    renderFields: [
      'coverageResult',
      'feasibility',
      'candidateTechnologies',
      'availableTechnology',
      'technicalConfidence',
      'evaluationSource',
      'technicalObservations',
    ],
    payloadFields: [
      'coverageResult',
      'feasibility',
      'candidateTechnologies',
      'availableTechnology',
      'technicalConfidence',
      'evaluationSource',
      'technicalObservations',
    ],
    completionFields: [
      'feasibility',
      'candidateTechnologies',
      'evaluationSource',
      'technicalConfidence',
    ],
  },
  {
    id: 'legal_consent',
    label: 'Cumplimiento legal',
    description: 'Confirma verificación de identidad y autorización de tratamiento de datos.',
    icon: ShieldCheck,
    renderFields: ['identityVerified', 'legalComplianceStatus'],
    payloadFields: ['identityVerified', 'legalComplianceStatus'],
    completionFields: ['identityVerified', 'legalComplianceStatus'],
  },
];

export const DIMENSION_SECTION_GROUPS: Record<CompletenessDimension, readonly SectionId[]> = {
  commercial: ['identification', 'contact', 'commercial_interest'],
  legal: ['legal_consent'],
  technical: ['location', 'technical_feasibility'],
  operational: [],
};

export function getSectionRenderFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.renderFields ?? [];
}

export function getSectionPayloadFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.payloadFields ?? [];
}

export function getSectionCompletionFields(
  sectionId: SectionId,
  personType: string | null | undefined,
): readonly string[] {
  if (sectionId === 'identification') {
    return getIdentificationRelevantFields(personType);
  }

  const section = SECTIONS.find((current) => current.id === sectionId);
  return section?.completionFields ?? [];
}

export function buildDraftValues(
  expediente: ExpedienteRecord,
  previous: DraftValues = {},
): DraftValues {
  return {
    ...previous,
    fullName: expediente.fullName ?? EMPTY_VALUE,
    personType: expediente.personType ?? EMPTY_VALUE,
    documentType: expediente.documentType ?? EMPTY_VALUE,
    documentNumber: expediente.documentNumber ?? previous.documentNumber ?? EMPTY_VALUE,
    firstName: expediente.firstName ?? EMPTY_VALUE,
    lastName: expediente.lastName ?? EMPTY_VALUE,
    companyName: expediente.companyName ?? EMPTY_VALUE,
    primaryContactName: expediente.primaryContactName ?? EMPTY_VALUE,
    primaryContactRole: expediente.primaryContactRole ?? EMPTY_VALUE,
    phonePrimary: expediente.phonePrimary ?? previous.phonePrimary ?? EMPTY_VALUE,
    emailPrimary: expediente.emailPrimary ?? previous.emailPrimary ?? EMPTY_VALUE,
    altContactName: expediente.altContactName ?? EMPTY_VALUE,
    altContactPhone: expediente.altContactPhone ?? previous.altContactPhone ?? EMPTY_VALUE,
    address: expediente.address ?? EMPTY_VALUE,
    municipality: expediente.municipality ?? EMPTY_VALUE,
    department: expediente.department ?? DEPARTAMENTO_DEFAULT,
    postalCode: expediente.postalCode ?? EMPTY_VALUE,
    stratum: expediente.stratum != null ? String(expediente.stratum) : EMPTY_VALUE,
    neighborhood: expediente.neighborhood ?? EMPTY_VALUE,
    latitude: expediente.latitude != null ? String(expediente.latitude) : EMPTY_VALUE,
    longitude: expediente.longitude != null ? String(expediente.longitude) : EMPTY_VALUE,
    interestedPlanId: expediente.interestedPlanId ?? EMPTY_VALUE,
    additionalProductIds: expediente.additionalProductIds
      ? JSON.stringify(expediente.additionalProductIds)
      : '[]',
    additionalServiceIds: expediente.additionalServiceIds
      ? JSON.stringify(expediente.additionalServiceIds)
      : '[]',
    acquisitionChannel: expediente.acquisitionChannel ?? 'OTRO',
    sourceDetail: expediente.sourceDetail ?? EMPTY_VALUE,
    coverageResult: expediente.coverageResult ?? EMPTY_VALUE,
    feasibility: expediente.feasibility ?? EMPTY_VALUE,
    candidateTechnologies: expediente.candidateTechnologies?.join(',') ?? EMPTY_VALUE,
    availableTechnology: expediente.availableTechnology ?? EMPTY_VALUE,
    technicalConfidence: expediente.technicalConfidence ?? EMPTY_VALUE,
    evaluationSource: expediente.evaluationSource ?? EMPTY_VALUE,
    technicalObservations: expediente.technicalObservations ?? EMPTY_VALUE,
    identityVerified: expediente.identityVerified ?? EMPTY_VALUE,
    legalComplianceStatus: expediente.legalComplianceStatus ?? EMPTY_VALUE,
  };
}

export function getCandidateTechnologiesFromDraft(values: DraftValues): string[] {
  const rawValue = values.candidateTechnologies ?? EMPTY_VALUE;
  return rawValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function calculateSectionCompletion(fields: readonly string[], values: DraftValues): number {
  if (fields.length === 0) {
    return 0;
  }

  const completedFields = fields.filter((field) => values[field]?.trim()).length;
  return Math.round((completedFields / fields.length) * 100);
}

export function calculateDimensionCompletion(
  sectionIds: readonly SectionId[],
  sectionCompletionById: Record<string, number>,
): number {
  if (sectionIds.length === 0) {
    return 0;
  }

  return Math.round(
    sectionIds.reduce((sum, sectionId) => sum + (sectionCompletionById[sectionId] ?? 0), 0) /
      sectionIds.length,
  );
}

export function getProtectedFieldHelper(
  expediente: ExpedienteRecord,
  field: string,
): string | undefined {
  if (field === 'phonePrimary' && expediente.phonePrimaryEncrypted) {
    return 'Teléfono protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  if (field === 'emailPrimary' && expediente.emailPrimaryEncrypted) {
    return 'Correo protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  if (field === 'altContactPhone' && expediente.altContactPhoneEncrypted) {
    return 'Teléfono protegido ya registrado. Si lo editas, el valor actual se reemplazará.';
  }

  return undefined;
}

export const DEFAULT_PRODUCTS = [
  { id: 'default-tvbox', name: 'TvBox', category: 'ENTERTAINMENT' },
  { id: 'default-decoder', name: 'Decodificador adicional', category: 'ENTERTAINMENT' },
  { id: 'default-camaras', name: 'Cámaras de seguridad', category: 'SECURITY' },
  { id: 'default-dvr', name: 'DVR / NVR', category: 'SECURITY' },
  { id: 'default-alarma', name: 'Alarma residencial', category: 'SECURITY' },
  { id: 'default-router', name: 'Router WiFi mesh', category: 'CONNECTIVITY' },
  { id: 'default-extensor', name: 'Extensor de cobertura', category: 'CONNECTIVITY' },
  { id: 'default-ip', name: 'IP estática', category: 'CONNECTIVITY' },
  { id: 'default-soporte', name: 'Soporte prioritario', category: 'BUSINESS' },
  { id: 'default-linea', name: 'Línea telefónica adicional', category: 'BUSINESS' },
] as const;
