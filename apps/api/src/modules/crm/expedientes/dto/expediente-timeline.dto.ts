import { z } from 'zod';
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';

export const EXPEDIENTE_TIMELINE_FILTERS = [
  'all',
  'contact',
  'asignaciones',
  'pipeline',
  'system',
] as const;

export const EXPEDIENTE_TIMELINE_MAX_EVENTS = 500;

export type ExpedienteTimelineFilter = (typeof EXPEDIENTE_TIMELINE_FILTERS)[number];

const optionalPositiveInteger = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).optional(),
);

export const ExpedienteTimelineQuerySchema = z.object({
  page: optionalPositiveInteger,
  limit: optionalPositiveInteger,
  filter: z.enum(EXPEDIENTE_TIMELINE_FILTERS).optional(),
});

export type ExpedienteTimelineQueryDto = z.infer<typeof ExpedienteTimelineQuerySchema>;

export interface ExpedienteTimelineActorDto {
  userId: string | null;
  name: string | null;
  role: string | null;
}

export interface ExpedienteContactTimelineEventDto {
  kind: 'contact';
  id: string;
  attemptedAt: Date;
  channel: string;
  result: string;
  durationMinutes: number | null;
  notes: string | null;
  actor: ExpedienteTimelineActorDto;
}

export interface ExpedienteResponsibilityTimelineEventDto {
  kind: 'responsibility';
  id: string;
  changedAt: Date;
  previousResponsible: ExpedienteTimelineActorDto | null;
  newResponsible: ExpedienteTimelineActorDto;
  /** Usuario que ejecutó la reasignación; no es el usuario asignado. */
  actor: ExpedienteTimelineActorDto;
  notes: string | null;
}

export interface ExpedienteAttributionTimelineEventDto {
  kind: 'attribution';
  id: string;
  attributedAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  actorName: string;
  actorRole: string;
  acquisitionChannel: string;
  /** Usuario que ejecutó la atribución; puede diferir del actor atribuido. */
  attributedBy: ExpedienteTimelineActorDto;
}

export interface ExpedientePipelineTimelineEventDto {
  kind: 'pipeline';
  id: string;
  changedAt: Date;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  actor: ExpedienteTimelineActorDto;
}

export interface ExpedienteSystemTimelineEventDto {
  kind: 'system';
  id: string;
  occurredAt: Date;
  type: 'CREATED' | 'SECTION_UPDATED';
  sectionLabel: string | null;
  reason: string | null;
  actor: ExpedienteTimelineActorDto;
}

export type ExpedienteTimelineEventDto =
  | ExpedienteContactTimelineEventDto
  | ExpedienteResponsibilityTimelineEventDto
  | ExpedienteAttributionTimelineEventDto
  | ExpedientePipelineTimelineEventDto
  | ExpedienteSystemTimelineEventDto;

export interface ExpedienteTimelineMetadataDto {
  createdBy: ExpedienteTimelineActorDto;
  lastEditedBy: ExpedienteTimelineActorDto;
  lastActivityAt: Date | null;
}

export interface ExpedienteTimelineResponseDto {
  data: {
    events: ExpedienteTimelineEventDto[];
    metadata: ExpedienteTimelineMetadataDto;
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    truncated: boolean;
    hasMore: boolean;
  };
}

/** DTOs de runtime para que Swagger publique el contrato real del timeline. */
export class ExpedienteTimelineActorSwaggerDto {
  @ApiProperty({ nullable: true, example: '00000000-0000-4000-a000-000000000001' })
  userId!: string | null;

  @ApiProperty({ nullable: true, example: 'Asesor comercial' })
  name!: string | null;

  @ApiProperty({ nullable: true, example: 'SALES' })
  role!: string | null;
}

export class ExpedienteContactTimelineEventSwaggerDto {
  @ApiProperty({ enum: ['contact'] })
  kind!: 'contact';

  @ApiProperty({ example: '00000000-0000-4000-a000-000000000002' })
  id!: string;

  @ApiProperty({ format: 'date-time' })
  attemptedAt!: Date;

  @ApiProperty({ example: 'TELEFONO' })
  channel!: string;

  @ApiProperty({ example: 'EXITOSO' })
  result!: string;

  @ApiProperty({ nullable: true, example: 5 })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true, example: 'Seguimiento inicial' })
  notes!: string | null;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;
}

export class ExpedienteResponsibilityTimelineEventSwaggerDto {
  @ApiProperty({ enum: ['responsibility'] })
  kind!: 'responsibility';

  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;

  @ApiProperty({ nullable: true, type: () => ExpedienteTimelineActorSwaggerDto })
  previousResponsible!: ExpedienteTimelineActorSwaggerDto | null;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  newResponsible!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ nullable: true })
  notes!: string | null;
}

export class ExpedienteAttributionTimelineEventSwaggerDto {
  @ApiProperty({ enum: ['attribution'] })
  kind!: 'attribution';

  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date-time' })
  attributedAt!: Date;

