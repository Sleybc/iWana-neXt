import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Inject,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
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
  SearchSubscribersInput,
  SearchSubscribersSchema,
  PlatformRole,
  PersonType,
  CustomerSegment,
  DocumentType,
  RUT_RESPONSIBILITIES,
  SubscriberStatus,
  VatTreatment,
  VatResponsibility,
  UserRole,
  type PrivacyMark,
  type TransitionStatusPayload,
} from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { SubscribersService } from './subscribers.service';
import { hasRealContact } from './subscriber-contact.util';
import { evaluateSubscriberFiscalCompleteness } from './subscriber-fiscal-completeness.service';
import { CreateSubscriberDto, CreateSubscriberSchema } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto, UpdateSubscriberSchema } from './dto/update-subscriber.dto';
import { Subscriber } from './entities/subscriber.entity';
import { TransitionSubscriberStatusSchema } from './dto/transition-subscriber-status.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { ListMetaDto } from '../../../common/pagination/list-meta.dto';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { AuditAction } from '@iwana/shared';
import { projectSubscriberForList } from './subscriber-projection';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { GuardBlockedTitular } from './guards/guard-blocked-titular.decorator';
import { SubscriberLifecycleService } from './subscriber-lifecycle.service';
import { ContractStatus } from '../enums/contract-status.enum';

/**
 * Roles administrativos habilitados para el alta manual fuera de flujo.
 *
 * Se compara contra `JwtPayload.role`, que es un `string`: tras ADR-061 §4 los
 * dos roles provienen de enums distintos, asi que el tipo comun es el literal.
 */
const ADMINISTRATIVE_ROLES: readonly string[] = [UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN];

type SubscriberWithDecryptedFields = Subscriber & {
  documentNumber?: string | null;
  email?: string;
  phone?: string;
  altContactPhone?: string;
  privacyMarks?: PrivacyMark[];
};

