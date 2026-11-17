export interface FieldServiceRequest {
  ticketId: string;
  /** Número visible del ticket (TK-…). Opcional: los jobs encolados antes no lo traen. */
  ticketNumber?: string | null;
  tenantId: string;
  schemaName: string;
  priority: string;
  subject: string;
  requestedByUserId: string;
  notes: string | null;
}
