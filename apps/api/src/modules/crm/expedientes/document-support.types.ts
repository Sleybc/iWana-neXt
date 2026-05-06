export const DOCUMENT_SUPPORT_STATUS = {
  PENDING: 'PENDING',
  UPLOADED: 'UPLOADED',
  OBSERVED: 'OBSERVED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type DocumentSupportStatus =
  (typeof DOCUMENT_SUPPORT_STATUS)[keyof typeof DOCUMENT_SUPPORT_STATUS];

export interface StoredDocumentSupportVersion {
  id: string;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByUserId: string;
  uploadedByName: string | null;
  status: DocumentSupportStatus;
  note: string | null;
}

export interface StoredDocumentSupportItem {
  versions: StoredDocumentSupportVersion[];
}

export type StoredDocumentSupportMap = Record<string, StoredDocumentSupportItem>;

export interface DocumentSupportDefinition {
  key: string;
  label: string;
  hint: string;
}

export type SupportedDocumentSupportPersonType = 'PERSONA_NATURAL' | 'PERSONA_JURIDICA';

export interface ExpedienteDocumentVersionDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
  status: DocumentSupportStatus;
  note: string | null;
  downloadUrl: string;
}

export interface ExpedienteDocumentItemDto {
  key: string;
  label: string;
  hint: string;
  versions: ExpedienteDocumentVersionDto[];
}

export interface ExpedienteDocumentSummaryDto {
  requiredCount: number;
  uploadedCount: number;
  approvedCount: number;
  blockStatus: 'PENDIENTE' | 'EN_REVISION' | 'OBSERVADO' | 'COMPLETO';
}

export interface ExpedienteDocumentSupportResponseDto {
  personType: string | null;
  items: ExpedienteDocumentItemDto[];
  summary: ExpedienteDocumentSummaryDto;
}

export const NATURAL_PERSON_DOCUMENTS: DocumentSupportDefinition[] = [
  {
    key: 'identity_document',
    label: 'Copia de documento de identidad',
    hint: 'Documento legible por ambas caras, si aplica.',
  },
  {
    key: 'utility_bill',
    label: 'Recibo de servicio público',
    hint: 'Soporte para validar dirección de instalación y estrato.',
  },
];

export const LEGAL_ENTITY_DOCUMENTS: DocumentSupportDefinition[] = [
  {
    key: 'chamber_of_commerce',
    label: 'Cámara de comercio',
    hint: 'Certificado vigente de existencia y representación.',
  },
  {
    key: 'rut',
    label: 'RUT',
    hint: 'Registro tributario vigente de la empresa.',
  },
  {
    key: 'legal_representative_id',
    label: 'Documento del representante legal',
    hint: 'Copia legible del documento de identidad del representante.',
  },
];

const SUPPORTED_DOCUMENT_SUPPORT_PERSON_TYPE_ALIASES: Record<
  string,
  SupportedDocumentSupportPersonType
> = {
  PERSONA_NATURAL: 'PERSONA_NATURAL',
  NATURAL: 'PERSONA_NATURAL',
  PERSONANATURAL: 'PERSONA_NATURAL',
  TIPO_PERSONA_NATURAL: 'PERSONA_NATURAL',
  PERSONA_JURIDICA: 'PERSONA_JURIDICA',
  JURIDICA: 'PERSONA_JURIDICA',
  PERSONAJURIDICA: 'PERSONA_JURIDICA',
  TIPO_PERSONA_JURIDICA: 'PERSONA_JURIDICA',
};

function normalizePersonType(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function isLegalEntityPersonType(value: string | null | undefined): boolean {
  return resolveSupportedDocumentSupportPersonType(value) === 'PERSONA_JURIDICA';
}

export function resolveSupportedDocumentSupportPersonType(
  value: string | null | undefined,
): SupportedDocumentSupportPersonType | null {
  const normalized = normalizePersonType(value);
  if (!normalized) {
    return null;
  }

  return SUPPORTED_DOCUMENT_SUPPORT_PERSON_TYPE_ALIASES[normalized] ?? null;
}

export function getDocumentDefinitionsByPersonType(
  personType: string | null | undefined,
): DocumentSupportDefinition[] {
  return isLegalEntityPersonType(personType) ? LEGAL_ENTITY_DOCUMENTS : NATURAL_PERSON_DOCUMENTS;
}
