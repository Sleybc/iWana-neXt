import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiExtraModels,
  ApiParam,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole, ExpedienteStatus } from '@iwana/shared';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
import { PipelineRecommendationService } from './pipeline-recommendation.service';
import { ExpedienteDetailBootstrapService } from './expediente-detail-bootstrap.service';
import { ExpedienteDetailBootstrapResponseDto } from './dto/expediente-detail-bootstrap.dto';
import { parseExpedienteListView } from './expediente-list-view';
import { CreateExpedienteDto, CreateExpedienteSchema } from './dto/create-expediente.dto';
import {
  ExpedienteSection,
  UpdateSectionBodyDto,
  UpdateSectionBodySchema,
} from './dto/update-section.dto';
import { TransitionStatusDto, TransitionStatusSchema } from './dto/transition-status.dto';
import {
  CreateContactAttemptDto,
  CreateContactAttemptSchema,
} from './dto/create-contact-attempt.dto';
import {
  CreateConsentDto,
  CreateConsentSchema,
  RevokeConsentDto,
  RevokeConsentSchema,
} from './dto/create-consent.dto';
import { CreateCoverageCheckDto, CreateCoverageCheckSchema } from './dto/create-coverage-check.dto';
import {
  UpdateDocumentSupportStatusBodyDto,
  UpdateDocumentSupportStatusSchema,
} from './dto/update-document-support-status.dto';
import {
  LinkInstallationOperationalRefsDto,
  LinkInstallationOperationalRefsSchema,
} from './dto/link-installation-operational-refs.dto';
import {
  ExpedienteTimelineQuerySchema,
  ExpedienteTimelineLegacyResponseSwaggerDto,
  ExpedienteTimelinePaginatedResponseSwaggerDto,
  ExpedienteContactTimelineEventSwaggerDto,
  ExpedienteResponsibilityTimelineEventSwaggerDto,
  ExpedienteAttributionTimelineEventSwaggerDto,
  ExpedientePipelineTimelineEventSwaggerDto,
  ExpedienteSystemTimelineEventSwaggerDto,
  type ExpedienteTimelineQueryDto,
} from './dto/expediente-timeline.dto';

/**
 * Roles administrativos que pueden ver la IP registrada en un consentimiento.
 *
 * Se compara contra `JwtPayload.role`, que es un `string`: tras ADR-061 §4 los
 * dos roles provienen de enums distintos, asi que el tipo comun es el literal.
 */
const ADMINISTRATIVE_ROLES: readonly string[] = [UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN];

interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/expedientes')
export class ExpedientesController {
  constructor(
    private readonly expedienteService: ExpedienteService,
    private readonly statusTransitionService: StatusTransitionService,
    private readonly completenessCalculator: CompletenessCalculator,
    private readonly pipelineRecommendationService: PipelineRecommendationService,
    private readonly detailBootstrapService: ExpedienteDetailBootstrapService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  // Audit manual limpio en ExpedienteService — evita PII descifrada en interceptor (SWEEP-01/03).
  @SkipAudit()
  @ApiOperation({ summary: 'Crear expediente con datos mínimos (nombre + canal de adquisición)' })
  async create(
    @Body(new ZodBodyValidationPipe(CreateExpedienteSchema)) dto: CreateExpedienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.create(dto, user.sub);
    return { data };
  }

  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.NOC,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar expedientes con filtros' })
  @ApiExtraModels(CrmListPaginationDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('status') status?: string,
    @Query('municipality') municipality?: string,
    @Query('search') search?: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
    @Query('assignedTo') assignedTo?: string,
    @Query('documentNumber') documentNumber?: string,
    @Query('includeCompleted') includeCompleted?: string,
    @Query('view') view?: string,
  ) {
    const result = await this.expedienteService.findAll({
      status: status as ExpedienteStatus | undefined,
      municipality: municipality ?? undefined,
      search: search ?? undefined,
      page,
      limit,
      assignedTo: assignedTo ?? undefined,
      documentNumber: documentNumber ?? undefined,
      includeCompleted: includeCompleted === 'true',
      view: parseExpedienteListView(view),
    });
    return result;
  }

  @Get(':id/bootstrap')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Obtener bootstrap seguro del detalle del expediente' })
  @ApiParam({ name: 'id', type: String, format: 'uuid', required: true })
  @ApiOkResponse({ type: ExpedienteDetailBootstrapResponseDto })
  async getBootstrap(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.detailBootstrapService.getDetailBootstrap(id, user.sub);
    return { data };
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Obtener expediente por ID con relaciones' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.expedienteService.findById(id);
    const completeness = await this.completenessCalculator.calculate(id);
    const pipelineRecommendation = await this.pipelineRecommendationService.getRecommendation(id);
    return {
      data,
      completeness,
      sectionCompleteness: completeness.sectionCompleteness,
      installationReadiness: completeness.installationReadiness,
      provisioningReadiness: (data as { provisioningReadiness?: unknown }).provisioningReadiness,
      missingRequirements: completeness.missingRequirements,
      pipelineRecommendation,
    };
  }

  @Patch(':id/sections/:section')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar una sección específica del expediente' })
  async updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('section') section: string,
    @Body(new ZodBodyValidationPipe(UpdateSectionBodySchema)) dto: UpdateSectionBodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!Object.values(ExpedienteSection).includes(section as ExpedienteSection)) {
      throw new BadRequestException({
        code: 'INVALID_EXPEDIENTE_SECTION',
        message: 'La sección solicitada no pertenece al expediente único.',
      });
    }

