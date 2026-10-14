import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  CreateLegalText,
  CurrentLegalTextQuery,
  LegalTextType,
  UserRole,
  createLegalTextSchema,
  currentLegalTextQuerySchema,
  legalTextSchema,
} from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { LegalTextsService } from './legal-texts.service';
import {
  createLegalTextRequestSchema,
  legalTextListResponseSchema,
  legalTextResponseSchema,
  currentLegalTextResponseSchema,
} from '../privacy-openapi.schemas';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditEntity('LegalText')
@Controller('privacy/legal-texts')
export class LegalTextsController {
  constructor(private readonly legalTextsService: LegalTextsService) {}

  @Get('current')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar la versión vigente de un texto legal' })
  @ApiQuery({
    name: 'type',
    required: true,
    enum: ['POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION'],
  })
  @ApiOkResponse({ description: 'Texto legal vigente.', schema: currentLegalTextResponseSchema })
  @ApiBadRequestResponse({ description: 'El tipo de texto no cumple el contrato.' })
  async current(
    @Query(new ZodValidationPipe(currentLegalTextQuerySchema)) query: CurrentLegalTextQuery,
  ) {
    const data = await this.legalTextsService.getCurrent(query.type);
    if (!data) {
      throw new NotFoundException({
        code: 'PRIVACY_LEGAL_TEXT_NOT_PUBLISHED',
        message: 'No hay una versión publicada para este tipo de texto.',
      });
    }
    return { data: legalTextSchema.parse(data) };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Listar versiones publicadas de textos legales' })
  @ApiOkResponse({
    description: 'Versiones publicadas e inmutables.',
    schema: legalTextListResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list() {
    const data = await this.legalTextsService.list();
    data.forEach((entry) => legalTextSchema.parse(entry));
    return { data };
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Publicar una nueva versión de texto legal' })
  @ApiBody({ schema: createLegalTextRequestSchema })
  @ApiCreatedResponse({ description: 'Nueva versión publicada.', schema: legalTextResponseSchema })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple el contrato de texto legal.' })
  @ApiConflictResponse({ description: 'Ya existe esa versión para el tipo de texto.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async create(@Body(new ZodValidationPipe(createLegalTextSchema)) dto: CreateLegalText) {
    const data = await this.legalTextsService.create(dto);
    return { data: legalTextSchema.parse(data) };
  }
}
