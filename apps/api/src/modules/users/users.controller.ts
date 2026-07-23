import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRole, AccessPermissionKey, UserRole, UserStatus } from '@iwana/shared';
import { Permissions } from '../access-control/decorators/permissions.decorator';
import { PermissionsGuard } from '../access-control/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SkipAudit } from '../audit/decorators/skip-audit.decorator';
import { UsersService } from './users.service';
import {
  AdminChangeUserLoginEmailDto,
  ChangeUserLoginEmailDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/user.dto';

/**
 * Controlador de gestion de usuarios por tenant.
 *
 * Todos los endpoints requieren JWT valido (JwtAuthGuard) y el usuario debe
 * pertenecer al tenant resuelto por TenantMiddleware.
 *
 * Accesos:
 * - CRUD completo: TENANT_ADMIN (role del tenant) + permisos de acceso
 * - GET /me y PATCH /me: cualquier usuario autenticado (perfil propio)
 * - Autorizacion de negocio vive en UsersService (H-08)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 — Endpoints 11-15
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Lista usuarios del tenant con paginacion cursor-based.
   * Solo accesible para administradores del tenant con USERS_READ.
   *
   * Contrato HTTP (H-11): el servicio ya devuelve `{ data, meta }`. El controlador
   * aplica el envelope estándar `{ data: T }` → cuerpo `{ data: { data, meta } }`.
   * Los clientes (portal/web) desenvuelven una sola vez y consumen `{ data, meta }`.
   * No aplanar: es el estándar de facto del módulo users + ApiEnvelope del FE.
   */
  @Get()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_READ)
  @ApiOperation({ summary: 'Listar usuarios del tenant (paginacion cursor-based)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor de paginacion (UUID del ultimo item)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Cantidad maxima de elementos (entero 1-100; default 50)',
    type: Number,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: UserStatus,
    description: 'Filtrar por estado',
  })
  @ApiQuery({ name: 'role', required: false, enum: UserRole, description: 'Filtrar por rol' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Búsqueda en PostgreSQL (pg_trgm + ILIKE) sobre email, first_name, last_name y job_title. ' +
      'total/nextCursor se calculan sobre el conjunto ya filtrado; el cursor aplica después del filtro (ADR-062).',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado de usuarios.', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Parametro limit invalido.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador o USERS_READ.' })
  async findAll(
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('search') search?: string,
  ): Promise<{
    data: { data: UserResponseDto[]; meta: { nextCursor: string | null; total: number } };
  }> {
    const params: {
      cursor?: string;
      limit?: number;
      status?: UserStatus;
      role?: UserRole;
      search?: string;
    } = {};
    if (cursor) params.cursor = cursor;
    if (limit !== undefined) params.limit = limit;
    if (status) params.status = status;
    if (role) params.role = role;
    if (search) params.search = search;
    const result = await this.usersService.findAll(params);
    return { data: result };
  }

  /**
   * Crea un nuevo usuario en el tenant.
   * El header Idempotency-Key es obligatorio y se usa para deduplicar reintentos.
   * Si no se provee password, se genera uno temporal y se retorna en la respuesta.
   */
  @Post()
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  // Audit manual en UsersService — evita PII/temporaryPassword duplicados (SWEEP-01).
  @SkipAudit()
  @ApiOperation({ summary: 'Crear usuario en el tenant' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria (max 128 chars)',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos o Idempotency-Key faltante.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador.' })
  @ApiResponse({
    status: 409,
    description: 'Email duplicado o Idempotency-Key reutilizada con otro payload.',
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: UserResponseDto & { temporaryPassword?: string } }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }
    if (idempotencyKey.trim().length > 128) {
      throw new BadRequestException('El header Idempotency-Key no puede exceder 128 caracteres.');
    }

    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    const user = await this.usersService.create(
      createUserDto,
      actor.sub,
      ipAddress || 'unknown',
      idempotencyKey.trim(),
    );
    return { data: user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtener perfil propio' })
  @ApiResponse({
    status: 200,
    description: 'Perfil propio del usuario autenticado.',
    type: UserResponseDto,
  })
  async getMe(@CurrentUser() actor: JwtPayload): Promise<{ data: UserResponseDto }> {
    return { data: await this.usersService.findMe(actor.sub) };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar perfil propio' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Perfil propio actualizado.', type: UserResponseDto })
  async updateMe(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    return { data: await this.usersService.updateMe(actor.sub, dto, ipAddress || 'unknown') };
  }

  /**
   * Obtiene un usuario por UUID.
   * Requiere rol ADMIN/SYSTEM_ADMIN y permiso USERS_READ.
   * La autorizacion de negocio adicional vive en el servicio (H-08).
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_READ)
  @ApiOperation({ summary: 'Obtener usuario del tenant por UUID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para ver este usuario.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    const result = await this.usersService.findOne(id, user.sub, user.role);
    return { data: result };
  }

  /**
   * Actualiza status y/o rol del usuario.
   * El header Idempotency-Key es obligatorio y se usa para deduplicar reintentos.
   */
  @Patch(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Actualizar estado o rol de un usuario' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Usuario actualizado.', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o Idempotency-Key faltante.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para modificar este usuario.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({
    status: 409,
    description: 'Idempotency-Key reutilizada con otro payload.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }
    if (idempotencyKey.trim().length > 128) {
      throw new BadRequestException('El header Idempotency-Key no puede exceder 128 caracteres.');
    }

    const result = await this.usersService.update(
      id,
      updateUserDto,
      actor.sub,
      actor.role,
      idempotencyKey.trim(),
    );
    return { data: result };
  }

  /**
   * Cambia el email de acceso de un usuario por acción administrativa.
   * Requiere Idempotency-Key para soportar reintentos seguros en la UI.
   */
  @Patch(':id/login-email/admin')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Cambiar el email de acceso de un usuario (admin)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Email de acceso actualizado (admin).',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos o Idempotency-Key faltante.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para modificar este usuario.' })
  @ApiResponse({
    status: 409,
    description: 'El nuevo email ya está en uso o Idempotency-Key reutilizada con otro payload.',
  })
  async changeLoginEmailAsAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminChangeUserLoginEmailDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }
    if (idempotencyKey.trim().length > 128) {
      throw new BadRequestException('El header Idempotency-Key no puede exceder 128 caracteres.');
    }

    const result = await this.usersService.changeLoginEmailAsAdmin(
      id,
      dto,
      actor.sub,
      actor.role,
      idempotencyKey.trim(),
    );

    return { data: result };
  }

  /**
   * Cambia el email de acceso del propio usuario autenticado.
   * Requiere contraseña actual para evitar cambios no autorizados sobre una sesión abierta.
   * La regla de ownership vive en el servicio (H-08) → 403 si el actor no es el dueño.
   */
  @Patch(':id/login-email')
  @SkipAudit()
  @ApiOperation({ summary: 'Cambiar el email de acceso del propio usuario' })
  @ApiResponse({
    status: 200,
    description: 'Email de acceso actualizado (propio).',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Contraseña actual invalida u otros datos invalidos.' })
  @ApiResponse({ status: 403, description: 'Solo puedes cambiar tu propio email de acceso.' })
  @ApiResponse({ status: 409, description: 'El nuevo email ya está en uso.' })
  async changeLoginEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserLoginEmailDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    const result = await this.usersService.changeLoginEmail(id, dto, actor.sub);
    return { data: result };
  }

  @Patch(':id/password')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @SkipAudit()
  @ApiOperation({ summary: 'Reiniciar password de usuario' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Password reiniciado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Idempotency-Key faltante.' })
  @ApiResponse({ status: 403, description: 'No puedes reiniciar a un SYSTEM_ADMIN.' })
  @ApiResponse({
    status: 409,
    description: 'Idempotency-Key ya usada (la contraseña temporal solo se muestra una vez).',
  })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: { temporaryPassword: string } }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }
    if (idempotencyKey.trim().length > 128) {
      throw new BadRequestException('El header Idempotency-Key no puede exceder 128 caracteres.');
    }

    const ipAddress = req.ip ?? req.socket?.remoteAddress;
    return {
      data: await this.usersService.resetPassword(
        id,
        actor.sub,
        actor.role,
        ipAddress || 'unknown',
        dto?.password,
        idempotencyKey.trim(),
      ),
    };
  }

  /**
   * Elimina (soft delete) un usuario del tenant.
   * Solo TENANT_ADMIN puede eliminar. No puede eliminar a otro TENANT_ADMIN (RF-RBAC-04).
   * No puede eliminarse a si mismo.
   *
   * RF-RBAC-04 (formulacion unica):
   * 1. No self-delete → BadRequest.
   * 2. Si target tiene rol de plataforma persistido y el actor no → Forbidden.
   * 3. Si target.role === ADMIN y actorRole !== SYSTEM_ADMIN → Forbidden.
   * 4. SYSTEM_ADMIN (actor) sí puede eliminar ADMIN.
   * 5. ADR-063: si target es el administrador principal designado → Conflict,
   *    sea quien sea el actor. Hay que transferir la designación primero.
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipAudit()
  @ApiOperation({ summary: 'Eliminar (soft delete) un usuario del tenant' })
  @ApiResponse({ status: 204, description: 'Usuario eliminado exitosamente.' })
  @ApiResponse({ status: 400, description: 'No puedes eliminar tu propio usuario.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({
    status: 403,
    description: 'No se puede eliminar a otro administrador del tenant.',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({
    status: 409,
    description: 'El usuario es el administrador principal; transfiera la designación primero.',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<void> {
    await this.usersService.remove(id, actor.sub, actor.role);
  }

  /**
   * Designa al administrador principal de la empresa (ADR-063).
   *
   * Única vía por la que cambia el principal: operación explícita y auditada,
   * nunca efecto colateral de un borrado.
   */
  @Put(':id/principal-admin')
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
  @Permissions(AccessPermissionKey.USERS_MANAGE)
  @ApiOperation({ summary: 'Designar administrador principal de la empresa' })
  @ApiResponse({
    status: 200,
    description: 'Administrador principal designado.',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'El usuario no está activo o no tiene rol de administrador.',
  })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para designar.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async setPrincipalAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    return { data: await this.usersService.transferPrincipalAdmin(id, actor.sub) };
  }
}
