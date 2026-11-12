import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  CreateSubscriberTagSchema,
  SUBSCRIBER_TAG_NAME_MAX_LENGTH,
  UpdateSubscriberTagSchema,
  UserRole,
  type CreateSubscriberTag,
  type SubscriberTag,
  type SubscriberTagAssignmentResponse,
  type SubscriberTagListResponse,
  type UpdateSubscriberTag,
} from '@iwana/shared';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { JwtPayload } from '../../../auth/interfaces/jwt-payload.interface';
import { Permissions } from '../../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../../audit/decorators/skip-audit.decorator';
import { ZodBodyValidationPipe } from '../../pipes/zod-body-validation.pipe';
import { GuardBlockedTitular } from '../guards/guard-blocked-titular.decorator';
import { SubscriberTagsService } from './subscriber-tags.service';

/** Todos los roles de tenant; los de plataforma no son UserRole (ADR-061 §4). */
const ANY_TENANT_ROLE: readonly UserRole[] = Object.values(UserRole);

const COLOR_PATTERN = '^#[0-9A-Fa-f]{6}$';

const CHIP_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  title: 'SubscriberTagChip',
  required: ['id', 'name', 'color'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 1, maxLength: SUBSCRIBER_TAG_NAME_MAX_LENGTH },
    color: { type: 'string', pattern: COLOR_PATTERN, example: '#1D4ED8' },
  },
};

const TAG_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  title: 'SubscriberTag',
  required: ['id', 'name', 'color', 'assignedCount', 'createdAt', 'updatedAt'],
  properties: {
    ...CHIP_OPENAPI_SCHEMA.properties,
    assignedCount: { type: 'integer', minimum: 0 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const TAG_BODY_PROPERTIES = {
  name: { type: 'string', minLength: 1, maxLength: SUBSCRIBER_TAG_NAME_MAX_LENGTH },
  color: { type: 'string', pattern: COLOR_PATTERN },
} as const;

/**
 * Catálogo de etiquetas manuales del suscriptor (ADR-110 D8).
 * Leer: quien lee suscriptores. Gestionar: ADMIN con crm.subscribers.manage — el catálogo
 * es configuración del ISP (vive en Ajustes); asignar es trabajo de la ficha.
 */
@ApiTags('subscribers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscriber-tags')
export class SubscriberTagCatalogController {
  constructor(private readonly tagsService: SubscriberTagsService) {}

  @Get()
  @Roles(...ANY_TENANT_ROLE)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Listar el catálogo de etiquetas del suscriptor (por nombre)' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: TAG_OPENAPI_SCHEMA } },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin el permiso crm.subscribers.read.' })
  async list(): Promise<SubscriberTagListResponse> {
    return { data: await this.tagsService.listCatalog() };
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear una etiqueta del suscriptor' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'color'],
      properties: TAG_BODY_PROPERTIES,
    },
  })
  @ApiResponse({
    status: 201,
    schema: { type: 'object', required: ['data'], properties: { data: TAG_OPENAPI_SCHEMA } },
  })
  @ApiResponse({
    status: 400,
    description: '`VALIDATION_ERROR`: nombre vacío o largo, color inválido.',
  })
  @ApiResponse({ status: 403, description: 'Sin rol ADMIN o sin crm.subscribers.manage.' })
  @ApiResponse({
    status: 409,
    description: '`SUBSCRIBER_TAG_NAME_TAKEN` o `SUBSCRIBER_TAG_CATALOG_FULL`.',
  })
  async create(
    @Body(new ZodBodyValidationPipe(CreateSubscriberTagSchema)) dto: CreateSubscriberTag,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: SubscriberTag }> {
    return { data: await this.tagsService.createTag(dto, user.sub) };
  }

  @Patch(':tagId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Cambiar el nombre o el color de una etiqueta' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: TAG_BODY_PROPERTIES,
    },
  })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', required: ['data'], properties: { data: TAG_OPENAPI_SCHEMA } },
  })
  @ApiResponse({ status: 400, description: '`VALIDATION_ERROR`.' })
  @ApiResponse({ status: 404, description: '`SUBSCRIBER_TAG_NOT_FOUND`.' })
  @ApiResponse({ status: 409, description: '`SUBSCRIBER_TAG_NAME_TAKEN`.' })
  async update(
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Body(new ZodBodyValidationPipe(UpdateSubscriberTagSchema)) dto: UpdateSubscriberTag,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: SubscriberTag }> {
    return { data: await this.tagsService.updateTag(tagId, dto, user.sub) };
  }

  @Delete(':tagId')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una etiqueta y quitarla de todos los suscriptores' })
  @ApiResponse({ status: 204, description: 'Etiqueta eliminada.' })
  @ApiResponse({ status: 404, description: '`SUBSCRIBER_TAG_NOT_FOUND`.' })
  async remove(
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.tagsService.deleteTag(tagId, user.sub);
  }
}

/** Asignación de etiquetas a un suscriptor; mismos roles y permiso que las notas. */
@ApiTags('subscribers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers/:subscriberId/tags')
export class SubscriberTagAssignmentController {
  constructor(private readonly tagsService: SubscriberTagsService) {}

  @Put(':tagId')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Asignar una etiqueta al suscriptor (idempotente)' })
  @ApiResponse({
    status: 200,
    description: 'Etiquetas vigentes del suscriptor.',
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: CHIP_OPENAPI_SCHEMA } },
    },
  })
  @ApiResponse({ status: 403, description: 'Sin el rol o el permiso crm.subscribers.manage.' })
  @ApiResponse({ status: 404, description: 'Suscriptor o `SUBSCRIBER_TAG_NOT_FOUND`.' })
  @ApiResponse({
    status: 409,
    description: '`PRIVACY_TITULAR_ANONYMIZED` o `PRIVACY_DATA_BLOCKED`.',
  })
  async assign(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubscriberTagAssignmentResponse> {
    return { data: await this.tagsService.assign(subscriberId, tagId, user.sub) };
  }

  @Delete(':tagId')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Quitar una etiqueta del suscriptor (idempotente)' })
  @ApiResponse({
    status: 200,
    description: 'Etiquetas vigentes del suscriptor.',
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: CHIP_OPENAPI_SCHEMA } },
    },
  })
  @ApiResponse({ status: 404, description: 'Suscriptor no encontrado.' })
  @ApiResponse({
    status: 409,
    description: '`PRIVACY_TITULAR_ANONYMIZED` o `PRIVACY_DATA_BLOCKED`.',
  })
  async unassign(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SubscriberTagAssignmentResponse> {
    return { data: await this.tagsService.unassign(subscriberId, tagId, user.sub) };
  }
}
