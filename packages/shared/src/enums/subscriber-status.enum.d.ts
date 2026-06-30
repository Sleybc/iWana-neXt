/**
 * Ciclo de vida del suscriptor.
 *
 * LEAD → PROSPECT → ACTIVE → SUSPENDED → CANCELLED
 *
 * LEAD: Primer contacto, sin contrato.
 * PROSPECT: Datos básicos completos, en proceso de calificación.
 * ACTIVE: Servicio activo, facturando.
 * SUSPENDED: Suspendido por mora o decisión manual.
 * CANCELLED: Contrato terminado. Estado terminal sin retorno.
 */
export declare enum SubscriberStatus {
    LEAD = "LEAD",
    PROSPECT = "PROSPECT",
    ACTIVE = "ACTIVE",
    SUSPENDED = "SUSPENDED",
    CANCELLED = "CANCELLED"
}
//# sourceMappingURL=subscriber-status.enum.d.ts.map