const SUBSCRIBER_LIST_ITEM_OPENAPI_SCHEMA: SchemaObject = {
  type: 'object',
  title: 'SubscriberListItem',
  required: [
    'id',
    'tenantId',
    'partyId',
    'userId',
    'privacyRestricted',
    'anonymizedAt',
    'anonymizedRequestId',
    'status',
    'personType',
    'customerSegment',
    'stratum',
    'vatTreatment',
    'taxRegime',
    'vatResponsibility',
    'rutResponsibilities',
    'legalRepresentative',
    'expedienteId',
    'convertedAt',
    'activatedAt',
    'documentType',
    'firstName',
    'lastName',
    'businessName',
    'commercialName',
    'createdAt',
    'updatedAt',
    'contactPending',
    'hasLiveContracts',
    'primaryService',
    'otherLiveServicesCount',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    partyId: { type: 'string', format: 'uuid', nullable: true },
    userId: { type: 'string', format: 'uuid', nullable: true },
    privacyRestricted: { type: 'boolean' },
    anonymizedAt: { type: 'string', format: 'date-time', nullable: true },
    anonymizedRequestId: { type: 'string', format: 'uuid', nullable: true },
    status: { type: 'string', enum: Object.values(SubscriberStatus) },
    personType: { type: 'string', enum: Object.values(PersonType) },
    customerSegment: { type: 'string', enum: Object.values(CustomerSegment) },
    stratum: { type: 'number', nullable: true },
    vatTreatment: {
      type: 'string',
      enum: Object.values(VatTreatment),
      deprecated: true,
    },
    taxRegime: { type: 'string', nullable: true, deprecated: true },
    vatResponsibility: {
      type: 'string',
      enum: Object.values(VatResponsibility),
      nullable: true,
    },
    rutResponsibilities: {
      type: 'array',
      description: 'Obligatorio para personas jurídicas o responsables de IVA.',
      items: { type: 'string', enum: [...RUT_RESPONSIBILITIES] },
    },
    legalRepresentative: {
      type: 'object',
      nullable: true,
      required: ['partyId', 'displayName'],
      properties: {
        partyId: { type: 'string', format: 'uuid' },
        displayName: { type: 'string' },
      },
    },
    expedienteId: { type: 'string', format: 'uuid', nullable: true },
    convertedAt: { type: 'string', format: 'date-time', nullable: true },
    activatedAt: { type: 'string', format: 'date-time', nullable: true },
    documentType: { type: 'string', enum: Object.values(DocumentType), nullable: true },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    businessName: { type: 'string', nullable: true },
    commercialName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    contactPending: { type: 'boolean' },
    hasLiveContracts: { type: 'boolean' },
    primaryService: {
      nullable: true,
      type: 'object',
      required: ['contractId', 'planName', 'status', 'city', 'alias'],
      properties: {
        contractId: { type: 'string', format: 'uuid' },
        planName: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DRAFT'] },
        city: { type: 'string', nullable: true },
        alias: { type: 'string', nullable: true },
      },
    },
    otherLiveServicesCount: { type: 'integer', minimum: 0 },
    privacyMarks: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['RECLAMO_EN_TRAMITE', 'VICTIMA_FALSEDAD_PERSONAL', 'DATOS_BLOQUEADOS'],
      },
    },
    documentNumber: { type: 'string', nullable: true },
    nit: { type: 'string', nullable: true },
    nitVerificationDigit: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    altContactPhone: { type: 'string', nullable: true },
    whatsapp: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    address: { type: 'string', nullable: true },
    neighborhood: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    department: { type: 'string', nullable: true },
    latitude: { type: 'number', nullable: true },
    longitude: { type: 'number', nullable: true },
  },
};

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers')
export class SubscribersController {
  constructor(
    private readonly subscribersService: SubscribersService,
    private readonly auditService: AuditService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
    private readonly subscriberLifecycleService: SubscriberLifecycleService,
    @Inject(IPrivacyMarksReadPort) private readonly privacyMarksReadPort: IPrivacyMarksReadPort,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * POST /crm/subscribers
   * Crear un nuevo suscriptor.
   * Roles: ADMIN, SALES
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  // Audit manual limpio en SubscribersService — evita PII en newValue del interceptor (SWEEP-01).
  @SkipAudit()
  @ApiOperation({ summary: 'Crear suscriptor' })
  async create(
    @Body(new ZodBodyValidationPipe(CreateSubscriberSchema)) dto: CreateSubscriberDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const isManualOverride = Boolean(dto.manualOverrideReason?.trim());
    if (isManualOverride && !ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'La creación manual fuera de flujo automático requiere rol administrativo.',
      );
    }

    const subscriber = await this.subscribersService.create(dto, user.sub, {
      ip: request.ip ?? null,
      userAgent:
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent'].slice(0, 512)
          : null,
    });
    return { data: this.sanitizeResponse(subscriber) };
  }

