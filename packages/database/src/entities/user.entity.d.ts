import { DocumentType, UserRole, UserStatus } from '@iwana/shared';
/**
 * Entidad User — schema por tenant (dinamico via search_path).
 *
 * Representa un usuario del ISP (empleados, tecnicos, contadores, suscriptores).
 * Reside en el schema exclusivo del tenant: "tenant_<slug>".users.
 *
 * IMPORTANTE: NO se especifica schema en @Entity() para que TypeORM genere
 * referencias no calificadas ("users") que PostgreSQL resuelve via search_path.
 * La resolucion de schema se realiza con SET LOCAL search_path al inicio de
 * cada transaccion (ADR-017, Riesgo R2 pgBouncer).
 *
 * SEGURIDAD:
 * - email: texto plano con constraint UNIQUE dentro del tenant
 * - emailHash: SHA-256 derivado para compatibilidad transversal de autenticacion
 * - passwordHash: bcrypt 12 rounds
 * - mfaSecret: AES-256-GCM cifrado (nullable hasta activacion MFA)
 * - password_reset_token: cifrado (nullable, expira en 24h)
 *
 * HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 */
export declare class User {
    id: string;
    /** Email en texto plano; emailHash se mantiene derivado para compatibilidad transversal. */
    email: string;
    /** SHA-256 del email normalizado. Longitud 64 = 256 bits en hex */
    emailHash: string;
    /** bcrypt 12 rounds. Longitud 60 = formato bcrypt estandar */
    passwordHash: string;
    /** Rol del usuario dentro del tenant (14 roles definidos en shared/enums) */
    role: UserRole;
    status: UserStatus;
    /**
     * FK logica a public.tenants.id.
     * No es FK referencial para evitar cross-schema FK en PostgreSQL.
     */
    tenantId: string;
    /** MFA TOTP — opcional para usuarios de tenant (obligatorio por rol segun politica) */
    mfaEnabled: boolean;
    /** Secret TOTP cifrado AES-256-GCM. Null hasta completar setup de MFA */
    mfaSecret: string | null;
    /**
     * Si true, el usuario debe completar el setup de MFA antes de acceder.
     * El admin lo define al crear el usuario o puede cambiarlo después.
     * Default false — no fuerza MFA por defecto.
     */
    mfaRequired: boolean;
    /**
     * Si true, el usuario participa en despacho operativo diario, capacidad
     * visible y recomendaciones de asignación. Cualquier usuario interno puede
     * recibir agenda; este flag solo gobierna la superficie operativa.
     */
    isOperationalResource: boolean;
    /**
     * true cuando el usuario debe cambiar el password en el proximo login.
     * Se activa en: creacion inicial (seed), reset de password por admin.
     */
    passwordResetRequired: boolean;
    /** Token de reset cifrado. Null cuando no hay reset pendiente */
    passwordResetToken: string | null;
    /** Expiracion del token de reset. Tokens sin fecha valida se consideran expirados */
    passwordResetExpiresAt: Date | null;
    /**
     * Contador de intentos fallidos de login.
     * 5 intentos consecutivos activan lockout de 15 minutos (HLD Seccion 1).
     */
    failedLoginAttempts: number;
    /** Timestamp hasta el cual el usuario esta bloqueado. Null = no bloqueado */
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    /** true despues de verificar el email con el token enviado */
    emailVerified: boolean;
    /** Token de verificacion de email cifrado. Null post-verificacion */
    emailVerificationToken: string | null;
    /** Nombre en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
    firstName: string | null;
    /** Apellido en texto plano. Se mantiene compatibilidad de lectura para datos legacy cifrados. */
    lastName: string | null;
    /** Teléfono en formato E.164 (ej: "+573001234567") */
    phone: string | null;
    /** Cargo o posición del usuario en la empresa */
    jobTitle: string | null;
    /** Tipo de documento de identidad colombiano */
    documentType: DocumentType | null;
    /**
     * Número de documento en texto plano.
     * PII sensible — Ley 1581 habeas data.
     * NUNCA se retorna en DTOs públicos; solo se persiste.
     */
    documentNumber: string | null;
    /** URL de imagen de perfil */
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    /** Soft delete — preserva el registro para auditoria e integridad historica */
    deletedAt: Date | null;
}
//# sourceMappingURL=user.entity.d.ts.map