  @ApiProperty({ nullable: true, format: 'date-time' })
  revokedAt!: Date | null;

  @ApiProperty({ nullable: true })
  revokedReason!: string | null;

  @ApiProperty()
  actorName!: string;

  @ApiProperty()
  actorRole!: string;

  @ApiProperty()
  acquisitionChannel!: string;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  attributedBy!: ExpedienteTimelineActorSwaggerDto;
}

export class ExpedientePipelineTimelineEventSwaggerDto {
  @ApiProperty({ enum: ['pipeline'] })
  kind!: 'pipeline';

  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;

  @ApiProperty()
  fromStatus!: string;

  @ApiProperty()
  toStatus!: string;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;
}

export class ExpedienteSystemTimelineEventSwaggerDto {
  @ApiProperty({ enum: ['system'] })
  kind!: 'system';

  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;

  @ApiProperty({ enum: ['CREATED', 'SECTION_UPDATED'] })
  type!: 'CREATED' | 'SECTION_UPDATED';

  @ApiProperty({ nullable: true })
  sectionLabel!: string | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;
}

export class ExpedienteTimelineMetadataSwaggerDto {
  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  createdBy!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  lastEditedBy!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastActivityAt!: Date | null;
}

export class ExpedienteTimelinePageMetaSwaggerDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 5 })
  limit!: number;

  @ApiProperty({ example: 12, maximum: 500 })
  total!: number;

  @ApiProperty({ example: 3, description: 'Nunca permite page × limit superior a 500.' })
  totalPages!: number;

  @ApiProperty({
    example: false,
    description: 'Indica que existen eventos fuera de la cota de 500.',
  })
  truncated!: boolean;

  @ApiProperty({
    example: true,
    description: 'Indica que aún hay otra página navegable dentro de la cota.',
  })
  hasMore!: boolean;
}

export class ExpedienteTimelinePaginatedDataSwaggerDto {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(ExpedienteContactTimelineEventSwaggerDto) },
        { $ref: getSchemaPath(ExpedienteResponsibilityTimelineEventSwaggerDto) },
        { $ref: getSchemaPath(ExpedienteAttributionTimelineEventSwaggerDto) },
        { $ref: getSchemaPath(ExpedientePipelineTimelineEventSwaggerDto) },
        { $ref: getSchemaPath(ExpedienteSystemTimelineEventSwaggerDto) },
      ],
    },
  })
  events!: ExpedienteTimelineEventDto[];

  @ApiProperty({ type: () => ExpedienteTimelineMetadataSwaggerDto })
  metadata!: ExpedienteTimelineMetadataSwaggerDto;
}

export class ExpedienteTimelinePaginatedResponseSwaggerDto {
  @ApiProperty({ type: () => ExpedienteTimelinePaginatedDataSwaggerDto })
  data!: ExpedienteTimelinePaginatedDataSwaggerDto;

  @ApiProperty({ type: () => ExpedienteTimelinePageMetaSwaggerDto })
  meta!: ExpedienteTimelinePageMetaSwaggerDto;
}

export class ExpedienteTimelineLegacyChangeSwaggerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fromStatus!: string;

  @ApiProperty()
  toStatus!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;
}

export class ExpedienteTimelineLegacyActivitySwaggerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['CREATED', 'SECTION_UPDATED', 'STATUS_CHANGED', 'CONTACT_ATTEMPT'] })
  type!: 'CREATED' | 'SECTION_UPDATED' | 'STATUS_CHANGED' | 'CONTACT_ATTEMPT';

  @ApiProperty({ format: 'date-time' })
  occurredAt!: Date;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  actor!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ nullable: true })
  sectionLabel!: string | null;

  @ApiProperty({ nullable: true })
  fromStatus!: string | null;

  @ApiProperty({ nullable: true })
  toStatus!: string | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class ExpedienteTimelineLegacyMetadataSwaggerDto {
  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  createdBy!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ type: () => ExpedienteTimelineActorSwaggerDto })
  lastEditedBy!: ExpedienteTimelineActorSwaggerDto;

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastActivityAt!: Date | null;
}

export class ExpedienteTimelineLegacyDataSwaggerDto {
  @ApiProperty({ type: () => [ExpedienteTimelineLegacyChangeSwaggerDto] })
  changes!: ExpedienteTimelineLegacyChangeSwaggerDto[];

  @ApiProperty({ type: () => [ExpedienteTimelineLegacyActivitySwaggerDto] })
  activities!: ExpedienteTimelineLegacyActivitySwaggerDto[];

  @ApiProperty({ type: () => ExpedienteTimelineLegacyMetadataSwaggerDto })
  metadata!: ExpedienteTimelineLegacyMetadataSwaggerDto;
}

export class ExpedienteTimelineLegacyResponseSwaggerDto {
  @ApiProperty({ type: () => ExpedienteTimelineLegacyDataSwaggerDto })
  data!: ExpedienteTimelineLegacyDataSwaggerDto;
}
