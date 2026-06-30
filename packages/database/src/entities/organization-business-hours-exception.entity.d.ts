/**
 * Excepciones de horario por fecha para Organization.
 * Permite modelar festivos, cierres especiales y aperturas extraordinarias.
 *
 * - organization_site_id = null: aplica a toda la empresa.
 * - organization_site_id = <uuid>: aplica solo a esa sede.
 * - is_recurring = true: se repite cada año en el mismo mes/día (mm-dd).
 * - is_open = false: cierre total por festivo o novedad.
 * - is_open = true: apertura o ajuste extraordinario.
 *
 * MOD00 — Configuración / Organización — Excepciones por fecha
 */
export declare class OrganizationBusinessHoursException {
    id: string;
    tenantId: string;
    organizationSiteId: string | null;
    /**
     * Fecha de la excepción en formato ISO 8601 YYYY-MM-DD.
     * Para excepciones recurrentes, el año puede ser 2000 como convenio o cualquier año.
     * La comparación de recurrencia usa solo mm-dd.
     */
    exceptionDate: string;
    isRecurring: boolean;
    isOpen: boolean;
    opensAt: string | null;
    closesAt: string | null;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=organization-business-hours-exception.entity.d.ts.map