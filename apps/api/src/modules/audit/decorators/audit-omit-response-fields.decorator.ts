import { SetMetadata } from '@nestjs/common';

/** Metadata para excluir campos de la respuesta del `newValue` automatico. */
export const AUDIT_OMIT_RESPONSE_FIELDS_KEY = 'auditOmitResponseFields';

/**
 * Omite los campos indicados del `newValue` de AuditInterceptor, sin suprimir
 * el evento ni alterar la respuesta HTTP. La omission aplica recursivamente.
 */
export const AuditOmitResponseFields = (...fields: string[]) =>
  SetMetadata(AUDIT_OMIT_RESPONSE_FIELDS_KEY, [
    ...new Set(fields.map((field) => field.toLowerCase())),
  ]);
