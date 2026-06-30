/**
 * Origen de la tasa efectiva en una asignación tributaria.
 *
 * CATALOG: la tasa proviene del catálogo (tributo de tasa fija en TaxDefinition.baseRate).
 * MANUAL: la tasa fue ingresada manualmente al asignar el tributo al cliente.
 *
 * Ref: spec 2026-04-22-taxation-mvp-tributos-por-cliente-design §6.2, §7.3
 */
export declare enum TaxAssignmentRateSource {
    CATALOG = "CATALOG",
    MANUAL = "MANUAL"
}
//# sourceMappingURL=tax-assignment-rate-source.enum.d.ts.map