import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  MigrationSourceConnectionUpsertSchema,
  MigrationUispUsersInviteSchema,
  MigrationUispUsersReopenSchema,
  MigrationUispUsersResolveSchema,
  UserRole,
  type MigrationSourceConnectionUpsert,
  type MigrationUispUsersInvite,
  type MigrationUispUsersReopen,
  type MigrationUispUsersResolve,
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
import type { MigrationTenantScope } from './migration-batches.service';
import { envelope } from './migration-openapi.schemas';
import { MigrationSourceConnectionService } from './migration-source-connection.service';
import {
  MIGRATION_SOURCE_CONNECTION_OPENAPI,
  MIGRATION_SOURCE_CONNECTION_UPSERT_OPENAPI,
  MIGRATION_SOURCE_ERROR_DESCRIPTIONS,
  MIGRATION_UISP_USERS_FETCH_ACCEPTED_OPENAPI,
  MIGRATION_UISP_USERS_INVITE_OPENAPI,
  MIGRATION_UISP_USERS_INVITE_RESULT_OPENAPI,
  MIGRATION_UISP_USERS_LIST_OPENAPI,
  MIGRATION_UISP_USERS_REOPEN_OPENAPI,
  MIGRATION_UISP_USERS_REOPEN_RESULT_OPENAPI,
  MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS,
  MIGRATION_UISP_USERS_RESOLVE_OPENAPI,
  MIGRATION_UISP_USERS_RESOLVE_RESULT_OPENAPI,
} from './migration-uisp-users.openapi';
import { MigrationUispUsersResolutionService } from './migration-uisp-users-resolution.service';
import { MigrationUispUsersService } from './migration-uisp-users.service';

/** El tenant sale del contexto verificado por el middleware (JWT), nunca del input. */
function scope(): MigrationTenantScope {
  const ctx = TenantContext.getOrThrow();
  return { tenantId: ctx.tenantId, schemaName: ctx.schemaName };
}

/** Llamadas que salen hacia UISP: acotadas por minuto. */
const OUTBOUND_THROTTLE = { global: { ttl: 60_000, limit: resolveRouteRateLimit(10) } };

/** Resolver e invitar (crean usuarios y envían correos): acotados por minuto. */
const RESOLUTION_THROTTLE = { global: { ttl: 60_000, limit: resolveRouteRateLimit(10) } };

/**
 * Conexión con UISP (ADR-110 D15; spec 2026-11-15 «usuarios» §2.1). Solo ADMIN con
 * `migration.import.manage`. La clave entra solo en el PUT y nunca sale.
 */
@ApiTags('migration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Permissions(AccessPermissionKey.MIGRATION_IMPORT_MANAGE)
@SkipAudit()
@ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN con migration.import.manage.' })
@Controller('migration/uisp-connection')
export class MigrationSourceConnectionController {
  constructor(private readonly connections: MigrationSourceConnectionService) {}

  @Get()
  @ApiOperation({ summary: 'Conexión con UISP del tenant (sin la clave); data null si no hay' })
  @ApiOkResponse({
    schema: envelope({ ...MIGRATION_SOURCE_CONNECTION_OPENAPI, nullable: true }),
  })
  async get() {
    return { data: await this.connections.get(scope()) };
  }

  @Put()
  @Throttle(OUTBOUND_THROTTLE)
  @ApiOperation({
    summary: 'Guardar o reemplazar la conexión: prueba GET /crm/api/v1.0/version antes de guardar',
  })
  @ApiBody({ schema: MIGRATION_SOURCE_CONNECTION_UPSERT_OPENAPI })
  @ApiOkResponse({ schema: envelope(MIGRATION_SOURCE_CONNECTION_OPENAPI) })
  @ApiBadRequestResponse({
    description: 'Datos inválidos (dirección no https, huella mal formada).',
  })
  @ApiUnprocessableEntityResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.unauthorized })
  @ApiBadGatewayResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.unreachable })
  async upsert(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MigrationSourceConnectionUpsertSchema))
    body: MigrationSourceConnectionUpsert,
  ) {
    return { data: await this.connections.upsert(scope(), body, user.sub) };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Throttle(OUTBOUND_THROTTLE)
  @ApiOperation({ summary: 'Probar la conexión guardada y registrar el resultado' })
  @ApiOkResponse({ schema: envelope(MIGRATION_SOURCE_CONNECTION_OPENAPI) })
  @ApiConflictResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.notConfigured })
  @ApiUnprocessableEntityResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.unauthorized })
  @ApiBadGatewayResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.unreachable })
  async test(@CurrentUser() user: JwtPayload) {
    return { data: await this.connections.test(scope(), user.sub) };
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Retirar la conexión: borra la clave cifrada y las filas de usuarios de UISP sin resolver (con su nombre y correo)',
  })
  @ApiNoContentResponse({ description: 'Conexión retirada.' })
  @ApiConflictResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.notConfigured })
  async remove(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.connections.remove(scope(), user.sub);
  }
}