    const data = await this.expedienteService.updateSection(
      id,
      {
        section: section as ExpedienteSection,
        data: dto.data,
      },
      user.sub,
    );
    return { data };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Transición de estado del pipeline' })
  async transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(TransitionStatusSchema)) dto: TransitionStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const validation = await this.statusTransitionService.validateTransition(id, dto.targetStatus);

    if (!validation.valid) {
      const missingFields = validation.missingFields ?? [];
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message:
          missingFields.length > 0
            ? `La transición solicitada no está permitida para el expediente. Faltantes: ${missingFields.join(', ')}.`
            : 'La transición solicitada no está permitida para el expediente.',
        missingFields,
      });
    }

    const data = await this.expedienteService.transitionStatus(id, dto, user.sub);
    const completeness = await this.completenessCalculator.calculate(id);
    const pipelineRecommendation = await this.pipelineRecommendationService.getRecommendation(id);
    return {
      data,
      completeness,
      sectionCompleteness: completeness.sectionCompleteness,
      installationReadiness: completeness.installationReadiness,
      provisioningReadiness: (data as { provisioningReadiness?: unknown }).provisioningReadiness,
      missingRequirements: completeness.missingRequirements,
      pipelineRecommendation,
      transitionWarning:
        validation.warningTitle && validation.warningMessage
          ? {
              title: validation.warningTitle,
              message: validation.warningMessage,
              missingRequirements: validation.missingRequirements ?? [],
            }
          : null,
    };
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Reactivar expediente descartado' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.expedienteService.reactivate(id, user.sub);
    return { data };
  }

  @Get(':id/timeline')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Obtener timeline cronológico del expediente' })
  @ApiExtraModels(
    ExpedienteTimelineLegacyResponseSwaggerDto,
    ExpedienteTimelinePaginatedResponseSwaggerDto,
    ExpedienteContactTimelineEventSwaggerDto,
    ExpedienteResponsibilityTimelineEventSwaggerDto,
    ExpedienteAttributionTimelineEventSwaggerDto,
    ExpedientePipelineTimelineEventSwaggerDto,
    ExpedienteSystemTimelineEventSwaggerDto,
  )
  @ApiOkResponse({
    description: 'Envelope legacy sin query o envelope paginado con query de timeline.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ExpedienteTimelineLegacyResponseSwaggerDto) },
        { $ref: getSchemaPath(ExpedienteTimelinePaginatedResponseSwaggerDto) },
      ],
    },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    minimum: 1,
    description: 'Página 1-based. La cota compuesta page × limit no puede superar 500.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 5,
    minimum: 1,
    maximum: 50,
    description: 'Cantidad por página. La cota compuesta page × limit no puede superar 500.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['all', 'contact', 'asignaciones', 'pipeline', 'system'],
    example: 'all',
  })
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ExpedienteTimelineQuerySchema))
    query: ExpedienteTimelineQueryDto = {},
  ) {
    if (Object.keys(query).length === 0) {
      const timeline = await this.expedienteService.getTimelineSummary(id);
      return {
        data: {
          changes: timeline.changes,
          activities: timeline.activities,
          metadata: timeline.metadata,
        },
      };
    }

    return this.expedienteService.getTimelinePage(
      id,
      query.page,
      query.limit,
      query.filter ?? 'all',
    );
  }

  @Get(':id/document-supports')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar soportes documentales del expediente' })
  async getDocumentSupports(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('personType') personTypeOverride?: string,
  ) {
    const data = await this.expedienteService.getDocumentSupports(id, personTypeOverride);
    return { data };
  }

  @Post(':id/document-supports/:documentKey/upload')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @SkipAudit()
  @ApiOperation({ summary: 'Subir o reemplazar un soporte documental del expediente' })
  async uploadDocumentSupport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @UploadedFile() file: UploadedDocumentFile,
    @CurrentUser() user: JwtPayload,
    @Query('personType') personTypeOverride?: string,
  ) {
    const data = await this.expedienteService.uploadDocumentSupport(
      id,
      documentKey,
      file,
      user.sub,
      personTypeOverride,
    );
    return { data };
  }

  @Patch(':id/document-supports/:documentKey/:versionId/status')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar estado de revisión de un soporte documental' })
  async updateDocumentSupportStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @Param('versionId') versionId: string,
    @Body(new ZodBodyValidationPipe(UpdateDocumentSupportStatusSchema))
    dto: UpdateDocumentSupportStatusBodyDto,
    @CurrentUser() user: JwtPayload,
    @Query('personType') personTypeOverride?: string,
  ) {
    const data = await this.expedienteService.updateDocumentSupportStatus(
      id,
      documentKey,
      versionId,
      dto.status,
      user.sub,
      dto.note,
      personTypeOverride,
    );
    return { data };
  }

  @Delete(':id/document-supports/:documentKey/:versionId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Eliminar una versión específica de soporte documental' })
  async deleteDocumentSupport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: JwtPayload,
    @Query('personType') personTypeOverride?: string,
  ) {
    const data = await this.expedienteService.deleteDocumentSupport(
      id,
      documentKey,
      versionId,
      user.sub,
      personTypeOverride,
    );
    return { data };
  }

  @Get(':id/document-supports/:documentKey/:versionId/file')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Descargar una versión específica de soporte documental' })
  async getDocumentSupportFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @Param('versionId') versionId: string,
    @Res() response: Response,
  ) {
    const file = await this.expedienteService.getDocumentSupportFile(id, documentKey, versionId);
    response.setHeader('Content-Type', file.mimeType);
    return response.download(file.filePath, file.fileName);
  }

  @Post(':id/contact-attempts')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar intento de contacto del expediente' })
  async createContactAttempt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(CreateContactAttemptSchema)) dto: CreateContactAttemptDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.createContactAttempt(id, dto, user.sub);
    return { data };
  }

  @Get(':id/contact-attempts')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar intentos de contacto del expediente' })
  @ApiExtraModels(CrmListPaginationDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async listContactAttempts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
  ) {
    return this.expedienteService.listContactAttempts(id, page, limit);
  }

  @Post(':id/consents')
  @Roles(UserRole.ADMIN, UserRole.SALES, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar consentimiento del expediente' })
  async createConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(CreateConsentSchema)) dto: CreateConsentDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor)
      ? (forwardedFor[0] ?? request.ip ?? null)
      : (forwardedFor?.split(',')[0]?.trim() ?? request.ip ?? null);

    const data = await this.expedienteService.createConsent(id, dto, user.sub, ipAddress);
    return { data };
  }

  @Get(':id/consents')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar consentimientos del expediente' })
  async listConsents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.expedienteService.listConsents(id);
    const canViewIpAddress = ADMINISTRATIVE_ROLES.includes(user.role);
    return {
      data: data.map((consent) => ({
        ...consent,
        ipAddress: canViewIpAddress ? consent.ipAddress : null,
      })),
    };
  }

  @Patch(':id/consents/:consentId/revoke')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Revocar consentimiento del expediente' })
  async revokeConsent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body(new ZodBodyValidationPipe(RevokeConsentSchema)) dto: RevokeConsentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.revokeConsent(id, consentId, dto.reason, user.sub);
    return { data };
  }

  @Post(':id/coverage-checks')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICIAN, PlatformRole.SYSTEM_ADMIN)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar verificación de cobertura del expediente' })
  async createCoverageCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(CreateCoverageCheckSchema)) dto: CreateCoverageCheckDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.createCoverageCheck(id, dto, user.sub);
    return { data };
  }

  @Get(':id/coverage-checks')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICIAN, PlatformRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar verificaciones de cobertura del expediente' })
  async listCoverageChecks(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.expedienteService.listCoverageChecks(id);
    return { data };
  }

  @Patch(':id/installation-operational-refs')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Vincular referencias operativas de instalación al expediente' })
  async linkInstallationOperationalRefs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(LinkInstallationOperationalRefsSchema))
    dto: LinkInstallationOperationalRefsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.linkInstallationOperationalRefs(id, dto, user.sub);
    return { data };
  }
}

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('crm/pipeline')
export class PipelineController {
  constructor(private readonly expedienteService: ExpedienteService) {}

  @Get('summary')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Resumen del pipeline por estado' })
  async getSummary() {
    return this.expedienteService.getPipelineSummary();
  }
}
