export enum TicketType {
  /** Incidencia de servicio reportada por un suscriptor */
  CUSTOMER_INCIDENT = 'CUSTOMER_INCIDENT',
  /** PQR formal regulatoria CRC */
  PQR = 'PQR',
  /** Consulta funcional u operativa */
  QUESTION = 'QUESTION',
  /** Solicitud de servicio técnico de un suscriptor */
  SERVICE_REQUEST = 'SERVICE_REQUEST',
  /** Incidencia interna operativa (NOC, soporte interno) */
  INTERNAL = 'INTERNAL',
  /** Soporte interno de herramientas o procesos */
  INTERNAL_SUPPORT = 'INTERNAL_SUPPORT',
  /** Tarea operativa sin cliente asociado */
  OPERATIONAL_TASK = 'OPERATIONAL_TASK',
  /** Consulta o información — no genera SLA crítico */
  INQUIRY = 'INQUIRY',
}
