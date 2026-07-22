import type { UserRole } from '../enums/user-role.enum';

/**
 * Contratos tipados del flujo async `POST /users/bulk` (MOD04 Ola C / D-3=A).
 *
 * UX de referencia: `docs/specs/UX-MOD04-BULKCREATE-ASYNC-OLA-C-v1.0.md`.
 * El worker recibe tenant explícito: AsyncLocalStorage no propaga a BullMQ.
 */

export type UsersBulkJobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'unknown';

/** Ítem de entrada (sin contraseña). */
export interface UsersBulkCreateJobUserItem {
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  jobTitle?: string;
  documentType?: string;
  documentNumber?: string;
  isOperationalResource?: boolean;
}

/**
 * Payload del job. Sin secretos: las contraseñas temporales se generan en el
 * worker y viajan solo al almacén one-time de resultado.
 */
export interface UsersBulkCreateJobPayload {
  tenantId: string;
  schemaName: string;
  tenantSlug: string;
  actorUserId: string;
  ipAddress: string;
  idempotencyKey: string;
  users: UsersBulkCreateJobUserItem[];
}

/**
 * Respuesta al aceptar (o reconocer) un lote.
 *
 * `failed` es un estado real y alcanzable: un reenvío con la misma
 * Idempotency-Key sobre un job que agotó sus reintentos devuelve el desenlace
 * de aquella petición, que fue un fallo. El contrato debe poder expresarlo para
 * que esta ruta y `GET /users/bulk/jobs/:jobId` no se contradigan (Ola F, D-3).
 */
export interface UsersBulkCreateAcceptedResponse {
  jobId: string;
  status: Extract<UsersBulkJobStatus, 'queued' | 'active' | 'completed' | 'failed'>;
}

export interface UsersBulkCreateSucceededItem {
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  /** Solo en la respuesta one-time de claim; nunca en GET status. */
  temporaryPassword?: string;
  createdAt: string;
}

export interface UsersBulkCreateFailedItem {
  rowIndex: number;
  email: string;
  reason: string;
}

export interface UsersBulkCreateResultSummary {
  total: number;
  succeeded: number;
  failed: number;
}

export interface UsersBulkJobStatusResponse {
  jobId: string;
  status: UsersBulkJobStatus;
  summary: UsersBulkCreateResultSummary | null;
  failed: UsersBulkCreateFailedItem[];
  /** true si el resultado con secretos ya fue reclamado. */
  credentialsClaimed: boolean;
  errorMessage?: string;
}

/**
 * Respuesta one-time al reclamar credenciales.
 * Tras el claim, `temporaryPassword` no vuelve a estar disponible.
 */
export interface UsersBulkJobResultResponse {
  jobId: string;
  status: Extract<UsersBulkJobStatus, 'completed'>;
  summary: UsersBulkCreateResultSummary;
  succeeded: UsersBulkCreateSucceededItem[];
  failed: UsersBulkCreateFailedItem[];
  credentialsClaimed: true;
}
