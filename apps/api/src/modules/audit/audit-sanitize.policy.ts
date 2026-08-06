/**
 * Política compartida de sanitización de audit trail (SEC-P1 / D-C).
 *
 * Usada por `AuditInterceptor` (HTTP) y `AuditService.log()` (rutas directas)
 * para que ninguna vía pueda evadir la denylist.
 */

export const AUDIT_SECRET_KEY_PATTERN =
  /password|secret|token|credential|apikey|api_?key|private_?key|authorization|otp|qr|seed|recovery|backup/i;

export const AUDIT_ALWAYS_OMITTED_KEYS = new Set([
  'email',
  'value',
  'whatsapp',
  'nit',
  'nitdv',
  'nit_dv',
  'fullname',
  'businessname',
  'business_name',
  'razonsocial',
  'razon_social',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'displayname',
  'display_name',
  'legalname',
  'legal_name',
  'address',
  'birthdate',
  'birth_date',
  'contactphone',
  'contact_phone',
  'contactname',
  'contact_name',
  'altcontactphone',
  'alt_contact_phone',
  'adminemail',
  'admin_email',
  'contactemail',
  'contact_email',
  'emailprimary',
  'email_primary',
  'emailsecondary',
  'email_secondary',
  'documentnumber',
  'document_number',
  'nationalid',
  'national_id',
  'identification',
  'identificacion',
  'cedula',
  'cédula',
  'phone',
  'mobile',
  'telefono',
  'teléfono',
  'celular',
  'phonenumber',
  'phone_number',
  'mobilenumber',
  'mobile_number',
  'sitecontactphone',
  'site_contact_phone',
  'phoneprimary',
  'phone_primary',
  'phonesecondary',
  'phone_secondary',
  'customerdisplayname',
  'customer_display_name',
  'expedientefullname',
  'expediente_full_name',
  'fiscalname',
  'fiscal_name',
  'suggestedpartyname',
  'suggested_party_name',
  // SEC-P1 / E5
  'latitude',
  'longitude',
  'description',
  'title',
  'sector',
  'municipality',
  // SEC-P1 H-6 — texto libre de adquisición; puede identificar a un tercero
  'sourcedetail',
  'source_detail',
]);

export const AUDIT_NEVER_OMITTED_KEYS = new Set(['actorname', 'piiaaccess']);

export const AUDIT_TECHNICAL_ADDRESS_PATTERN = /(^|_)(ip|mac|remote)_address$/;

export const AUDIT_PII_KEY_SUFFIX_PATTERN =
  /(^|_)(email|encrypted|phone|document_number|nit|address|(contact|person|customer|holder|owner|subscriber|responsible|technician|uploaded_by|directed_to)_name)$/;

export const AUDIT_MAX_SANITIZE_DEPTH = 5;

export function normalizeAuditPiiKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export function matchesAuditPiiSuffix(key: string): boolean {
  if (AUDIT_NEVER_OMITTED_KEYS.has(key.toLowerCase())) {
    return false;
  }

  const normalized = normalizeAuditPiiKey(key);

  if (AUDIT_TECHNICAL_ADDRESS_PATTERN.test(normalized)) {
    return false;
  }

  return AUDIT_PII_KEY_SUFFIX_PATTERN.test(normalized);
}

export function isAuditSecretEntry(key: string, value: unknown): boolean {
  const normalizedKey = key.toLowerCase();

  if (AUDIT_NEVER_OMITTED_KEYS.has(normalizedKey)) {
    return false;
  }

  if (AUDIT_ALWAYS_OMITTED_KEYS.has(normalizedKey)) {
    return typeof value === 'string' || typeof value === 'number' || value instanceof Date;
  }

  if (typeof value !== 'string') {
    return false;
  }

  if (AUDIT_SECRET_KEY_PATTERN.test(key)) {
    return true;
  }

  return matchesAuditPiiSuffix(key);
}

export function sanitizeAuditTree(value: unknown, depth: number): unknown {
  if (depth > AUDIT_MAX_SANITIZE_DEPTH) {
    return '[PROFUNDIDAD_EXCEDIDA]';
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return '[BINARIO]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditTree(item, depth + 1));
  }

  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isAuditSecretEntry(key, item)) {
      continue;
    }

    result[key] = sanitizeAuditTree(item, depth + 1);
  }

  return result;
}

/** Sanitiza oldValue/newValue antes de persistir en audit_logs. */
export function sanitizeAuditPayload(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (data == null) {
    return null;
  }
  return sanitizeAuditTree(data, 0) as Record<string, unknown>;
}
