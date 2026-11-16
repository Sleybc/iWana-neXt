import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import {
  AccessPermissionKey,
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES,
  UserRole,
} from '@iwana/shared';
import { AuditOmitResponseFields } from '../audit/decorators/audit-omit-response-fields.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { resolveRouteRateLimit } from '../../common/rate-limit-env';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  AddCommentDto,
  AddCommentSchema,
  AddCommentWithAttachmentsSchema,
  type AddCommentWithAttachmentsInput,
  TicketAttachmentLinkQuerySchema,
  type TicketAttachmentLinkQuery,
  AssignTicketDto,
  AssignTicketSchema,
  CreateSlaPolicyDto,
  CreateSlaPolicySchema,
  CreateTicketDto,
  CreateTicketSchema,
  FindOrCreateInstallationTicketSchema,
  LinkWorkOrderDto,
  LinkWorkOrderSchema,
  ListTicketsQueryDto,
  ListTicketsQuerySchema,
  ListTicketsResponseDto,
  RequestFieldServiceDto,
  RequestFieldServiceSchema,
  TransitionTicketDto,
  TransitionTicketSchema,
  UpdateTicketDto,
  UpdateTicketSchema,
} from './dto';
import { ListMetaDto } from '../../common/pagination';
import { AssuranceDashboardService } from './services/assurance-dashboard.service';
import { CommentsService } from './services/comments.service';
import { SlaService } from './services/sla.service';
import { TicketsService } from './services/tickets.service';
import { TimelineService } from './services/timeline.service';
import { TicketAttachmentsService } from './services/ticket-attachments.service';
import { TicketAttachmentsUploadSizeInterceptor } from './ticket-attachments-upload-size.interceptor';
import {
  TICKET_ATTACHMENT_LINK_OPENAPI,
  TICKET_ATTACHMENT_REJECTED_OPENAPI,
  TICKET_COMMENT_ATTACHMENT_OPENAPI,
  TICKET_COMMENT_LIST_WITH_ATTACHMENTS_OPENAPI,
  TICKET_COMMENT_WITH_ATTACHMENTS_OPENAPI,
  TICKET_LIST_WITH_ATTACHMENT_COUNT_OPENAPI,
} from './ticket-attachments.openapi';

const dashboardSummarySchema = {
  type: 'object',
  properties: {
    openCount: { type: 'number' },
    assignedCount: { type: 'number' },
    inProgressCount: { type: 'number' },
    atRiskCount: { type: 'number' },
    breachedCount: { type: 'number' },
    resolvedTodayCount: { type: 'number' },
    fieldServicePendingCount: { type: 'number' },
    byPriority: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
    byType: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
    byQueue: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
  },
  required: [
    'openCount',
    'assignedCount',
    'inProgressCount',
    'atRiskCount',
    'breachedCount',
    'resolvedTodayCount',
    'fieldServicePendingCount',
    'byPriority',
    'byType',
    'byQueue',
  ],
};

/**
 * Assurance — tickets, comentarios, timeline y SLA.
 *
 * Nota (DEF-2 D-6): la validación efectiva de query/body en este controller
 * la hace `ZodValidationPipe` + schemas Zod (p. ej. `ListTicketsQuerySchema`),
 * no el `ValidationPipe` global de class-validator. Los DTO clase con `@Allow()`
 * existen solo para OpenAPI / tipado Nest; no son la fuente de verdad de cotas.
 */
