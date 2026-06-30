'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.VatTreatment = void 0;
/**
 * Tratamiento IVA colombiano para servicios de Internet.
 *
 * Regla (Ley 1819/2016, Estatuto Tributario Arts. 476-477):
 * - EXEMPT: Estratos 1-2 (gravado tarifa 0%, se declara en IVA)
 * - EXCLUDED: Estrato 3 (fuera del régimen IVA, no se declara)
 * - STANDARD: Estratos 4-6 y personas jurídicas (IVA 19%)
 *
 * El segmento de negocio (customerSegment) NO afecta el IVA.
 * Las entidades gubernamentales pagan IVA al 19% (STANDARD).
 */
var VatTreatment;
(function (VatTreatment) {
  VatTreatment['EXEMPT'] = 'EXEMPT';
  VatTreatment['EXCLUDED'] = 'EXCLUDED';
  VatTreatment['STANDARD'] = 'STANDARD';
})(VatTreatment || (exports.VatTreatment = VatTreatment = {}));
//# sourceMappingURL=vat-treatment.enum.js.map
