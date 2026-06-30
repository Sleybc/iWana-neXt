import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';

/**
 * Configuracion singleton de branding propio de la consola de plataforma.
 * No pertenece a ningun tenant; vive en schema public y usa assets con tenantSchema='platform'.
 */
@Entity({ schema: 'public', name: 'platform_branding_settings' })
export class PlatformBrandingSettings {
  @Column({ type: 'varchar', length: 30, primary: true, default: 'platform' })
  id: string;

  @Column({ name: 'product_name', type: 'varchar', length: 120 })
  productName: string;

  @Column({ name: 'surface_name', type: 'varchar', length: 120 })
  surfaceName: string;

  @Column({ name: 'metadata_title', type: 'varchar', length: 180 })
  metadataTitle: string;

  @Column({ name: 'metadata_description', type: 'varchar', length: 300 })
  metadataDescription: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'logo_asset_id', type: 'uuid', nullable: true })
  logoAssetId: string | null;

  @Column({ name: 'favicon_url', type: 'varchar', length: 500, nullable: true })
  faviconUrl: string | null;

  @Column({ name: 'favicon_asset_id', type: 'uuid', nullable: true })
  faviconAssetId: string | null;

  @Column({ name: 'login_background_light_url', type: 'varchar', length: 500, nullable: true })
  loginBackgroundLightUrl: string | null;

  @Column({ name: 'login_background_light_asset_id', type: 'uuid', nullable: true })
  loginBackgroundLightAssetId: string | null;

  @Column({ name: 'login_background_dark_url', type: 'varchar', length: 500, nullable: true })
  loginBackgroundDarkUrl: string | null;

  @Column({ name: 'login_background_dark_asset_id', type: 'uuid', nullable: true })
  loginBackgroundDarkAssetId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
