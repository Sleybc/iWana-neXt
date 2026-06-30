/**
 * Configuracion singleton de branding propio de la consola de plataforma.
 * No pertenece a ningun tenant; vive en schema public y usa assets con tenantSchema='platform'.
 */
export declare class PlatformBrandingSettings {
    id: string;
    productName: string;
    surfaceName: string;
    metadataTitle: string;
    metadataDescription: string;
    logoUrl: string | null;
    logoAssetId: string | null;
    faviconUrl: string | null;
    faviconAssetId: string | null;
    loginBackgroundLightUrl: string | null;
    loginBackgroundLightAssetId: string | null;
    loginBackgroundDarkUrl: string | null;
    loginBackgroundDarkAssetId: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=platform-branding-settings.entity.d.ts.map