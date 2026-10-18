import { Allow } from 'class-validator';
import { Type } from 'class-transformer';
import {
  PersonType,
  CustomerSegment,
  ConsentChannel,
  DocumentType,
  VatResponsibility,
  type RutResponsibility,
  type DataPurpose,
} from '@iwana/shared';

export { CreateSubscriberSchema } from '@iwana/shared';

export class CreateSubscriberLegalRepresentativeDto {
  @Allow()
  fullName!: string;

  @Allow()
  documentType!: DocumentType;

  @Allow()
  documentNumber!: string;
}

export class CreateSubscriberAuthorizationDto {
  @Allow()
  purpose!: DataPurpose;

  @Allow()
  granted!: boolean;

  @Allow()
  legalTextId!: string;
}

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
  @Type(() => CreateSubscriberLegalRepresentativeDto)
  legalRepresentative?: CreateSubscriberLegalRepresentativeDto;

  @Allow()
  vatResponsibility!: VatResponsibility;

  @Allow()
  rutResponsibilities!: RutResponsibility[];

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

  @Allow()
  authorizationChannel?: ConsentChannel;

  @Allow()
  @Type(() => CreateSubscriberAuthorizationDto)
  authorizations?: CreateSubscriberAuthorizationDto[];
}
