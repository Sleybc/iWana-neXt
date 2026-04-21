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
export * from './enums/person-type.enum';
export * from './enums/customer-segment.enum';
export * from './enums/vat-treatment.enum';
export * from './enums/tax-regime.enum';
export * from './enums/subscriber-status.enum';
export * from './enums/crm';
export * from './enums/commercial';
export * from './enums/taxation';

// Interfaces
export * from './interfaces/api-response.interface';

// DTOs
export * from './dto/pagination.dto';

// Constants
export * from './constants/queue-names';

// Schemas Zod (frontend)
export * from './schemas/auth.schema';
export * from './schemas/subscriber.schema';
