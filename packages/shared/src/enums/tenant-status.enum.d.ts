/**
 * Estado del ciclo de vida de un tenant (ISP) en la plataforma.
 * SUSPENDED retorna HTTP 403 en todos los endpoints del tenant.
 */
export declare enum TenantStatus {
    PROVISIONING = "PROVISIONING",
    ACTIVE = "ACTIVE",
    /** El tenant esta suspendido — todos los endpoints retornan HTTP 403 */
    SUSPENDED = "SUSPENDED",
    INACTIVE = "INACTIVE",
    /** Eliminacion solicitada; datos retenidos hasta purga fisica diferida */
    MARKED_FOR_DELETION = "MARKED_FOR_DELETION",
    PROVISIONING_FAILED = "PROVISIONING_FAILED"
}
//# sourceMappingURL=tenant-status.enum.d.ts.map