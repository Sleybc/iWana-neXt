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
export * from './constants/platform-roles';
export * from './constants/queue-names';
export * from './constants/search-job-names';
export * from './constants/users-bulk-job-names';
export * from './constants/profile-phone';
export * from './constants/user-field-constraints';

// Contratos de payload entre procesos (API productor / Worker consumidor)
export * from './contracts/queue-payloads';
export * from './contracts/users-bulk-create.contract';
export * from './contracts/operations/execution-orders';
export * from './contracts/configuration/settings-priority.contract';
export * from './contracts/inventory/executor-custody';
export * from './contracts/inventory';

// Operations
export * from './operations/task-type-to-wfm-work-type';

// Nombres de persona e iniciales canónicas (contrato Avatar v1.0 §4)
export * from './utils/person-name';

// Schemas Zod (frontend)
export * from './schemas/auth.schema';
export * from './schemas/subscriber.schema';
