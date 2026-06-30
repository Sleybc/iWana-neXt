'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TaxProfileStatus = void 0;
/**
 * Estado general del perfil tributario del suscriptor.
 *
 * PENDING_REVIEW: perfil creado pero aún no revisado ni confirmado por facturación.
 * CONFIGURED: al menos un tributo ha sido confirmado o ajustado manualmente.
 *
 * Ref: spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §9.1
 */
var TaxProfileStatus;
(function (TaxProfileStatus) {
  TaxProfileStatus['PENDING_REVIEW'] = 'PENDING_REVIEW';
  TaxProfileStatus['CONFIGURED'] = 'CONFIGURED';
})(TaxProfileStatus || (exports.TaxProfileStatus = TaxProfileStatus = {}));
//# sourceMappingURL=tax-profile-status.enum.js.map
