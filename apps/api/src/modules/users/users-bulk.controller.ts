import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import {
  BulkCreateUsersRequestSchema,
  type BulkCreateUsersRequest,
  type BulkCreateUsersResponse,
} from './dto/bulk-create-users.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersBulkController {
  constructor(private readonly usersService: UsersService) {}

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear usuarios en lote' })
  @ApiResponse({ status: 201, description: 'Procesamiento completado (éxito parcial posible).' })
  @ApiResponse({ status: 400, description: 'Payload inválido o sin usuarios.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador.' })
  async bulkCreate(
    @Body(new ZodValidationPipe(BulkCreateUsersRequestSchema))
    dto: BulkCreateUsersRequest,
  ): Promise<BulkCreateUsersResponse> {
    return this.usersService.bulkCreate(dto.users);
  }
}
