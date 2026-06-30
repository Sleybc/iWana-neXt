/**
 * Estado de una asignación tributaria por cliente.
 *
 * SUGGESTED: sugerido automáticamente por el sistema (p.ej. IVA por estrato).
 * CONFIRMED: confirmado por el área de facturación sin cambios.
 * MANUAL_ADJUSTMENT: ajustado manualmente por facturación respecto a la sugerencia.
 *
 * Ref: HLD-MOD07 §7, spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §7.3
 */
export declare enum TaxAssignmentStatus {
    SUGGESTED = "SUGGESTED",
    CONFIRMED = "CONFIRMED",
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
}
//# sourceMappingURL=tax-assignment-status.enum.d.ts.map