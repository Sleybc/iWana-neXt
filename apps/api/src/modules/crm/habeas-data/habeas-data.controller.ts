import { Controller, GoneException, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole } from '@iwana/shared';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';

@ApiTags('habeas-data')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class HabeasDataController {
  private retired(): never {
    throw new GoneException({
      code: 'PRIVACY_ROUTE_RETIRED',
      message: 'Este flujo fue trasladado al módulo de privacidad.',
      redirectTo: '/privacy',
    });
  }

  @Post('subscribers/:subscriberId/habeas-data/consent')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Registrar consentimiento Habeas Data de suscriptor' })
  @ApiResponse({ status: 201 })
  createConsent(): never {
    return this.retired();
  }

  @Get('subscribers/:subscriberId/habeas-data/consents')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar historial de consentimientos del suscriptor' })
  listConsents(): never {
    return this.retired();
  }

  @Post('subscribers/:subscriberId/habeas-data/arco')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Crear solicitud ARCO para suscriptor' })
  createArcoRequest(): never {
    return this.retired();
  }

  @Get('subscribers/:subscriberId/habeas-data/arco')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar solicitudes ARCO del suscriptor' })
  listArcoRequests(): never {
    return this.retired();
  }

  @Patch('habeas-data/arco/:requestId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @ApiOperation({ summary: 'Actualizar estado de solicitud ARCO' })
  patchArcoStatus(): never {
    return this.retired();
  }
}
