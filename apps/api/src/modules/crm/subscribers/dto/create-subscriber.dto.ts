import { Allow } from 'class-validator';
import { PersonType, CustomerSegment, DocumentType } from '@iwana/shared';

export { CreateSubscriberSchema } from '@iwana/shared';

/**
 * Clase DTO para NestJS (compatible con class-validator pipe).
 * La validación real la hace ZodBodyValidationPipe con el schema.
 */
export class CreateSubscriberDto {
  @Allow()
  personType!: PersonType;

  @Allow()
  customerSegment!: CustomerSegment;

  @Allow()
  documentType?: DocumentType;

  @Allow()
  documentNumber?: string;

  @Allow()
  firstName?: string;

  @Allow()
  lastName?: string;

  @Allow()
  stratum?: number;

  @Allow()
  birthDate?: string;

  @Allow()
  nit?: string;

  @Allow()
  nitVerificationDigit?: string;

  @Allow()
  businessName?: string;

  @Allow()
  commercialName?: string;

  @Allow()
  legalRepresentativeId?: string;

  @Allow()
  email!: string;

  @Allow()
  phone!: string;

  @Allow()
  altContactName?: string;

  @Allow()
  altContactPhone?: string;

  @Allow()
  whatsapp?: string;

  @Allow()
  address!: string;

  @Allow()
  neighborhood?: string;

  @Allow()
  city?: string;

  @Allow()
  department?: string;

  @Allow()
  postalCode?: string;

  @Allow()
  latitude?: number;

  @Allow()
  longitude?: number;

  @Allow()
  coverageNodeId?: string;

  @Allow()
  externalId?: string;

  @Allow()
  expedienteId?: string;

  @Allow()
  manualOverrideReason?: string;
}
