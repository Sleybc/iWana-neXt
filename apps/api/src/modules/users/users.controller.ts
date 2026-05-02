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
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
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
import { UserRole, UserStatus } from '@iwana/shared';

/**
 * Controlador de gestion de usuarios por tenant.
 *
 * Todos los endpoints requieren JWT valido (JwtAuthGuard) y el usuario debe
 * pertenecer al tenant resuelto por TenantMiddleware.
 *
 * Accesos:
 * - CRUD completo: TENANT_ADMIN (role del tenant)
 * - GET /:id: cualquier usuario autenticado (el servicio verifica si es propio)
 * - PATCH /:id: TENANT_ADMIN o el propio usuario
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 — Endpoints 11-15
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Lista usuarios del tenant con paginacion cursor-based.
   * Solo accesible para administradores del tenant.
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Listar usuarios del tenant (paginacion cursor-based)' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor de paginacion (UUID del ultimo item)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Cantidad maxima de elementos (max 100)',
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
    description: 'Busqueda ILIKE en email, firstName, lastName y jobTitle',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado de usuarios.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos de administrador.' })
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
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
    if (limit) params.limit = parseInt(limit, 10);
    if (status) params.status = status;
    if (role) params.role = role;
    if (search) params.search = search;
    const result = await this.usersService.findAll(params);
    return { data: result };
  }

  /**
   * Crea un nuevo usuario en el tenant.
   * El header Idempotency-Key es obligatorio para evitar duplicados en reintentos.
   * Si no se provee password, se genera uno temporal y se retorna en la respuesta.
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.CREATED)
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
  @ApiResponse({ status: 409, description: 'Ya existe un usuario con ese email en el tenant.' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: UserResponseDto & { temporaryPassword?: string } }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const user = await this.usersService.create(createUserDto);
    return { data: user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obtener perfil propio' })
  @ApiResponse({ status: 200, description: 'Perfil propio del usuario autenticado.' })
  async getMe(@CurrentUser() actor: JwtPayload): Promise<{ data: UserResponseDto }> {
    return { data: await this.usersService.findMe(actor.sub) };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Actualizar perfil propio' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Perfil propio actualizado.' })
  async updateMe(
    @CurrentUser() actor: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-forwarded-for') ipAddress?: string,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    return { data: await this.usersService.updateMe(actor.sub, dto, ipAddress || 'unknown') };
  }

  /**
   * Obtiene un usuario por UUID.
   * Los administradores pueden consultar cualquier usuario del tenant.
   * Un usuario no-admin solo puede consultar su propio perfil (verificado en el servicio).
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario del tenant por UUID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para ver este usuario.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    // El servicio verifica si el requester puede ver el usuario solicitado
    // (admin puede ver cualquiera; no-admin solo el propio)
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SYSTEM_ADMIN && user.sub !== id) {
      throw new BadRequestException('No tienes permisos para ver este usuario.');
    }
    const result = await this.usersService.findOne(id);
    return { data: result };
  }

  /**
   * Actualiza status y/o rol del usuario.
   * El header Idempotency-Key es obligatorio para reintentos seguros.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar estado o rol de un usuario' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Usuario actualizado.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos o Idempotency-Key faltante.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para modificar este usuario.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const result = await this.usersService.update(id, updateUserDto, actor.sub, actor.role);
    return { data: result };
  }

  /**
   * Cambia el email de acceso de un usuario por acción administrativa.
   * Requiere Idempotency-Key para soportar reintentos seguros en la UI.
   */
  @Patch(':id/login-email/admin')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Cambiar el email de acceso de un usuario (admin)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Email de acceso actualizado.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos o Idempotency-Key faltante.' })
  @ApiResponse({ status: 403, description: 'Sin permisos para modificar este usuario.' })
  @ApiResponse({ status: 409, description: 'El nuevo email ya está en uso.' })
  async changeLoginEmailAsAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminChangeUserLoginEmailDto,
    @CurrentUser() actor: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: UserResponseDto }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    const result = await this.usersService.changeLoginEmailAsAdmin(
      id,
      dto,
      actor.sub,
      actor.role as UserRole,
    );

    return { data: result };
  }

  /**
   * Cambia el email de acceso del propio usuario autenticado.
   * Requiere contraseña actual para evitar cambios no autorizados sobre una sesión abierta.
   */
  @Patch(':id/login-email')
  @ApiOperation({ summary: 'Cambiar el email de acceso del propio usuario' })
  @ApiResponse({ status: 200, description: 'Email de acceso actualizado.' })
  @ApiResponse({ status: 400, description: 'Solo puedes cambiar tu propio email.' })
  @ApiResponse({ status: 409, description: 'El nuevo email ya está en uso.' })
  async changeLoginEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeUserLoginEmailDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<{ data: UserResponseDto }> {
    if (actor.sub !== id) {
      throw new BadRequestException('Solo puedes cambiar tu propio email de acceso.');
    }

    const result = await this.usersService.changeLoginEmail(id, dto, actor.sub);
    return { data: result };
  }

  @Patch(':id/password')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Reiniciar password de usuario' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Clave de idempotencia obligatoria',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Password reiniciado exitosamente.' })
  @ApiResponse({ status: 403, description: 'No puedes reiniciar a un SYSTEM_ADMIN.' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto: ResetPasswordDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-forwarded-for') ipAddress?: string,
  ): Promise<{ data: { temporaryPassword: string } }> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('El header Idempotency-Key es obligatorio.');
    }

    return {
      data: await this.usersService.resetPassword(
        id,
        actor.sub,
        actor.role as UserRole,
        ipAddress || 'unknown',
        dto?.password,
      ),
    };
  }

  /**
   * Elimina (soft delete) un usuario del tenant.
   * Solo TENANT_ADMIN puede eliminar. No puede eliminar a otro TENANT_ADMIN (RF-RBAC-04).
   * No puede eliminarse a si mismo.
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SYSTEM_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar (soft delete) un usuario del tenant' })
  @ApiResponse({ status: 204, description: 'Usuario eliminado exitosamente.' })
  @ApiResponse({ status: 400, description: 'No puedes eliminar tu propio usuario.' })
  @ApiResponse({ status: 401, description: 'Token invalido o expirado.' })
  @ApiResponse({
    status: 403,
    description: 'No se puede eliminar a otro administrador del tenant.',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<void> {
    await this.usersService.remove(id, actor.sub, actor.role);
  }
}
