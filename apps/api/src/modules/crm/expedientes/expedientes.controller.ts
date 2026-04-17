import {
  BadRequestException,
  Body,
  Controller,
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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, ExpedienteStatus } from '@iwana/shared';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';
import { ExpedienteService } from './expediente.service';
import { StatusTransitionService } from './status-transition.service';
import { CompletenessCalculator } from './completeness-calculator.service';
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

interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/expedientes')
export class ExpedientesController {
  constructor(
    private readonly expedienteService: ExpedienteService,
    private readonly statusTransitionService: StatusTransitionService,
    private readonly completenessCalculator: CompletenessCalculator,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Crear expediente con datos mínimos (nombre + canal de adquisición)' })
  async create(
    @Body(new ZodBodyValidationPipe(CreateExpedienteSchema)) dto: CreateExpedienteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.create(dto, user.sub);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar expedientes con filtros' })
  async findAll(
    @Query('status') status?: string,
    @Query('municipality') municipality?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('assignedTo') assignedTo?: string,
    @Query('documentNumber') documentNumber?: string,
    @Query('includeCompleted') includeCompleted?: string,
  ) {
    const result = await this.expedienteService.findAll({
      status: status as ExpedienteStatus | undefined,
      municipality: municipality ?? undefined,
      search: search ?? undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      assignedTo: assignedTo ?? undefined,
      documentNumber: documentNumber ?? undefined,
      includeCompleted: includeCompleted === 'true',
    });
    return result;
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener expediente por ID con relaciones' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.expedienteService.findById(id);
    const completeness = await this.completenessCalculator.calculate(id);
    return { data, completeness };
  }

  @Patch(':id/sections/:section')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SYSTEM_ADMIN)
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
    return { data, completeness };
  }

  @Post(':id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Reactivar expediente descartado' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.expedienteService.reactivate(id, user.sub);
    return { data };
  }

  @Get(':id/timeline')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Obtener timeline cronológico del expediente' })
  async getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    const timeline = await this.expedienteService.getTimelineSummary(id);
    return {
      data: {
        changes: timeline.changes,
        activities: timeline.activities,
        metadata: timeline.metadata,
      },
    };
  }

  @Get(':id/document-supports')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar soportes documentales del expediente' })
  async getDocumentSupports(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('personType') personTypeOverride?: string,
  ) {
    const data = await this.expedienteService.getDocumentSupports(id, personTypeOverride);
    return { data };
  }

  @Post(':id/document-supports/:documentKey/upload')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Subir o reemplazar un soporte documental del expediente' })
  async uploadDocumentSupport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @UploadedFile() file: UploadedDocumentFile,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.uploadDocumentSupport(
      id,
      documentKey,
      file,
      user.sub,
    );
    return { data };
  }

  @Patch(':id/document-supports/:documentKey/:versionId/status')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Actualizar estado de revisión de un soporte documental' })
  async updateDocumentSupportStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentKey') documentKey: string,
    @Param('versionId') versionId: string,
    @Body(new ZodBodyValidationPipe(UpdateDocumentSupportStatusSchema))
    dto: UpdateDocumentSupportStatusBodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.expedienteService.updateDocumentSupportStatus(
      id,
      documentKey,
      versionId,
      dto.status,
      user.sub,
      dto.note,
    );
    return { data };
  }

  @Get(':id/document-supports/:documentKey/:versionId/file')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar intentos de contacto del expediente' })
  async listContactAttempts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.expedienteService.listContactAttempts(
      id,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Post(':id/consents')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar consentimientos del expediente' })
  async listConsents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    const data = await this.expedienteService.listConsents(id);
    const canViewIpAddress = [UserRole.ADMIN, UserRole.SYSTEM_ADMIN].includes(
      user.role as UserRole,
    );
    return {
      data: data.map((consent) => ({
        ...consent,
        ipAddress: canViewIpAddress ? consent.ipAddress : null,
      })),
    };
  }

  @Patch(':id/consents/:consentId/revoke')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICIAN, UserRole.SYSTEM_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICIAN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar verificaciones de cobertura del expediente' })
  async listCoverageChecks(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.expedienteService.listCoverageChecks(id);
    return { data };
  }
}

@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/pipeline')
export class PipelineController {
  constructor(private readonly expedienteService: ExpedienteService) {}

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Resumen del pipeline por estado' })
  async getSummary() {
    return this.expedienteService.getPipelineSummary();
  }
}
