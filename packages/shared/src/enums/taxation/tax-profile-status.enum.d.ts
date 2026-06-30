/**
 * Estado general del perfil tributario del suscriptor.
 *
 * PENDING_REVIEW: perfil creado pero aún no revisado ni confirmado por facturación.
 * CONFIGURED: al menos un tributo ha sido confirmado o ajustado manualmente.
 *
 * Ref: spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §9.1
 */
export declare enum TaxProfileStatus {
    PENDING_REVIEW = "PENDING_REVIEW",
    CONFIGURED = "CONFIGURED"
}
//# sourceMappingURL=tax-profile-status.enum.d.ts.map