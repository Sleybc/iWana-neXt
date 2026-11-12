import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN,
  CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN,
  CONTRACT_ITEM_VAT_SOURCES,
  CustomerSegment,
  ServiceUsage,
  VatLegalBasis,
  VatTreatment,
  type ContractItemVatSource,
} from '@iwana/shared';
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

/** IVA de la instalación congelado en el contrato (spec MOD14 2026-11-12 R2). */
export class ContractItemVatSnapshotResponseDto {
  @ApiProperty({ enum: VatTreatment })
  treatment: VatTreatment;

  @ApiProperty({
    maxLength: 40,
    pattern: CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN.source,
    example: 'ET_468',
  })
  legalBasis: string;

  @ApiProperty({ enum: [0, 19] })
  ratePercent: 0 | 19;

  @ApiProperty({
    enum: CONTRACT_ITEM_VAT_SOURCES,
    description:
      'CATALOG: tratamiento del ítem; DEFAULT: sin tratamiento propio, STANDARD 19 %; ' +
      'BACKFILL: relleno de la migración 201.',
  })
  source: ContractItemVatSource;

  @ApiProperty({ format: 'date-time' })
  frozenAt: string;
}

/** IVA de un adicional congelado en el contrato (spec MOD14 2026-11-12 R2). */
export class ContractAdditionalVatSnapshotResponseDto extends ContractItemVatSnapshotResponseDto {
  @ApiProperty({ maxLength: 120 })
  itemId: string;

  @ApiProperty({ enum: ['PRODUCT', 'SERVICE'] })
  itemType: 'PRODUCT' | 'SERVICE';

  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 200,
    description: 'Nombre del ítem congelado al agregarlo (bloque C, R3).',
  })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN.source,
    example: '15000.00',
    description:
      'Precio vigente congelado para el segmento del contrato; null o ausente en un ítem legado ' +
      'sin precio, que no se cobra y cuenta como adicional sin cobrar.',
  })
  unitPrice?: string | null;
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

  @ApiProperty({ nullable: true, maxLength: 40 })
  statusReasonCode: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  statusChangedAt: Date | null;

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

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    description:
      'Cargo de instalación congelado al crear el contrato (installation_fee vigente del plan y ' +
      'segmento). Null en contratos heredados o sin precio vigente.',
  })
  installationFee: number | null;

  @ApiPropertyOptional({
    type: ContractItemVatSnapshotResponseDto,
    nullable: true,
    description:
      'IVA del cargo de instalación congelado al crear el contrato (tratamiento propio del cargo ' +
      'en el plan, por defecto STANDARD 19 %). Null en contratos heredados: el cobro aplica 19 %.',
  })
  installationVatSnapshot?: ContractItemVatSnapshotResponseDto | null;

  @ApiPropertyOptional({
    type: [ContractAdditionalVatSnapshotResponseDto],
    description: 'IVA de cada producto o servicio adicional, congelado al agregarlo al contrato.',
  })
  additionalVatSnapshot?: ContractAdditionalVatSnapshotResponseDto[];

  @ApiProperty({ nullable: true, deprecated: true })
  billingCycle: string | null;

  @ApiProperty({ minimum: 1, maximum: 28, nullable: true })
  billingCycleDay: number | null;

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
