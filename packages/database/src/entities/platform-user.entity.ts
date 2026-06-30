import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlatformRole, UserStatus } from '@iwana/shared';

/**
 * Entidad PlatformUser — schema publico.
 *
 * Usuarios de nivel plataforma: SYSTEM_ADMIN e IWANA_SUPPORT.
 * Estos usuarios NO pertenecen a ningun tenant especifico — tienen
 * acceso transversal a todos los tenants según su rol.
 *
 * SEGURIDAD:
 * - email: almacenado cifrado con AES-256-GCM (IV unico por registro)
 * - emailHash: SHA-256 del email en minusculas — usado en indices y busquedas
 * - passwordHash: bcrypt 12 rounds — NO cifrar adicionalmente (redundante)
 * - mfaSecret: AES-256-GCM cifrado — obligatorio para plataforma (mfaEnabled siempre true)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
@Index('idx_platform_users_email_hash', ['emailHash'])
@Entity({ schema: 'public', name: 'platform_users' })
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Email cifrado con AES-256-GCM.
   * Longitud 512 para acomodar el ciphertext (IV + datos + auth tag en base64).
   * Para buscar por email, usar emailHash.
   */
  @Column({ length: 512 })
  email: string;

  /**
   * SHA-256 del email normalizado (trim().toLowerCase()).
   * Longitud 64 = 256 bits en hex. Unico e indexado para busquedas eficientes.
   */
  @Column({ unique: true, name: 'email_hash', length: 64 })
  emailHash: string;

  /**
   * Hash bcrypt 12 rounds del password.
   * Longitud 60 = formato bcrypt estandar.
   * NO se cifra adicionalmente con AES-256 (hash one-way ya es seguro).
   */
  @Column({ name: 'password_hash', length: 60 })
  passwordHash: string;

  /** Rol de plataforma: SYSTEM_ADMIN o IWANA_SUPPORT */
  @Column({ type: 'enum', enum: PlatformRole })
  role: PlatformRole;

  /** Estado del usuario de plataforma */
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /**
   * MFA TOTP — siempre habilitado para usuarios de plataforma.
   * Default true refleja la politica de seguridad obligatoria.
   */
  @Column({ name: 'mfa_enabled', default: true })
  mfaEnabled: boolean;

  /**
   * Secret TOTP cifrado con AES-256-GCM.
   * Null hasta que el usuario completa el setup de MFA.
   */
  @Column({ name: 'mfa_secret', type: 'varchar', length: 512, nullable: true })
  mfaSecret: string | null;

  /** Nombre del usuario de plataforma */
  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  /** Apellido del usuario de plataforma */
  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  /** Telefono de contacto opcional en formato E.164 */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** Zona horaria preferida para render de fechas en UI */
  @Column({ length: 50, default: 'America/Bogota' })
  timezone: string;

  /** Idioma preferido del usuario de plataforma */
  @Column({ length: 10, default: 'es-CO' })
  language: string;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft delete — usuario desactivado conserva el registro para auditoria */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
