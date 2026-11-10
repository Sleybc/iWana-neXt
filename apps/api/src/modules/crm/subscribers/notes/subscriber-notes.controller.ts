import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  AccessPermissionKey,
  CreateSubscriberNoteSchema,
  SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
  UserRole,
  type CreateSubscriberNote,
  type SubscriberNote,
  type SubscriberNoteListResponse,
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
import { CrmListLimitPipe, CrmListPagePipe } from '../../pipes/crm-list-pagination.pipe';
import { ListMetaDto } from '../../../../common/pagination/list-meta.dto';
import { GuardBlockedTitular } from '../guards/guard-blocked-titular.decorator';
import { SubscriberNotesService } from './subscriber-notes.service';

const SUBSCRIBER_NOTE_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  title: 'SubscriberNote',
  required: ['id', 'subscriberId', 'body', 'createdBy', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    subscriberId: { type: 'string', format: 'uuid' },
    body: { type: 'string', minLength: 1, maxLength: SUBSCRIBER_NOTE_BODY_MAX_LENGTH },
    createdBy: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

/**
 * Notas manuales del suscriptor (MOD05 ficha estilo UISP, D3).
 * No se editan ni se borran: solo GET y POST.
 */
@ApiTags('subscribers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers/:subscriberId/notes')
export class SubscriberNotesController {
  constructor(private readonly notesService: SubscriberNotesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Listar las notas manuales del suscriptor (más reciente primero)' })
  @ApiExtraModels(ListMetaDto)
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiResponse({
    status: 200,
    description: 'Página de notas.',
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: { type: 'array', items: SUBSCRIBER_NOTE_OPENAPI_SCHEMA },
        meta: { $ref: getSchemaPath(ListMetaDto) },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Parámetros de paginación inválidos (page o limit).' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({
    status: 403,
    description: 'Sin permiso, o `BLOCKED_DATA_READ_FORBIDDEN`: titular con datos bloqueados.',
  })
  @ApiResponse({ status: 404, description: 'Suscriptor no encontrado.' })
  async list(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @CurrentUser() user: JwtPayload,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ): Promise<SubscriberNoteListResponse> {
    return this.notesService.list(
      subscriberId,
      { id: user.sub, role: user.role },
      { ...(page !== undefined ? { page } : {}), ...(limit !== undefined ? { limit } : {}) },
    );
  }

  @Post()
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  // Auditoría manual en la transacción del servicio, sin el texto de la nota.
  @SkipAudit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar una nota manual del suscriptor (no editable)' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['body'],
      properties: {
        body: { type: 'string', minLength: 1, maxLength: SUBSCRIBER_NOTE_BODY_MAX_LENGTH },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Nota creada.',
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: SUBSCRIBER_NOTE_OPENAPI_SCHEMA },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      '`VALIDATION_ERROR`: nota vacía, de más de 2000 caracteres o con campos no admitidos.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin el rol o el permiso CRM_SUBSCRIBERS_MANAGE.' })
  @ApiResponse({ status: 404, description: 'Suscriptor no encontrado.' })
  @ApiResponse({
    status: 409,
    description:
      '`PRIVACY_TITULAR_ANONYMIZED` (titular anonimizado) o `PRIVACY_DATA_BLOCKED` (datos bloqueados).',
  })
  async create(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body(new ZodBodyValidationPipe(CreateSubscriberNoteSchema)) dto: CreateSubscriberNote,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: SubscriberNote }> {
    return { data: await this.notesService.create(subscriberId, dto.body, user.sub) };
  }
}
