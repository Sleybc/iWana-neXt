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
export * from './enums/assurance';
export * from './commercial';
export * from './enums/taxation';
export * from './enums/parties';
export * from './enums/wfm';
export * from './enums/organization';
export * from './enums/access-control';
export * from './enums/configuration';
export * from './enums/tasks';
export * from './enums/operations';
export * from './enums/inventory';
export * from './inventory';
export * from './taxation';

// Interfaces
export * from './interfaces/api-response.interface';
export * from './interfaces/assurance-field-service-request.interface';

// DTOs
export * from './dto/pagination.dto';

// Constants
export * from './constants/queue-names';
export * from './constants/search-job-names';

// Contratos de payload entre procesos (API productor / Worker consumidor)
export * from './contracts/queue-payloads';

// Operations
export * from './operations/task-type-to-wfm-work-type';

// Schemas Zod (frontend)
export * from './schemas/auth.schema';
export * from './schemas/subscriber.schema';
