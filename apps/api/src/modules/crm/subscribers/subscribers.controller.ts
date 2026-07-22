import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PlatformRole,
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  UserRole,
} from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  /**
   * POST /crm/subscribers
   * Crear un nuevo suscriptor.
   * Roles: ADMIN, SALES
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN, PlatformRole.IWANA_SUPPORT)
  // Audit manual limpio en SubscribersService — evita PII en newValue del interceptor (SWEEP-01).
  @SkipAudit()
  @ApiOperation({ summary: 'Crear suscriptor' })
  async create(
    @Body(new ZodBodyValidationPipe(CreateSubscriberSchema)) dto: CreateSubscriberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const isManualOverride = Boolean(dto.manualOverrideReason?.trim());
    if (isManualOverride && !ADMINISTRATIVE_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'La creación manual fuera de flujo automático requiere rol administrativo.',
      );
    }

    const subscriber = await this.subscribersService.create(dto, user.sub);
    return { data: this.sanitizeResponse(subscriber) };
  }

  /**
   * GET /crm/subscribers
   * Listar suscriptores con filtros y paginación.
   * Roles: ADMIN, NOC, SALES, SUPPORT, ACCOUNTANT
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Listar suscriptores con filtros' })
  async findAll(
    @Query('status') status?: SubscriberStatus,
    @Query('personType') personType?: PersonType,
    @Query('customerSegment') customerSegment?: CustomerSegment,
    @Query('stratum') stratum?: number,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.subscribersService.findAll({
      status: status ?? undefined,
      personType: personType ?? undefined,
      customerSegment: customerSegment ?? undefined,
      stratum: stratum ? Number(stratum) : undefined,
      search: search ?? undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return {
      data: result.data.map((s) => this.sanitizeResponse(s)),
      total: result.total,
    };
  }

  /**
   * GET /crm/subscribers/search
   * Búsqueda determinista por documento, NIT, email o teléfono.
   * Roles: ADMIN, NOC, SALES, SUPPORT, ACCOUNTANT
   */
  @Get('search')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Buscar suscriptor por documento, NIT, email o teléfono' })
  async search(
    @Query('documentNumber') documentNumber?: string,
    @Query('nit') nit?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
  ) {
    const results = await this.subscribersService.search({
      documentNumber: documentNumber ?? undefined,
      nit: nit ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
    });

    return { data: results.map((s) => this.sanitizeResponse(s)) };
  }

  /**
   * GET /crm/subscribers/:id
   * Obtener suscriptor por ID con PII descifrado.
   * Roles: ADMIN, SALES, SUPPORT, ACCOUNTANT
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Obtener suscriptor por ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const subscriber = await this.subscribersService.findById(id);
    return { data: this.sanitizeResponse(subscriber) };
  }

  /**
   * PATCH /crm/subscribers/:id
   * Actualizar suscriptor. Recalcula IVA si cambia personType o stratum.
   * Roles: ADMIN, SALES
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Ficha 360° del suscriptor' })
  async get360View(@Param('id', ParseUUIDPipe) id: string) {
    const view360 = await this.subscribersService.get360View(id);
    return { data: { ...view360, subscriber: this.sanitizeResponse(view360.subscriber) } };
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
