'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SubscriberStatus = void 0;
/**
 * Ciclo de vida del suscriptor.
 *
 * LEAD → PROSPECT → ACTIVE → SUSPENDED → CANCELLED
 *
 * LEAD: Primer contacto, sin contrato.
 * PROSPECT: Datos básicos completos, en proceso de calificación.
 * ACTIVE: Servicio activo, facturando.
 * SUSPENDED: Suspendido por mora o decisión manual.
 * CANCELLED: Contrato terminado. Estado terminal sin retorno.
 */
var SubscriberStatus;
(function (SubscriberStatus) {
  SubscriberStatus['LEAD'] = 'LEAD';
  SubscriberStatus['PROSPECT'] = 'PROSPECT';
  SubscriberStatus['ACTIVE'] = 'ACTIVE';
  SubscriberStatus['SUSPENDED'] = 'SUSPENDED';
  SubscriberStatus['CANCELLED'] = 'CANCELLED';
})(SubscriberStatus || (exports.SubscriberStatus = SubscriberStatus = {}));
//# sourceMappingURL=subscriber-status.enum.js.map