/** Usuarios del personal traídos de UISP: lectura en segundo plano y lista de revisión (§2.2, §2.3). */
@ApiTags('migration')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN)
@Permissions(AccessPermissionKey.MIGRATION_IMPORT_MANAGE)
@SkipAudit()
@ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
@ApiForbiddenResponse({ description: 'Se requiere ADMIN con migration.import.manage.' })
@Controller('migration/uisp-users')
export class MigrationUispUsersController {
  constructor(
    private readonly uispUsers: MigrationUispUsersService,
    private readonly resolution: MigrationUispUsersResolutionService,
  ) {}

  @Post('fetch')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(OUTBOUND_THROTTLE)
  @ApiOperation({
    summary:
      'Traer usuarios de UISP (users/admins) en segundo plano; repetir actualiza, no duplica',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Lectura encolada.',
    schema: envelope(MIGRATION_UISP_USERS_FETCH_ACCEPTED_OPENAPI),
  })
  @ApiConflictResponse({ description: MIGRATION_SOURCE_ERROR_DESCRIPTIONS.notConfigured })
  @ApiServiceUnavailableResponse({ description: 'MIGRATION_ENQUEUE_FAILED: no se pudo encolar.' })
  async fetch(@CurrentUser() user: JwtPayload) {
    return { data: await this.uispUsers.requestFetch(scope(), user.sub) };
  }

  @Get()
  @ApiOperation({ summary: 'Lista de revisión de usuarios de UISP' })
  @ApiOkResponse({ schema: MIGRATION_UISP_USERS_LIST_OPENAPI })
  async list(@CurrentUser() user: JwtPayload) {
    return this.uispUsers.list(scope(), { id: user.sub, role: user.role as UserRole });
  }

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @Throttle(RESOLUTION_THROTTLE)
  @ApiOperation({
    summary:
      'Enlazar, crear o descartar usuarios de UISP en lote (todo o nada); purga nombre y correo de cada fila',
  })
  @ApiBody({ schema: MIGRATION_UISP_USERS_RESOLVE_OPENAPI })
  @ApiOkResponse({ schema: MIGRATION_UISP_USERS_RESOLVE_RESULT_OPENAPI })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_ERROR: cuerpo inválido, CREAR sin rol, nombre ausente en una fila SIN_DATOS o presente en una fila de la API.',
  })
  @ApiNotFoundResponse({ description: MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.notFound })
  @ApiConflictResponse({ description: MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.resolved })
  @ApiUnprocessableEntityResponse({
    description: MIGRATION_UISP_USERS_RESOLVE_ERROR_DESCRIPTIONS.unprocessable,
  })
  async resolve(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MigrationUispUsersResolveSchema)) body: MigrationUispUsersResolve,
  ) {
    return { data: await this.resolution.resolve(scope(), body.items, user.sub) };
  }

  @Post('reopen')
  @HttpCode(HttpStatus.OK)
  @Throttle(RESOLUTION_THROTTLE)
  @ApiOperation({
    summary:
      'Recuperar usuarios de UISP descartados: vuelven a pendientes; la siguiente lectura les devuelve nombre y correo',
  })
  @ApiBody({ schema: MIGRATION_UISP_USERS_REOPEN_OPENAPI })
  @ApiOkResponse({ schema: envelope(MIGRATION_UISP_USERS_REOPEN_RESULT_OPENAPI) })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR: ids vacíos, repetidos o no uuid.' })
  async reopen(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MigrationUispUsersReopenSchema)) body: MigrationUispUsersReopen,
  ) {
    return { data: await this.resolution.reopen(scope(), body.ids, user.sub) };
  }

  @Post('invite')
  @HttpCode(HttpStatus.OK)
  @Throttle(RESOLUTION_THROTTLE)
  @ApiOperation({
    summary:
      'Enviar (o reenviar) la invitación de activación a usuarios creados desde UISP; solo PENDING_VERIFICATION con correo real',
  })
  @ApiBody({ schema: MIGRATION_UISP_USERS_INVITE_OPENAPI })
  @ApiOkResponse({ schema: envelope(MIGRATION_UISP_USERS_INVITE_RESULT_OPENAPI) })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR: ids vacíos, repetidos o no uuid.' })
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MigrationUispUsersInviteSchema)) body: MigrationUispUsersInvite,
  ) {
    // El enlace de la invitación lleva la empresa: la persona no conoce el identificador.
    const { tenantSlug } = TenantContext.getOrThrow();
    return { data: await this.resolution.invite({ ...scope(), tenantSlug }, body.ids, user.sub) };
  }
}
