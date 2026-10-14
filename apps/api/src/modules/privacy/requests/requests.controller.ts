import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AccessPermissionKey,
  completeRequestSchema,
  completeRequestTaskSchema,
  CreateDataSubjectRequest,
  createDataSubjectRequestSchema,
  extendRequestSchema,
  listDataSubjectRequestsQuerySchema,
  ListDataSubjectRequestsQuery,
  rejectRequestSchema,
  requireInfoRequestSchema,
  resolveRequestSchema,
  transferRequestSchema,
  verifyIdentityRequestSchema,
  VerifyIdentityRequest,
} from '@iwana/shared';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@iwana/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PrivacyRequestsService } from './requests.service';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@AuditEntity('DataSubjectRequest')
@Controller('privacy/requests')
export class PrivacyRequestsController {
  constructor(private readonly requestsService: PrivacyRequestsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Radicar una solicitud del titular' })
  @ApiBody({
    schema: { type: 'object', description: 'Solicitud y datos cifrados del solicitante.' },
  })
  @ApiCreatedResponse({ description: 'Solicitud radicada.' })
  @ApiBadRequestResponse({ description: 'Los datos de radicación no cumplen el contrato.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async create(
    @Body(new ZodValidationPipe(createDataSubjectRequestSchema)) dto: CreateDataSubjectRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    const data = await this.requestsService.create(dto, request.user.sub);
    return { data };
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar la bandeja de solicitudes' })
  @ApiOkResponse({ description: 'Lista paginada, sin datos personales del solicitante.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list(
    @Query(new ZodValidationPipe(listDataSubjectRequestsQuerySchema))
    query: ListDataSubjectRequestsQuery,
  ) {
    return this.requestsService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @SkipAudit()
  @ApiOperation({ summary: 'Consultar una solicitud y su historial' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description:
      'Detalle con estado de identidad; los datos del solicitante solo se incluyen con privacy.manage.',
  })
  @ApiNotFoundResponse({ description: 'No existe la solicitud indicada.' })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const data = await this.requestsService.get(id, request.user.sub);
    if (data.request.requester) response.setHeader('Cache-Control', 'no-store');
    return { data };
  }

  @Post(':id/require-info')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Solicitar la información que falta' })
  async requireInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(requireInfoRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.requestsService.transition(id, 'require-info', body, request.user.sub),
    };
  }

  @Post(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Completar la revisión de identidad y contenido' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.transition(id, 'complete', body, request.user.sub) };
  }

  @Post(':id/extend')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar una prórroga motivada' })
  async extend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(extendRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.transition(id, 'extend', body, request.user.sub) };
  }

  @Post(':id/resolve')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Resolver una solicitud' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.transition(id, 'resolve', body, request.user.sub) };
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Declarar una solicitud no procedente' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.transition(id, 'reject', body, request.user.sub) };
  }

  @Post(':id/transfer')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Trasladar una solicitud a la entidad competente' })
  async transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transferRequestSchema)) body: Record<string, unknown>,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.transition(id, 'transfer', body, request.user.sub) };
  }

  @Get(':id/evidence')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar temporalmente la evidencia del solicitante' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description: 'URL firmada de corta duración; la respuesta no se almacena en caché.',
    schema: {
      type: 'object',
      required: ['url', 'expiresAt'],
      properties: {
        url: { type: 'string', format: 'uri' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
      additionalProperties: false,
    },
  })
  @ApiNotFoundResponse({ description: 'No existe evidencia disponible para esta solicitud.' })
  async getEvidence(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
    return this.requestsService.getRequesterEvidence(id, request.user.sub);
  }

  @Post(':id/verify-identity')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Verificar la identidad de una solicitud radicada' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ schema: { type: 'object', description: 'Método y evidencia de verificación.' } })
  @ApiOkResponse({ description: 'Identidad verificada y evento registrado.' })
  @ApiConflictResponse({ description: 'La solicitud ya fue verificada o no admite esta acción.' })
  async verifyIdentity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(verifyIdentityRequestSchema)) body: VerifyIdentityRequest,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.requestsService.verifyIdentity(id, body, request.user.sub) };
  }

  @Post(':id/tasks/:taskId/complete')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Marcar una tarea manual como completada' })
  async completeTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body(new ZodValidationPipe(completeRequestTaskSchema)) body: { note: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: await this.requestsService.completeTask(id, taskId, body.note, request.user.sub),
    };
  }
}
