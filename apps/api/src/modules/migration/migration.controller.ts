import {
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  MIGRATION_IMPORT_LIMITS,
  MigrationBatchListQuerySchema,
  MigrationMappingCreateSchema,
  MigrationMappingListQuerySchema,
  MigrationMappingUpdateSchema,
  UserRole,
  type MigrationBatchListQuery,
  type MigrationMappingCreate,
  type MigrationMappingListQuery,
  type MigrationMappingUpdate,
} from '@iwana/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { resolveRouteRateLimit } from '../../common/rate-limit-env';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MigrationBatchesService, type MigrationTenantScope } from './migration-batches.service';
import { MigrationMappingsService } from './migration-mappings.service';
import { MigrationPromotionService } from './migration-promotion.service';
import { MigrationRevertService } from './migration-revert.service';
import {
  MIGRATION_BATCH_REPORT_OPENAPI,
  MIGRATION_BATCH_SUMMARY_OPENAPI,
  MIGRATION_MAPPING_CREATE_OPENAPI,
  MIGRATION_MAPPING_OPENAPI,
  MIGRATION_MAPPING_UPDATE_OPENAPI,
  MIGRATION_PENDING_VALUE_OPENAPI,
  MIGRATION_PROMOTE_ACCEPTED_OPENAPI,
  MIGRATION_RECONCILIATION_OPENAPI,
  MIGRATION_REVERT_RESULT_OPENAPI,
  envelope,
  listEnvelope,
} from './migration-openapi.schemas';

/** El tenant sale del contexto verificado por el middleware (JWT), nunca del input. */
function scope(): MigrationTenantScope {
  const ctx = TenantContext.getOrThrow();
  return { tenantId: ctx.tenantId, schemaName: ctx.schemaName };
}

/**
 * Importación desde UISP — lotes y simulación (ADR-110 D1, D9; spec §3.3). Solo ADMIN con
 * `migration.import.manage`. La auditoría se escribe en la transacción del servicio.
 */
@ApiTags('migration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Permissions(AccessPermissionKey.MIGRATION_IMPORT_MANAGE)
@SkipAudit()
@ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN con migration.import.manage.' })
@Controller('migration/batches')
export class MigrationBatchesController {
  constructor(
    private readonly batches: MigrationBatchesService,
    private readonly promotion: MigrationPromotionService,
    private readonly reversion: MigrationRevertService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ global: { ttl: 60_000, limit: resolveRouteRateLimit(10) } })
  @UseInterceptors(
    FilesInterceptor('files', MIGRATION_IMPORT_LIMITS.maxZipsPerBatch, {
      storage: memoryStorage(),
      limits: {
        fileSize: MIGRATION_IMPORT_LIMITS.maxZipBytes,
        files: MIGRATION_IMPORT_LIMITS.maxZipsPerBatch,
        fields: 0,
      },
    }),
  )
  @ApiOperation({ summary: 'Crear un lote de importación con uno o varios ZIP de cliente de UISP' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      additionalProperties: false,
      properties: {
        files: {
          type: 'array',
          maxItems: MIGRATION_IMPORT_LIMITS.maxZipsPerBatch,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Lote creado; la simulación corre en segundo plano.',
    schema: envelope(MIGRATION_BATCH_SUMMARY_OPENAPI),
  })
  @ApiBadRequestResponse({
    description: 'Sin archivos, tipo o tamaño no permitido o ZIP rechazado.',
  })
  @ApiServiceUnavailableResponse({ description: 'No se pudo encolar la simulación.' })
  async create(
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return { data: await this.batches.createBatch(scope(), files, user.sub) };
  }

  @Get()
  @ApiOperation({ summary: 'Listar lotes de importación' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ schema: listEnvelope(MIGRATION_BATCH_SUMMARY_OPENAPI) })
  async list(
    @Query(new ZodValidationPipe(MigrationBatchListQuerySchema)) query: MigrationBatchListQuery,
  ) {
    const { data, total } = await this.batches.list(scope(), query.page, query.limit);
    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Informe de simulación del lote por entidad y motivo (sin datos personales)',
  })
  @ApiOkResponse({ schema: envelope(MIGRATION_BATCH_REPORT_OPENAPI) })
  @ApiNotFoundResponse({ description: 'El lote no existe.' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.batches.getReport(scope(), id) };
  }

  @Post(':id/promote')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ global: { ttl: 60_000, limit: resolveRouteRateLimit(10) } })
  @ApiOperation({
    summary: 'Promover el lote simulado (idempotente por external_id); concilia al terminar',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Lote en CARGADO; la promoción y la conciliación corren en segundo plano.',
    schema: envelope(MIGRATION_PROMOTE_ACCEPTED_OPENAPI),
  })
  @ApiNotFoundResponse({ description: 'El lote no existe.' })
  @ApiConflictResponse({
    description: 'MIGRATION_BATCH_NOT_PROMOTABLE o MIGRATION_BATCH_PURGED.',
  })
  @ApiServiceUnavailableResponse({ description: 'No se pudo encolar la promoción.' })
  async promote(@CurrentUser() user: JwtPayload, @Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.promotion.requestPromotion(scope(), id, user.sub) };
  }

  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Conciliar por titular: facturado, pagado y saldo de iWana contra UISP (D6)',
  })
  @ApiOkResponse({ schema: envelope(MIGRATION_RECONCILIATION_OPENAPI) })
  @ApiNotFoundResponse({ description: 'El lote no existe.' })
  @ApiConflictResponse({
    description: 'MIGRATION_BATCH_NOT_RECONCILABLE o MIGRATION_BATCH_PURGED.',
  })
  async reconcile(@CurrentUser() user: JwtPayload, @Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.promotion.reconcile(scope(), id, user.sub) };
  }

  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revertir el lote en orden inverso; se bloquea si algo posterior lo referencia (D7)',
  })
  @ApiOkResponse({ schema: envelope(MIGRATION_REVERT_RESULT_OPENAPI) })
  @ApiNotFoundResponse({ description: 'El lote no existe.' })
  @ApiConflictResponse({
    description:
      'MIGRATION_BATCH_NOT_REVERTIBLE o MIGRATION_REVERT_BLOCKED (details.blockers: motivo y cantidad).',
  })
  async revert(@CurrentUser() user: JwtPayload, @Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.reversion.revert(scope(), id, user.sub) };
  }

  @Get(':id/pending-mappings')
  @ApiOperation({ summary: 'Valores del lote que siguen sin equivalencia' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: MIGRATION_PENDING_VALUE_OPENAPI } },
    },
  })
  @ApiNotFoundResponse({ description: 'El lote no existe.' })
  async pending(@Param('id', new ParseUUIDPipe()) id: string) {
    return { data: await this.batches.pendingMappings(scope(), id) };
  }
}

