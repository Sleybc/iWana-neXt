import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad PlatformAuditLog — schema publico.
 *
 * Registro de auditoria para operaciones a nivel plataforma
 * (acciones de SYSTEM_ADMIN e IWANA_SUPPORT sobre tenants,
 * usuarios de plataforma y configuraciones globales).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
@Index('idx_pal_user_created', ['userId', 'createdAt'])
@Index('idx_pal_action_created', ['action', 'createdAt'])
@Entity({ schema: 'public', name: 'platform_audit_logs' })
export class PlatformAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ID del usuario de plataforma que realizo la accion. Null = sistema/job */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** Accion realizada. Ejemplo: 'TENANT_CREATED', 'PLATFORM_USER_SUSPENDED' */
  @Column({ length: 100 })
  action: string;

  /** Tipo de entidad afectada. Ejemplo: 'Tenant', 'PlatformUser' */
  @Column({ name: 'entity_type', length: 100 })
  entityType: string;

  /** ID de la entidad afectada */
  @Column({ name: 'entity_id', length: 100 })
  entityId: string;

  /** Estado anterior de la entidad (para operaciones de actualizacion) */
  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, unknown> | null;

  /** Estado nuevo de la entidad */
  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  /** IP del solicitante. Longitud 45 soporta IPv6 completo */
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /** ID de correlacion de la request (para trazabilidad) */
  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  /** Inmutable — unica marca temporal del registro */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // SIN updatedAt — SIN deletedAt — APPEND-ONLY absoluto
}
