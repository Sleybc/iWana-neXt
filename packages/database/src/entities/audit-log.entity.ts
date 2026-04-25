import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '@iwana/shared';

/**
 * Entidad AuditLog — schema por tenant (dinamico via search_path).
 *
 * Registro append-only de todas las operaciones CUD del tenant.
 * Generado por el AuditInterceptor global (NestJS) sin intervencion
 * del codigo de negocio (excepto skip con @SkipAudit).
 *
 * APPEND-ONLY: sin UpdateDateColumn, sin DeleteDateColumn.
 * La RLS en PostgreSQL refuerza esto: REVOKE DELETE, REVOKE UPDATE.
 * Retencion minima 7 anios (Ley 1581/2012 + CRC).
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 1 (@iwana/audit)
 */
@Index('idx_al_tenant_created', ['tenantId', 'createdAt'])
@Index('idx_al_entity', ['entityType', 'entityId'])
@Index('idx_al_user_created', ['userId', 'createdAt'])
@Index('idx_al_action_tenant', ['action', 'tenantId'])
@Entity({ name: 'audit_logs' }) // Sin schema — resuelto via SET LOCAL search_path
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK logica a public.tenants.id — para trazabilidad cross-schema */
  @Column({ name: 'tenant_id' })
  tenantId: string;

  /** FK logica a users.id del tenant. Null para jobs del sistema */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  /** Accion auditada (enum AuditAction) */
  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  /** Nombre de la entidad afectada. Ejemplo: 'User', 'Subscriber', 'Invoice' */
  @Column({ name: 'entity_type', length: 100 })
  entityType: string;

  /** ID de la entidad afectada */
  @Column({ name: 'entity_id', length: 100 })
  entityId: string;

  /** Estado anterior (para operaciones de actualizacion). Sanitizado sin PII cifrado */
  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: Record<string, unknown> | null;

  /** Estado nuevo. Sanitizado sin PII cifrado */
  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  /** IP del solicitante. Longitud 45 soporta IPv6 completo */
  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /** ID de correlacion de la request (header X-Request-Id o generado) */
  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  /** Unica marca temporal del registro — inmutable */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // SIN updatedAt — SIN deletedAt — APPEND-ONLY absoluto
}
