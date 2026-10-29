import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  RetentionPolicy,
  UpdateRetentionPolicy,
  UserRole,
  retentionPolicySchema,
  updateRetentionPolicySchema,
} from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { RetentionService } from './retention.service';
import {
  retentionPoliciesResponseSchema,
  retentionPolicyResponseSchema,
  updateRetentionPolicyRequestSchema,
} from '../privacy-openapi.schemas';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@AuditEntity('RetentionPolicy')
@Controller('privacy/retention-policies')
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar el catálogo de periodos de conservación' })
  @ApiOkResponse({
    description: 'Periodos de conservación vigentes.',
    schema: retentionPoliciesResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list(): Promise<{ data: RetentionPolicy[] }> {
    const data = await this.retentionService.list();
    data.forEach((policy) => retentionPolicySchema.parse(policy));
    return { data };
  }

  @Patch()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @ApiOperation({ summary: 'Alargar un periodo de conservación' })
  @ApiBody({ schema: updateRetentionPolicyRequestSchema })
  @ApiOkResponse({
    description: 'Periodo ampliado o sin cambios.',
    schema: retentionPolicyResponseSchema,
  })
  @ApiBadRequestResponse({ description: 'No se permite acortar el periodo legal.' })
  @ApiNotFoundResponse({ description: 'La categoría de conservación no existe.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async extend(
    @Body(new ZodValidationPipe(updateRetentionPolicySchema)) dto: UpdateRetentionPolicy,
  ): Promise<{ data: RetentionPolicy }> {
    const data = await this.retentionService.extend(dto);
    return { data: retentionPolicySchema.parse(data) };
  }
}
