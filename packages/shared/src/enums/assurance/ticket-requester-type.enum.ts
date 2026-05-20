export enum TicketRequesterType {
  /** Suscriptor o cliente externo — referenciado por subscriberId */
  SUBSCRIBER = 'SUBSCRIBER',
  /** Empleado interno — referenciado por userId */
  INTERNAL_USER = 'INTERNAL_USER',
  EMPLOYEE = 'EMPLOYEE',
  TECHNICIAN = 'TECHNICIAN',
  CONTRACTOR = 'CONTRACTOR',
  PARTNER = 'PARTNER',
  SYSTEM = 'SYSTEM',
  EXTERNAL = 'EXTERNAL',
  /** Solicitud anónima o de canal (correo, formulario web, etc.) */
  ANONYMOUS = 'ANONYMOUS',
}
