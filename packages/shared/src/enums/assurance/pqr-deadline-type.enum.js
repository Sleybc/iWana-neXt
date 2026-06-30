'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PqrDeadlineType = void 0;
var PqrDeadlineType;
(function (PqrDeadlineType) {
  /** Plazo inicial de respuesta regulatoria (CRC: 15 días hábiles) */
  PqrDeadlineType['INITIAL_RESPONSE'] = 'INITIAL_RESPONSE';
  /** Plazo de resolución definitiva (CRC: 15 días hábiles adicionales si recurre) */
  PqrDeadlineType['FINAL_RESOLUTION'] = 'FINAL_RESOLUTION';
  /** Plazo de subsanación requerido por el regulador */
  PqrDeadlineType['CORRECTION'] = 'CORRECTION';
})(PqrDeadlineType || (exports.PqrDeadlineType = PqrDeadlineType = {}));
//# sourceMappingURL=pqr-deadline-type.enum.js.map