@ApiTags('assurance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('assurance')
export class AssuranceController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly commentsService: CommentsService,
    private readonly timelineService: TimelineService,
    private readonly slaService: SlaService,
    private readonly dashboardService: AssuranceDashboardService,
    private readonly attachmentsService: TicketAttachmentsService,
  ) {}

  @Get('tickets')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar tickets del tenant' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'subscriberId',
    required: false,
    type: String,
    format: 'uuid',
    description: 'Limita los tickets al suscriptor y a sus contratos.',
  })
  @ApiOkResponse({
    description:
      'Tickets del tenant. Cada ticket trae `attachmentCount`: adjuntos que el usuario puede ver.',
    schema: TICKET_LIST_WITH_ATTACHMENT_COUNT_OPENAPI,
  })
  async listTickets(
    @Query(new ZodValidationPipe(ListTicketsQuerySchema)) query: ListTicketsQueryDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    const result = await this.ticketsService.list(query, actor);
    return this.attachmentsService.decorateTicketList(result, actor);
  }

  @Post('tickets')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Crear ticket de service assurance' })
  @ApiResponse({ status: 201, description: 'Ticket creado' })
  createTicket(
    @Body(new ZodValidationPipe(CreateTicketSchema)) dto: CreateTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.create(dto, actor);
  }

  @Post('tickets/find-or-create-installation')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Buscar o crear ticket de instalación para expediente' })
  @ApiResponse({ status: 200, description: 'Ticket encontrado o creado' })
  async findOrCreateInstallationTicket(@Body() body: unknown, @CurrentUser() actor: JwtPayload) {
    const dto = FindOrCreateInstallationTicketSchema.parse(body);
    return this.ticketsService.findOrCreateInstallationTicket(dto, actor.sub);
  }

  @Patch('tickets/:id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Transicionar estado del ticket' })
  transitionTicketStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TransitionTicketSchema)) dto: TransitionTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.transitionStatus(id, dto, actor);
  }

  @Post('tickets/:id/comments')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Agregar comentario al ticket (sin archivos; trae `attachments: []`)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Comentario creado; `attachments` siempre vacío en este endpoint.',
    schema: TICKET_COMMENT_WITH_ATTACHMENTS_OPENAPI,
  })
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddCommentSchema)) dto: AddCommentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    await this.ticketsService.getById(id, actor);
    const comment = await this.commentsService.addComment(id, dto, actor);
    return { ...comment, attachments: [] };
  }

  @Post('tickets/:id/comments/with-attachments')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @AuditOmitResponseFields('filename')
  // S-3: hasta 110 MB por petición en memoria; acotado como la subida de medios.
  @Throttle({ global: { ttl: 60000, limit: resolveRouteRateLimit(10) } })
  @UseInterceptors(
    // Antes de multer: acota el cuerpo por `Content-Length` sin leerlo (spec §2.5).
    TicketAttachmentsUploadSizeInterceptor,
    FilesInterceptor('files', TICKET_ATTACHMENTS_MAX_PER_COMMENT * 2, {
      storage: memoryStorage(),
      limits: {
        // El límite por tipo (25 MB o 100 MB) lo aplica el servicio y nombra el archivo.
        fileSize: TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES,
        files: TICKET_ATTACHMENTS_MAX_PER_COMMENT * 2,
        fields: 2,
        parts: TICKET_ATTACHMENTS_MAX_PER_COMMENT * 2 + 2,
      },
    }),
  )
  @ApiOperation({
    summary: 'Agregar comentario con adjuntos (multipart, todo o nada, hasta 10 archivos)',
    description:
      'Fotos (JPG, PNG, WebP, GIF) y PDF hasta 25 MB; MP4 hasta 100 MB; validados por firma real. ' +
      'El cuerpo no puede superar 110 MB (`Content-Length` obligatorio). Si un archivo se rechaza ' +
      'no se guarda nada. Los adjuntos quedan «En revisión» (`IN_REVIEW`) hasta la cuarentena.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['body'],
      additionalProperties: false,
      properties: {
        body: { type: 'string', minLength: 1 },
        isInternal: { type: 'string', enum: ['true', 'false'], default: 'false' },
        files: {
          type: 'array',
          maxItems: TICKET_ATTACHMENTS_MAX_PER_COMMENT,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Comentario creado con sus adjuntos.',
    schema: TICKET_COMMENT_WITH_ATTACHMENTS_OPENAPI,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'TICKET_ATTACHMENT_REJECTED (dice qué archivo y por qué), TICKET_ATTACHMENTS_TOO_MANY o VALIDATION_ERROR. No se guarda nada.',
    schema: TICKET_ATTACHMENT_REJECTED_OPENAPI,
  })
  @ApiResponse({
    status: HttpStatus.LENGTH_REQUIRED,
    description: 'TICKET_ATTACHMENTS_LENGTH_REQUIRED.',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Más de 10 subidas por minuto.',
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: 'TICKET_ATTACHMENTS_TOO_LARGE (más de 110 MB).',
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description:
      'TICKET_ATTACHMENT_STORAGE_FAILED o TICKET_ATTACHMENT_STORAGE_MUST_BE_PRIVATE. No se guarda nada.',
  })
  async addCommentWithAttachments(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddCommentWithAttachmentsSchema))
    dto: AddCommentWithAttachmentsInput,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.attachmentsService.createCommentWithAttachments(id, dto, files ?? [], actor);
  }

  @Get('tickets/:id/comments')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar comentarios del ticket' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description: 'Comentarios visibles; cada uno con sus `attachments` (`[]` si no tiene).',
    schema: TICKET_COMMENT_LIST_WITH_ATTACHMENTS_OPENAPI,
  })
  async listComments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.ticketsService.getById(id, actor);
    const comments = await this.commentsService.listComments(id, actor);
    return this.attachmentsService.decorateComments(comments);
  }

  @Get('tickets/:id/attachments')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({
    summary: 'Listar los adjuntos del ticket que el usuario puede ver (sección «Adjuntos (N)»)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description: 'Adjuntos de los comentarios visibles, del más antiguo al más reciente.',
    schema: { type: 'array', items: TICKET_COMMENT_ATTACHMENT_OPENAPI },
  })
  listAttachments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.attachmentsService.listForTicket(id, actor);
  }

  @Get('tickets/:id/attachments/:attachmentId/link')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({
    summary: 'Enlace firmado (5 minutos) para abrir o descargar un adjunto',
    description:
      'Mismos permisos que el comentario: el adjunto de un comentario interno responde 404 a quien ' +
      'no ve comentarios internos. En revisión o bloqueado no se firma (409).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiQuery({ name: 'disposition', required: false, enum: ['inline', 'attachment'] })
  @ApiOkResponse({ schema: TICKET_ATTACHMENT_LINK_OPENAPI })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'TICKET_ATTACHMENT_NOT_FOUND.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'TICKET_ATTACHMENT_IN_REVIEW o TICKET_ATTACHMENT_BLOCKED.',
  })
  getAttachmentLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query(new ZodValidationPipe(TicketAttachmentLinkQuerySchema)) query: TicketAttachmentLinkQuery,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.attachmentsService.signLink(id, attachmentId, query.disposition, actor);
  }

  @Post('tickets/:id/assign')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Asignar responsable o cola del ticket' })
  assignTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignTicketSchema)) dto: AssignTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.assign(id, dto, actor);
  }

  @Get('tickets/:id/timeline')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar timeline del ticket' })
  async listTimeline(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    await this.ticketsService.getById(id, actor);
    return this.timelineService.listTimeline(id);
  }

  @Post('tickets/:id/field-service')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Solicitar trabajo de campo hacia WFM' })
  requestFieldService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestFieldServiceSchema)) dto: RequestFieldServiceDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.requestFieldService(id, dto, actor);
  }

  @Post('tickets/:id/request-field-service')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Solicitar trabajo de campo hacia WFM (alias REST de fase 01)' })
  requestFieldServiceAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestFieldServiceSchema)) dto: RequestFieldServiceDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.requestFieldService(id, dto, actor);
  }

  @Post('tickets/:id/link-work-order')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Asociar una Work Order existente al ticket' })
  linkWorkOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(LinkWorkOrderSchema)) dto: LinkWorkOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.linkWorkOrder(id, dto, actor);
  }

  @Get('tickets/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SUPPORT,
    UserRole.TECHNICIAN,
    UserRole.CONTRACTOR,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Obtener detalle de ticket' })
  getTicket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.ticketsService.getById(id, actor);
  }

  @Patch('tickets/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.TECHNICIAN, UserRole.CONTRACTOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Actualizar campos editables del ticket' })
  updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTicketSchema)) dto: UpdateTicketDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ticketsService.update(id, dto, actor);
  }

  @Get('sla-policies')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Listar políticas SLA del tenant' })
  listSlaPolicies() {
    return this.slaService.listPolicies();
  }

  @Post('sla-policies')
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_MANAGE)
  @ApiOperation({ summary: 'Crear política SLA del tenant' })
  createSlaPolicy(@Body(new ZodValidationPipe(CreateSlaPolicySchema)) dto: CreateSlaPolicyDto) {
    return this.slaService.createPolicy(dto);
  }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Resumen operativo de assurance' })
  @ApiOkResponse({ description: 'Resumen operativo de assurance', schema: dashboardSummarySchema })
  getDashboard() {
    return this.dashboardService.getSummary();
  }

  @Get('dashboard/summary')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.ASSURANCE_TICKETS_READ)
  @ApiOperation({ summary: 'Resumen operativo de assurance para dashboard' })
  @ApiOkResponse({
    description: 'Resumen operativo de assurance para dashboard',
    schema: dashboardSummarySchema,
  })
  getDashboardSummary() {
    return this.dashboardService.getSummary();
  }
}
