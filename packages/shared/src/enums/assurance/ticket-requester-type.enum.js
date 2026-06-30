'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TicketRequesterType = void 0;
var TicketRequesterType;
(function (TicketRequesterType) {
  /** Suscriptor o cliente externo — referenciado por subscriberId */
  TicketRequesterType['SUBSCRIBER'] = 'SUBSCRIBER';
  /** Empleado interno — referenciado por userId */
  TicketRequesterType['INTERNAL_USER'] = 'INTERNAL_USER';
  TicketRequesterType['EMPLOYEE'] = 'EMPLOYEE';
  TicketRequesterType['TECHNICIAN'] = 'TECHNICIAN';
  TicketRequesterType['CONTRACTOR'] = 'CONTRACTOR';
  TicketRequesterType['PARTNER'] = 'PARTNER';
  TicketRequesterType['SYSTEM'] = 'SYSTEM';
  TicketRequesterType['EXTERNAL'] = 'EXTERNAL';
  /** Solicitud anónima o de canal (correo, formulario web, etc.) */
  TicketRequesterType['ANONYMOUS'] = 'ANONYMOUS';
})(TicketRequesterType || (exports.TicketRequesterType = TicketRequesterType = {}));
//# sourceMappingURL=ticket-requester-type.enum.js.map
