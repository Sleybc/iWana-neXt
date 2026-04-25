import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad RefreshToken — schema por tenant (dinamico via search_path).
 *
 * Gestiona las sesiones persistentes de usuarios del tenant.
 * Implementa refresh token rotation con deteccion de reuse attack:
 * - Al rotar, el token previo se marca revocado con reason 'ROTATION'
 * - Si se detecta uso de token ya revocado, toda la familia se revoca (reuse attack)
 *
 * SEGURIDAD:
 * - El token real NUNCA se almacena — solo su SHA-256 (tokenHash)
 * - familyId agrupa todos los tokens rotados de una misma sesion
 * - revokedAt null = token vigente; no-null = revocado
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (Autenticacion JWT RS256)
 */
@Index('idx_rt_token_hash', ['tokenHash'])
@Index('idx_rt_family_id', ['familyId'])
@Index('idx_rt_user_revoked', ['userId', 'revokedAt'])
@Entity({ name: 'refresh_tokens' }) // Sin schema — resuelto via SET LOCAL search_path
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a users.id del tenant */
  @Column({ name: 'user_id' })
  userId: string;

  /**
   * SHA-256 del refresh token en hex (64 chars).
   * El token real se envia al cliente via cookie httpOnly y NUNCA se persiste.
   */
  @Column({ name: 'token_hash', unique: true, length: 64 })
  tokenHash: string;

  /**
   * UUID agrupador de la sesion — todos los tokens rotados comparten familyId.
   * Cuando se detecta reuse attack, se revocan TODOS los tokens con este familyId.
   */
  @Column({ name: 'family_id' })
  familyId: string;

  /** Cuando expira el token (7 dias desde creacion) */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /**
   * Null = token vigente.
   * No-null = revocado en este momento por esta razon.
   */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /**
   * Razon de revocacion.
   * Valores: LOGOUT | ROTATION | REUSE_ATTACK | PASSWORD_CHANGE | ADMIN
   */
  @Column({ name: 'revoke_reason', type: 'varchar', length: 50, nullable: true })
  revokeReason: string | null;

  /** IP del cliente al momento de crear el token (para auditoria) */
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // SIN updatedAt — revokedAt captura cualquier cambio de estado
}
