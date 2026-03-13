import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantStatus } from '@iwana/shared';

/**
 * Entidad Tenant — schema publico.
 *
 * Representa un ISP cliente de la plataforma iWana neXt.
 * Cada tenant tiene su propio schema PostgreSQL (schema_name) para
 * aislar completamente sus datos de otros tenants (ADR-017).
 *
 * IMPORTANTE: slug e schema_name son INMUTABLES post-creacion.
 * Modificarlos requeriria renombrar el schema PostgreSQL y es
 * una operacion de alto riesgo fuera del alcance del CRUD normal.
 */
@Index('idx_tenants_slug', ['slug'])
@Index('idx_tenants_schema_name', ['schemaName'])
@Entity({ schema: 'public', name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nombre comercial del ISP */
  @Column({ length: 255 })
  name: string;

  /**
   * Slug identificador unico — solo letras minusculas, numeros y guiones.
   * Ejemplo: "mi-isp-colombia". Inmutable post-creacion.
   */
  @Column({ unique: true, length: 63 })
  slug: string;

  /**
   * Nombre del schema PostgreSQL del tenant.
   * Derivado del slug con prefijo "tenant_": "tenant_mi_isp_colombia".
   * Inmutable post-creacion (ADR-017).
   */
  @Column({ unique: true, length: 63, name: 'schema_name' })
  schemaName: string;

  /** Estado del ciclo de vida del tenant */
  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.PROVISIONING })
  status: TenantStatus;

  /**
   * Configuracion especifica del tenant.
   * Ejemplo: { timezone: 'America/Bogota', currency: 'COP', features: { billing: true } }
   */
  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  /** Email de contacto del representante del ISP */
  @Column({ name: 'contact_email', length: 255 })
  contactEmail: string;

  /** Limite de suscriptores contratado. 0 = sin limite definido */
  @Column({ name: 'max_subscribers', default: 0 })
  maxSubscribers: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
