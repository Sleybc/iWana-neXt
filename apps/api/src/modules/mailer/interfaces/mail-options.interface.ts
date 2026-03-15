/**
 * Opciones para el envio de un correo electronico.
 *
 * SEGURIDAD: El campo `to` contiene PII (email en texto plano).
 * Solo existe en memoria durante el envio — NUNCA se persiste ni se loguea en produccion.
 */
export interface MailOptions {
  to: string; // Email en texto plano — solo en memoria, nunca se persiste ni se loguea en produccion
  subject: string;
  html: string;
  text?: string; // Version plain text opcional
}
