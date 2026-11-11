import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  UpdateOperatorContractProfileSchema,
  UserRole,
  type UpdateOperatorContractProfileInput,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { OperatorContractProfileService } from './operator-contract-profile.service';
import {
  operatorContractProfileResponseSchema,
  updateOperatorContractProfileRequestSchema,
} from './operator-contract-profile.openapi';

type AuthenticatedRequest = {
  user: JwtPayload;
  ip: string;
  headers: Record<string, string | string[] | undefined>;
};

function header(req: AuthenticatedRequest, key: string): string | null {
  const value = req.headers[key];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

/**
 * Datos del operador para el contrato (cierre de venta A0, CA-11). La respuesta lleva
 * `meta.missingFields`: los datos obligatorios que faltan para generar el contrato.
 */
@ApiTags('organization')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('organization/contract-profile')
export class OperatorContractProfileController {
  constructor(private readonly service: OperatorContractProfileService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.HR)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_READ)
  @ApiOperation({ summary: 'Consultar los datos del operador para el contrato' })
  @ApiOkResponse({
    description: 'Datos del operador y obligatorios faltantes.',
    schema: operatorContractProfileResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async get() {
    const view = await this.service.get();
    return { data: view.profile, meta: { missingFields: view.missingFields } };
  }

  @Put()
  @Roles(UserRole.ADMIN)
  @Permissions(AccessPermissionKey.ORGANIZATION_SITES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Reemplazar los datos del operador para el contrato' })
  @ApiBody({ schema: updateOperatorContractProfileRequestSchema })
  @ApiOkResponse({
    description: 'Datos guardados y obligatorios faltantes.',
    schema: operatorContractProfileResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'El cuerpo no cumple el contrato.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async update(
    @Body(new ZodValidationPipe(UpdateOperatorContractProfileSchema))
    dto: UpdateOperatorContractProfileInput,
    @Request() req: AuthenticatedRequest,
  ) {
    const view = await this.service.update(dto, {
      userId: req.user.sub,
      ipAddress: req.ip,
      userAgent: header(req, 'user-agent'),
      requestId: header(req, 'x-request-id'),
    });
    return { data: view.profile, meta: { missingFields: view.missingFields } };
  }
}
