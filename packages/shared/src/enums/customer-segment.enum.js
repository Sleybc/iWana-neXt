'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CustomerSegment = void 0;
/**
 * Segmento de negocio del ISP para el suscriptor.
 * Dimensión ortogonal a personType: determina tipo de plan, SLA y provisioning.
 * NO afecta el cálculo de IVA — solo personType + stratum lo hacen.
 */
var CustomerSegment;
(function (CustomerSegment) {
  CustomerSegment['RESIDENTIAL'] = 'RESIDENTIAL';
  CustomerSegment['SOHO'] = 'SOHO';
  CustomerSegment['PYME'] = 'PYME';
  CustomerSegment['CORPORATE'] = 'CORPORATE';
  CustomerSegment['GOVERNMENT'] = 'GOVERNMENT';
  CustomerSegment['WHOLESALE'] = 'WHOLESALE';
})(CustomerSegment || (exports.CustomerSegment = CustomerSegment = {}));
//# sourceMappingURL=customer-segment.enum.js.map
