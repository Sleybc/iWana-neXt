import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
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
import {
  AccessPermissionKey,
  PlatformRole,
  SubscriberStatus,
  UserRole,
  LIFECYCLE_REASON_CODES_BY_ACTION,
  LifecycleSuspendCommandSchema,
  LifecycleReactivateCommandSchema,
  LifecycleTerminateCommandSchema,
  LifecyclePreviewRequestSchema,
  type LifecyclePreviewRequest,
  type LifecycleSuspendCommand,
  type LifecycleReactivateCommand,
  type LifecycleTerminateCommand,
  type ListResponse,
} from '@iwana/shared';
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
import { ZodBodyValidationPipe } from '../pipes/zod-body-validation.pipe';

const rejectClientStratumEvidenceGuard = new RejectClientStratumEvidenceGuard();

function lifecycleBodySchema(
  reasonCodes: readonly string[],
  contractIds: 'none' | 'optional' | 'required',
) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['reasonCode', ...(contractIds === 'required' ? ['contractIds'] : [])],
    properties: {
      reasonCode: { type: 'string', enum: [...reasonCodes] },
      note: { type: 'string', maxLength: 500 },
      ...(contractIds !== 'none'
        ? {
            contractIds: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
          }
        : {}),
    },
  };
}

function lifecyclePreviewBodySchema() {
  const option = (
    action: 'SUSPEND' | 'REACTIVATE' | 'TERMINATE',
    reasonCodes: readonly string[],
    contractIds: 'optional' | 'required',
  ) => ({
    type: 'object',
    additionalProperties: false,
    required: ['action', 'reasonCode', ...(contractIds === 'required' ? ['contractIds'] : [])],
    properties: {
      action: { type: 'string', enum: [action] },
      reasonCode: { type: 'string', enum: [...reasonCodes] },
      note: { type: 'string', maxLength: 500 },
      ...(contractIds === 'required' || action !== 'TERMINATE'
        ? {
            contractIds: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
          }
        : {}),
    },
  });
  return {
    oneOf: [
      option('SUSPEND', LIFECYCLE_REASON_CODES_BY_ACTION.suspend, 'optional'),
      option('REACTIVATE', LIFECYCLE_REASON_CODES_BY_ACTION.reactivate, 'optional'),
      option('TERMINATE', LIFECYCLE_REASON_CODES_BY_ACTION.terminate, 'required'),
    ],
  };
}

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

  @Post('crm/subscribers/:subscriberId/services/preview')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Previsualizar el efecto de un cambio de ciclo de vida' })
  @ApiBody({ schema: lifecyclePreviewBodySchema() })
  @ApiResponse({
    status: 200,
    description: 'Efecto calculado sin escribir cambios',
    schema: {
      type: 'object',
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          required: [
            'action',
            'affectedContracts',
            'subscriberStatus',
            'hasLiveContracts',
            'warnings',
          ],
          properties: {
            action: { type: 'string', enum: ['SUSPEND', 'REACTIVATE', 'TERMINATE'] },
            affectedContracts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'fromStatus', 'toStatus'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  fromStatus: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'TERMINATED'] },
                  toStatus: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'TERMINATED'] },
                },
              },
            },
            subscriberStatus: {
              type: 'object',
              required: ['from', 'to'],
              properties: {
                from: { type: 'string', enum: Object.values(SubscriberStatus) },
                to: { type: 'string', enum: Object.values(SubscriberStatus) },
              },
            },
            hasLiveContracts: { type: 'boolean' },
            warnings: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'contractIds'],
                properties: {
                  code: { type: 'string', enum: ['EQUIPMENT_ON_LOAN', 'OPEN_WITHDRAWAL_ORDERS'] },
                  contractIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                },
              },
            },
          },
        },
      },
    },
  })
  async previewSubscriberServices(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body(new ZodBodyValidationPipe(LifecyclePreviewRequestSchema)) dto: LifecyclePreviewRequest,
  ) {
    const data = await this.contractsService.previewSubscriberServices(subscriberId, dto);
    return { data };
  }

  @Post('crm/subscribers/:subscriberId/services/suspend')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender servicios de un suscriptor' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.suspend, 'optional') })
  @ApiResponse({
    status: 409,
    description: 'El estado del servicio cambió o no hay servicios elegibles',
  })
  async suspendSubscriberServices(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body(new ZodBodyValidationPipe(LifecycleSuspendCommandSchema)) dto: LifecycleSuspendCommand,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.contractsService.suspendSubscriberServices(
      subscriberId,
      dto,
      actor.sub,
      idempotencyKey,
    );
    return { data };
  }

  @Post('crm/subscribers/:subscriberId/services/reactivate')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar servicios de un suscriptor' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.reactivate, 'optional') })
  @ApiResponse({ status: 409, description: 'El servicio cambió o el suscriptor está cancelado' })
  async reactivateSubscriberServices(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body(new ZodBodyValidationPipe(LifecycleReactivateCommandSchema))
    dto: LifecycleReactivateCommand,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.contractsService.reactivateSubscriberServices(
      subscriberId,
      dto,
      actor.sub,
      idempotencyKey,
    );
    return { data };
  }

  @Post('crm/subscribers/:subscriberId/services/terminate')
  @GuardBlockedTitular('params.subscriberId')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar servicios seleccionados de un suscriptor' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.terminate, 'required') })
  @ApiResponse({ status: 409, description: 'El estado de uno o más servicios cambió' })
  async terminateSubscriberServices(
    @Param('subscriberId', ParseUUIDPipe) subscriberId: string,
    @Body(new ZodBodyValidationPipe(LifecycleTerminateCommandSchema))
    dto: LifecycleTerminateCommand,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.contractsService.terminateSubscriberServices(
      subscriberId,
      dto,
      actor.sub,
      idempotencyKey,
    );
    return { data };
  }

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
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender contrato (ACTIVE → SUSPENDED)' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.suspend, 'none') })
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(LifecycleSuspendCommandSchema.omit({ contractIds: true })))
    dto: Omit<LifecycleSuspendCommand, 'contractIds'>,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.suspend(id, dto, actor.sub, idempotencyKey);
    return { data };
  }

  @Post('crm/contracts/:id/reactivate')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar contrato (SUSPENDED → ACTIVE)' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.reactivate, 'none') })
  async reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(LifecycleReactivateCommandSchema.omit({ contractIds: true })))
    dto: Omit<LifecycleReactivateCommand, 'contractIds'>,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.reactivate(id, dto, actor.sub, idempotencyKey);
    return { data };
  }

  @Post('crm/contracts/:id/terminate')
  @GuardBlockedTitular('params.id')
  @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  @Permissions(AccessPermissionKey.CRM_SUBSCRIBERS_MANAGE)
  @SkipAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar contrato (ACTIVE | SUSPENDED → TERMINATED)' })
  @ApiBody({ schema: lifecycleBodySchema(LIFECYCLE_REASON_CODES_BY_ACTION.terminate, 'none') })
  async terminate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBodyValidationPipe(LifecycleTerminateCommandSchema.omit({ contractIds: true })))
    dto: Omit<LifecycleTerminateCommand, 'contractIds'>,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: Contract }> {
    const data = await this.contractsService.terminate(
      id,
      { ...dto, contractIds: [id] },
      actor.sub,
      idempotencyKey,
    );
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
