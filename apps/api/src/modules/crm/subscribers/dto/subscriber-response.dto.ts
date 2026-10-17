import type {
  RutResponsibility,
  SubscriberFiscalCompleteness,
  VatResponsibility,
} from '@iwana/shared';

/**
 * DTO de respuesta del suscriptor con PII descifrado.
 * Se usa para serializar la respuesta del controller.
 */
export class SubscriberResponseDto {
  id!: string;
  tenantId!: string;
  userId!: string | null;
  personType!: string;
  customerSegment!: string;

  // Persona natural
  documentType!: string | null;
  documentNumber!: string | null;
  firstName!: string | null;
  lastName!: string | null;
  stratum!: number | null;
  birthDate!: string | null;

  // Persona jurídica
  nit!: string | null;
  nitVerificationDigit!: string | null;
  businessName!: string | null;
  commercialName!: string | null;
  legalRepresentative!: { partyId: string; displayName: string } | null;

  // Compartido
  email!: string;
  phone!: string;
  altContactName!: string | null;
  altContactPhone!: string | null;
  whatsapp!: string | null;

  // Fiscal
  vatTreatment!: string;
  vatResponsibility!: VatResponsibility | null;
  rutResponsibilities!: RutResponsibility[];
  fiscalCompleteness!: SubscriberFiscalCompleteness;
  /** @deprecated Columna legada que la API ya no escribe. */
  taxRegime!: string | null;

  // Ubicación
  address!: string;
  neighborhood!: string | null;
  city!: string | null;
  department!: string | null;
  postalCode!: string | null;
  latitude!: number | null;
  longitude!: number | null;

  // Cobertura
  coverageNodeId!: string | null;

  // Ciclo de vida
  status!: string;
  externalId!: string | null;

  // Auditoría
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
}
