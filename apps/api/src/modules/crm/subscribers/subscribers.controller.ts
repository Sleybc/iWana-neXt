import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  SearchSubscribersInput,
  SearchSubscribersSchema,
  PlatformRole,
  PersonType,
  CustomerSegment,
  DocumentType,
  SubscriberStatus,
  VatTreatment,
  UserRole,
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
import { CreateSubscriberDto, CreateSubscriberSchema } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto, UpdateSubscriberSchema } from './dto/update-subscriber.dto';
import { Subscriber } from './entities/subscriber.entity';
import {
  TransitionSubscriberStatusDto,
  TransitionSubscriberStatusSchema,
} from './dto/transition-subscriber-status.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '@iwana/shared';
import { projectSubscriberForList } from './subscriber-projection';
import type { Request } from 'express';

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
};

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/subscribers')
export class SubscribersController {
  constructor(
    private readonly subscribersService: SubscribersService,
    private readonly auditService: AuditService,
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
  @ApiExtraModels(CrmListPaginationDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  @ApiQuery({ name: 'status', required: false, enum: SubscriberStatus })
  @ApiQuery({ name: 'personType', required: false, enum: PersonType })
  @ApiQuery({ name: 'customerSegment', required: false, enum: CustomerSegment })
  @ApiQuery({ name: 'stratum', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
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
    };

    const result = await this.subscribersService.findAll(filters);

    // ADR-067 §5: registro de acceso masivo a PII — se registran filtros y
    // dimensiones, nunca los datos leídos.
    await this.logListAccess(user, filters, result.meta, result.data.length);

    return {
      data: result.data.map((subscriber) => projectSubscriberForList(subscriber, user.role)),
      total: result.total,
      meta: result.meta,
    };
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
          items: {
            type: 'object',
            title: 'SubscriberListItem',
            required: [
              'id',
              'status',
              'personType',
              'customerSegment',
              'stratum',
              'vatTreatment',
              'documentType',
              'firstName',
              'lastName',
              'businessName',
              'commercialName',
              'createdAt',
            ],
            properties: {
              id: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: Object.values(SubscriberStatus) },
              personType: { type: 'string', enum: Object.values(PersonType) },
              customerSegment: { type: 'string', enum: Object.values(CustomerSegment) },
              stratum: { type: 'number', nullable: true },
              vatTreatment: { type: 'string', enum: Object.values(VatTreatment), deprecated: true },
              documentType: {
                type: 'string',
                enum: Object.values(DocumentType),
                nullable: true,
              },
              firstName: { type: 'string', nullable: true },
              lastName: { type: 'string', nullable: true },
              businessName: { type: 'string', nullable: true },
              commercialName: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              documentNumber: { type: 'string' },
              nit: { type: 'string' },
              nitVerificationDigit: { type: 'string' },
              phone: { type: 'string' },
              altContactPhone: { type: 'string' },
              whatsapp: { type: 'string' },
              email: { type: 'string', format: 'email' },
              address: { type: 'string' },
              neighborhood: { type: 'string' },
              city: { type: 'string' },
              department: { type: 'string' },
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
          },
        },
        total: { type: 'number' },
        meta: { type: 'object' },
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
    };

    if (body.search !== undefined) {
      const result = await this.subscribersService.findAll({ ...filters, search: body.search });
      await this.logListAccess(
        user,
        { ...filters, searchApplied: true, exactCriteriaApplied: false },
        result.meta,
        result.data.length,
      );
      return {
        data: result.data.map((subscriber) => projectSubscriberForList(subscriber, user.role)),
        total: result.total,
        meta: result.meta,
      };
    }

    if (Object.values(filters).some((value) => value !== undefined)) {
      throw new BadRequestException(
        'Los filtros y la paginación solo se admiten con búsqueda libre de listado.',
      );
    }

    const results = await this.subscribersService.search(body);
    await this.logListAccess(
      user,
      { ...filters, searchApplied: false, exactCriteriaApplied: true },
      null,
      results.length,
    );

    return { data: results.map((subscriber) => projectSubscriberForList(subscriber, user.role)) };
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
    const subscriber = await this.subscribersService.findById(id);
    await this.auditRecordAccess(id, user);
    return { data: this.sanitizeResponse(subscriber) };
  }

  /**
   * PATCH /crm/subscribers/:id
   * Actualizar suscriptor. Recalcula IVA si cambia personType o stratum.
   * Roles: ADMIN, SALES
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar suscriptor' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(UpdateSubscriberSchema)) dto: UpdateSubscriberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const subscriber = await this.subscribersService.update(id, dto, user.sub);
    return { data: this.sanitizeResponse(subscriber) };
  }

  /**
   * PATCH /crm/subscribers/:id/section/:section
   * Guardado parcial por sección para la vista 360°.
   */
  @Patch(':id/section/:section')
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
    const updated = await this.subscribersService.updateSection(id, section, payload, user.sub);
    return { data: this.sanitizeResponse(updated) };
  }

  /**
   * DELETE /crm/subscribers/:id
   * Soft delete de suscriptor.
   * Roles: ADMIN
   */
  @Delete(':id')
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
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Transición de estado del suscriptor' })
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(TransitionSubscriberStatusSchema))
    dto: TransitionSubscriberStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const subscriber = await this.subscribersService.transitionStatus(
      id,
      dto.targetStatus,
      dto.reason ?? null,
      user.sub,
    );
    return { data: this.sanitizeResponse(subscriber) };
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
    const view360 = await this.subscribersService.get360View(id);
    await this.auditRecordAccess(id, user);
    return { data: { ...view360, subscriber: this.sanitizeResponse(view360.subscriber) } };
  }

  private async logListAccess(
    user: JwtPayload,
    filters: Record<string, unknown>,
    meta: { page?: number | null; limit?: number | null; total?: number | null } | null,
    totalServed: number,
  ): Promise<void> {
    const { searchApplied, exactCriteriaApplied, ...nonPersonalFilters } = filters;
    await this.auditService.log({
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
            }
          : { totalServed },
      },
    });
  }

  private async auditRecordAccess(id: string, user: JwtPayload): Promise<void> {
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'Subscriber',
      entityId: id,
      userId: user.sub,
      newValue: { role: user.role },
    });
  }

  /**
   * Sanitiza la respuesta eliminando campos cifrados internos
   * y exponiendo solo los campos descifrados.
   */
  private sanitizeResponse(subscriber: SubscriberWithDecryptedFields): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: subscriber.id,
      tenantId: subscriber.tenantId,
      userId: subscriber.userId,
      personType: subscriber.personType,
      customerSegment: subscriber.customerSegment,
      documentType: subscriber.documentType,
      firstName: subscriber.firstName,
      lastName: subscriber.lastName,
      stratum: subscriber.stratum,
      birthDate: subscriber.birthDate,
      nit: subscriber.nit,
      nitVerificationDigit: subscriber.nitVerificationDigit,
      businessName: subscriber.businessName,
      commercialName: subscriber.commercialName,
      legalRepresentativeId: subscriber.legalRepresentativeId,
      altContactName: subscriber.altContactName,
      whatsapp: subscriber.whatsapp,
      vatTreatment: subscriber.vatTreatment,
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
    };

    // Campos descifrados (si existen en el objeto)
    if ('documentNumber' in subscriber) result.documentNumber = subscriber.documentNumber;
    if ('email' in subscriber) result.email = subscriber.email;
    if ('phone' in subscriber) result.phone = subscriber.phone;
    if ('altContactPhone' in subscriber) result.altContactPhone = subscriber.altContactPhone;

    return result;
  }
}