/** Equivalencias por tenant y tipo para la importación (ADR-110 D4). */
@ApiTags('migration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Permissions(AccessPermissionKey.MIGRATION_IMPORT_MANAGE)
@SkipAudit()
@ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN con migration.import.manage.' })
@Controller('migration/mappings')
export class MigrationMappingsController {
  constructor(private readonly mappings: MigrationMappingsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar equivalencias' })
  @ApiQuery({ name: 'kind', required: false, enum: ['PLAN', 'METODO_PAGO', 'CICLO', 'ETIQUETA'] })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['data'],
      properties: { data: { type: 'array', items: MIGRATION_MAPPING_OPENAPI } },
    },
  })
  async list(
    @Query(new ZodValidationPipe(MigrationMappingListQuerySchema)) query: MigrationMappingListQuery,
  ) {
    return { data: await this.mappings.list(scope(), query.kind) };
  }

  @Post()
  @ApiOperation({ summary: 'Crear una equivalencia' })
  @ApiBody({ schema: MIGRATION_MAPPING_CREATE_OPENAPI })
  @ApiCreatedResponse({ schema: envelope(MIGRATION_MAPPING_OPENAPI) })
  @ApiBadRequestResponse({ description: 'Datos inválidos o destino incompatible con el tipo.' })
  @ApiConflictResponse({ description: 'Ya existe una equivalencia para ese valor.' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MigrationMappingCreateSchema)) body: MigrationMappingCreate,
  ) {
    return { data: await this.mappings.create(scope(), body, user.sub) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cambiar la acción o el destino de una equivalencia' })
  @ApiBody({ schema: MIGRATION_MAPPING_UPDATE_OPENAPI })
  @ApiOkResponse({ schema: envelope(MIGRATION_MAPPING_OPENAPI) })
  @ApiNotFoundResponse({ description: 'La equivalencia no existe.' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(MigrationMappingUpdateSchema)) body: MigrationMappingUpdate,
  ) {
    return { data: await this.mappings.update(scope(), id, body, user.sub) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una equivalencia' })
  @ApiNoContentResponse({ description: 'Equivalencia eliminada.' })
  @ApiNotFoundResponse({ description: 'La equivalencia no existe.' })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.mappings.remove(scope(), id, user.sub);
  }
}
