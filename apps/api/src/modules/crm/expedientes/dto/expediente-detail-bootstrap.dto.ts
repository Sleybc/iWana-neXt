import { ApiProperty } from '@nestjs/swagger';
import type { CompletenessResult } from '../completeness-calculator.service';
import type { PipelineRecommendation } from '../pipeline-recommendation.service';
import type { ResponsibilitySnapshot } from '../../responsibilities/responsibilities.service';
import type {
  InstallationReadinessSummary,
  MissingRequirement,
  SectionCompletenessItem,
} from '../expediente-section-completeness.types';

/** Proyección mínima para Vista general; las superficies pesadas se cargan bajo demanda. */
export interface ExpedienteDetailProjection {
  id: string;
  status: string;
  previousStatus: string | null;
  statusChangedAt: Date;
  dataConsentRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  documentType: string | null;
  personType: string | null;
  hasLocation: boolean;
  source: string;
  acquisitionChannel: string;
  interestedPlanId: string | null;
  additionalProductIds: string[] | null;
  additionalServiceIds: string[];
}

export interface ExpedienteDetailOperationalMetadata {
  createdBy: { userId: string | null; name: string | null };
  lastEditedBy: { userId: string | null; name: string | null };
  lastActivityAt: Date | null;
}

export interface CurrentAttributionSummary {
  id: string;
  expedienteId: string;
  attributionRole: string;
  actorRole: string;
  actorName: string;
  acquisitionChannel: string;
  attributedAt: Date;
  revokedAt: Date | null;
}

export interface SubscriberSummary {
  id: string;
  status: string;
  fullName: string;
}

export interface ExpedienteDetailBootstrap {
  expediente: ExpedienteDetailProjection;
  completeness: CompletenessResult;
  pipelineRecommendation: PipelineRecommendation | null;
  operationalMetadata: ExpedienteDetailOperationalMetadata;
  currentAttribution: CurrentAttributionSummary | null;
  responsibility: ResponsibilitySnapshot | null;
  subscriberSummary: SubscriberSummary | null;
}

export class MissingRequirementDto implements MissingRequirement {
  @ApiProperty({ type: String })
  sectionKey!: string;

  @ApiProperty({ type: String })
  sectionLabel!: string;

  @ApiProperty({ type: String })
  fieldKey!: string;

  @ApiProperty({ type: String })
  fieldLabel!: string;
}

export class SectionCompletenessItemDto implements SectionCompletenessItem {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ type: String })
  label!: string;

  @ApiProperty({ type: Number })
  percentage!: number;

  @ApiProperty({ type: Number })
  completedFields!: number;

  @ApiProperty({ type: Number })
  totalFields!: number;

  @ApiProperty({ type: [MissingRequirementDto] })
  missingFields!: MissingRequirementDto[];
}

export class InstallationReadinessSummaryDto implements InstallationReadinessSummary {
  @ApiProperty({ type: String })
  status!: InstallationReadinessSummary['status'];

  @ApiProperty({ type: Boolean })
  canTransition!: boolean;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  message!: string;
}

export class CompletenessResultDto implements CompletenessResult {
  @ApiProperty({ type: Number })
  commercial!: number;

  @ApiProperty({ type: Number })
  legal!: number;

  @ApiProperty({ type: Number })
  technical!: number;

  @ApiProperty({ type: Number })
  operational!: number;

  @ApiProperty({ type: Number })
  overall!: number;

  @ApiProperty({ type: [SectionCompletenessItemDto] })
  sectionCompleteness!: SectionCompletenessItemDto[];

  @ApiProperty({ type: InstallationReadinessSummaryDto })
  installationReadiness!: InstallationReadinessSummaryDto;

  @ApiProperty({ type: [MissingRequirementDto] })
  missingRequirements!: MissingRequirementDto[];
}

export class PipelineRecommendationDto implements PipelineRecommendation {
  @ApiProperty({ type: String })
  currentStatus!: PipelineRecommendation['currentStatus'];