  /**
   * GET /crm/subscribers
   * Listar suscriptores con filtros y paginación.
   * Roles: ADMIN, NOC, SALES, SUPPORT, ACCOUNTANT
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Listar suscriptores con filtros' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data', 'total', 'meta'],
      properties: {
        data: {
          type: 'array',
          items: SUBSCRIBER_LIST_ITEM_OPENAPI_SCHEMA,
        },
        total: { type: 'integer', minimum: 0 },
        meta: { $ref: getSchemaPath(ListMetaDto) },
      },
    },
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  @ApiQuery({ name: 'status', required: false, enum: SubscriberStatus })
  @ApiQuery({ name: 'personType', required: false, enum: PersonType })
  @ApiQuery({ name: 'customerSegment', required: false, enum: CustomerSegment })
  @ApiQuery({ name: 'stratum', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'contactPending', required: false, type: Boolean })
  @ApiQuery({ name: 'fiscalIncomplete', required: false, type: Boolean })
  @ApiQuery({ name: 'withoutLiveServices', required: false, type: Boolean })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: SubscriberStatus,
    @Query('personType') personType?: PersonType,
    @Query('customerSegment') customerSegment?: CustomerSegment,
    @Query('stratum') stratum?: number,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('contactPending', new ParseBoolPipe({ optional: true })) contactPending?: boolean,
    @Query('fiscalIncomplete', new ParseBoolPipe({ optional: true })) fiscalIncomplete?: boolean,
    @Query('withoutLiveServices', new ParseBoolPipe({ optional: true }))
    withoutLiveServices?: boolean,
  ) {
    const filters = {
      status: status ?? undefined,
      personType: personType ?? undefined,
      customerSegment: customerSegment ?? undefined,
      stratum: stratum ? Number(stratum) : undefined,
      page,
      limit,
      sortBy: sortBy ?? undefined,
      sortDir: sortDir ?? undefined,
      contactPending,
      fiscalIncomplete,
      withoutLiveServices,
    };

    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const result = await this.subscribersService.findAll({
      ...filters,
      canSeeBlocked: readAccess.canSeeBlocked,
    });
    const blockedServed = readAccess.canSeeBlocked
      ? result.data.filter((subscriber) => this.isBlocked(subscriber)).length
      : undefined;

    // ADR-067 §5: registro de acceso masivo a PII — se registran filtros y
    // dimensiones, nunca los datos leídos.
    await this.logListAccess(user, filters, result.meta, result.data.length, blockedServed);

    return {
      data: result.data.map((subscriber) =>
        projectSubscriberForList(subscriber, user.role, readAccess.canSeeBlocked),
      ),
      total: result.total,
      meta: result.meta,
    };
  }

  /** Conteos globales de las colas operativas, sin PII en la respuesta. */
  @Get('queue-counts')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Consultar conteos globales de la cola de suscriptores' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: [
        'active',
        'suspended',
        'contactPending',
        'fiscalIncomplete',
        'withoutLiveServices',
      ],
      properties: {
        active: { type: 'integer', minimum: 0 },
        suspended: { type: 'integer', minimum: 0 },
        contactPending: { type: 'integer', minimum: 0 },
        fiscalIncomplete: { type: 'integer', minimum: 0 },
        withoutLiveServices: { type: 'integer', minimum: 0 },
      },
    },
  })
  async getQueueCounts() {
    return this.subscribersService.getQueueCounts();
  }

  /**
   * Ruta retirada explícitamente para que `/search` no caiga en el ParseUUIDPipe de `:id`.
   */
  @Get('search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @HttpCode(HttpStatus.NOT_FOUND)
  @ApiExcludeEndpoint()
  async retiredGetSearch(): Promise<never> {
    throw new NotFoundException();
  }

  /**
   * POST /crm/subscribers/search — búsqueda libre del listado o lookup exacto por PII.
   */
  @Post('search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buscar suscriptores para listado y lookup exacto' })
  @ApiExtraModels(ListMetaDto)
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['search'],
          properties: { search: { type: 'string', minLength: 1, maxLength: 200 } },
          additionalProperties: false,
        },
        {
          type: 'object',
          minProperties: 1,
          properties: {
            documentNumber: { type: 'string' },
            nit: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
          },
          additionalProperties: false,
        },
      ],
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'array',
          items: SUBSCRIBER_LIST_ITEM_OPENAPI_SCHEMA,
        },
        total: { type: 'integer', minimum: 0 },
        meta: { $ref: getSchemaPath(ListMetaDto) },
      },
    },
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  @ApiQuery({ name: 'status', required: false, enum: SubscriberStatus })
  @ApiQuery({ name: 'personType', required: false, enum: PersonType })
  @ApiQuery({ name: 'customerSegment', required: false, enum: CustomerSegment })
  @ApiQuery({ name: 'stratum', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'contactPending', required: false, type: Boolean })
  @ApiQuery({ name: 'fiscalIncomplete', required: false, type: Boolean })
  @ApiQuery({ name: 'withoutLiveServices', required: false, type: Boolean })
  async search(
    @Body(new ZodBodyValidationPipe(SearchSubscribersSchema)) body: SearchSubscribersInput,
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: SubscriberStatus,
    @Query('personType') personType?: PersonType,
    @Query('customerSegment') customerSegment?: CustomerSegment,
    @Query('stratum') stratum?: number,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('contactPending', new ParseBoolPipe({ optional: true })) contactPending?: boolean,
    @Query('fiscalIncomplete', new ParseBoolPipe({ optional: true })) fiscalIncomplete?: boolean,
    @Query('withoutLiveServices', new ParseBoolPipe({ optional: true }))
    withoutLiveServices?: boolean,
  ) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const filters = {
      status: status ?? undefined,
      personType: personType ?? undefined,
      customerSegment: customerSegment ?? undefined,
      stratum: stratum ? Number(stratum) : undefined,
      page,
      limit,
      sortBy: sortBy ?? undefined,
      sortDir: sortDir ?? undefined,
      contactPending,
      fiscalIncomplete,
      withoutLiveServices,
    };

    if (body.search !== undefined) {
      const result = await this.subscribersService.findAll({
        ...filters,
        search: body.search,
        excludeBlocked: !readAccess.canSeeBlocked,
        canSeeBlocked: readAccess.canSeeBlocked,
      });
      await this.logListAccess(
        user,
        { ...filters, searchApplied: true, exactCriteriaApplied: false },
        result.meta,
        result.data.length,
        readAccess.canSeeBlocked
          ? result.data.filter((subscriber) => this.isBlocked(subscriber)).length
          : undefined,
      );
      return {
        data: result.data.map((subscriber) =>
          projectSubscriberForList(subscriber, user.role, readAccess.canSeeBlocked),
        ),
        total: result.total,
        meta: result.meta,
      };
    }

    if (Object.values(filters).some((value) => value !== undefined)) {
      throw new BadRequestException(
        'Los filtros y la paginación solo se admiten con búsqueda libre de listado.',
      );
    }

    const results = await this.subscribersService.search({
      ...body,
      excludeBlocked: !readAccess.canSeeBlocked,
      canSeeBlocked: readAccess.canSeeBlocked,
    });
    await this.logListAccess(
      user,
      { ...filters, searchApplied: false, exactCriteriaApplied: true },
      null,
      results.length,
      readAccess.canSeeBlocked
        ? results.filter((subscriber) => this.isBlocked(subscriber)).length
        : undefined,
    );

    return {
      data: results.map((subscriber) =>
        projectSubscriberForList(subscriber, user.role, readAccess.canSeeBlocked),
      ),
    };
  }

  /**
   * GET /crm/subscribers/:id
   * Obtener suscriptor por ID con PII descifrado.
   * Roles: ADMIN, SALES, SUPPORT, ACCOUNTANT
   */
  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.TECHNICIAN,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Obtener suscriptor por ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const subscriber = await this.subscribersService.findById(id, readAccess.canSeeBlocked);
    const privacyMarks = await this.getPrivacyMarks(subscriber.partyId);
    const enrichedSubscriber = { ...subscriber, privacyMarks };
    await this.auditRecordAccess(
      id,
      user,
      this.isBlocked(enrichedSubscriber),
      readAccess.grantedBy,
    );
    return {
      data: this.sanitizeResponse(enrichedSubscriber, privacyMarks, readAccess.canSeeBlocked),
    };
  }

  /**
   * PATCH /crm/subscribers/:id
   * Actualizar suscriptor. Recalcula IVA si cambia personType o stratum.
   * Roles: ADMIN, SALES
   */
  @Patch(':id')
  @GuardBlockedTitular()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar suscriptor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(UpdateSubscriberSchema)) dto: UpdateSubscriberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const subscriber = await this.subscribersService.update(id, dto, user.sub);
    const privacyMarks = await this.getPrivacyMarks(subscriber.partyId);
    return { data: this.sanitizeResponse(subscriber, privacyMarks, readAccess.canSeeBlocked) };
  }

  /**
   * PATCH /crm/subscribers/:id/section/:section
   * Guardado parcial por sección para la vista 360°.
   */
  @Patch(':id/section/:section')
  @GuardBlockedTitular()
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar sección del subscriber' })
  async updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('section') section: string,
    @Body() payload: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const updated = await this.subscribersService.updateSection(id, section, payload, user.sub);
    const privacyMarks = await this.getPrivacyMarks(updated.partyId);
    return { data: this.sanitizeResponse(updated, privacyMarks, readAccess.canSeeBlocked) };
  }

  /**
   * DELETE /crm/subscribers/:id
   * Soft delete de suscriptor.
   * Roles: ADMIN
   */
  @Delete(':id')
  @GuardBlockedTitular()
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Eliminar suscriptor (soft delete)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    await this.subscribersService.remove(id, user.sub);
    return { data: { id, deleted: true } };
  }

  /**
   * PATCH /crm/subscribers/:id/status
   * Transición de estado del suscriptor.
   * Roles: ADMIN, SUPPORT
   */
  @Patch(':id/status')
  @GuardBlockedTitular()
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Transición de estado del suscriptor' })
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['targetStatus', 'reasonCode'],
          properties: {
            targetStatus: { type: 'string', enum: [SubscriberStatus.CANCELLED] },
            reasonCode: {
              type: 'string',
              enum: [
                'SOLICITUD_TITULAR',
                'MORA_PROLONGADA',
                'TRASLADO_SIN_COBERTURA',
                'USO_INDEBIDO',
                'DUPLICADO',
              ],
            },
            note: { type: 'string', maxLength: 500 },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['targetStatus'],
          properties: {
            targetStatus: {
              type: 'string',
              enum: [
                SubscriberStatus.LEAD,
                SubscriberStatus.PROSPECT,
                SubscriberStatus.ACTIVE,
                SubscriberStatus.SUSPENDED,
              ],
            },
            reason: { type: 'string', maxLength: 255 },
          },
        },
      ],
    },
  })
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(TransitionSubscriberStatusSchema))
    dto: TransitionStatusPayload,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    let subscriber: Subscriber;
    if (
      dto.targetStatus === SubscriberStatus.ACTIVE ||
      dto.targetStatus === SubscriberStatus.SUSPENDED
    ) {
      throw new ConflictException({
        code: 'SUBSCRIBER_STATUS_DERIVED',
        message:
          'El estado se deriva de los servicios. Usa la acción de ciclo de vida correspondiente.',
      });
    }
    if (dto.targetStatus === SubscriberStatus.CANCELLED) {
      await this.subscriberLifecycleService.cancelSubscriber(id, dto, user.sub, idempotencyKey);
      subscriber = await this.subscribersService.findById(id, readAccess.canSeeBlocked);
    } else {
      subscriber = await this.subscribersService.transitionStatus(
        id,
        dto.targetStatus,
        dto.reason ?? null,
        user.sub,
      );
    }
    const privacyMarks = await this.getPrivacyMarks(subscriber.partyId);
    const blocked = this.isBlocked({ ...subscriber, privacyMarks });
    if (blocked) await this.auditRecordAccess(id, user, true, readAccess.grantedBy);
    return {
      data: this.sanitizeResponse(subscriber, privacyMarks, readAccess.canSeeBlocked),
    };
  }

  @Get(':id/lifecycle-changes')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Consultar el historial de cambios de ciclo de vida' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  async lifecycleChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const subscriber = await this.subscribersService.findById(id, readAccess.canSeeBlocked);
    const privacyMarks = await this.getPrivacyMarks(subscriber.partyId);
    const blocked = this.isBlocked({ ...subscriber, privacyMarks });
    await this.auditRecordAccess(id, user, blocked, readAccess.grantedBy);
    if (blocked && !readAccess.canSeeBlocked) {
      throw new ForbiddenException({
        code: 'BLOCKED_DATA_READ_FORBIDDEN',
        message: 'No tiene permiso para consultar el historial de un titular con datos bloqueados.',
      });
    }
    const canReadNote =
      readAccess.permissions.has(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE) &&
      (!blocked || readAccess.canSeeBlocked);
    return {
      ...(await this.subscriberLifecycleService.listHistory(id, {
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
        canReadNote,
      })),
    };
  }

  /**
   * GET /crm/subscribers/:id/360
   * Ficha 360° del suscriptor (datos + contacts + contracts + habeas data).
   * Roles: ADMIN, SALES, SUPPORT, ACCOUNTANT
   */
  @Get(':id/360')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.ACCOUNTANT,
    UserRole.TECHNICIAN,
    UserRole.AUDITOR,
  )
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_READ)
  @ApiOperation({ summary: 'Ficha 360° del suscriptor' })
  async get360View(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const readAccess = await this.resolveBlockedReadAccess(user.sub);
    const view360 = await this.subscribersService.get360View(id, readAccess.canSeeBlocked);
    const privacyMarks = view360.privacyMarks ?? [];
    const enrichedSubscriber = { ...view360.subscriber, privacyMarks };
    const blocked = this.isBlocked(enrichedSubscriber);
    await this.auditRecordAccess(id, user, blocked, readAccess.grantedBy);
    const privacyRestricted = blocked && !readAccess.canSeeBlocked;
    const hasLiveContracts = view360.contracts.some(
      ({ status }) => status === ContractStatus.ACTIVE || status === ContractStatus.SUSPENDED,
    );
    const subscriberResponse = this.sanitizeResponse(
      enrichedSubscriber,
      privacyMarks,
      readAccess.canSeeBlocked,
    );
    subscriberResponse.hasLiveContracts = hasLiveContracts;
    return {
      data: {
        ...view360,
        subscriber: subscriberResponse,
        contracts: view360.contracts,
        expedienteSummary: privacyRestricted
          ? this.redactExpedienteSummary(view360.expedienteSummary)
          : view360.expedienteSummary,
      },
    };
  }

  private async logListAccess(
    user: JwtPayload,
    filters: Record<string, unknown>,
    meta: { page?: number | null; limit?: number | null; total?: number | null } | null,
    totalServed: number,
    blockedServed?: number,
  ): Promise<void> {
    const { searchApplied, exactCriteriaApplied, ...nonPersonalFilters } = filters;
    const entry: Parameters<AuditService['log']>[0] = {
      action: AuditAction.LIST_ACCESS,
      entityType: 'SubscriberList',
      entityId: 'N/A',
      userId: user.sub,
      newValue: {
        role: user.role,
        filters: {
          ...nonPersonalFilters,
          search: searchApplied ? '(aplicado)' : null,
          exactCriteria: exactCriteriaApplied ? '(aplicado)' : null,
        },
        pagination: meta
          ? {
              page: meta.page ?? null,
              limit: meta.limit ?? null,
              totalServed,
              totalAvailable: meta.total ?? null,
              ...(blockedServed !== undefined ? { blockedServed } : {}),
            }
          : { totalServed, ...(blockedServed !== undefined ? { blockedServed } : {}) },
      },
    };
    if (blockedServed !== undefined && blockedServed > 0) {
      await this.logBlockedDataAccess(entry);
      return;
    }
    await this.auditService.log(entry);
  }

  private async auditRecordAccess(
    id: string,
    user: JwtPayload,
    blocked: boolean,
    grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ',
  ): Promise<void> {
    const entry: Parameters<AuditService['log']>[0] = {
      action: AuditAction.RECORD_ACCESS,
      entityType: 'Subscriber',
      entityId: id,
      userId: user.sub,
      newValue: {
        role: user.role,
        ...(blocked && grantedBy ? { privacyMark: 'DATOS_BLOQUEADOS', grantedBy } : {}),
      },
    };
    if (blocked && grantedBy) {
      await this.logBlockedDataAccess(entry);
      return;
    }
    await this.auditService.log(entry);
  }

  private async logBlockedDataAccess(entry: Parameters<AuditService['log']>[0]): Promise<void> {
    try {
      const { schemaName } = TenantContext.getOrThrow();
      await runInTenantSchema(this.dataSource, schemaName, (queryRunner) =>
        this.auditService.logWithin(entry, queryRunner.manager),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_AUDIT_UNAVAILABLE',
        message: 'No se pudo registrar el acceso a los datos protegidos.',
      });
    }
  }

  private async resolveBlockedReadAccess(actorId: string): Promise<{
    canSeeBlocked: boolean;
    permissions: ReadonlySet<string>;
    grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ';
  }> {
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actorId),
    );
    if (permissions.has(AccessPermissionKey.PRIVACY_READ)) {
      return { canSeeBlocked: true, grantedBy: 'PRIVACY_READ', permissions };
    }
    if (permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)) {
      return { canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ', permissions };
    }
    return { canSeeBlocked: false, permissions };
  }

  private async getPrivacyMarks(partyId: string | null): Promise<PrivacyMark[]> {
    if (!partyId) return [];
    const marksByParty = await this.privacyMarksReadPort.activeMarks([partyId]);
    return marksByParty[partyId] ?? [];
  }

  private isBlocked(subscriber: SubscriberWithDecryptedFields): boolean {
    return !subscriber.anonymizedAt && (subscriber.privacyMarks ?? []).includes('DATOS_BLOQUEADOS');
  }

  private redactExpedienteSummary(
    summary: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!summary) return null;
    const allowed = new Set(['id', 'status', 'source', 'createdAt', 'statusChangedAt']);
    return Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [key, allowed.has(key) ? value : null]),
    );
  }

  private toIsoOrNull(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  /**
   * Sanitiza la respuesta eliminando campos cifrados internos
   * y exponiendo solo los campos descifrados.
   */
  private sanitizeResponse(
    subscriber: SubscriberWithDecryptedFields,
    privacyMarks: PrivacyMark[] = subscriber.privacyMarks ?? [],
    canSeeBlocked = false,
  ): Record<string, unknown> {
    const anonymizedAt = this.toIsoOrNull(subscriber.anonymizedAt);
    const privacyRestricted =
      anonymizedAt === null && privacyMarks.includes('DATOS_BLOQUEADOS') && !canSeeBlocked;
    const result: Record<string, unknown> = {
      id: subscriber.id,
      tenantId: subscriber.tenantId,
      partyId: subscriber.partyId,
      userId: subscriber.userId,
      personType: subscriber.personType,
      customerSegment: subscriber.customerSegment,
      documentType: subscriber.documentType,
      contactPending: !hasRealContact(subscriber),
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      stratum: subscriber.stratum,
      birthDate: subscriber.birthDate,
      nit: subscriber.nit,
      nitVerificationDigit: subscriber.nitVerificationDigit,
      businessName: subscriber.businessName,
      commercialName: subscriber.commercialName,
      legalRepresentative:
        subscriber.legalRepresentativePartyId && subscriber.legalRepresentativeDisplayName
          ? {
              partyId: subscriber.legalRepresentativePartyId,
              displayName: subscriber.legalRepresentativeDisplayName,
            }
          : null,
      altContactName: subscriber.altContactName,
      whatsapp: subscriber.whatsapp,
      vatTreatment: subscriber.vatTreatment,
      vatResponsibility: subscriber.vatResponsibility,
      rutResponsibilities: subscriber.rutResponsibilities ?? [],
      fiscalCompleteness: evaluateSubscriberFiscalCompleteness(subscriber),
      taxRegime: subscriber.taxRegime,
      address: subscriber.address,
      neighborhood: subscriber.neighborhood,
      city: subscriber.city,
      department: subscriber.department,
      postalCode: subscriber.postalCode,
      latitude: subscriber.latitude,
      longitude: subscriber.longitude,
      coverageNodeId: subscriber.coverageNodeId,
      expedienteId: subscriber.expedienteId,
      convertedAt: subscriber.convertedAt,
      activatedAt: subscriber.activatedAt,
      manualOverrideReason: subscriber.manualOverrideReason,
      status: subscriber.status,
      externalId: subscriber.externalId,
      createdBy: subscriber.createdBy,
      createdAt: subscriber.createdAt,
      updatedAt: subscriber.updatedAt,
      deletedAt: subscriber.deletedAt,
      privacyMarks,
      privacyRestricted,
      anonymizedAt,
      anonymizedRequestId: subscriber.anonymizedRequestId ?? null,
    };

    // Campos descifrados (si existen en el objeto)
    if ('documentNumber' in subscriber) result.documentNumber = subscriber.documentNumber;
    if ('email' in subscriber) result.email = subscriber.email;
    if ('phone' in subscriber) result.phone = subscriber.phone;
    if ('altContactPhone' in subscriber) result.altContactPhone = subscriber.altContactPhone;

    if (privacyRestricted || anonymizedAt !== null) {
      const allowed = new Set([
        'id',
        'tenantId',
        'partyId',
        'userId',
        'personType',
        'customerSegment',
        'documentType',
        'status',
        'vatTreatment',
        'taxRegime',
        'expedienteId',
        'convertedAt',
        'activatedAt',
        'createdAt',
        'updatedAt',
        'privacyMarks',
        'privacyRestricted',
        'anonymizedAt',
        'anonymizedRequestId',
        'contactPending',
        'vatResponsibility',
        'rutResponsibilities',
        'fiscalCompleteness',
      ]);
      for (const key of Object.keys(result)) {
        if (!allowed.has(key)) result[key] = null;
      }
      result.contactPending = false;
      result.documentNumber = null;
      result.email = null;
      result.phone = null;
      result.altContactPhone = null;
    }

    return result;
  }
}
