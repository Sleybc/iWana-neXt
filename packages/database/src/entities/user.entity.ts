import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentType, UserRole, UserStatus } from '@iwana/shared';

/**
 * Entidad User — schema por tenant (dinamico via search_path).
 *
 * Representa un usuario del ISP (empleados, tecnicos, contadores, suscriptores).
 * Reside en el schema exclusivo del tenant: "tenant_<slug>".users.
 *
 * IMPORTANTE: NO se especifica schema en @Entity() para que TypeORM genere
 * referencias no calificadas ("users") que PostgreSQL resuelve via search_path.
 * La resolucion de schema se realiza con SET LOCAL search_path al inicio de
 * cada transaccion (ADR-017, Riesgo R2 pgBouncer).
 *
 * SEGURIDAD:
 * - email: texto plano con constraint UNIQUE dentro del tenant
 * - emailHash: SHA-256 derivado para compatibilidad transversal de autenticacion
 * - passwordHash: bcrypt 12 rounds
 * - mfaSecret: AES-256-GCM cifrado (nullable hasta activacion MFA)
 * - password_reset_token: cifrado (nullable, expira en 24h)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
@Index('idx_users_email_hash', ['emailHash'])
@Index('idx_users_first_name', ['firstName'])
@Index('idx_users_last_name', ['lastName'])
@Index('idx_users_tenant_role', ['tenantId', 'role'])
@Index('idx_users_tenant_status', ['tenantId', 'status'])
@Entity({ name: 'users' }) // Sin schema — resuelto via SET LOCAL search_path
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Email en texto plano; emailHash se mantiene derivado para compatibilidad transversal. */
  @Column({ length: 255, unique: true })
  email: string;

  /** SHA-256 del email normalizado. Longitud 64 = 256 bits en hex */
  @Column({ unique: true, name: 'email_hash', length: 64 })
  emailHash: string;

  /** bcrypt 12 rounds. Longitud 60 = formato bcrypt estandar */
  @Column({ name: 'password_hash', length: 60 })
  passwordHash: string;

  /** Rol del usuario dentro del tenant (14 roles definidos en shared/enums) */
  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING_VERIFICATION })
  status: UserStatus;

  /**
   * FK logica a public.tenants.id.
   * No es FK referencial para evitar cross-schema FK en PostgreSQL.
   */
  @Column({ name: 'tenant_id' })
  tenantId: string;

  /** MFA TOTP — opcional para usuarios de tenant (obligatorio por rol segun politica) */
  @Column({ name: 'mfa_enabled', default: false })
  mfaEnabled: boolean;

  /** Secret TOTP cifrado AES-256-GCM. Null hasta completar setup de MFA */
  @Column({ name: 'mfa_secret', type: 'varchar', length: 512, nullable: true })
  mfaSecret: string | null;

  /**
   * Si true, el usuario debe completar el setup de MFA antes de acceder.
   * El admin lo define al crear el usuario o puede cambiarlo después.
   * Default false — no fuerza MFA por defecto.
   */
  @Column({ name: 'mfa_required', default: false })
  mfaRequired: boolean;

  /**
   * Si true, el usuario participa en despacho operativo diario, capacidad
   * visible y recomendaciones de asignación. Cualquier usuario interno puede
   * recibir agenda; este flag solo gobierna la superficie operativa.
   */
  @Column({ name: 'is_operational_resource', default: false })
  isOperationalResource: boolean;

  /**
   * true cuando el usuario debe cambiar el password en el proximo login.
   * Se activa en: creacion inicial (seed), reset de password por admin.
   */
  @Column({ name: 'password_reset_required', default: false })
  passwordResetRequired: boolean;

  /** Token de reset (forgot-password). Null cuando no hay reset pendiente */
  @Column({ name: 'password_reset_token', type: 'varchar', length: 512, nullable: true })
  passwordResetToken: string | null;

  /**
   * Expiracion de la credencial temporal (passwordResetRequired).
   * No usar para el TTL del token forgot-password (SEC-03).
   */
  @Column({ name: 'password_reset_expires_at', type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;

  /**
   * Expiracion del token forgot-password (TTL corto, tipicamente 1 h).
   * Independiente de passwordResetExpiresAt (credencial temporal 24 h).
   */
  @Column({ name: 'password_reset_token_expires_at', type: 'timestamptz', nullable: true })
  passwordResetTokenExpiresAt: Date | null;

  /**
   * Contador de intentos fallidos de login.
   * 5 intentos consecutivos activan lockout de 15 minutos (HLD Seccion 1).
   */
  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  /** Timestamp hasta el cual el usuario esta bloqueado. Null = no bloqueado */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** true despues de verificar el email con el token enviado */
  @Column({ name: 'email_verified', default: false })
  emailVerified: boolean;

  /** Token de verificacion de email cifrado. Null post-verificacion */
  @Column({ name: 'email_verification_token', type: 'varchar', length: 512, nullable: true })
  emailVerificationToken: string | null;

  // ── Perfil personal ─────────────────────────────────────────────────────────

  /** Nombre en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  /** Apellido en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  /** Teléfono en formato E.164 (ej: "+573001234567") */
  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** Cargo o posición del usuario en la empresa */
  @Column({ name: 'job_title', type: 'varchar', length: 150, nullable: true })
  jobTitle: string | null;

  /** Tipo de documento de identidad colombiano */
  @Column({ name: 'document_type', type: 'varchar', length: 20, nullable: true })
  documentType: DocumentType | null;

  /**
   * Número de documento en texto plano.
   * PII sensible — Ley 1581 habeas data.
   * Se expone de forma controlada en UserResponseDto para gestión interna
   * del tenant y perfil propio autenticado.
   */
  @Column({ name: 'document_number', type: 'varchar', length: 30, nullable: true })
  documentNumber: string | null;

  /** URL de imagen de perfil */
  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete — preserva el registro para auditoria e integridad historica */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
