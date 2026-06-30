'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TicketType = void 0;
var TicketType;
(function (TicketType) {
  /** Incidencia de servicio reportada por un suscriptor */
  TicketType['CUSTOMER_INCIDENT'] = 'CUSTOMER_INCIDENT';
  /** PQR formal regulatoria CRC */
  TicketType['PQR'] = 'PQR';
  /** Consulta funcional u operativa */
  TicketType['QUESTION'] = 'QUESTION';
  /** Solicitud de servicio técnico de un suscriptor */
  TicketType['SERVICE_REQUEST'] = 'SERVICE_REQUEST';
  /** Incidencia interna operativa (NOC, soporte interno) */
  TicketType['INTERNAL'] = 'INTERNAL';
  /** Soporte interno de herramientas o procesos */
  TicketType['INTERNAL_SUPPORT'] = 'INTERNAL_SUPPORT';
  /** Tarea operativa sin cliente asociado */
  TicketType['OPERATIONAL_TASK'] = 'OPERATIONAL_TASK';
  /** Consulta o información — no genera SLA crítico */
  TicketType['INQUIRY'] = 'INQUIRY';
})(TicketType || (exports.TicketType = TicketType = {}));
//# sourceMappingURL=ticket-type.enum.js.map
