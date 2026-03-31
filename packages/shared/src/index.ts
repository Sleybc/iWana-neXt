/**
 * @iwana/shared — Enums, interfaces y DTOs compartidos entre apps y packages.
 * Sprint 0 — Scaffold. Tipos de negocio se agregan en Sprint 1.
 */

// Enums
export * from './enums/user-role.enum';
export * from './enums/user-status.enum';
export * from './enums/tenant-status.enum';
export * from './enums/audit-action.enum';
export * from './enums/platform-role.enum';
export * from './enums/company-type.enum';
export * from './enums/document-type.enum';
export * from './enums/crm/consent-type.enum';
export * from './enums/crm/consent-status.enum';
export * from './enums/crm/consent-channel.enum';
export * from './enums/crm/feasibility.enum';
export * from './enums/crm/expediente-status.enum';
export * from './enums/crm/contact-channel.enum';
export * from './enums/crm/contact-result.enum';
export * from './enums/crm/evidence-mode.enum';

// Interfaces
export * from './interfaces/api-response.interface';

// DTOs
export * from './dto/pagination.dto';

// Constants
export * from './constants/queue-names';

// Schemas Zod (frontend)
export * from './schemas/auth.schema';
