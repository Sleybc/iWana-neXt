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
export declare class Tenant {
    id: string;
    /** Nombre comercial del ISP */
    name: string;
    /**
     * Slug identificador unico — solo letras minusculas, numeros y guiones.
     * Ejemplo: "mi-isp-colombia". Inmutable post-creacion.
     */
    slug: string;
    /**
     * Nombre del schema PostgreSQL del tenant.
     * Derivado del slug con prefijo "tenant_": "tenant_mi_isp_colombia".
     * Inmutable post-creacion (ADR-017).
     */
    schemaName: string;
    /** Estado del ciclo de vida del tenant */
    status: TenantStatus;
    /**
     * Configuracion especifica del tenant.
     * Ejemplo: { timezone: 'America/Bogota', currency: 'COP', features: { billing: true } }
     */
    settings: Record<string, unknown>;
    /** Email de contacto del representante del ISP */
    contactEmail: string;
    /** Limite de suscriptores contratado. null = sin limite; 0 = bloqueado */
    maxSubscribers: number | null;
    /** Razón social registrada ante la Cámara de Comercio */
    legalName: string | null;
    /** NIT sin dígito verificador (ej: "900123456") */
    nit: string | null;
    /** Dígito verificador del NIT */
    nitDv: string | null;
    /** Tipo de persona jurídica o natural */
    companyType: CompanyType | null;
    /** Dirección física completa */
    address: string | null;
    city: string | null;
    /** Departamento colombiano (ej: "Cundinamarca") */
    department: string | null;
    /** ISO 3166-1 alpha-2 — distinto del campo "country" dentro del JSONB settings */
    countryCode: string | null;
    postalCode: string | null;
    /** Coordenadas GPS en formato "lat,lng" (ej: "4.6097,-74.0817") */
    coordinates: string | null;
    /** Teléfono principal en formato E.164 (ej: "+573001234567") */
    phone: string | null;
    /** Sitio web corporativo */
    website: string | null;
    /** Código CIIU colombiano (ej: "6110") */
    economicSector: string | null;
    /** URL pública HTTPS del logo horizontal — variante clara (fondo blanco/claro) */
    logoLightUrl: string | null;
    /** URL pública HTTPS del logo horizontal — variante oscura (fondo dark) */
    logoDarkUrl: string | null;
    /** URL pública HTTPS del sello compacto (ícono 1:1) — variante clara */
    sealLightUrl: string | null;
    /** URL pública HTTPS del sello compacto (ícono 1:1) — variante oscura */
    sealDarkUrl: string | null;
    /** URL pública HTTPS del favicon — variante clara */
    faviconLightUrl: string | null;
    /** URL pública HTTPS del favicon — variante oscura */
    faviconDarkUrl: string | null;
    /** URL pública HTTPS del fondo de login — variante clara */
    loginBackgroundLightUrl: string | null;
    /** URL pública HTTPS del fondo de login — variante oscura */
    loginBackgroundDarkUrl: string | null;
    /** FK opcional al asset subido para el logo claro */
    logoLightAssetId: string | null;
    /** FK opcional al asset subido para el logo oscuro */
    logoDarkAssetId: string | null;
    /** FK opcional al asset subido para el sello claro */
    sealLightAssetId: string | null;
    /** FK opcional al asset subido para el sello oscuro */
    sealDarkAssetId: string | null;
    /** FK opcional al asset subido para el favicon claro */
    faviconLightAssetId: string | null;
    /** FK opcional al asset subido para el favicon oscuro */
    faviconDarkAssetId: string | null;
    /** FK opcional al asset subido para el fondo de login claro */
    loginBackgroundLightAssetId: string | null;
    /** FK opcional al asset subido para el fondo de login oscuro */
    loginBackgroundDarkAssetId: string | null;
    /** Si el tenant elige mostrar su nombre comercial junto al sello en el sidebar */
    showTenantName: boolean;
    /** Nombre de producto visible del tenant en superficies públicas del portal */
    brandingProductName: string | null;
    /** Nombre de la superficie de acceso (ej: Portal empresarial) */
    brandingSurfaceName: string | null;
    /** Título público efectivo para pestaña/narrativa en login */
    brandingMetadataTitle: string | null;
    /** Descripción pública efectiva para el login del portal */
    brandingMetadataDescription: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}
//# sourceMappingURL=tenant.entity.d.ts.map