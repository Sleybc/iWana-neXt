import { PlatformRole, UserStatus } from '@iwana/shared';
/**
 * Entidad PlatformUser — schema publico.
 *
 * Usuarios de nivel plataforma: SYSTEM_ADMIN e IWANA_SUPPORT.
 * Estos usuarios NO pertenecen a ningun tenant especifico — tienen
 * acceso transversal a todos los tenants según su rol.
 *
 * SEGURIDAD:
 * - email: almacenado cifrado con AES-256-GCM (IV unico por registro)
 * - emailHash: SHA-256 del email en minusculas — usado en indices y busquedas
 * - passwordHash: bcrypt 12 rounds — NO cifrar adicionalmente (redundante)
 * - mfaSecret: AES-256-GCM cifrado — obligatorio para plataforma (mfaEnabled siempre true)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
export declare class PlatformUser {
    id: string;
    /**
     * Email cifrado con AES-256-GCM.
     * Longitud 512 para acomodar el ciphertext (IV + datos + auth tag en base64).
     * Para buscar por email, usar emailHash.
     */
    email: string;
    /**
     * SHA-256 del email normalizado (trim().toLowerCase()).
     * Longitud 64 = 256 bits en hex. Unico e indexado para busquedas eficientes.
     */
    emailHash: string;
    /**
     * Hash bcrypt 12 rounds del password.
     * Longitud 60 = formato bcrypt estandar.
     * NO se cifra adicionalmente con AES-256 (hash one-way ya es seguro).
     */
    passwordHash: string;
    /** Rol de plataforma: SYSTEM_ADMIN o IWANA_SUPPORT */
    role: PlatformRole;
    /** Estado del usuario de plataforma */
    status: UserStatus;
    /**
     * MFA TOTP — siempre habilitado para usuarios de plataforma.
     * Default true refleja la politica de seguridad obligatoria.
     */
    mfaEnabled: boolean;
    /**
     * Secret TOTP cifrado con AES-256-GCM.
     * Null hasta que el usuario completa el setup de MFA.
     */
    mfaSecret: string | null;
    /** Nombre del usuario de plataforma */
    firstName: string | null;
    /** Apellido del usuario de plataforma */
    lastName: string | null;
    /** Telefono de contacto opcional en formato E.164 */
    phone: string | null;
    /** Zona horaria preferida para render de fechas en UI */
    timezone: string;
    /** Idioma preferido del usuario de plataforma */
    language: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    /** Soft delete — usuario desactivado conserva el registro para auditoria */
    deletedAt: Date | null;
}
//# sourceMappingURL=platform-user.entity.d.ts.map