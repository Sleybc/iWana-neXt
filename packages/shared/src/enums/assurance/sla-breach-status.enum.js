'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SlaBreachStatus = void 0;
var SlaBreachStatus;
(function (SlaBreachStatus) {
  /** Sin incumplimiento — dentro de los tiempos */
  SlaBreachStatus['OK'] = 'OK';
  /** En riesgo — menos del 20% del tiempo SLA restante */
  SlaBreachStatus['AT_RISK'] = 'AT_RISK';
  /** SLA de primera respuesta vencido */
  SlaBreachStatus['FIRST_RESPONSE_BREACHED'] = 'FIRST_RESPONSE_BREACHED';
  /** SLA de resolución vencido */
  SlaBreachStatus['RESOLUTION_BREACHED'] = 'RESOLUTION_BREACHED';
})(SlaBreachStatus || (exports.SlaBreachStatus = SlaBreachStatus = {}));
//# sourceMappingURL=sla-breach-status.enum.js.map
