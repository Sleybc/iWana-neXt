import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  AccessPermissionKey,
  UpdatePurposeSettings,
  updatePurposeSettingsSchema,
} from '@iwana/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@iwana/shared';
import {
  purposeSettingsResponseSchema,
  updatePurposeSettingsRequestSchema,
} from '../privacy-openapi.schemas';
import { PurposesService } from './purposes.service';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('privacy/purposes')
export class PurposesController {
  constructor(private readonly service: PurposesService) {}

  @Get()
  @ApiOperation({ summary: 'Consultar las finalidades de la empresa' })
  @ApiOkResponse({ schema: purposeSettingsResponseSchema })
  async list() {
    return { data: await this.service.list() };
  }

  @Put()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar las finalidades de la empresa' })
  @ApiBody({ schema: updatePurposeSettingsRequestSchema })
  @ApiOkResponse({ schema: purposeSettingsResponseSchema })
  @ApiUnprocessableEntityResponse({
    description: 'La finalidad requerida no se puede deshabilitar.',
  })
  async update(
    @Body(new ZodValidationPipe(updatePurposeSettingsSchema)) body: UpdatePurposeSettings,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return { data: await this.service.update(body, request.user.sub) };
  }
}
