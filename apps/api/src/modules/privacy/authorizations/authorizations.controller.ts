import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessPermissionKey, AuditAction, CreateDataAuthorization, UserRole } from '@iwana/shared';
import type { Request } from 'express';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { AuditService } from '../../audit/audit.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  authorizationProofSchema,
  createDataAuthorizationSchema,
  dataAuthorizationViewSchema,
} from '@iwana/shared';
import { AuthorizationsService } from './authorizations.service';
import {
  authorizationListResponseSchema,
  authorizationProofResponseSchema,
  createAuthorizationRequestSchema,
  createAuthorizationResponseSchema,
} from '../privacy-openapi.schemas';

type AuthenticatedRequest = Request & { user: JwtPayload };

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@AuditEntity('DataAuthorization')
@Controller('privacy')
export class AuthorizationsController {
  constructor(
    private readonly authorizationsService: AuthorizationsService,
    private readonly auditService: AuditService,
  ) {}

  @Post('authorizations')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Registrar una autorización o revocación del titular' })
  @ApiBody({ schema: createAuthorizationRequestSchema })
  @ApiCreatedResponse({
    description: 'Autorización anexada.',
    schema: createAuthorizationResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple el contrato de autorización.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async create(
    @Body(new ZodValidationPipe(createDataAuthorizationSchema)) dto: CreateDataAuthorization,
    @Req() request: AuthenticatedRequest,
  ) {
    const userAgentHeader = request.headers['user-agent'];
    const data = await this.authorizationsService.create(dto, {
      actorId: request.user.sub,
      ip: request.ip ?? request.socket.remoteAddress ?? null,
      userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : null,
    });
    return { data };
  }

  @Get('parties/:partyId/authorizations')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar autorizaciones del titular' })
  @ApiParam({ name: 'partyId', format: 'uuid' })
  @ApiOkResponse({
    description: 'Autorizaciones sin evidencia binaria ni datos de conexión.',
    schema: authorizationListResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async listForParty(@Param('partyId', ParseUUIDPipe) partyId: string) {
    const data = await this.authorizationsService.listForParty(partyId);
    data.forEach((record) => dataAuthorizationViewSchema.parse(record));
    return { data };
  }

  @Get('parties/:partyId/authorizations/:id/proof')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @SkipAudit()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar la prueba de una autorización' })
  @ApiParam({ name: 'partyId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    description: 'Versión, hash y URL temporal de evidencia.',
    schema: authorizationProofResponseSchema,
  })
  @ApiNotFoundResponse({ description: 'No existe soporte legal para esta autorización.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async proof(
    @Param('partyId', ParseUUIDPipe) partyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const data = await this.authorizationsService.proof(partyId, id);
    await this.auditService.log({
      action: AuditAction.RECORD_ACCESS,
      entityType: 'DataAuthorization',
      entityId: id,
      userId: request.user.sub,
      newValue: {
        operation: 'AUTHORIZATION_PROOF_VIEWED',
        authorizationId: id,
      },
    });
    return { data: authorizationProofSchema.parse(data) };
  }
}
