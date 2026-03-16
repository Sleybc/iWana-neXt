import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';

/** Iteraciones bcrypt para hashes de password de usuarios creados por admin */
const BCRYPT_ROUNDS = 12;

/** Longitud del password temporal en bytes (16 bytes → 32 chars hex) */
const TEMP_PASSWORD_BYTES = 16;

/**
 * Servicio de gestion de usuarios por tenant.
 *
 * Opera siempre dentro del schema del tenant via TenantContext + runInTenantSchema.
 * El email se cifra antes de persistir y se indexa por emailHash (SHA-256).
 *
 * Operaciones disponibles:
 * - findAll: listado cursor-based con filtros por status y rol
 * - findOne: obtener usuario por ID
 * - create: crear usuario (opcionalmente con password temporal)
 * - update: actualizar status y/o rol (ADMIN o propio usuario)
 * - remove: soft delete (solo ADMIN, no puede borrar a otro ADMIN del mismo tenant)
 *
 * SEGURIDAD:
 * - Email siempre cifrado AES-256-GCM antes de persistir (necesita MFA_ENCRYPTION_KEY)
 * - Password temporal generado con crypto.randomBytes (nunca predecible)
 * - Audit trail en CREATE, UPDATE, DELETE via AuditService
 * - RBAC: ADMIN no puede eliminar a otro ADMIN (RF-RBAC-04)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 4 (endpoints 11-15)
 */
@Injectable()
export class UsersService {
  /** Clave AES-256-GCM derivada de MFA_ENCRYPTION_KEY (64 chars hex) */
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
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
  }): Promise<{ data: UserResponseDto[]; meta: { nextCursor: string | null; total: number } }> {
    const { schemaName } = TenantContext.getOrThrow();
    const limit = Math.min(params.limit ?? 50, 100);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Construir filtros tipados — TypeORM find* filtra soft-delete automáticamente
      const where: FindOptionsWhere<User> = {};
      if (params.cursor) where.id = MoreThan(params.cursor);
      if (params.status) where.status = params.status;
      if (params.role) where.role = params.role;

      // Consulta de datos: +1 para detectar si hay pagina siguiente
      const users = await qr.manager.find(User, {
        where,
        order: { id: 'ASC' },
        take: limit + 1,
      });

      // Total sin paginacion — misma conexion que garantiza el search_path
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
   * - El email se cifra AES-256-GCM y se indexa por emailHash SHA-256.
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

      // Verificar unicidad incluyendo soft-deleted (emailHash tiene unique constraint en DB)
      const existing = await qr.manager.findOne(User, { where: { emailHash }, withDeleted: true });
      if (existing && !existing.deletedAt) {
        // Usuario activo con ese email — conflicto real
        throw new ConflictException('Ya existe un usuario con ese email en este tenant.');
      }

      // Cifrar email antes de persistir
      const encryptedEmail = this.encryptValue(dto.email.toLowerCase().trim());

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
        existing.email = encryptedEmail;
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
        existing.firstName = dto.firstName ? this.encryptValue(dto.firstName.trim()) : null;
        existing.lastName = dto.lastName ? this.encryptValue(dto.lastName.trim()) : null;
        existing.phone = dto.phone ?? null;
        existing.jobTitle = dto.jobTitle ?? null;
        existing.documentType = dto.documentType ?? null;
        existing.documentNumber = dto.documentNumber
          ? this.encryptValue(dto.documentNumber.trim())
          : null;
        existing.avatarUrl = dto.avatarUrl ?? null;
        await qr.manager.save(User, existing);
        user = existing;
      } else {
        // Usuario nuevo — insertar registro fresco
        user = qr.manager.create(User, {
          email: encryptedEmail,
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
          firstName: dto.firstName ? this.encryptValue(dto.firstName.trim()) : null,
          lastName: dto.lastName ? this.encryptValue(dto.lastName.trim()) : null,
          phone: dto.phone ?? null,
          jobTitle: dto.jobTitle ?? null,
          documentType: dto.documentType ?? null,
          documentNumber: dto.documentNumber ? this.encryptValue(dto.documentNumber.trim()) : null,
          avatarUrl: dto.avatarUrl ?? null,
        });
        await qr.manager.save(User, user);
      }

      // Audit trail — no incluir el email cifrado ni el hash como newValue (contiene PII cifrada)
      void this.auditService.log({
        action: AuditAction.CREATE,
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        newValue: { role: user.role, status: user.status, tenantId: user.tenantId },
        ipAddress: ipAddress ?? null,
      });

      const dto_result = this.toDto(user);
      return temporaryPassword ? { ...dto_result, temporaryPassword } : dto_result;
    });
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

      const oldValue = { status: user.status, role: user.role };

      if (dto.status !== undefined) user.status = dto.status;
      if (dto.role !== undefined) user.role = dto.role;
      // Perfil personal — cifrar campos PII si se actualizan
      if (dto.firstName !== undefined)
        user.firstName = dto.firstName ? this.encryptValue(dto.firstName.trim()) : null;
      if (dto.lastName !== undefined)
        user.lastName = dto.lastName ? this.encryptValue(dto.lastName.trim()) : null;
      if (dto.phone !== undefined) user.phone = dto.phone ?? null;
      if (dto.jobTitle !== undefined) user.jobTitle = dto.jobTitle ?? null;
      if (dto.documentType !== undefined) user.documentType = dto.documentType ?? null;
      if (dto.documentNumber !== undefined)
        user.documentNumber = dto.documentNumber
          ? this.encryptValue(dto.documentNumber.trim())
          : null;
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl ?? null;

      await qr.manager.save(User, user);

      void this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: id,
        userId: actorUserId,
        oldValue,
        newValue: { status: user.status, role: user.role },
      });

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
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Convierte entidad User a DTO publico.
   * Descifra firstName y lastName si están presentes.
   * documentNumber NUNCA se incluye — PII sensible bajo Ley 1581.
   */
  private toDto(user: User): UserResponseDto {
    return {
      id: user.id,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      tenantId: user.tenantId,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      passwordResetRequired: user.passwordResetRequired,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt ?? null,
      // Perfil personal — desencriptar campos cifrados
      firstName: user.firstName ? this.decryptValue(user.firstName) : null,
      lastName: user.lastName ? this.decryptValue(user.lastName) : null,
      phone: user.phone ?? null,
      jobTitle: user.jobTitle ?? null,
      documentType: (user.documentType as DocumentType) ?? null,
      avatarUrl: user.avatarUrl ?? null,
      // documentNumber: omitido intencionalmente (PII sensible — Ley 1581)
    };
  }

  /** SHA-256 del email normalizado — para busquedas indexadas sin exponer PII */
  private hashEmail(email: string): string {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  /**
   * Cifra un valor con AES-256-GCM usando la clave derivada del constructor.
   * Formato: <iv_hex>:<authTag_hex>:<ciphertext_hex>
   */
  private encryptValue(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Descifra un valor cifrado con AES-256-GCM.
   * Formato esperado: <iv_hex>:<authTag_hex>:<ciphertext_hex>
   */
  private decryptValue(encrypted: string): string {
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
}
