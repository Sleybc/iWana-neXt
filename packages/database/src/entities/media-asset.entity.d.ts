/**
 * Usos permitidos para un MediaAsset de branding empresarial.
 * Determina validaciones de MIME type, tamaño máximo y slots del Tenant.
 */
export declare enum MediaUsage {
    /** Logo horizontal — clara u oscura */
    LOGO = "logo",
    /** Sello compacto cuadrado (ícono 1:1) */
    SEAL = "seal",
    /** Favicon de la consola (32x32 o SVG) */
    FAVICON = "favicon",
    /** Imagen de fondo del login */
    LOGIN_BACKGROUND = "login_background",
    /** Asset genérico sin slot específico */
    GENERAL = "general"
}
/**
 * Variante de tema para el asset.
 * 'light' = visible sobre fondos claros.
 * 'dark'  = visible sobre fondos oscuros.
 * null    = sin preferencia / neutral.
 */
export type MediaThemeVariant = 'light' | 'dark' | null;
/**
 * Entidad MediaAsset — schema público.
 *
 * Registra cada archivo subido a través del módulo Media.
 * Los objetos físicos viven en MinIO (STORAGE_DRIVER=minio) o en el FS
 * local de desarrollo (STORAGE_DRIVER=local).
 *
 * Naming de objectKey: {tenantSchema}/{usage}/{id}.{ext}
 * - tenantSchema='platform' para assets de la plataforma (SYSTEM_ADMIN).
 * - El campo `publicUrl` se rellena al subir para buckets públicos.
 *
 * Soft delete: deletedAt != null marca el asset como eliminado;
 * la tarea de limpieza (worker) borra el objeto físico de MinIO.
 *
 * ADR-034 — Bounded Context Media/Assets
 * HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0
 */
export declare class MediaAsset {
    id: string;
    /**
     * Schema del tenant propietario del asset.
     * Valor especial 'platform' para assets globales (SYSTEM_ADMIN).
     * Ejemplo: 'tenant_mi_isp_colombia'
     */
    tenantSchema: string;
    /**
     * Propósito del asset dentro del branding empresarial.
     * Determina restricciones de MIME type y dimensiones.
     */
    usage: MediaUsage;
    /**
     * Variante de tema: 'light', 'dark' o null (sin preferencia).
     * Relevante para logo, seal y favicon.
     */
    themeVariant: MediaThemeVariant;
    /** Nombre original del archivo al momento de la subida */
    originalFilename: string;
    /** MIME type detectado/validado (ej: 'image/png', 'image/webp') */
    mimeType: string;
    /** Extensión sin punto (ej: 'png', 'webp', 'jpg') */
    ext: string;
    /** Tamaño del archivo en bytes */
    sizeBytes: number;
    /**
     * Clave del objeto en el bucket S3/MinIO.
     * Formato: {tenantSchema}/{usage}/{id}.{ext}
     */
    objectKey: string;
    /**
     * URL pública permanente del objeto (bucket público o CDN).
     * null si el bucket es privado y se usan signed URLs.
     */
    publicUrl: string | null;
    /** UUID del usuario que subió el archivo. null para uploads del sistema. */
    uploadedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** Soft delete — el worker limpia el objeto físico de MinIO al detectar este campo */
    deletedAt: Date | null;
}
//# sourceMappingURL=media-asset.entity.d.ts.map