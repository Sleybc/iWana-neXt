'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TaxAssignmentRateSource = void 0;
/**
 * Origen de la tasa efectiva en una asignación tributaria.
 *
 * CATALOG: la tasa proviene del catálogo (tributo de tasa fija en TaxDefinition.baseRate).
 * MANUAL: la tasa fue ingresada manualmente al asignar el tributo al cliente.
 *
 * Ref: spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §6.2, §7.3
 */
var TaxAssignmentRateSource;
(function (TaxAssignmentRateSource) {
  TaxAssignmentRateSource['CATALOG'] = 'CATALOG';
  TaxAssignmentRateSource['MANUAL'] = 'MANUAL';
})(TaxAssignmentRateSource || (exports.TaxAssignmentRateSource = TaxAssignmentRateSource = {}));
//# sourceMappingURL=tax-assignment-rate-source.enum.js.map
