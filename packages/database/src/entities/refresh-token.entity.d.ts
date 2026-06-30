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
export declare class RefreshToken {
    id: string;
    /** FK logica a users.id del tenant */
    userId: string;
    /**
     * SHA-256 del refresh token en hex (64 chars).
     * El token real se envia al cliente via cookie httpOnly y NUNCA se persiste.
     */
    tokenHash: string;
    /**
     * UUID agrupador de la sesion — todos los tokens rotados comparten familyId.
     * Cuando se detecta reuse attack, se revocan TODOS los tokens con este familyId.
     */
    familyId: string;
    /** Cuando expira el token (7 dias desde creacion) */
    expiresAt: Date;
    /**
     * Null = token vigente.
     * No-null = revocado en este momento por esta razon.
     */
    revokedAt: Date | null;
    /**
     * Razon de revocacion.
     * Valores: LOGOUT | ROTATION | REUSE_ATTACK | PASSWORD_CHANGE | ADMIN
     */
    revokeReason: string | null;
    /** IP del cliente al momento de crear el token (para auditoria) */
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}
//# sourceMappingURL=refresh-token.entity.d.ts.map