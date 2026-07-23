import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  PlatformRole,
  AccessPermissionKey,
  UserRole,
  type UsersBulkCreateAcceptedResponse,
  type UsersBulkJobResultResponse,
  type UsersBulkJobStatusResponse,
} from '@iwana/shared';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';
import {
  BulkCreateUsersRequestSchema,
  type BulkCreateUsersRequest,
} from './dto/bulk-create-users.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersBulkController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Contrato async (H-06 / D-3=A): acepta el lote y devuelve `jobId`.
   * Credenciales temporales solo vía `POST /users/bulk/jobs/:jobId/result`.
   * Sin envelope `{ data }` (H-11 — mismo precedente del bulk síncrono).
   */
  @Post('bulk')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipAudit()
  @ApiOperation({
    summary: 'Encolar creación de usuarios en lote (async BullMQ)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['users'],
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            required: ['email', 'role'],
            properties: {
              email: { type: 'string', format: 'email' },
              role: { type: 'string', description: 'Rol del usuario en el tenant' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phone: { type: 'string', description: 'Formato E.164 (ej: +573001234567)' },
              jobTitle: { type: 'string' },
              documentType: { type: 'string' },
              documentNumber: { type: 'string' },
              isOperationalResource: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave de idempotencia del lote (reintento seguro).',
  })
  @ApiResponse({
    status: 202,
    description: 'Lote aceptado; consultar estado con GET /users/bulk/jobs/:jobId.',
  })
  @ApiResponse({ status: 400, description: 'Payload inválido o Idempotency-Key faltante.' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador.' })
  async bulkCreate(
    @Body(new ZodValidationPipe(BulkCreateUsersRequestSchema))
    dto: BulkCreateUsersRequest,
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<UsersBulkCreateAcceptedResponse> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }
    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    return this.usersService.bulkCreate(
      dto.users,
      actor.sub,
      ipAddress || 'unknown',
      idempotencyKey.trim(),
    );
  }

  @Get('bulk/jobs/:jobId')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @ApiOperation({ summary: 'Estado de importación masiva (sin contraseñas)' })
  @ApiResponse({
    status: 200,
    description:
      'Estado del job. Incluye summary (total/succeeded/failed), failed[], y credentialsClaimed.',
  })
  @ApiResponse({ status: 404, description: 'Job no encontrado en este tenant.' })
  async getBulkJobStatus(@Param('jobId') jobId: string): Promise<UsersBulkJobStatusResponse> {
    return this.usersService.getBulkJobStatus(jobId);
  }

  @Post('bulk/jobs/:jobId/result')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @SkipAudit()
  @ApiOperation({
    summary: 'Reclamar resultado one-time (credenciales temporales)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resultado del lote con summary (total/succeeded/failed), succeeded[] (incluye temporaryPassword en primera reclamación), failed[]. Las contraseñas solo en la primera reclamación.',
  })
  @ApiResponse({ status: 400, description: 'El job aún no terminó.' })
  @ApiResponse({ status: 404, description: 'Job o resultado no disponible.' })
  async claimBulkJobResult(@Param('jobId') jobId: string): Promise<UsersBulkJobResultResponse> {
    return this.usersService.claimBulkJobResult(jobId);
  }
}
