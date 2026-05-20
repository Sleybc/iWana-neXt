export interface FieldServiceRequest {
  ticketId: string;
  tenantId: string;
  schemaName: string;
  priority: string;
  subject: string;
  requestedByUserId: string;
  notes: string | null;
}
