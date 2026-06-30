'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExpedienteStatus = void 0;
/**
 * Estados del pipeline de expediente unico progresivo.
 *
 * Consolidado de 12 a 8 estados (ADR-026):
 * - Eliminados: CONTACTADO, PENDIENTE_DATOS, VIABLE_COMERCIALMENTE, PENDIENTE_DECISION
 * - CONTACTADO y PENDIENTE_DATOS absorbidos por PRECALIFICADO
 * - VIABLE_COMERCIALMENTE absorbido por VALIDANDO_COBERTURA
 * - PENDIENTE_DECISION absorbido por EN_COTIZACION
 */
var ExpedienteStatus;
(function (ExpedienteStatus) {
  ExpedienteStatus['NUEVO_POTENCIAL'] = 'NUEVO_POTENCIAL';
  ExpedienteStatus['PRECALIFICADO'] = 'PRECALIFICADO';
  ExpedienteStatus['VALIDANDO_COBERTURA'] = 'VALIDANDO_COBERTURA';
  ExpedienteStatus['EN_COTIZACION'] = 'EN_COTIZACION';
  ExpedienteStatus['LISTO_PARA_INSTALACION'] = 'LISTO_PARA_INSTALACION';
  ExpedienteStatus['INSTALACION_AGENDADA'] = 'INSTALACION_AGENDADA';
  ExpedienteStatus['CLIENTE_ACTIVO'] = 'CLIENTE_ACTIVO';
  ExpedienteStatus['DESCARTADO'] = 'DESCARTADO';
})(ExpedienteStatus || (exports.ExpedienteStatus = ExpedienteStatus = {}));
//# sourceMappingURL=expediente-status.enum.js.map
