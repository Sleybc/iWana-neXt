/**
 * Vocabulario canónico de historial de cambios (action / entityType).
 * Fuente única para el inicio y la campana del shell — system-vocabulary-review.
 * Nunca devolver el enum crudo ni un identificador.
 */

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Actualización',
  DELETE: 'Eliminación',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FAILED: 'Intento de acceso fallido',
  ACCOUNT_LOCKED: 'Cuenta bloqueada',
  PASSWORD_CHANGED: 'Cambio de contraseña',
  PASSWORD_RESET_REQUESTED: 'Solicitud de restablecimiento',
  PASSWORD_RESET_COMPLETED: 'Contraseña restablecida',
  MFA_ENABLED: 'Verificación en dos pasos activada',
  MFA_DISABLED: 'Verificación en dos pasos desactivada',
  MFA_SETUP_INITIATED: 'Inicio de verificación en dos pasos',
  MFA_SETUP: 'Configuración de verificación en dos pasos',
  MFA_VERIFIED: 'Verificación en dos pasos confirmada',
  TENANT_PROVISIONED: 'Empresa aprovisionada',
  TENANT_SUSPENDED: 'Empresa suspendida',
  TENANT_ACTIVATED: 'Empresa activada',
  REFRESH: 'Renovación de sesión',
  EMAIL_VERIFIED: 'Correo verificado',
  LIST_ACCESS: 'Consulta de listado',
};

const AUDIT_ENTITY_TYPE_LABELS: Record<string, string> = {
  User: 'usuario',
  user: 'usuario',
  Tenant: 'empresa',
  tenant: 'empresa',
  TenantSettings: 'configuración de la empresa',
  tenant_settings: 'configuración de la empresa',
  Settings: 'configuración',
  AccessProfile: 'perfil de acceso',
  access_profile: 'perfil de acceso',
  Role: 'categoría base',
  AuditLog: 'historial',
  Session: 'sesión',
  InventoryItem: 'producto operativo',
  inventory_item: 'producto operativo',
  CommercialPlan: 'plan comercial',
  Plan: 'plan comercial',
  plan: 'plan comercial',
  AssuranceTicket: 'caso de mesa de ayuda',
  Ticket: 'caso de mesa de ayuda',
  WorkOrder: 'orden de campo',
  Visit: 'visita',
  Expediente: 'oportunidad',
  expediente: 'oportunidad',
  ExpedienteRecord: 'oportunidad',
  expedienterecord: 'oportunidad',
  Subscriber: 'suscriptor',
  subscriber: 'suscriptor',
  ContactAttempt: 'intento de contacto',
  Contract: 'contrato',
  Quote: 'cotización',
  Opportunity: 'oportunidad',
  Contact: 'contacto',
};

/** Mapea la acción del historial a etiqueta legible (sin enums crudos). */
export function auditActionLabel(action: string): string {
  const normalized = action.trim().toUpperCase();
  return AUDIT_ACTION_LABELS[normalized] ?? 'Cambio registrado';
}

/** Mapea el tipo de entidad a vocabulario de producto. */
export function auditEntityTypeLabel(entityType: string): string {
  const normalized = entityType.trim();
  return AUDIT_ENTITY_TYPE_LABELS[normalized] ?? 'registro';
}

/** Línea visible para campana e historial: acción · entidad. Sin id. */
export function auditFeedSummary(action: string, entityType: string): string {
  return `${auditActionLabel(action)} · ${auditEntityTypeLabel(entityType)}`;
}
