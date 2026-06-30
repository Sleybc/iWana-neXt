'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TaxAssignmentStatus = void 0;
/**
 * Estado de una asignación tributaria por cliente.
 *
 * SUGGESTED: sugerido automáticamente por el sistema (p.ej. IVA por estrato).
 * CONFIRMED: confirmado por el área de facturación sin cambios.
 * MANUAL_ADJUSTMENT: ajustado manualmente por facturación respecto a la sugerencia.
 *
 * Ref: HLD-MOD07 §7, spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §7.3
 */
var TaxAssignmentStatus;
(function (TaxAssignmentStatus) {
  TaxAssignmentStatus['SUGGESTED'] = 'SUGGESTED';
  TaxAssignmentStatus['CONFIRMED'] = 'CONFIRMED';
  TaxAssignmentStatus['MANUAL_ADJUSTMENT'] = 'MANUAL_ADJUSTMENT';
})(TaxAssignmentStatus || (exports.TaxAssignmentStatus = TaxAssignmentStatus = {}));
//# sourceMappingURL=tax-assignment-status.enum.js.map
