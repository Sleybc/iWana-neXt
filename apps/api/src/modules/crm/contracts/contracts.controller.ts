import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessPermissionKey, PlatformRole, UserRole, type ListResponse } from '@iwana/shared';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ListMetaDto } from '../../../common/pagination';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Permissions } from '../../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../../access-control/guards/permissions.guard';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { CrmListPaginationDto } from '../dto/crm-list-pagination.dto';
import { CrmListLimitPipe, CrmListPagePipe } from '../pipes/crm-list-pagination.pipe';
import { ContractStatus } from '../enums/contract-status.enum';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractFromExpedienteDto } from './dto/create-contract-from-expediente.dto';
import { UpdateServicePointDto } from './dto/update-service-point.dto';
import { ContractResponseEnvelopeDto } from './dto/contract-response.dto';
import { ContractsService } from './contracts.service';
import { Contract } from './entities/contract.entity';
import { RejectClientStratumEvidenceGuard } from './guards/reject-client-stratum-evidence.guard';
import { SkipAudit } from '../../audit/decorators/skip-audit.decorator';
import { GuardBlockedTitular } from './guards/guard-blocked-titular.decorator';

const rejectClientStratumEvidenceGuard = new RejectClientStratumEvidenceGuard();

@ApiTags('contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller()
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly effectivePermissionsService: EffectivePermissionsService,
  ) {}

  // ── Endpoints anidados bajo /crm/subscribers/:subscriberId ─────────────────

  @Post('crm/subscribers/:subscriberId/contracts')
  @GuardBlockedTitular('params.subscriberId')
  @UseGuards(rejectClientStratumEvidenceGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Crear servicio contratado para un suscriptor (estado DRAFT)' })
  async createForSubscriber(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateContractDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.create({ ...dto, subscriberId }, actor.sub);
    return { data };
  }

  @Get('crm/subscribers/:subscriberId/contracts')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar servicios contratados de un suscriptor' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAllBySubscriber(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
    @CurrentUser() actor?: JwtPayload,
  ): Promise<ListResponse<Contract>> {
    const readAccess = await this.resolveBlockedReadAccess(actor?.sub);
    return this.contractsService.findAllBySubscriber(
      subscriberId,
      {
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
      readAccess.canSeeBlocked,
      actor?.sub,
    );
  }

  @Post('crm/subscribers/:subscriberId/contracts/from-expediente')
  @GuardBlockedTitular('params.subscriberId')
  @UseGuards(rejectClientStratumEvidenceGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({
    summary: 'Crear contrato DRAFT a partir del interés comercial en el expediente',
  })
  async createFromExpediente(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body() dto: CreateContractFromExpedienteDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.createFromExpediente(subscriberId, dto, actor.sub);
    return { data };
  }

  // ── Endpoints de recurso /crm/contracts ────────────────────────────────────

  @Post('crm/contracts')
  @GuardBlockedTitular('body.subscriberId')
  @UseGuards(rejectClientStratumEvidenceGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Crear contrato (uso directo sin subscriber en path)' })
  async create(
    @Body() dto: CreateContractDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.create(dto, actor.sub);
    return { data };
  }

  @Get('crm/contracts')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Listar contratos con filtros opcionales' })
  @ApiExtraModels(CrmListPaginationDto, ListMetaDto)
  @ApiQuery({ name: 'status', required: false, enum: ContractStatus })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 100 })
  async findAll(
    @Query('status') status?: ContractStatus,
    @Query('planId') planId?: string,
    @Query('page', CrmListPagePipe) page?: number,
    @Query('limit', CrmListLimitPipe) limit?: number,
    @CurrentUser() actor?: JwtPayload,
  ): Promise<ListResponse<Contract>> {
    const readAccess = await this.resolveBlockedReadAccess(actor?.sub);
    return this.contractsService.findAll(
      {
        ...(status !== undefined ? { status } : {}),
        ...(planId !== undefined ? { planId } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
      readAccess.canSeeBlocked,
      actor?.sub,
    );
  }

  @Get('crm/contracts/:id')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Consultar contrato por id' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor?: JwtPayload,
  ): Promise<{ data: Contract }> {
    const readAccess = await this.resolveBlockedReadAccess(actor?.sub);
    const data = await this.contractsService.findOneForRead(
      id,
      readAccess.canSeeBlocked,
      actor?.sub,
      readAccess.grantedBy,
    );
    return { data };
  }

  @Patch('crm/contracts/:id')
  @GuardBlockedTitular('params.id')
  @UseGuards(rejectClientStratumEvidenceGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar datos del contrato (no cambia estado)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.update(id, dto, actor.sub);
    return { data };
  }

  @Patch('crm/contracts/:id/service-point')
  @GuardBlockedTitular('params.id')
  @UseGuards(rejectClientStratumEvidenceGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({
    summary: 'Actualizar el punto de servicio de un contrato activo y recalcular su IVA',
  })
  @ApiExtraModels(ContractResponseEnvelopeDto)
  @ApiResponse({ status: 200, type: ContractResponseEnvelopeDto })
  @ApiResponse({ status: 422, description: 'Datos fiscales del punto de servicio no válidos' })
  async updateServicePoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServicePointDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.updateServicePoint(id, dto, actor.sub);
    return { data };
  }

  @Post('crm/contracts/:id/stratum-evidence')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG, PNG o WEBP; máximo 10 MiB',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Cargar o reemplazar el soporte de estrato del contrato' })
  @ApiResponse({ status: 201, type: ContractResponseEnvelopeDto })
  @ApiResponse({
    status: 422,
    description:
      'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED (tipo de archivo no permitido); el punto de servicio no admite soporte de estrato',
  })
  @ApiResponse({ status: 422, description: 'El punto de servicio no admite soporte de estrato' })
  async uploadStratumEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    if (!file) {
      throw new BadRequestException('Se requiere el campo "file" con el soporte del estrato.');
    }
    const data = await this.contractsService.uploadStratumEvidence(id, file, actor.sub);
    return { data };
  }

  @Delete('crm/contracts/:id/stratum-evidence')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Retirar el soporte de estrato del contrato' })
  @ApiResponse({ status: 200, type: ContractResponseEnvelopeDto })
  async removeStratumEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.removeStratumEvidence(id, actor.sub);
    return { data };
  }

  @Get('crm/contracts/:id/stratum-evidence/signed-url')
  @Roles(
    UserRole.ADMIN,
    UserRole.SALES,
    UserRole.SUPPORT,
    UserRole.AUDITOR,
    PlatformRole.SYSTEM_ADMIN,
  )
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_READ)
  @ApiOperation({ summary: 'Obtener acceso temporal al soporte de estrato del contrato' })
  @ApiResponse({
    status: 200,
    description: 'URL firmada con vigencia máxima de cinco minutos',
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          required: ['signedUrl', 'expiresAt'],
          properties: {
            signedUrl: { type: 'string', format: 'uri' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'El contrato no tiene un soporte verificable' })
  @ApiResponse({
    status: 503,
    description: 'El almacenamiento no cumple la configuración privada requerida',
  })
  async getStratumEvidenceSignedUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: { signedUrl: string; expiresAt: Date } }> {
    const readAccess = await this.resolveBlockedReadAccess(actor.sub);
    const data = await this.contractsService.getStratumEvidenceSignedUrl(
      id,
      actor.sub,
      readAccess.canSeeBlocked,
      readAccess.grantedBy,
    );
    return { data };
  }

  private async resolveBlockedReadAccess(actorId?: string): Promise<{
    canSeeBlocked: boolean;
    grantedBy?: 'PRIVACY_READ' | 'CRM_BLOCKED_DATA_READ';
  }> {
    if (!actorId) return { canSeeBlocked: false };
    const permissions = new Set(
      await this.effectivePermissionsService.getEffectivePermissionsForUser(actorId),
    );
    if (permissions.has(AccessPermissionKey.PRIVACY_READ)) {
      return { canSeeBlocked: true, grantedBy: 'PRIVACY_READ' };
    }
    if (permissions.has(AccessPermissionKey.CRM_BLOCKED_DATA_READ)) {
      return { canSeeBlocked: true, grantedBy: 'CRM_BLOCKED_DATA_READ' };
    }
    return { canSeeBlocked: false };
  }

  @Delete('crm/contracts/:id')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar contrato (solo en estado DRAFT)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<void> {
    await this.contractsService.remove(id, actor.sub);
  }

  // ── Transiciones de estado ──────────────────────────────────────────────────

  @Post('crm/contracts/:id/activate')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activar contrato (DRAFT → ACTIVE — firma del cliente)' })
  @ApiExtraModels(ContractResponseEnvelopeDto)
  @ApiResponse({ status: 200, type: ContractResponseEnvelopeDto })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.activate(id, actor.sub);
    return { data };
  }

  @Post('crm/contracts/:id/suspend')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender contrato (ACTIVE → SUSPENDED)' })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.suspend(id, actor.sub);
    return { data };
  }

  @Post('crm/contracts/:id/reactivate')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar contrato (SUSPENDED → ACTIVE)' })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.reactivate(id, actor.sub);
    return { data };
  }

  @Post('crm/contracts/:id/terminate')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar contrato (ACTIVE | SUSPENDED → TERMINATED)' })
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.terminate(id, actor.sub);
    return { data };
  }

  @Post('crm/contracts/:id/archive')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archivar contrato (SUSPENDED | TERMINATED → ARCHIVED)' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.archive(id, actor.sub);
    return { data };
  }
}
