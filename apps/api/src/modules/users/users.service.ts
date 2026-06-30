import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { DataSource, FindOptionsWhere, MoreThan } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { User } from '@iwana/db';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DocumentType, UserRole, UserStatus, AuditAction } from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { SearchQueueService } from '../search/search-queue.service';
import { TenantService } from '../tenant/tenant.service';
import {
  AdminChangeUserLoginEmailDto,
  ChangeUserLoginEmailDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserResponseDto,
} from './dto/user.dto';
import type { BulkCreateUserItem, BulkCreateUsersResponse } from './dto/bulk-create-users.dto';

/** Iteraciones bcrypt para hashes de password de usuarios creados por admin */
const BCRYPT_ROUNDS = 12;

/** Longitud del password temporal en bytes (16 bytes → 32 chars hex) */
const TEMP_PASSWORD_BYTES = 16;

export interface SearchIndexUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  role: UserRole;
  status: UserStatus;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  route: string;
  updatedAt: number;
}

/**
 * Servicio de gestion de usuarios por tenant.
 *
 * Opera siempre dentro del schema del tenant via TenantContext + runInTenantSchema.
 * El email se persiste en texto plano y mantiene emailHash como derivado SHA-256
 * para compatibilidad transversal con autenticacion y bootstrap.
 *
 * Operaciones disponibles:
 * - findAll: listado cursor-based con filtros por status y rol
 * - findOne: obtener usuario por ID
 * - create: crear usuario (opcionalmente con password temporal)
 * - update: actualizar status y/o rol (ADMIN o propio usuario)
 * - remove: soft delete (solo ADMIN, no puede borrar a otro ADMIN del mismo tenant)
 *
 * SEGURIDAD:
 * - Email en texto plano con unique constraint; emailHash derivado para compatibilidad
 * - Password temporal generado con crypto.randomBytes (nunca predecible)
 * - Audit trail en CREATE, UPDATE, DELETE via AuditService
 * - RBAC: ADMIN no puede eliminar a otro ADMIN (RF-RBAC-04)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (endpoints 11-15)
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  /** Clave AES-256-GCM derivada de MFA_ENCRYPTION_KEY (64 chars hex) para lectura legacy. */
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    private readonly searchQueueService: SearchQueueService,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
  }

  private getDefaultOperationalResource(role: UserRole): boolean {
    return role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
  }

  /**
   * Lista usuarios del tenant con paginacion cursor-based.
   * Filtra por status y/o role si se proveen.
   */
  async findAll(params: {
    cursor?: string;
    limit?: number;
    status?: UserStatus;
    role?: UserRole;
    search?: string;
  }): Promise<{ data: UserResponseDto[]; meta: { nextCursor: string | null; total: number } }> {
    const { schemaName } = TenantContext.getOrThrow();
    const limit = Math.min(params.limit ?? 50, 100);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const where: FindOptionsWhere<User> = {};
      if (params.cursor) where.id = MoreThan(params.cursor);
      if (params.status) where.status = params.status;
      if (params.role) where.role = params.role;

      if (params.search) {
        // firstName/lastName pueden existir en formato legacy cifrado.
        // ILIKE sobre la columna no encuentra texto plano, por lo que la
        // busqueda se resuelve sobre los DTOs ya decodificados.
        const users = await qr.manager.find(User, {
          where,
          order: { id: 'ASC' },
        });

        const filteredUsers = users
          .map((user) => this.toDto(user))
          .filter((user) => this.matchesUserSearch(user, params.search ?? ''));

        const hasNext = filteredUsers.length > limit;
        const items = hasNext ? filteredUsers.slice(0, limit) : filteredUsers;

        return {
          data: items,
          meta: {
            nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
            total: filteredUsers.length,
          },
        };
      }

      const users = await qr.manager.find(User, {
        where,
        order: { id: 'ASC' },
        take: limit + 1,
      });

      const total = await qr.manager.count(User, { where });

      const hasNext = users.length > limit;
      const items = hasNext ? users.slice(0, limit) : users;

      return {
        data: items.map((u) => this.toDto(u)),
        meta: {
          nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
          total,
        },
      };
    });
  }

  /**
   * Obtiene un usuario del tenant por UUID.
   * Lanza NotFoundException si no existe o fue eliminado (soft delete).
   */
  async findOne(id: string): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);
      return this.toDto(user);
    });
  }

  /**
   * Crea un usuario en el tenant.
   *
   * - El email se almacena en texto plano y se indexa por unique + emailHash derivado.
   * - Si no se provee password, se genera uno temporal y se activa passwordResetRequired.
   * - Lanza ConflictException si ya existe un usuario con ese email en el tenant.
   * - Idempotente por Idempotency-Key (el caller debe pasarla como paramero separado para
   *   cache; aqui solo se verifica unicidad por emailHash).
   */
  async create(
    dto: CreateUserDto,
    ipAddress?: string,
  ): Promise<UserResponseDto & { temporaryPassword?: string }> {
    const { schemaName } = TenantContext.getOrThrow();
    // Obtener tenantId desde TenantContext
    const { tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const emailHash = this.hashEmail(dto.email);

      const normalizedEmail = dto.email.toLowerCase().trim();
      const existing = await qr.manager.findOne(User, {
        where: { email: normalizedEmail },
        withDeleted: true,
      });
      if (existing && !existing.deletedAt) {
        // Usuario activo con ese email — conflicto real
        throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
      }

      // Generar o usar el password provisto
      let temporaryPassword: string | undefined;
      let passwordHash: string;

      if (dto.password) {
        passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      } else {
        temporaryPassword = crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
        passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      }

      let user: User;
      const isOperationalResource =
        dto.isOperationalResource ?? this.getDefaultOperationalResource(dto.role);

      if (existing?.deletedAt) {
        /**
         * El usuario fue eliminado (soft delete) pero el email_hash tiene unique constraint
         * a nivel de columna PostgreSQL — no se puede insertar una fila nueva con el mismo hash.
         * Solución: restaurar el registro eliminado y reinicializar todos sus campos con los
         * nuevos datos, como si fuera un usuario completamente nuevo.
         */
        await qr.manager.restore(User, { id: existing.id });
        /**
         * CRÍTICO: limpiar deletedAt en el objeto en memoria ANTES de save().
         * restore() limpia deleted_at en la BD, pero el objeto TypeScript todavía
         * tiene deletedAt = Date. Si se omite esta línea, save() re-escribe el valor
         * antiguo a la BD y el usuario queda soft-deleted inmediatamente otra vez.
         */
        existing.deletedAt = null;
        existing.email = normalizedEmail;
        existing.emailHash = emailHash;
        existing.passwordHash = passwordHash;
        existing.role = dto.role;
        existing.status = UserStatus.PENDING_VERIFICATION;
        existing.tenantId = tenantId;
        existing.mfaEnabled = false;
        existing.mfaSecret = null;
        existing.passwordResetRequired = !dto.password;
        existing.failedLoginAttempts = 0;
        existing.lockedUntil = null;
        existing.lastLoginAt = null;
        existing.emailVerified = false;
        existing.emailVerificationToken = null;
        existing.firstName = dto.firstName?.trim() ?? null;
        existing.lastName = dto.lastName?.trim() ?? null;
        existing.phone = dto.phone ?? null;
        existing.jobTitle = dto.jobTitle ?? null;
        existing.documentType = dto.documentType ?? null;
        existing.documentNumber = dto.documentNumber?.trim() ?? null;
        existing.avatarUrl = dto.avatarUrl ?? null;
        existing.mfaRequired = dto.mfaRequired ?? false;
        existing.isOperationalResource = isOperationalResource;
        await qr.manager.save(User, existing);
        user = existing;
      } else {
        // Usuario nuevo — insertar registro fresco
        user = qr.manager.create(User, {
          email: normalizedEmail,
          emailHash,
          passwordHash,
          role: dto.role,
          status: UserStatus.PENDING_VERIFICATION,
          tenantId,
          mfaEnabled: false,
          mfaSecret: null,
          passwordResetRequired: !dto.password,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          emailVerified: false,
          emailVerificationToken: null,
          firstName: dto.firstName?.trim() ?? null,
          lastName: dto.lastName?.trim() ?? null,
          phone: dto.phone ?? null,
          jobTitle: dto.jobTitle ?? null,
          documentType: dto.documentType ?? null,
          documentNumber: dto.documentNumber?.trim() ?? null,
          avatarUrl: dto.avatarUrl ?? null,
          mfaRequired: dto.mfaRequired ?? false,
          isOperationalResource,
        });
        await qr.manager.save(User, user);
      }

      // Audit trail — no incluir el email cifrado ni el hash como newValue (contiene PII cifrada)
      void this.auditService.log({
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValue: {
          role: user.role,
          status: user.status,
          tenantId: user.tenantId,
          isOperationalResource: user.isOperationalResource,
        },
        ipAddress: ipAddress ?? null,
      });

      const dto_result = this.toDto(user);
      void this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id);
      return temporaryPassword ? { ...dto_result, temporaryPassword } : dto_result;
    });
  }

  /**
   * Crea usuarios en lote.
   *
   * Itera sobre cada item y llama a `create()` individualmente, recolectando
   * exitos y errores sin interrumpir el batch. Cada `create()` usa su propia
   * transaccion via runInTenantSchema, por lo que un fallo no revierte los anteriores.
   *
   * @returns Resumen con exitos (password temporal incluido) y fallos con causa.
   */
  async bulkCreate(users: BulkCreateUserItem[]): Promise<BulkCreateUsersResponse> {
    const succeeded: BulkCreateUsersResponse['succeeded'] = [];
    const failed: BulkCreateUsersResponse['failed'] = [];

    for (let i = 0; i < users.length; i++) {
      const item = users[i]!;
      const rowIndex = i + 1;

      try {
        const dto = new CreateUserDto();
        dto.email = item.email;
        dto.role = item.role;
        if (item.firstName !== undefined) dto.firstName = item.firstName;
        if (item.lastName !== undefined) dto.lastName = item.lastName;
        if (item.phone !== undefined) dto.phone = item.phone;
        if (item.jobTitle !== undefined) dto.jobTitle = item.jobTitle;
        if (item.documentType !== undefined) dto.documentType = item.documentType;
        if (item.documentNumber !== undefined) dto.documentNumber = item.documentNumber;
        if (item.isOperationalResource !== undefined)
          dto.isOperationalResource = item.isOperationalResource;

        const result = await this.create(dto);

        succeeded.push({
          email: item.email,
          firstName: item.firstName ?? null,
          lastName: item.lastName ?? null,
          role: item.role,
          temporaryPassword: result.temporaryPassword ?? '',
          createdAt: new Date().toISOString(),
        });
      } catch (error: unknown) {
        const reason =
          error instanceof ConflictException
            ? 'El email ya existe en este tenant.'
            : error instanceof Error
              ? error.message
              : 'Error desconocido al crear el usuario.';

        failed.push({
          rowIndex,
          email: item.email,
          reason,
        });
      }
    }

    return {
      summary: {
        total: users.length,
        succeeded: succeeded.length,
        failed: failed.length,
      },
      succeeded,
      failed,
    };
  }

  /**
   * Actualiza status y/o rol del usuario.
   * Registra oldValue/newValue en el audit trail.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
    actorUserId: string,
    actorRole: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);

      // Un usuario no-ADMIN solo puede actualizar su propio perfil
      if (
        actorRole !== UserRole.ADMIN &&
        actorRole !== UserRole.SYSTEM_ADMIN &&
        actorUserId !== id
      ) {
        throw new ForbiddenException('No tienes permisos para actualizar este usuario.');
      }

      const oldValue = {
        status: user.status,
        role: user.role,
        isOperationalResource: user.isOperationalResource,
      };

      if (dto.status !== undefined) user.status = dto.status;
      if (dto.role !== undefined) user.role = dto.role;
      // Perfil personal — texto plano, manteniendo compatibilidad de lectura legacy.
      if (dto.firstName !== undefined) user.firstName = dto.firstName?.trim() ?? null;
      if (dto.lastName !== undefined) user.lastName = dto.lastName?.trim() ?? null;
      if (dto.phone !== undefined) user.phone = dto.phone ?? null;
      if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null;
      if (dto.documentType !== undefined) user.documentType = dto.documentType ?? null;
      if (dto.documentNumber !== undefined)
        user.documentNumber = dto.documentNumber?.trim() ?? null;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;
      if (dto.mfaRequired !== undefined) user.mfaRequired = dto.mfaRequired;
      if (dto.isOperationalResource !== undefined)
        user.isOperationalResource = dto.isOperationalResource;

      await qr.manager.save(User, user);

      void this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: id,
        userId: actorUserId,
        oldValue,
        newValue: {
          status: user.status,
          role: user.role,
          isOperationalResource: user.isOperationalResource,
        },
      });

      void this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id);
      return this.toDto(user);
    });
  }

  /**
   * Cambia el email de acceso del propio usuario.
   * Si el usuario coincide con el ADMIN principal del tenant, sincroniza también
   * el email de contacto de la empresa en public.tenants.
   */
  async changeLoginEmail(
    id: string,
    dto: ChangeUserLoginEmailDto,
    actorUserId: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      if (actorUserId !== id) {
        throw new ForbiddenException('No tienes permisos para cambiar este email de acceso.');
      }

      const passwordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!passwordValid) {
        throw new BadRequestException('La contraseña actual no es válida.');
      }

      const normalizedEmail = dto.email.toLowerCase().trim();
      const nextEmailHash = this.hashEmail(normalizedEmail);

      if (nextEmailHash !== user.emailHash) {
        const existingUser = await qr.manager.findOne(User, {
          where: { email: normalizedEmail },
          withDeleted: false,
        });

        if (existingUser && existingUser.id !== user.id) {
          throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
        }

        user.email = normalizedEmail;
        user.emailHash = nextEmailHash;
        await qr.manager.save(User, user);
      }

      const shouldSyncContactEmail = dto.syncCompanyContactEmail !== false;
      const shouldUpdateTenantContactEmail = shouldSyncContactEmail
        ? await this.isPrincipalAdminUser(qr.manager, user.id)
        : false;

      if (shouldUpdateTenantContactEmail) {
        await this.tenantService.updateTenantSelfProfile(
          user.tenantId,
          { contactEmail: normalizedEmail },
          actorUserId,
        );
      }

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'UserLoginEmail',
        entityId: user.id,
        userId: actorUserId,
        oldValue: { loginEmailChanged: false },
        newValue: {
          loginEmailChanged: true,
          companyContactEmailSynced: shouldUpdateTenantContactEmail,
        },
      });

      void this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id);
      return this.toDto(user);
    });
  }

  /**
   * Cambia el email de acceso de un usuario por acción administrativa.
   * No requiere contraseña actual, pero mantiene controles RBAC y auditoría.
   */
  async changeLoginEmailAsAdmin(
    id: string,
    dto: AdminChangeUserLoginEmailDto,
    actorUserId: string,
    actorRole: UserRole,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      if (user.role === UserRole.SYSTEM_ADMIN && actorRole !== UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException(
          'No tienes permisos para cambiar el email de un SYSTEM_ADMIN.',
        );
      }

      const normalizedEmail = dto.email.toLowerCase().trim();
      const nextEmailHash = this.hashEmail(normalizedEmail);
      const emailChanged = nextEmailHash !== user.emailHash;

      if (emailChanged) {
        const existingUser = await qr.manager.findOne(User, {
          where: { email: normalizedEmail },
          withDeleted: false,
        });

        if (existingUser && existingUser.id !== user.id) {
          throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
        }

        user.email = normalizedEmail;
        user.emailHash = nextEmailHash;
        await qr.manager.save(User, user);
      }

      const shouldSyncContactEmail = dto.syncCompanyContactEmail !== false;
      const shouldUpdateTenantContactEmail =
        shouldSyncContactEmail && emailChanged
          ? await this.isPrincipalAdminUser(qr.manager, user.id)
          : false;

      if (shouldUpdateTenantContactEmail) {
        await this.tenantService.updateTenantSelfProfile(
          user.tenantId,
          { contactEmail: normalizedEmail },
          actorUserId,
        );
      }

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'UserLoginEmailAdmin',
        entityId: user.id,
        userId: actorUserId,
        oldValue: { loginEmailChanged: false },
        newValue: {
          loginEmailChanged: emailChanged,
          companyContactEmailSynced: shouldUpdateTenantContactEmail,
        },
      });

      void this.searchQueueService.enqueueUserUpsert(user.tenantId, user.id);
      return this.toDto(user);
    });
  }

  /**
   * Soft delete de usuario.
   * RF-RBAC-04: un ADMIN de tenant no puede eliminar a otro ADMIN del mismo tenant.
   * SYSTEM_ADMIN puede eliminar cualquier usuario (incluidos ADMINs).
   */
  async remove(id: string, actorUserId: string, actorRole: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) throw new NotFoundException(`Usuario ${id} no encontrado.`);

      if (user.id === actorUserId) {
        throw new BadRequestException('No puedes eliminar tu propio usuario.');
      }

      // RF-RBAC-04: solo aplica para ADMIN de tenant — SYSTEM_ADMIN puede eliminar ADMINs
      if (user.role === UserRole.ADMIN && actorRole !== UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('No es posible eliminar a otro administrador del tenant.');
      }

      // Soft delete via softRemove — establece deletedAt
      await qr.manager.softRemove(User, user);

      void this.auditService.log({
        action: AuditAction.DELETE,
        entityType: 'User',
        entityId: id,
        userId: actorUserId,
      });

      void this.searchQueueService.enqueueUserDelete(id);
    });
  }

  /** Reinicia el password de un usuario por acción administrativa. */
  async resetPassword(
    id: string,
    actorId: string,
    actorRole: UserRole,
    ipAddress: string,
    password?: string,
  ): Promise<{ temporaryPassword: string }> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id } });
      if (!user) {
        throw new NotFoundException(`Usuario ${id} no encontrado.`);
      }

      if (user.role === UserRole.SYSTEM_ADMIN && actorRole !== UserRole.SYSTEM_ADMIN) {
        throw new ForbiddenException('No puedes reiniciar la contraseña de un SYSTEM_ADMIN.');
      }

      const temporaryPassword = password ?? crypto.randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
      user.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      user.passwordResetRequired = true;
      await qr.manager.save(User, user);

      void this.auditService.log({
        action: AuditAction.PASSWORD_CHANGED,
        entityType: 'UserPasswordReset',
        entityId: user.id,
        userId: actorId,
        ipAddress,
      });

      return { temporaryPassword };
    });
  }

  /** Retorna el perfil del usuario autenticado. */
  async findMe(actorId: string): Promise<UserResponseDto> {
    return this.findOne(actorId);
  }

  /**
   * Expone un read-model mínimo para indexación cross-tenant en búsqueda global.
   * Mantiene el boundary de UsersModule: SearchModule no toca la tabla directamente.
   */
  async listForSearchIndex(params: {
    schemaName: string;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
  }): Promise<SearchIndexUserRecord[]> {
    return runInTenantSchema(this.dataSource, params.schemaName, async (qr) => {
      const users = await qr.manager.find(User, {
        where: { tenantId: params.tenantId },
        order: { updatedAt: 'DESC' },
      });

      return users.map((user) => {
        const dto = this.toDto(user);
        const routeParams = new URLSearchParams({
          tenant: params.tenantSlug,
          search: dto.email,
          openUser: dto.id,
        });

        return {
          id: dto.id,
          email: dto.email,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          jobTitle: dto.jobTitle ?? null,
          role: dto.role,
          status: dto.status,
          tenantId: params.tenantId,
          tenantSlug: params.tenantSlug,
          tenantName: params.tenantName,
          route: `/users?${routeParams.toString()}`,
          updatedAt: dto.updatedAt.getTime(),
        } satisfies SearchIndexUserRecord;
      });
    });
  }

  /** Actualiza solo los campos de perfil del usuario autenticado. */
  async updateMe(
    actorId: string,
    dto: UpdateProfileDto,
    ipAddress: string,
  ): Promise<UserResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const user = await qr.manager.findOne(User, { where: { id: actorId } });
      if (!user) {
        throw new NotFoundException(`Usuario ${actorId} no encontrado.`);
      }

      if (dto.firstName !== undefined) user.firstName = dto.firstName?.trim() ?? null;
      if (dto.lastName !== undefined) user.lastName = dto.lastName?.trim() ?? null;
      if (dto.phone !== undefined) user.phone = dto.phone ?? null;
      if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null;
      if (dto.documentType !== undefined) user.documentType = dto.documentType ?? null;
      if (dto.documentNumber !== undefined)
        user.documentNumber = dto.documentNumber?.trim() ?? null;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;

      await qr.manager.save(User, user);

      void this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'UserProfile',
        entityId: user.id,
        userId: actorId,
        ipAddress,
      });

      return this.toDto(user);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Convierte entidad User a DTO publico.
   * Tolera datos legacy cifrados solo en lectura durante la transición.
   * documentNumber se devuelve para edicion en portal interno autenticado.
   */
  private toDto(user: User): UserResponseDto {
    const decodedEmail = this.decodeLegacyValue(user.email);

    return {
      id: user.id,
      // Compatibilidad temporal: algunos tenants pueden mantener email legacy cifrado.
      // Se intenta descifrar para exponer siempre el email usable en portal/admin.
      // Si falla el descifrado, se conserva el valor original para no romper el contrato.
      email: decodedEmail ?? user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
      mfaRequired: user.mfaRequired,
      isOperationalResource: user.isOperationalResource,
      emailVerified: user.emailVerified,
      passwordResetRequired: user.passwordResetRequired,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt ?? null,
      // Compatibilidad hacia atrás: algunos tenants pueden tener nombres legados
      // en texto plano o con cifrado inválido. El endpoint no debe caer por eso.
      firstName: this.decodeLegacyValue(user.firstName),
      lastName: this.decodeLegacyValue(user.lastName),
      phone: user.phone ?? null,
      jobTitle: user.jobTitle ?? null,
      documentType: (user.documentType as DocumentType) ?? null,
      avatarUrl: user.avatarUrl ?? null,
      // Compatibilidad temporal: documentNumber puede venir legacy cifrado.
      // Se intenta descifrar para mostrar valor editable en UI interna.
      documentNumber: this.decodeLegacyValue(user.documentNumber),
    };
  }

  /** SHA-256 del email normalizado — para compatibilidad transversal. */
  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  private matchesUserSearch(
    user: Pick<UserResponseDto, 'firstName' | 'lastName' | 'email' | 'jobTitle'>,
    rawSearch: string,
  ): boolean {
    const query = this.normalizeSearchValue(rawSearch);
    if (!query) {
      return true;
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const candidates = [fullName, user.firstName, user.lastName, user.email, user.jobTitle]
      .map((value) => this.normalizeSearchValue(value))
      .filter((value) => value.length > 0);

    return candidates.some((candidate) => {
      if (candidate.includes(query)) {
        return true;
      }

      return candidate
        .split(' ')
        .some(
          (token) =>
            token.startsWith(query) ||
            (query.length >= 4 && this.levenshteinDistance(token, query) <= 1),
        );
    });
  }

  private normalizeSearchValue(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private levenshteinDistance(left: string, right: string): number {
    if (left === right) {
      return 0;
    }

    if (!left.length) {
      return right.length;
    }

    if (!right.length) {
      return left.length;
    }

    const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      let previousDiagonal = previousRow[0] ?? 0;
      previousRow[0] = leftIndex + 1;

      for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
        const currentValue = previousRow[rightIndex + 1] ?? 0;
        const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;

        previousRow[rightIndex + 1] = Math.min(
          (previousRow[rightIndex] ?? 0) + 1,
          currentValue + 1,
          previousDiagonal + substitutionCost,
        );

        previousDiagonal = currentValue;
      }
    }

    return previousRow[right.length] ?? 0;
  }

  /**
   * TODO: eliminar tras confirmar que no quedan datos cifrados legacy en perfil.
   * Tolera texto plano y valores legacy AES-256-GCM sin romper el endpoint.
   */
  private decodeLegacyValue(value: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!this.looksLikeEncryptedValue(value)) {
      return value;
    }

    try {
      return this.decryptLegacyValue(value);
    } catch {
      this.logger.warn(
        'Se detectó un campo de perfil con cifrado inválido o incompatible. Se omitirá en la respuesta.',
      );
      return null;
    }
  }

  /** Descifra únicamente valores legacy AES-256-GCM. */
  private decryptLegacyValue(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de valor cifrado inválido.');
    }
    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const ciphertext = Buffer.from(parts[2]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private looksLikeEncryptedValue(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 3) {
      return false;
    }

    const [iv, authTag, ciphertext] = parts;
    const isHex = (segment: string, expectedLength?: number) => {
      if (!segment || (expectedLength && segment.length !== expectedLength)) {
        return false;
      }

      return /^[0-9a-f]+$/i.test(segment) && segment.length % 2 === 0;
    };

    return isHex(iv ?? '', 24) && isHex(authTag ?? '', 32) && isHex(ciphertext ?? '');
  }

  private async isPrincipalAdminUser(
    manager: import('typeorm').EntityManager,
    userId: string,
  ): Promise<boolean> {
    const principalAdmin = await manager.findOne(User, {
      where: { role: UserRole.ADMIN },
      order: { createdAt: 'ASC' },
      withDeleted: false,
    });

    return principalAdmin?.id === userId;
  }
}
