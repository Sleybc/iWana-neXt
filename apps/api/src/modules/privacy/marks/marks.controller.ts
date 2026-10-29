import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { MarksService } from './marks.service';
import { privacyMarksResponseSchema } from '../privacy-openapi.schemas';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('privacy/parties/:partyId/marks')
export class MarksController {
  constructor(private readonly marksService: MarksService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar marcas de privacidad activas del titular' })
  @ApiParam({ name: 'partyId', format: 'uuid' })
  @ApiOkResponse({ description: 'Marcas activas del titular.', schema: privacyMarksResponseSchema })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async list(@Param('partyId', ParseUUIDPipe) partyId: string) {
    const data = await this.marksService.listForParty(partyId);
    return { data };
  }
}
