/**
 * Snapshot de una aplicación tributaria resuelta.
 * Retornado por ITaxApplicationReadPort (CommercialModule) para uso por
 * CrmModule, BillingModule y otros consumidores downstream.
 *
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §5, ADR-031 §D3
 */
export interface TaxApplicationSnapshot {
    /** UUID de la definición en el catálogo de Taxation (MOD07). */
    readonly taxDefinitionId: string;
    /** Tratamiento tributario aplicado. */
    readonly treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
    /**
     * Tasa efectiva en porcentaje.
     * null cuando el tratamiento no implica tasa (EXEMPT / EXCLUDED).
     */
    readonly effectiveRate: number | null;
    /** UUID de la regla de aplicación que originó este resultado. */
    readonly ruleId: string;
    /** Prioridad de la regla ganadora en el momento de la resolución. */
    readonly priorityMatched: number;
}
//# sourceMappingURL=tax-application-snapshot.d.ts.map