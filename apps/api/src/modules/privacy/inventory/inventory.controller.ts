import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  AccessPermissionKey,
  PrivacyInventory,
  UserRole,
  privacyInventorySchema,
} from '@iwana/shared';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { AuditEntity } from '../../audit/decorators/audit-entity.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { privacyInventoryResponseSchema } from '../privacy-openapi.schemas';
import { PrivacyInventoryService } from './inventory.service';

@ApiTags('privacy')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@AuditEntity('PrivacyInventory')
@Controller('privacy/inventory')
export class PrivacyInventoryController {
  constructor(private readonly inventoryService: PrivacyInventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  @Permissions(AccessPermissionKey.PRIVACY_READ)
  @ApiOperation({ summary: 'Consultar el inventario declarativo de datos personales' })
  @ApiOkResponse({
    description: 'Inventario declarativo sin conteos de registros.',
    schema: privacyInventoryResponseSchema,
  })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'El rol o permiso no permite esta acción.' })
  async getInventory(): Promise<{ data: PrivacyInventory }> {
    const data = privacyInventorySchema.parse(await this.inventoryService.getInventory());
    return { data };
  }
}