  @ApiProperty({ type: String, nullable: true })
  suggestedStatus!: PipelineRecommendation['suggestedStatus'];

  @ApiProperty({ type: String, nullable: true })
  recommendationReason!: string | null;

  @ApiProperty({ type: [MissingRequirementDto] })
  blockingRequirements!: MissingRequirementDto[];

  @ApiProperty({ type: [MissingRequirementDto] })
  informationalRequirements!: MissingRequirementDto[];
}

export class ExpedienteDetailActorDto {
  @ApiProperty({ type: String, nullable: true })
  userId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;
}

export class ExpedienteDetailProjectionDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String, nullable: true })
  previousStatus!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  statusChangedAt!: Date;

  @ApiProperty({ type: Boolean })
  dataConsentRevoked!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: String })
  fullName!: string;

  @ApiProperty({ type: String, nullable: true })
  documentType!: string | null;

  @ApiProperty({ type: String, nullable: true })
  personType!: string | null;

  @ApiProperty({ type: Boolean })
  hasLocation!: boolean;

  @ApiProperty({ type: String })
  source!: string;

  @ApiProperty({ type: String })
  acquisitionChannel!: string;

  @ApiProperty({ type: String, nullable: true })
  interestedPlanId!: string | null;

  @ApiProperty({ type: [String], nullable: true })
  additionalProductIds!: string[] | null;

  @ApiProperty({ type: [String] })
  additionalServiceIds!: string[];
}

export class ExpedienteDetailOperationalMetadataDto {
  @ApiProperty({ type: ExpedienteDetailActorDto })
  createdBy!: ExpedienteDetailActorDto;

  @ApiProperty({ type: ExpedienteDetailActorDto })
  lastEditedBy!: ExpedienteDetailActorDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastActivityAt!: Date | null;
}

export class ResponsibilityActorDto extends ExpedienteDetailActorDto {
  @ApiProperty({ type: String, nullable: true })
  role!: string | null;
}

export class ResponsibilitySnapshotDto {
  @ApiProperty({ type: String, nullable: true })
  currentResponsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  currentResponsibleAssignedAt!: Date | null;

  @ApiProperty({ type: ResponsibilityActorDto })
  currentResponsible!: ResponsibilityActorDto;

  @ApiProperty({ type: String, format: 'uuid' })
  expedienteId!: string;
}

export class CurrentAttributionSummaryDto implements CurrentAttributionSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  expedienteId!: string;

  @ApiProperty({ type: String })
  attributionRole!: string;

  @ApiProperty({ type: String })
  actorRole!: string;

  @ApiProperty({ type: String })
  actorName!: string;

  @ApiProperty({ type: String })
  acquisitionChannel!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  attributedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: Date | null;
}

export class SubscriberSummaryDto implements SubscriberSummary {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  status!: string;

  @ApiProperty({ type: String })
  fullName!: string;
}

export class ExpedienteDetailBootstrapDataDto {
  @ApiProperty({ type: ExpedienteDetailProjectionDto })
  expediente!: ExpedienteDetailProjection;

  @ApiProperty({ type: CompletenessResultDto })
  completeness!: CompletenessResult;

  @ApiProperty({ type: PipelineRecommendationDto, nullable: true })
  pipelineRecommendation!: PipelineRecommendation | null;

  @ApiProperty({ type: ExpedienteDetailOperationalMetadataDto })
  operationalMetadata!: ExpedienteDetailOperationalMetadata;

  @ApiProperty({ type: CurrentAttributionSummaryDto, nullable: true })
  currentAttribution!: CurrentAttributionSummary | null;

  @ApiProperty({ type: ResponsibilitySnapshotDto, nullable: true })
  responsibility!: ResponsibilitySnapshot | null;

  @ApiProperty({ type: SubscriberSummaryDto, nullable: true })
  subscriberSummary!: SubscriberSummary | null;
}

export class ExpedienteDetailBootstrapResponseDto {
  @ApiProperty({ type: ExpedienteDetailBootstrapDataDto })
  data!: ExpedienteDetailBootstrapDataDto;
}
