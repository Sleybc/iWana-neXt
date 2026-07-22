import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyType, TenantStatus } from '@iwana/shared';

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

  /**
   * Email del administrador inicial, indicado al crear la empresa.
   *
   * Se persiste —en vez de quedarse en el DTO— porque el reintento de
   * provisioning debe poder reconstruir el payload del job sin volver a
   * pedírselo al operador, y porque saber quién administra cada empresa es
   * metadato legítimo del tenant.
   *
   * Nullable por compatibilidad con los tenants anteriores a este campo, que
   * se sembraron con la constante `admin@iwana.co`.
   */
  // `type` explícito como el resto de columnas nullable: la reflexión de
  // TypeORM ve `Object` para `string | null` y no puede inferirlo.
  @Column({ name: 'admin_email', length: 255, nullable: true, type: 'varchar' })
  adminEmail: string | null;

  /**
   * Administrador principal del tenant (ADR-063).
   *
   * FK lógica a `<schema_name>.users.id`; no es FK referencial porque la columna
   * vive en `public` y el usuario en el schema del tenant.
   *
   * Antes era una regla derivada («el ADMIN activo más antiguo»), que cambiaba
   * en silencio al eliminarse ese usuario. Ahora es una designación explícita:
   * solo la mueve una transferencia auditada, nunca un soft-delete.
   *
   * NULL mientras el tenant no tenga ADMIN activo (p. ej. en PROVISIONING).
   */
  @Column({ name: 'principal_admin_user_id', nullable: true, type: 'uuid' })
  principalAdminUserId: string | null;

  /** Limite de suscriptores contratado. null = sin limite; 0 = bloqueado */
  @Column({ name: 'max_subscribers', nullable: true, type: 'integer' })
  maxSubscribers: number | null;

  // ── Datos legales ────────────────────────────────────────────────────────────

  /** Razón social registrada ante la Cámara de Comercio */
  @Column({ name: 'legal_name', length: 300, nullable: true, type: 'varchar' })
  legalName: string | null;

  /** NIT sin dígito verificador (ej: "900123456") */
  @Column({ name: 'nit', length: 20, nullable: true, type: 'varchar' })
  nit: string | null;

  /** Dígito verificador del NIT */
  @Column({ name: 'nit_dv', length: 1, nullable: true, type: 'varchar' })
  nitDv: string | null;

  /** Tipo de persona jurídica o natural */
  @Column({ name: 'company_type', length: 20, nullable: true, type: 'varchar' })
  companyType: CompanyType | null;

  // ── Dirección ────────────────────────────────────────────────────────────────

  /** Dirección física completa */
  @Column({ name: 'address', length: 500, nullable: true, type: 'varchar' })
  address: string | null;

  @Column({ name: 'city', length: 100, nullable: true, type: 'varchar' })
  city: string | null;

  /** Departamento colombiano (ej: "Cundinamarca") */
  @Column({ name: 'department', length: 100, nullable: true, type: 'varchar' })
  department: string | null;

  /** ISO 3166-1 alpha-2 — distinto del campo "country" dentro del JSONB settings */
  @Column({ name: 'country_code', length: 2, nullable: true, type: 'varchar', default: 'CO' })
  countryCode: string | null;

  @Column({ name: 'postal_code', length: 10, nullable: true, type: 'varchar' })
  postalCode: string | null;

  /** Coordenadas GPS en formato "lat,lng" (ej: "4.6097,-74.0817") */
  @Column({ name: 'coordinates', length: 50, nullable: true, type: 'varchar' })
  coordinates: string | null;

  // ── Contacto adicional ───────────────────────────────────────────────────────

  /** Teléfono principal en formato E.164 (ej: "+573001234567") */
  @Column({ name: 'phone', length: 50, nullable: true, type: 'varchar' })
  phone: string | null;

  /** Sitio web corporativo */
  @Column({ name: 'website', length: 255, nullable: true, type: 'varchar' })
  website: string | null;

  /** Código CIIU colombiano (ej: "6110") */
  @Column({ name: 'economic_sector', length: 10, nullable: true, type: 'varchar' })
  economicSector: string | null;

  // ── Branding ─────────────────────────────────────────────────────────────────

  /** URL pública HTTPS del logo horizontal — variante clara (fondo blanco/claro) */
  @Column({ name: 'logo_light_url', length: 500, nullable: true, type: 'varchar' })
  logoLightUrl: string | null;

  /** URL pública HTTPS del logo horizontal — variante oscura (fondo dark) */
  @Column({ name: 'logo_dark_url', length: 500, nullable: true, type: 'varchar' })
  logoDarkUrl: string | null;

  /** URL pública HTTPS del sello compacto (ícono 1:1) — variante clara */
  @Column({ name: 'seal_light_url', length: 500, nullable: true, type: 'varchar' })
  sealLightUrl: string | null;

  /** URL pública HTTPS del sello compacto (ícono 1:1) — variante oscura */
  @Column({ name: 'seal_dark_url', length: 500, nullable: true, type: 'varchar' })
  sealDarkUrl: string | null;

  /** URL pública HTTPS del favicon — variante clara */
  @Column({ name: 'favicon_light_url', length: 500, nullable: true, type: 'varchar' })
  faviconLightUrl: string | null;

  /** URL pública HTTPS del favicon — variante oscura */
  @Column({ name: 'favicon_dark_url', length: 500, nullable: true, type: 'varchar' })
  faviconDarkUrl: string | null;

  /** URL pública HTTPS del fondo de login — variante clara */
  @Column({ name: 'login_background_light_url', length: 500, nullable: true, type: 'varchar' })
  loginBackgroundLightUrl: string | null;

  /** URL pública HTTPS del fondo de login — variante oscura */
  @Column({ name: 'login_background_dark_url', length: 500, nullable: true, type: 'varchar' })
  loginBackgroundDarkUrl: string | null;

  /** FK opcional al asset subido para el logo claro */
  @Column({ name: 'logo_light_asset_id', nullable: true, type: 'uuid' })
  logoLightAssetId: string | null;

  /** FK opcional al asset subido para el logo oscuro */
  @Column({ name: 'logo_dark_asset_id', nullable: true, type: 'uuid' })
  logoDarkAssetId: string | null;

  /** FK opcional al asset subido para el sello claro */
  @Column({ name: 'seal_light_asset_id', nullable: true, type: 'uuid' })
  sealLightAssetId: string | null;

  /** FK opcional al asset subido para el sello oscuro */
  @Column({ name: 'seal_dark_asset_id', nullable: true, type: 'uuid' })
  sealDarkAssetId: string | null;

  /** FK opcional al asset subido para el favicon claro */
  @Column({ name: 'favicon_light_asset_id', nullable: true, type: 'uuid' })
  faviconLightAssetId: string | null;

  /** FK opcional al asset subido para el favicon oscuro */
  @Column({ name: 'favicon_dark_asset_id', nullable: true, type: 'uuid' })
  faviconDarkAssetId: string | null;

  /** FK opcional al asset subido para el fondo de login claro */
  @Column({ name: 'login_background_light_asset_id', nullable: true, type: 'uuid' })
  loginBackgroundLightAssetId: string | null;

  /** FK opcional al asset subido para el fondo de login oscuro */
  @Column({ name: 'login_background_dark_asset_id', nullable: true, type: 'uuid' })
  loginBackgroundDarkAssetId: string | null;

  /** Si el tenant elige mostrar su nombre comercial junto al sello en el sidebar */
  @Column({ name: 'show_tenant_name', type: 'boolean', default: true })
  showTenantName: boolean;

  /** Nombre de producto visible del tenant en superficies públicas del portal */
  @Column({ name: 'branding_product_name', length: 120, nullable: true, type: 'varchar' })
  brandingProductName: string | null;

  /** Nombre de la superficie de acceso (ej: Portal empresarial) */
  @Column({ name: 'branding_surface_name', length: 120, nullable: true, type: 'varchar' })
  brandingSurfaceName: string | null;

  /** Título público efectivo para pestaña/narrativa en login */
  @Column({ name: 'branding_metadata_title', length: 180, nullable: true, type: 'varchar' })
  brandingMetadataTitle: string | null;

  /** Descripción pública efectiva para el login del portal */
  @Column({ name: 'branding_metadata_description', length: 300, nullable: true, type: 'varchar' })
  brandingMetadataDescription: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', nullable: true, type: 'timestamptz' })
  deletedAt: Date | null;
}
