import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerSegment, ServiceUsage, VatLegalBasis, VatTreatment } from '@iwana/shared';
import { ContractStatus } from '../../enums/contract-status.enum';

export class ContractVatSnapshotResponseDto {
  @ApiProperty({ enum: VatTreatment })
  treatment: VatTreatment;

  @ApiProperty({ enum: VatLegalBasis })
  legalBasis: VatLegalBasis;

  @ApiProperty({ enum: [0, 19] })
  ratePercent: 0 | 19;

  @ApiProperty()
  requiresAccountantReview: boolean;

  @ApiProperty({ format: 'date-time' })
  resolvedAt: string;
}

/** OpenAPI shape of a contract resource, including the service-point VAT snapshot. */
export class ContractResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  quoteId: string | null;

  @ApiProperty({ format: 'uuid' })
  subscriberId: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  titularAnonymizedAt: string | null;

  @ApiProperty()
  planId: string;

  @ApiProperty({ type: Object })
  planSnapshotJson: Record<string, unknown>;

  @ApiProperty({ enum: ContractStatus })
  status: ContractStatus;

  @ApiProperty()
  alias: string;

  @ApiPropertyOptional({ nullable: true })
  installationAddress: string | null;

  @ApiPropertyOptional({ nullable: true })
  installationCity: string | null;

  @ApiPropertyOptional({ nullable: true })
  installationDepartment: string | null;

  @ApiPropertyOptional({ nullable: true })
  installationPostalCode: string | null;

  @ApiPropertyOptional({ nullable: true })
  installationNotes: string | null;

  @ApiPropertyOptional({ enum: CustomerSegment, nullable: true })
  customerSegment: CustomerSegment | null;

  @ApiPropertyOptional({ enum: ServiceUsage, nullable: true })
  serviceUsage: ServiceUsage | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 6, nullable: true })
  installationStratum: number | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  stratumEvidenceMediaId: string | null;

  @ApiPropertyOptional({ type: ContractVatSnapshotResponseDto, nullable: true })
  vatSnapshot: ContractVatSnapshotResponseDto | null;

  @ApiProperty({ type: [String] })
  additionalProductIds: string[];

  @ApiProperty({ type: [String] })
  additionalServiceIds: string[];

  @ApiPropertyOptional({ nullable: true })
  paymentMethod: string | null;

  @ApiPropertyOptional({ nullable: true })
  billingCycle: string | null;

  @ApiPropertyOptional({ nullable: true })
  fiscalName: string | null;

  @ApiPropertyOptional({ nullable: true })
  fiscalDocument: string | null;

  @ApiPropertyOptional({ nullable: true })
  fiscalAddress: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  startDate: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  endDate: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  deletedAt: Date | null;
}

export class ContractResponseEnvelopeDto {
  @ApiProperty({ type: ContractResponseDto })
  data: ContractResponseDto;
}
