/**
 * Inventario de columnas cifradas AES-256-GCM (MFA_ENCRYPTION_KEY).
 *
 * Fuente: rutas de escritura reales en auth/CRM/platform (encryptAes256Gcm).
 * No inventar tablas: gaps documentados al final del archivo.
 */

export type EncryptedColumnScope = 'public' | 'tenant';

export type EncryptedColumnTarget = {
  /** Identificador opaco para métricas/logs (sin PII). */
  entityType: string;
  scope: EncryptedColumnScope;
  /** Nombre de tabla SQL. */
  table: string;
  /** Columna cifrada. */
  column: string;
  /** PK UUID. */
  idColumn: string;
  /**
   * Si true, solo se procesan filas cuyo valor parece ciphertext AES-GCM.
   * Necesario para columnas mixtas (p. ej. users.email tras migración 005).
   */
  requireCiphertextShape: boolean;
};

/** Schema público (plataforma). */
export const PUBLIC_ENCRYPTED_TARGETS: readonly EncryptedColumnTarget[] = [
  {
    entityType: 'platform_user.email',
    scope: 'public',
    table: 'platform_users',
    column: 'email',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'platform_user.mfaSecret',
    scope: 'public',
    table: 'platform_users',
    column: 'mfa_secret',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
] as const;

/**
 * Schemas tenant_* (search_path por transacción).
 * Incluye legado de perfil users.* que aún pueda estar cifrado.
 */
export const TENANT_ENCRYPTED_TARGETS: readonly EncryptedColumnTarget[] = [
  {
    entityType: 'user.mfaSecret',
    scope: 'tenant',
    table: 'users',
    column: 'mfa_secret',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'user.email',
    scope: 'tenant',
    table: 'users',
    column: 'email',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'user.firstName',
    scope: 'tenant',
    table: 'users',
    column: 'first_name',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'user.lastName',
    scope: 'tenant',
    table: 'users',
    column: 'last_name',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'user.documentNumber',
    scope: 'tenant',
    table: 'users',
    column: 'document_number',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriber.documentNumberEncrypted',
    scope: 'tenant',
    table: 'subscribers',
    column: 'document_number_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriber.emailEncrypted',
    scope: 'tenant',
    table: 'subscribers',
    column: 'email_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriber.phoneEncrypted',
    scope: 'tenant',
    table: 'subscribers',
    column: 'phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriber.altContactPhoneEncrypted',
    scope: 'tenant',
    table: 'subscribers',
    column: 'alt_contact_phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.documentNumberEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'document_number_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.phonePrimaryEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'phone_primary_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.phoneSecondaryEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'phone_secondary_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.emailPrimaryEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'email_primary_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.altContactPhoneEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'alt_contact_phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'expediente.siteContactPhoneEncrypted',
    scope: 'tenant',
    table: 'expediente_records',
    column: 'site_contact_phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriberContact.emailEncrypted',
    scope: 'tenant',
    table: 'subscriber_contacts',
    column: 'email_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'subscriberContact.phoneEncrypted',
    scope: 'tenant',
    table: 'subscriber_contacts',
    column: 'phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'potentialLead.emailEncrypted',
    scope: 'tenant',
    table: 'potential_leads',
    column: 'email_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
  {
    entityType: 'potentialLead.phoneEncrypted',
    scope: 'tenant',
    table: 'potential_leads',
    column: 'phone_encrypted',
    idColumn: 'id',
    requireCiphertextShape: true,
  },
] as const;

/**
 * Gaps conocidos (NO cubiertos — no hay escritura AES en código actual):
 * - party.document_number: columna dimensionada para ciphertext (ADR-030/058)
 *   pero PartyService persiste texto plano hoy.
 * - users.password_reset_token: token opaco, no AES-GCM.
 */
export const REENCRYPT_INVENTORY_GAPS: readonly string[] = [
  'party.document_number (plaintext en write path actual)',
  'users.password_reset_token (token opaco, no AES-GCM)',
] as const;
