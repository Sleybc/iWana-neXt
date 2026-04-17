import { Allow } from 'class-validator';
import { PersonType, CustomerSegment, DocumentType } from '@iwana/shared';

export { UpdateSubscriberSchema } from '@iwana/shared';

export class UpdateSubscriberDto {
  @Allow()
  personType?: PersonType;

  @Allow()
  customerSegment?: CustomerSegment;

  @Allow()
  documentType?: DocumentType;

  @Allow()
  documentNumber?: string;

  @Allow()
  firstName?: string;

  @Allow()
  lastName?: string;

  @Allow()
  stratum?: number | null;

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
  email?: string;

  @Allow()
  phone?: string;

  @Allow()
  altContactName?: string;

  @Allow()
  altContactPhone?: string;

  @Allow()
  whatsapp?: string;

  @Allow()
  address?: string;

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
  expedienteId?: string | null;

  @Allow()
  manualOverrideReason?: string | null;
}
