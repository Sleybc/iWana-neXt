'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TicketStatus = void 0;
var TicketStatus;
(function (TicketStatus) {
  /** Ticket registrado, sin asignar */
  TicketStatus['OPEN'] = 'OPEN';
  /** Ticket asignado a un agente/técnico */
  TicketStatus['ASSIGNED'] = 'ASSIGNED';
  /** Trabajo en curso */
  TicketStatus['IN_PROGRESS'] = 'IN_PROGRESS';
  /** Esperando respuesta del solicitante */
  TicketStatus['PENDING_CUSTOMER'] = 'PENDING_CUSTOMER';
  /** Esperando recurso interno (pieza, aprobación, WFM) */
  TicketStatus['PENDING_INTERNAL'] = 'PENDING_INTERNAL';
  /** Solicitud de trabajo de campo emitida hacia WFM */
  TicketStatus['FIELD_SERVICE_REQUESTED'] = 'FIELD_SERVICE_REQUESTED';
  /** Ticket resuelto — pendiente confirmación */
  TicketStatus['RESOLVED'] = 'RESOLVED';
  /** Ticket cerrado y confirmado */
  TicketStatus['CLOSED'] = 'CLOSED';
  /** Ticket cancelado sin resolución */
  TicketStatus['CANCELLED'] = 'CANCELLED';
})(TicketStatus || (exports.TicketStatus = TicketStatus = {}));
//# sourceMappingURL=ticket-status.enum.js.map
